import { clampSlippage, SLIPPAGE_DEFAULT } from '../src/lib/slippage.js'
import { forwardNordstern, isHexAddress, json, methodNotAllowed, NORDSTERN_ORIGIN, refererFor } from './nordstern.js'

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
export const HEAD = methodNotAllowed

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

export async function GET(request: Request): Promise<Response> {
  try {
    const incoming = new URL(request.url)
    const src = incoming.searchParams.get('src')?.trim() ?? ''
    const dst = incoming.searchParams.get('dst')?.trim() ?? ''
    const amount = incoming.searchParams.get('amount')?.trim() ?? ''
    const from = incoming.searchParams.get('from')?.trim() ?? ''
    const slippage = clampSlippage(Number(incoming.searchParams.get('slippage'))) ?? SLIPPAGE_DEFAULT

    if (!isHexAddress(src) || !isHexAddress(dst) || !isHexAddress(from) || !/^\d+$/.test(amount)) {
      return json({ error: 'Invalid quote parameters.' }, 400)
    }

    const upstream = new URL(`${NORDSTERN_ORIGIN}/aggregator/43111`)
    upstream.searchParams.set('src', src)
    upstream.searchParams.set('dst', dst)
    upstream.searchParams.set('amount', amount)
    upstream.searchParams.set('from', from)
    upstream.searchParams.set('slippage', String(slippage))
    return await forwardNordstern(upstream, refererFor(request), 'no-store')
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Quote failed.'
    return json({ error: 'Could not build the Nordstern quote request.', detail }, 500)
  }
}
