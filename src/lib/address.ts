import { getAddress, type Address } from 'viem'

export function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function checksumAddress(value: string): Address | null {
  try {
    return getAddress(value)
  } catch {
    return null
  }
}

export function shortAddress(address: string): string {
  const value = address.trim()
  if (value.length < 10) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
