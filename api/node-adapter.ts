/** Vercel Node functions pass (req, res). A Web `Request` is accepted too. */

export type NodeReq = {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

export type NodeRes = {
  status: (code: number) => NodeRes
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
}

export function isNodeResponse(value: unknown): value is NodeRes {
  if (!value || typeof value !== 'object') return false
  const candidate = value as NodeRes
  return typeof candidate.status === 'function' && typeof candidate.send === 'function'
}

export function nodeToRequest(req: NodeReq): Request {
  const raw = req.url || '/'
  const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://hemiswap.app')
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value) && value[0]) headers.set(key, value.join(', '))
  }
  return new Request(url, { method: req.method || 'GET', headers })
}

export async function dispatch(
  request: Request | NodeReq,
  response: NodeRes | undefined,
  handle: (request: Request) => Promise<Response>,
): Promise<Response | void> {
  const web = request instanceof Request ? request : nodeToRequest(request)
  const result = await handle(web)
  if (response && isNodeResponse(response)) {
    const text = await result.text()
    response.status(result.status)
    result.headers.forEach((value, key) => response.setHeader(key, value))
    response.send(text)
    return
  }
  return result
}
