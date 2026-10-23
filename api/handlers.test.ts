import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as prices } from './prices'
import { GET as quote, POST as quotePost } from './quote'

const FROM = '0x7a3F00000000000000000000000000000000c91E'
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const USDC = '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA'

function quoteUrl(query = ''): string {
  return `https://hemi-swap.vercel.app/api/quote${query}`
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Vercel quote and price handlers', () => {
  it('returns JSON for a missing quote instead of throwing', async () => {
    const response = await quote(new Request(quoteUrl()))
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({ error: 'Invalid quote parameters.' })
  })

  it('rejects a non-GET with JSON', async () => {
    const response = await quotePost()
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed.' })
  })

  it('sends a Referer and passes a JSON quote through', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Referer')).toBe('https://hemi-swap.vercel.app')
      return new Response(JSON.stringify({ toAmount: '1', tx: { to: '0xC87De04e2EC1F4282dFF2933A2D58199f688fC3d' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await quote(
      new Request(
        quoteUrl(`?src=${ETH}&dst=${USDC}&amount=1000&from=${FROM}&slippage=80`),
        { headers: { origin: 'https://hemi-swap.vercel.app' } },
      ),
    )
    expect(response.status).toBe(200)
    const called = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(called.pathname).toBe('/aggregator/43111')
    expect(called.searchParams.get('slippage')).toBe('50')
    await expect(response.json()).resolves.toMatchObject({ toAmount: '1' })
  })

  it('turns an upstream rate-limit body into JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('slow down, rate limited', { status: 429, headers: { 'content-type': 'text/plain' } })),
    )
    const response = await quote(
      new Request(quoteUrl(`?src=${ETH}&dst=${USDC}&amount=1&from=${FROM}&slippage=0.5`)),
    )
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.error).toMatch(/rate-limited/)
  })

  it('returns JSON when Nordstern cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED')
      }),
    )
    const response = await prices(new Request(`https://hemi-swap.vercel.app/api/prices?token=${ETH}`))
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toMatch(/unreachable/)
    expect(body.detail).toMatch(/ECONNREFUSED/)
  })

  it('keeps a JSON 422 from Nordstern so the client can map it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'no swap route found: no known liquidity for src token' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    const response = await quote(
      new Request(quoteUrl(`?src=${ETH}&dst=${USDC}&amount=1&from=${FROM}&slippage=0.5`)),
    )
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('no known liquidity') })
  })
})
