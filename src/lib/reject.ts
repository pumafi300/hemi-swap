import { UserRejectedRequestError } from 'viem'

export function isUserReject(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) return true
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: number; name?: string; message?: string; shortMessage?: string; cause?: unknown }
    const message = `${record.shortMessage ?? ''} ${record.message ?? ''}`
    if (record.code === 4001 || record.name === 'UserRejectedRequestError') return true
    if (/user rejected|user denied|rejected the request/i.test(message)) return true
    current = record.cause
  }
  return false
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as { shortMessage?: string; message?: string }
    if (record.shortMessage) return record.shortMessage
    if (record.message) return record.message
  }
  return 'Something went wrong.'
}
