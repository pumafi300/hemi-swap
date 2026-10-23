import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS, QUICK_SYMBOLS, tokenBySymbol } from './tokens'

const VUSD = '0xD3599AE62EE280709A22268a46d23164214e345B'
const WBTC = '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3'
const HEMI_BTC = '0xAA40c0c7644e0b2B224509571e10ad20d9C4ef28'

describe('default token list', () => {
  it('names VUSD Vetro USD and keeps the Hemi Labs address', () => {
    const vusd = tokenBySymbol(DEFAULT_TOKENS, 'VUSD')
    expect(vusd).toMatchObject({
      address: VUSD,
      symbol: 'VUSD',
      name: 'Vetro USD',
      decimals: 18,
      icon: '/tokens/vusd.svg',
    })
    expect(DEFAULT_TOKENS.filter((token) => token.symbol === 'VUSD')).toHaveLength(1)
  })

  it('lists WBTC beside hemiBTC and on the quick-pick row', () => {
    const symbols = DEFAULT_TOKENS.map((token) => token.symbol)
    const hemi = symbols.indexOf('hemiBTC')
    expect(symbols[hemi + 1]).toBe('WBTC')
    expect(tokenBySymbol(DEFAULT_TOKENS, 'WBTC')).toMatchObject({
      address: WBTC,
      name: 'Wrapped BTC',
      decimals: 8,
      displayDecimals: 6,
      icon: '/tokens/wbtc.svg',
    })
    expect(tokenBySymbol(DEFAULT_TOKENS, 'hemiBTC')?.address).toBe(HEMI_BTC)
    expect(QUICK_SYMBOLS).toEqual(['ETH', 'hemiBTC', 'WBTC', 'USDC.e', 'HEMI'])
  })
})
