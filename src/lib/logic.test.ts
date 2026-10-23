import { describe, expect, it } from 'vitest'
import { formatAmountInput, parseAmount, sanitizeAmountInput } from './amount'
import { formatEth } from './format'
import { deriveCta } from './cta'
import { isGuardAddress, parseTxValue, quoteMovedMaterially, swapTxRejection } from './guard'
import { scaleApiGas, withGasBuffer } from './gas'
import { impactLevel, priceImpactPercent } from './impact'
import { mapQuoteFailure, parseQuoteResponse } from './quote'
import { allocatePercents, mapSwapsToPaths, poolTagFromFee, type RouteSwap } from './route'
import { clampSlippage, minOutFromSlippage } from './slippage'
import { GUARD_ADDRESS, NATIVE_SENTINEL, WETH_ADDRESS } from './constants'

const ready = {
  connected: true,
  wrongNetwork: false,
  amount: 1n,
  quoteReady: true,
  quoteLoading: false,
  quoteKind: null,
  unsafe: false,
  overBalance: false,
  fromSymbol: 'USDC.e',
  fromNative: false,
  needsApproval: false,
  approvalLoading: false,
  phase: 'idle' as const,
  impact: 'ok' as const,
  ack: false,
  flowKind: null,
}

describe('amount parsing', () => {
  it('parses whole tokens and fractional base units', () => {
    expect(parseAmount('1', 18)).toBe(10n ** 18n)
    expect(parseAmount('1.5', 18)).toBe(1_500_000_000_000_000_000n)
    expect(parseAmount('0.000001', 6)).toBe(1n)
    expect(parseAmount('', 18)).toBeNull()
    expect(parseAmount('.', 18)).toBeNull()
    expect(parseAmount('1.1234567', 6)).toBeNull()
  })

  it('sanitizes typing and keeps the amount round-trippable', () => {
    expect(sanitizeAmountInput('1,250.12999', 6)).toBe('1250.12999')
    expect(sanitizeAmountInput('00.50abc', 18)).toBe('0.50')
    expect(sanitizeAmountInput('1.2.3', 18)).toBe('1.23')
    const raw = parseAmount('12.5', 8)!
    expect(formatAmountInput(raw, 8)).toBe('12.5')
    expect(formatAmountInput(0n, 18)).toBe('0')
  })
})

describe('slippage', () => {
  it('clamps to 0.01–50 and rounds to 2 decimals', () => {
    expect(clampSlippage(0.5)).toBe(0.5)
    expect(clampSlippage(0.001)).toBe(0.01)
    expect(clampSlippage(80)).toBe(50)
    expect(clampSlippage(Number.NaN)).toBeNull()
    expect(clampSlippage(1.239)).toBe(1.24)
  })

  it('applies slippage in basis points without floats', () => {
    expect(minOutFromSlippage(1_000_000n, 0.5)).toBe(995_000n)
    expect(minOutFromSlippage(10_000n, 1)).toBe(9_900n)
  })
})

describe('guard check', () => {
  const tx = { to: GUARD_ADDRESS, data: '0x3f0bde25', value: '0' }

  it('accepts the Guard regardless of case and rejects anything else', () => {
    expect(isGuardAddress(GUARD_ADDRESS.toLowerCase())).toBe(true)
    expect(isGuardAddress(WETH_ADDRESS)).toBe(false)
    expect(isGuardAddress('not an address')).toBe(false)
    expect(swapTxRejection(tx, false, 5n)).toBeNull()
    expect(swapTxRejection({ ...tx, to: WETH_ADDRESS }, false, 5n)).toMatch(/Guard/)
    expect(swapTxRejection({ ...tx, value: '1' }, false, 5n)).toMatch(/ETH/)
    expect(swapTxRejection({ ...tx, value: '5', data: '0x1234' }, true, 5n)).toMatch(/calldata/)
    expect(swapTxRejection({ ...tx, value: '4' }, true, 5n)).toMatch(/does not match/)
    expect(parseTxValue('0x10')).toBe(16n)
  })

  it('asks for confirmation when output moves more than 0.5%', () => {
    expect(quoteMovedMaterially(10_000n, 10_049n)).toBe(false)
    expect(quoteMovedMaterially(10_000n, 9_949n)).toBe(true)
    expect(quoteMovedMaterially(10_000n, 10_050n)).toBe(false)
    expect(quoteMovedMaterially(10_000n, 10_051n)).toBe(true)
  })
})

describe('network fee formatting', () => {
  it('prints cheap Hemi fees as a fixed decimal', () => {
    expect(formatEth(2_760_000_000_000n)).toBe('0.00000276 ETH')
    expect(formatEth(180_000_000_000_000n)).toBe('0.00018 ETH')
    expect(formatEth(0n)).toBe('0 ETH')
  })
})

describe('gas buffer', () => {
  it('doubles the API estimate and then adds 20%', () => {
    expect(scaleApiGas(1000n)).toBe(2000n)
    expect(withGasBuffer(2000n)).toBe(2400n)
    expect(withGasBuffer(0n)).toBe(0n)
    expect(scaleApiGas(0n)).toBe(0n)
  })
})

describe('route mapping', () => {
  const weth = { address: WETH_ADDRESS, symbol: 'WETH', icon: '/weth.svg' }
  const usdc = { address: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA', symbol: 'USDC.e' }
  const btc = { address: '0xAA40c0c7644e0b2B224509571e10ad20d9C4ef28', symbol: 'hemiBTC' }
  const poolA = '0x9580D4519C9F27642e21085E763E761a74eF3735'
  const poolB = '0x44b4DB10a1891926f8B655944Babe0CdDe774b90'
  const swaps: RouteSwap[] = [
    {
      amountIn: '600',
      amountOut: '1',
      route: [
        {
          amountIn: '600',
          amountOut: '1',
          pool: poolA,
          tokenIn: WETH_ADDRESS,
          tokenOut: usdc.address,
        },
      ],
    },
    {
      amountIn: '400',
      amountOut: '1',
      route: [
        { amountIn: '400', amountOut: '2', pool: poolB, tokenIn: WETH_ADDRESS, tokenOut: btc.address },
        { amountIn: '2', amountOut: '1', pool: poolA, tokenIn: btc.address, tokenOut: usdc.address },
      ],
    },
  ]

  it('builds split paths, a native wrap hop, and generic fee labels', () => {
    expect(poolTagFromFee(3000)).toEqual({ label: 'v3 · 0.3%', title: 'v3 pool · 0.3% fee', wrap: false })
    expect(poolTagFromFee(100)).toMatchObject({ label: 'v3 · 0.01%' })
    expect(poolTagFromFee(2500).label).toBe('Pool · 0.25%')
    expect(poolTagFromFee(null).label).toBe('Pool')
    expect(allocatePercents([600n, 400n])).toEqual([60, 40])
    expect(allocatePercents([1n, 1n, 1n])).toEqual([34, 33, 33])

    const paths = mapSwapsToPaths({
      swaps,
      src: { address: NATIVE_SENTINEL, symbol: 'ETH', native: true },
      dst: usdc,
      weth,
      resolve: (address) => [weth, usdc, btc].find((token) => token.address.toLowerCase() === address.toLowerCase()) ?? { address, symbol: 'TOK' },
      fees: { [poolA.toLowerCase()]: 3000, [poolB.toLowerCase()]: null },
    })

    expect(paths.map((path) => path.pct)).toEqual([60, 40])
    expect(paths[0]!.hops.map((hop) => hop.symbol)).toEqual(['ETH', 'WETH', 'USDC.e'])
    expect(paths[0]!.hops[1]!.poolBefore).toMatchObject({ label: 'wrap', wrap: true })
    expect(paths[0]!.hops[2]!.poolBefore?.label).toBe('v3 · 0.3%')
    expect(paths[1]!.hops.map((hop) => hop.symbol)).toEqual(['ETH', 'WETH', 'hemiBTC', 'USDC.e'])
    expect(paths[1]!.hops[2]!.poolBefore?.label).toBe('Pool')
    const serialized = JSON.stringify(paths, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    expect(serialized).not.toContain('uniswap')
    expect(paths[0]!.hopCount).toBe(2)
  })
})

describe('quote errors and parsing', () => {
  it('maps Nordstern status codes onto the UI states', () => {
    expect(mapQuoteFailure(400, '{"error":"recipient (previousely from) must be a valid 0x... address"}').kind).toBe('badRequest')
    expect(mapQuoteFailure(403, '{"error":"arbitrage requests (src == dst) are not enabled"}').kind).toBe('same')
    expect(mapQuoteFailure(422, '{"error":"no swap route found: no known liquidity for src token 0x1111"}').kind).toBe('noroute')
    expect(mapQuoteFailure(422, '{"error":"insufficient liquidity for this size"}').kind).toBe('liquidity')
    expect(mapQuoteFailure(404, '<html><h1>404 Not Found</h1></html>').kind).toBe('unavailable')
    expect(mapQuoteFailure(429, 'slow down').retryable).toBe(true)
    expect(mapQuoteFailure(200, 'rate limited, try later').kind).toBe('rateLimit')
  })

  it('drops the venue label and keeps minToAmount', () => {
    const parsed = parseQuoteResponse(
      {
        src: NATIVE_SENTINEL,
        dst: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA',
        fromAmount: '1000',
        toAmount: '2000',
        minToAmount: '1990',
        gasEstimate: '10',
        simulationBlock: 5,
        swaps: [
          {
            amountIn: '1000',
            amountOut: '2000',
            route: [
              {
                amountIn: '1000',
                amountOut: '2000',
                pool: '0x9580D4519C9F27642e21085E763E761a74eF3735',
                tokenIn: WETH_ADDRESS,
                tokenOut: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA',
                type: 'uniswap_v3',
              },
            ],
          },
        ],
        tx: { from: '0x7a3F00000000000000000000000000000000c91E', to: GUARD_ADDRESS, data: '0xabcdef01', value: '1000' },
      },
      0.5,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.quote.minToAmount).toBe('1990')
    expect(parsed.quote.swaps[0]!.route[0]).not.toHaveProperty('type')
    expect(swapTxRejection(parsed.quote.tx, true, 1000n)).toBeNull()
  })

  it('computes a minimum when the API omits minToAmount', () => {
    const parsed = parseQuoteResponse(
      {
        src: WETH_ADDRESS,
        dst: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA',
        fromAmount: '1',
        toAmount: '10000',
        gasEstimate: '10',
        swaps: [],
        tx: { from: '0x7a3F00000000000000000000000000000000c91E', to: GUARD_ADDRESS, data: '0xabcdef01', value: '0' },
      },
      1,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.quote.minToAmount).toBe('9900')
  })
})

describe('price impact and call to action', () => {
  it('computes impact from spot prices and omits it when a price is missing', () => {
    const impact = priceImpactPercent({
      amountIn: 1_000_000n,
      amountOut: 990_000n,
      decimalsIn: 6,
      decimalsOut: 6,
      priceIn: 1,
      priceOut: 1,
    })
    expect(impact).toBeCloseTo(1)
    expect(impactLevel(impact)).toBe('warn')
    expect(impactLevel(3)).toBe('danger')
    expect(impactLevel(0.2)).toBe('ok')
    expect(
      priceImpactPercent({
        amountIn: 1n,
        amountOut: 1n,
        decimalsIn: 18,
        decimalsOut: 18,
        priceIn: null,
        priceOut: 1,
      }),
    ).toBeNull()
  })

  it('picks the call to action for each trade state', () => {
    expect(deriveCta({ ...ready, connected: false }).action).toBe('connect')
    expect(deriveCta({ ...ready, wrongNetwork: true }).action).toBe('switch')
    expect(deriveCta({ ...ready, amount: 0n }).label).toBe('Enter an amount')
    expect(deriveCta({ ...ready, quoteKind: 'noroute', quoteReady: false }).label).toBe('No route found')
    expect(deriveCta({ ...ready, quoteKind: 'liquidity', quoteReady: false }).label).toBe('Insufficient liquidity')
    expect(deriveCta({ ...ready, overBalance: true }).label).toBe('Insufficient USDC.e balance')
    expect(deriveCta({ ...ready, needsApproval: true }).action).toBe('approve')
    expect(deriveCta({ ...ready, fromNative: true, fromSymbol: 'ETH' }).note).toBe('')
    expect(deriveCta({ ...ready, impact: 'danger', ack: false })).toMatchObject({ disabled: true, variant: 'danger' })
    expect(deriveCta({ ...ready, impact: 'danger', ack: true }).label).toBe('Swap anyway')
    expect(deriveCta({ ...ready, phase: 'swapping' }).busy).toBe(true)
    expect(deriveCta({ ...ready, flowKind: 'reverted' }).label).toBe('Try again')
  })
})
