import type { Address } from 'viem'
import { isHexAddress, sameAddress } from './address'
import { NATIVE_SENTINEL, WETH_ADDRESS } from './constants'

export type Token = {
  address: Address
  symbol: string
  name: string
  decimals: number
  displayDecimals: number
  native?: boolean
  icon?: string
  imported?: boolean
}

export const DEFAULT_TOKENS: Token[] = [
  {
    address: NATIVE_SENTINEL,
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    displayDecimals: 5,
    native: true,
    icon: '/tokens/eth.svg',
  },
  {
    address: WETH_ADDRESS,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    displayDecimals: 5,
    icon: '/tokens/weth.svg',
  },
  {
    address: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA',
    symbol: 'USDC.e',
    name: 'USD Coin (bridged)',
    decimals: 6,
    displayDecimals: 2,
    icon: '/tokens/usdc.svg',
  },
  {
    address: '0xbB0D083fb1be0A9f6157ec484b6C79E0A4e31C2e',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    displayDecimals: 2,
    icon: '/tokens/usdt.svg',
  },
  {
    address: '0xAA40c0c7644e0b2B224509571e10ad20d9C4ef28',
    symbol: 'hemiBTC',
    name: 'Hemi Bitcoin',
    decimals: 8,
    displayDecimals: 6,
    icon: '/tokens/hemibtc.svg',
  },
  {
    address: '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3',
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    decimals: 8,
    displayDecimals: 6,
    icon: '/tokens/wbtc.svg',
  },
  {
    address: '0x99e3dE3817F6081B2568208337ef83295b7f591D',
    symbol: 'HEMI',
    name: 'Hemi',
    decimals: 18,
    displayDecimals: 2,
    icon: '/tokens/hemi.svg',
  },
  {
    address: '0xD3599AE62EE280709A22268a46d23164214e345B',
    symbol: 'VUSD',
    name: 'Vetro USD',
    decimals: 18,
    displayDecimals: 2,
    icon: '/tokens/vusd.svg',
  },
]

export const QUICK_SYMBOLS = ['ETH', 'hemiBTC', 'WBTC', 'USDC.e', 'HEMI'] as const

export const IMPORTED_STORAGE_KEY = 'hemiswap.imported.v1'

export type StoredToken = {
  address: Address
  symbol: string
  name: string
  decimals: number
}

export function findToken(tokens: Token[], address: string): Token | undefined {
  return tokens.find((token) => sameAddress(token.address, address))
}

export function tokenBySymbol(tokens: Token[], symbol: string): Token | undefined {
  return tokens.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase())
}

export function isStoredToken(value: unknown): value is StoredToken {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.address === 'string' &&
    isHexAddress(row.address) &&
    typeof row.symbol === 'string' &&
    typeof row.name === 'string' &&
    typeof row.decimals === 'number' &&
    Number.isInteger(row.decimals) &&
    row.decimals >= 0 &&
    row.decimals <= 36 &&
    row.symbol.trim().length > 0 &&
    row.symbol.length <= 20 &&
    row.name.length <= 64
  )
}

export function storedToToken(stored: StoredToken): Token {
  return {
    address: stored.address,
    symbol: stored.symbol,
    name: stored.name,
    decimals: stored.decimals,
    displayDecimals: Math.min(6, stored.decimals),
    imported: true,
  }
}

export function loadImportedTokens(): Token[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(IMPORTED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredToken).slice(0, 24).map(storedToToken)
  } catch {
    return []
  }
}

export function saveImportedTokens(tokens: Token[]): void {
  if (typeof localStorage === 'undefined') return
  const payload: StoredToken[] = tokens
    .filter((token) => token.imported)
    .slice(0, 24)
    .map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    }))
  localStorage.setItem(IMPORTED_STORAGE_KEY, JSON.stringify(payload))
}

export function cleanTokenLabel(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F]/g, '').trim().slice(0, max)
}
