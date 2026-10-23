import { formatAmountInput } from './amount'
import { decimalToNumber } from './impact'

export function formatUnitsFixed(amount: bigint, decimals: number, dp: number): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const places = Math.max(0, Math.min(dp, 18))
  const base = 10n ** BigInt(decimals)
  const scale = 10n ** BigInt(places)
  const rounded = places === 0 ? (abs + base / 2n) / base * scale : (abs * scale + base / 2n) / base
  if (abs > 0n && rounded === 0n) {
    const min = places <= 1 ? '0.1' : `0.${'0'.repeat(places - 1)}1`
    return `<${min}`
  }
  const whole = rounded / scale
  const frac = rounded % scale
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const body = places > 0 ? `${wholeStr}.${frac.toString().padStart(places, '0')}` : wholeStr
  return negative ? `-${body}` : body
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const abs = Math.abs(value)
  if (abs > 0 && abs < 0.0001) return value < 0 ? '-<$0.0001' : '<$0.0001'
  const dp = abs > 0 && abs < 1 ? 4 : 2
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  return `${value < 0 ? '-$' : '$'}${formatted}`
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const abs = Math.abs(value)
  const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8
  return value.toLocaleString('en-US', { maximumFractionDigits: dp })
}

export function formatEth(wei: bigint): string {
  const value = decimalToNumber(wei, 18)
  if (!Number.isFinite(value) || value === 0) return '0 ETH'
  if (value >= 1) return `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH`
  if (value >= 0.0001) return `${trimZeros(value.toFixed(5))} ETH`
  if (value >= 0.00000001) return `${trimZeros(value.toFixed(8))} ETH`
  return `${value.toExponential(2)} ETH`
}

function trimZeros(text: string): string {
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

export function formatImpact(pct: number, withMinus: boolean): string {
  if (Math.abs(pct) < 0.01) return '<0.01%'
  if (pct < 0) return `${pct.toFixed(2)}%`
  return withMinus ? `−${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`
}

export function amountNumber(amount: bigint, decimals: number): number {
  return Number(formatAmountInput(amount, decimals))
}
