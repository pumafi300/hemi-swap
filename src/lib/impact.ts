import { formatAmountInput } from './amount'

export type ImpactLevel = 'none' | 'ok' | 'warn' | 'danger'

export function decimalToNumber(amount: bigint, decimals: number): number {
  return Number(formatAmountInput(amount, decimals))
}

/**
 * Price impact versus USD spot from Nordstern's price endpoint.
 * Positive means the quote returns less dollar value than spot. Null when a price is missing.
 */
export function priceImpactPercent(args: {
  amountIn: bigint
  amountOut: bigint
  decimalsIn: number
  decimalsOut: number
  priceIn: number | null
  priceOut: number | null
}): number | null {
  const { amountIn, amountOut, decimalsIn, decimalsOut, priceIn, priceOut } = args
  if (priceIn == null || priceOut == null || priceIn <= 0 || priceOut <= 0) return null
  if (amountIn <= 0n || amountOut <= 0n) return null
  const valueIn = decimalToNumber(amountIn, decimalsIn) * priceIn
  const valueOut = decimalToNumber(amountOut, decimalsOut) * priceOut
  if (!Number.isFinite(valueIn) || valueIn <= 0 || !Number.isFinite(valueOut)) return null
  return ((valueIn - valueOut) / valueIn) * 100
}

export function impactLevel(pct: number | null): ImpactLevel {
  if (pct == null || !Number.isFinite(pct)) return 'none'
  if (pct >= 3) return 'danger'
  if (pct >= 1) return 'warn'
  return 'ok'
}
