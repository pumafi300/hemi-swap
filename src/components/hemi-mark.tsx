import { HEMI_SYMBOL_PATH } from '../lib/hemi-symbol'

export function HemiMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d={HEMI_SYMBOL_PATH} />
    </svg>
  )
}
