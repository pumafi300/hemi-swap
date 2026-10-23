/**
 * Keep a single decimal point and at most `decimals` fractional digits.
 * A comma is a thousands separator when a dot is also present, and a decimal
 * mark when it is the only separator (or the last one).
 */
export function sanitizeAmountInput(raw: string, decimals: number): string {
  const trimmed = raw.trim()
  const lastComma = trimmed.lastIndexOf(',')
  const lastDot = trimmed.lastIndexOf('.')
  let normalized = trimmed
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastComma > lastDot ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed.replace(/,/g, '')
  } else if (lastComma !== -1) {
    normalized = trimmed.replace(',', '.')
  }
  const cleaned = normalized.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  const body = dot === -1 ? cleaned : `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, '')}`
  const [wholeRaw, fracRaw] = body.split('.')
  const whole = (wholeRaw ?? '').replace(/^0+(?=\d)/, '').slice(0, 40)
  if (fracRaw === undefined) return whole
  const frac = fracRaw.slice(0, Math.max(0, decimals))
  return `${whole || '0'}.${frac}`
}

/** Parse a decimal string into base units. Returns null when the text is not a complete amount. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const text = input.trim().replace(/\.$/, '')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  if (decimals < 0 || decimals > 36) return null
  const [whole, frac = ''] = text.split('.')
  if (frac.length > decimals) return null
  try {
    const scale = 10n ** BigInt(decimals)
    const fracPadded = frac.padEnd(decimals, '0')
    return BigInt(whole) * scale + (fracPadded ? BigInt(fracPadded) : 0n)
  } catch {
    return null
  }
}

/** Decimal string without grouping and without trailing zeros. Suitable for an input value. */
export function formatAmountInput(amount: bigint, decimals: number): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const scale = 10n ** BigInt(decimals)
  const whole = abs / scale
  const frac = abs % scale
  const sign = negative ? '-' : ''
  if (frac === 0n) return `${sign}${whole.toString()}`
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${sign}${whole.toString()}.${fracStr}`
}
