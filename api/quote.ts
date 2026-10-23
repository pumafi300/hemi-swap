import { isHexAddress } from '../src/lib/address'
import { NORDSTERN_ORIGIN } from '../src/lib/constants'
import { clampSlippage, SLIPPAGE_DEFAULT } from '../src/lib/slippage'
import { dispatch, type NodeReq, type NodeRes } from './node-adapter'

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

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

  const origin = request.headers.get('origin')
  const referer = origin && /^https?:\/\//i.test(origin) ? origin : 'https://hemiswap.app'
  const response = await fetch(upstream, {
    headers: { Accept: 'application/json', Referer: referer },
  })
  const text = await response.text()
  return new Response(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export default function handler(request: Request | NodeReq, response?: NodeRes): Promise<Response | void> {
  return dispatch(request, response, handle)
}
