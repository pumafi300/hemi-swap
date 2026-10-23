/**
 * Shared by the Vercel functions. No npm imports and no extensionless
 * relative imports: the project is `"type": "module"`, and Vercel loads these
 * files as native ESM. An extensionless import fails at load time with
 * ERR_MODULE_NOT_FOUND, which the platform reports as FUNCTION_INVOCATION_FAILED.
 */

export const NORDSTERN_ORIGIN = 'https://api.nordstern.finance'
const FALLBACK_REFERER = 'https://hemiswap.app'

export function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

export function json(body: unknown, status: number, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
    },
  })
}

export function refererFor(request: Request): string {
  const origin = request.headers.get('origin')?.trim() ?? ''
  if (/^https?:\/\//i.test(origin)) return origin
  const referer = request.headers.get('referer')?.trim() ?? ''
  if (/^https?:\/\//i.test(referer)) return referer
  return FALLBACK_REFERER
}

export function methodNotAllowed(): Response {
  return json({ error: 'Method not allowed.' }, 405)
}

/** Forward to Nordstern. Every outcome is JSON, including upstream failures. */
export async function forwardNordstern(url: URL, referer: string, cache: string): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: referer,
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The upstream request failed.'
    return json({ error: 'Nordstern is unreachable.', detail }, 502)
  }

  const text = await upstream.text()
  const trimmed = text.trim()
  const type = upstream.headers.get('content-type') ?? ''
  const isJson = type.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')
  if (!isJson) {
    const limited = upstream.status === 429 || /rate|too many|slow down/i.test(trimmed)
    return json(
      {
        error: limited
          ? 'Nordstern rate-limited this request. Try again in a moment.'
          : 'Nordstern returned a non-JSON response.',
        status: upstream.status,
        detail: trimmed.slice(0, 300),
      },
      limited ? 429 : upstream.status >= 400 ? upstream.status : 502,
    )
  }

  return new Response(trimmed || '{}', {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
    },
  })
}
