import { sameAddress } from './address'
import { NATIVE_SENTINEL } from './constants'

export type RouteLeg = {
  amountIn: string
  amountOut: string
  pool: string
  tokenIn: string
  tokenOut: string
}

export type RouteSwap = {
  amountIn: string
  amountOut: string
  route: RouteLeg[]
}

export type TokenRef = {
  address: string
  symbol: string
  icon?: string
  native?: boolean
}

export type PoolTag = { label: string; title: string; wrap: boolean }

export type DisplayHop = {
  symbol: string
  icon?: string
  address: string
  poolBefore: PoolTag | null
}

export type DisplayPath = {
  pct: number
  amountIn: bigint
  hopCount: number
  hops: DisplayHop[]
}

const WRAP: PoolTag = { label: 'wrap', title: 'Wrap / unwrap', wrap: true }

const STANDARD_FEES: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  3000: '0.3%',
  10000: '1%',
}

/**
 * Label a pool from its on-chain `fee()` when that read succeeded.
 * The API's pool `type` is ignored: Nordstern tags every venue `uniswap_v3`.
 */
export function poolTagFromFee(fee: number | null | undefined): PoolTag {
  if (fee == null || !Number.isInteger(fee) || fee <= 0 || fee > 100_000) {
    return { label: 'Pool', title: 'Liquidity pool', wrap: false }
  }
  const known = STANDARD_FEES[fee]
  if (known) return { label: `v3 · ${known}`, title: `v3 pool · ${known} fee`, wrap: false }
  const pct = fee / 10_000
  const text = `${trimFee(pct)}%`
  return { label: `Pool · ${text}`, title: `Pool fee ${text}`, wrap: false }
}

function trimFee(value: number): string {
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

/** Integer percents that sum to 100, using the largest-remainder method. */
export function allocatePercents(weights: bigint[]): number[] {
  if (weights.length === 0) return []
  const safe = weights.map((weight) => (weight > 0n ? weight : 0n))
  const total = safe.reduce((sum, weight) => sum + weight, 0n)
  if (total <= 0n) return safe.map(() => 0)
  const floors = safe.map((weight) => (weight * 100n) / total)
  let remain = 100n - floors.reduce((sum, part) => sum + part, 0n)
  const order = safe
    .map((weight, index) => ({ index, rem: (weight * 100n) % total }))
    .sort((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1))
  const out = floors.map((part) => Number(part))
  let cursor = 0
  while (remain > 0n && order.length > 0) {
    out[order[cursor % order.length]!.index] += 1
    remain -= 1n
    cursor += 1
    if (cursor > 10_000) break
  }
  return out
}

function isNativeToken(token: TokenRef): boolean {
  return Boolean(token.native) || sameAddress(token.address, NATIVE_SENTINEL)
}

export function mapSwapsToPaths(args: {
  swaps: RouteSwap[]
  src: TokenRef
  dst: TokenRef
  weth: TokenRef
  resolve: (address: string) => TokenRef
  fees?: Record<string, number | null | undefined>
}): DisplayPath[] {
  const ordered = [...args.swaps].sort((a, b) => {
    const left = BigInt(a.amountIn || '0')
    const right = BigInt(b.amountIn || '0')
    if (left === right) return 0
    return left > right ? -1 : 1
  })
  const weights = ordered.map((swap) => {
    try {
      return BigInt(swap.amountIn)
    } catch {
      return 0n
    }
  })
  const percents = allocatePercents(weights)
  return ordered.map((swap, index) => {
    const hops = buildHops(swap, args)
    return {
      pct: percents[index] ?? 0,
      amountIn: weights[index] ?? 0n,
      hopCount: Math.max(0, hops.length - 1),
      hops,
    }
  })
}

function buildHops(
  swap: RouteSwap,
  args: {
    src: TokenRef
    dst: TokenRef
    weth: TokenRef
    resolve: (address: string) => TokenRef
    fees?: Record<string, number | null | undefined>
  },
): DisplayHop[] {
  const legs = swap.route
  if (legs.length === 0) return []
  const hops: DisplayHop[] = []
  const firstIn = legs[0]!.tokenIn
  if (isNativeToken(args.src) && sameAddress(firstIn, args.weth.address)) {
    hops.push(hop(args.src, null))
    hops.push(hop(args.weth, WRAP))
  } else {
    hops.push(hop(args.resolve(firstIn), null))
  }
  for (const leg of legs) {
    const fee = args.fees?.[leg.pool.toLowerCase()]
    hops.push(hop(args.resolve(leg.tokenOut), poolTagFromFee(fee ?? null)))
  }
  const last = hops[hops.length - 1]
  if (last && isNativeToken(args.dst) && sameAddress(last.address, args.weth.address)) {
    hops.push(hop(args.dst, WRAP))
  }
  return hops
}

function hop(token: TokenRef, poolBefore: PoolTag | null): DisplayHop {
  return {
    symbol: token.symbol,
    icon: token.icon,
    address: token.address,
    poolBefore,
  }
}
