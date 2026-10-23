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
    return await forwardNordstern(upstream, refererFor(request), 'public, max-age=10')
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Prices failed.'
    return json({ error: 'Could not build the Nordstern price request.', detail }, 500)
  }
}
