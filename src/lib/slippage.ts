export const SLIPPAGE_MIN = 0.01
export const SLIPPAGE_MAX = 50
export const SLIPPAGE_DEFAULT = 0.5

/** Clamp a percent into the range Nordstern will accept. Null when the value is not a number. */
export function clampSlippage(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const clamped = Math.min(SLIPPAGE_MAX, Math.max(SLIPPAGE_MIN, value))
  return Math.round(clamped * 100) / 100
}

export function slippageWarning(value: number): { text: string; warn: boolean } {
  if (value > 5) return { text: 'High slippage. Your swap can be frontrun.', warn: true }
  if (value > 1) return { text: 'Your transaction may be frontrun.', warn: true }
  if (value < 0.1) return { text: 'Very low slippage. Your transaction may fail.', warn: true }
  return { text: 'Default is 0.5% for most swaps.', warn: false }
}

export function minOutFromSlippage(amount: bigint, slippagePct: number): bigint {
  const clamped = clampSlippage(slippagePct) ?? SLIPPAGE_DEFAULT
  const bps = BigInt(Math.round(clamped * 100))
  if (bps >= 10_000n) return 0n
  return (amount * (10_000n - bps)) / 10_000n
}
