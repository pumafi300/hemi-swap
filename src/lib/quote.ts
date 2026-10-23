import { isHexAddress } from './address'
import { clampSlippage, minOutFromSlippage, SLIPPAGE_DEFAULT } from './slippage'
import type { RouteLeg, RouteSwap } from './route'

export type QuoteTx = { from: string; to: string; data: string; value: string }

export type NormalizedQuote = {
  src: string
  dst: string
  fromAmount: string
  toAmount: string
  minToAmount: string
  gasEstimate: string
  simulationBlock: number | null
  swaps: RouteSwap[]
  tx: QuoteTx
}

export type QuoteErrorKind = 'noroute' | 'liquidity' | 'same' | 'badRequest' | 'unavailable' | 'rateLimit' | 'guard'

export type QuoteFailure = {
  kind: QuoteErrorKind
  detail: string
  retryable: boolean
  status: number
}

export class QuoteRequestError extends Error {
  readonly kind: QuoteErrorKind
  readonly detail: string
  readonly retryable: boolean
  readonly status: number

  constructor(info: QuoteFailure) {
    super(info.detail || info.kind)
    this.name = 'QuoteRequestError'
    this.kind = info.kind
    this.detail = info.detail
    this.retryable = info.retryable
    this.status = info.status
  }
}

export type QuoteRequest = {
  src: string
  dst: string
  amount: string
  from: string
  slippage: number
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

export function mapQuoteFailure(status: number, raw: string): QuoteFailure {
  const trimmed = raw.trim()
  let message = ''
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown }
      message = String(parsed.error ?? parsed.message ?? '')
    } catch {
      message = ''
    }
  } else if (trimmed && !trimmed.startsWith('<')) {
    message = trimmed.slice(0, 280)
  }
  const lower = message.toLowerCase()
  if (status === 403 && (lower.includes('src == dst') || lower.includes('arbitrage'))) {
    return { kind: 'same', detail: message, retryable: false, status }
  }
  if (status === 422) {
    if (lower.includes('insufficient') && !lower.includes('no known liquidity') && !lower.includes('unknown')) {
      return { kind: 'liquidity', detail: message, retryable: false, status }
    }
    return { kind: 'noroute', detail: message, retryable: false, status }
  }
  if (status === 400) {
    return { kind: 'badRequest', detail: message || 'The quote request was rejected.', retryable: false, status }
  }
  if (status === 404) {
    return { kind: 'unavailable', detail: 'This chain is not supported.', retryable: false, status }
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many')) {
    return { kind: 'rateLimit', detail: message || 'The quote service is busy. Try again in a moment.', retryable: true, status }
  }
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {
      kind: 'rateLimit',
      detail: message || 'The quote service returned an unexpected response. Try again in a moment.',
      retryable: true,
      status,
    }
  }
  return {
    kind: 'unavailable',
    detail: message || `Quote failed (${status}).`,
    retryable: status >= 500,
    status,
  }
}

function parseSwaps(value: unknown): RouteSwap[] | null {
  if (!Array.isArray(value)) return null
  const swaps: RouteSwap[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const amountIn = asString(row.amountIn)
    const amountOut = asString(row.amountOut)
    if (!/^\d+$/.test(amountIn) || !/^\d+$/.test(amountOut) || !Array.isArray(row.route)) return null
    const route: RouteLeg[] = []
    for (const leg of row.route) {
      if (!leg || typeof leg !== 'object') return null
      const hop = leg as Record<string, unknown>
      const pool = asString(hop.pool)
      const tokenIn = asString(hop.tokenIn)
      const tokenOut = asString(hop.tokenOut)
      const legIn = asString(hop.amountIn)
      const legOut = asString(hop.amountOut)
      if (!isHexAddress(pool) || !isHexAddress(tokenIn) || !isHexAddress(tokenOut)) return null
      if (!/^\d+$/.test(legIn) || !/^\d+$/.test(legOut)) return null
      route.push({ amountIn: legIn, amountOut: legOut, pool, tokenIn, tokenOut })
    }
    swaps.push({ amountIn, amountOut, route })
  }
  return swaps
}

export function parseQuoteResponse(value: unknown, slippage: number): { ok: true; quote: NormalizedQuote } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Quote was not a JSON object.' }
  const row = value as Record<string, unknown>
  const src = asString(row.src)
  const dst = asString(row.dst)
  const fromAmount = asString(row.fromAmount)
  const toAmount = asString(row.toAmount)
  const gasEstimate = asString(row.gasEstimate)
  if (!isHexAddress(src) || !isHexAddress(dst) || !/^\d+$/.test(fromAmount) || !/^\d+$/.test(toAmount) || !/^\d+$/.test(gasEstimate)) {
    return { ok: false, error: 'Quote is missing amounts.' }
  }
  if (BigInt(toAmount) <= 0n) return { ok: false, error: 'Quote output was zero.' }
  if (!row.tx || typeof row.tx !== 'object') return { ok: false, error: 'Quote is missing the transaction.' }
  const tx = row.tx as Record<string, unknown>
  const to = asString(tx.to)
  const from = asString(tx.from)
  const data = asString(tx.data)
  const txValue = asString(tx.value) || '0'
  if (!isHexAddress(to) || !isHexAddress(from) || !/^0x[0-9a-fA-F]*$/.test(data)) {
    return { ok: false, error: 'Quote transaction is malformed.' }
  }
  const swaps = parseSwaps(row.swaps)
  if (!swaps) return { ok: false, error: 'Quote routes were malformed.' }
  const minRaw = asString(row.minToAmount)
  const minToAmount = /^\d+$/.test(minRaw) ? minRaw : minOutFromSlippage(BigInt(toAmount), slippage).toString()
  const simulationBlock = typeof row.simulationBlock === 'number' && Number.isFinite(row.simulationBlock) ? row.simulationBlock : null
  return {
    ok: true,
    quote: {
      src,
      dst,
      fromAmount,
      toAmount,
      minToAmount,
      gasEstimate,
      simulationBlock,
      swaps,
      tx: { from, to, data, value: txValue },
    },
  }
}

export function normalizePriceMap(value: unknown): Record<string, number | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number | null> = {}
  for (const [key, price] of Object.entries(value as Record<string, unknown>)) {
    out[key.toLowerCase()] = typeof price === 'number' && Number.isFinite(price) ? price : null
  }
  return out
}

async function readBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text()
  try {
    return { text, json: JSON.parse(text) as unknown }
  } catch {
    return { text, json: null }
  }
}

export async function fetchQuote(request: QuoteRequest): Promise<NormalizedQuote> {
  const slippage = clampSlippage(request.slippage) ?? SLIPPAGE_DEFAULT
  const params = new URLSearchParams({
    src: request.src,
    dst: request.dst,
    amount: request.amount,
    from: request.from,
    slippage: String(slippage),
  })
  const response = await fetch(`/api/quote?${params.toString()}`, { headers: { Accept: 'application/json' } })
  const body = await readBody(response)
  if (!response.ok || body.json == null) {
    throw new QuoteRequestError(mapQuoteFailure(response.status, body.text))
  }
  const parsed = parseQuoteResponse(body.json, slippage)
  if (!parsed.ok) {
    throw new QuoteRequestError({ kind: 'unavailable', detail: parsed.error, retryable: true, status: response.status })
  }
  return parsed.quote
}

export async function fetchPrices(tokens: string[]): Promise<Record<string, number | null>> {
  const unique = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))]
  if (unique.length === 0) return {}
  const response = await fetch(`/api/prices?token=${encodeURIComponent(unique.join(','))}`, {
    headers: { Accept: 'application/json' },
  })
  const body = await readBody(response)
  if (!response.ok || body.json == null) return {}
  return normalizePriceMap(body.json)
}
