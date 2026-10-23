import { GUARD_ADDRESS, MATERIAL_BPS } from './constants'

export function isGuardAddress(to: string | null | undefined): boolean {
  return typeof to === 'string' && to.trim().toLowerCase() === GUARD_ADDRESS.toLowerCase()
}

export function parseTxValue(value: string): bigint | null {
  const text = value.trim()
  if (/^\d+$/.test(text)) return BigInt(text)
  if (/^0x[0-9a-fA-F]+$/.test(text)) return BigInt(text)
  return null
}

export type SwapTx = { to: string; data: string; value: string }

/**
 * Refuse to sign unless the quote targets the Nordstern Guard and the value
 * matches the input (native amount, or zero for ERC-20).
 */
export function swapTxRejection(tx: SwapTx, isNative: boolean, amount: bigint): string | null {
  if (!isGuardAddress(tx.to)) {
    return 'This quote does not target the Nordstern Guard. The swap was not sent.'
  }
  if (!/^0x[0-9a-fA-F]+$/.test(tx.data) || tx.data.length < 10) {
    return 'Swap calldata is missing or invalid.'
  }
  const value = parseTxValue(tx.value)
  if (value == null) return 'Swap value is invalid.'
  if (isNative && value !== amount) return 'Native swap value does not match the amount you entered.'
  if (!isNative && value !== 0n) return 'This token swap tries to send ETH. It was not sent.'
  return null
}

/** True when the fresh output differs from the shown output by more than `bps` (default 0.5%). */
export function quoteMovedMaterially(shown: bigint, next: bigint, bps: bigint = MATERIAL_BPS): boolean {
  if (shown < 0n || next < 0n) return true
  if (shown === 0n) return next !== 0n
  const diff = shown > next ? shown - next : next - shown
  return diff * 10_000n > shown * bps
}
