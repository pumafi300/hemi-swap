import { isHexAddress } from '../src/lib/address'
import { NORDSTERN_ORIGIN } from '../src/lib/constants'
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

  const token = new URL(request.url).searchParams.get('token')?.trim() ?? ''
  const parts = token
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0 || parts.length > 30 || parts.some((part) => !isHexAddress(part))) {
    return json({ error: 'Invalid token list.' }, 400)
  }

  const upstream = new URL(`${NORDSTERN_ORIGIN}/prices/43111`)
  upstream.searchParams.set('token', parts.join(','))
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
      'cache-control': 'public, max-age=10',
    },
  })
}

export default function handler(request: Request | NodeReq, response?: NodeRes): Promise<Response | void> {
  return dispatch(request, response, handle)
}
