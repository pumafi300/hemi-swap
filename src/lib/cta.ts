import type { ImpactLevel } from './impact'
import type { QuoteErrorKind } from './quote'

export type TradePhase = 'idle' | 'approving' | 'swapping'
export type CtaAction = 'connect' | 'switch' | 'approve' | 'swap' | 'none'

export type CtaModel = {
  label: string
  disabled: boolean
  busy: boolean
  variant: 'primary' | 'danger'
  note: string
  action: CtaAction
}

export type CtaInput = {
  connected: boolean
  wrongNetwork: boolean
  amount: bigint | null
  quoteReady: boolean
  quoteLoading: boolean
  quoteKind: QuoteErrorKind | null
  unsafe: boolean
  overBalance: boolean
  fromSymbol: string
  fromNative: boolean
  needsApproval: boolean
  approvalLoading: boolean
  phase: TradePhase
  impact: ImpactLevel
  ack: boolean
  flowKind: 'rejected' | 'reverted' | 'send' | null
}

const base = (patch: Partial<CtaModel> & Pick<CtaModel, 'label'>): CtaModel => ({
  disabled: false,
  busy: false,
  variant: 'primary',
  note: '',
  action: 'none',
  ...patch,
})

export function deriveCta(state: CtaInput): CtaModel {
  if (!state.connected) return base({ label: 'Connect Wallet', action: 'connect' })
  if (state.wrongNetwork) {
    return base({
      label: 'Switch to Hemi',
      action: 'switch',
      note: 'HemiSwap only trades on Hemi mainnet (43111).',
    })
  }
  if (state.phase === 'approving') {
    return base({
      label: `Approving ${state.fromSymbol}…`,
      disabled: true,
      busy: true,
      note: 'Confirm the approval in your wallet',
    })
  }
  if (state.phase === 'swapping') {
    return base({ label: 'Swapping…', disabled: true, busy: true, note: 'Waiting for confirmation on Hemi' })
  }
  if (state.amount == null || state.amount <= 0n) return base({ label: 'Enter an amount', disabled: true })
  if (state.quoteKind === 'noroute') return base({ label: 'No route found', disabled: true })
  if (state.quoteKind === 'liquidity') return base({ label: 'Insufficient liquidity', disabled: true })
  if (state.quoteKind === 'same') return base({ label: 'Select different tokens', disabled: true })
  if (state.quoteKind) return base({ label: 'Quote unavailable', disabled: true })
  if (state.unsafe) return base({ label: 'Route blocked', disabled: true })
  if (state.quoteLoading || !state.quoteReady) return base({ label: 'Fetching quote…', disabled: true })
  if (state.overBalance) return base({ label: `Insufficient ${state.fromSymbol} balance`, disabled: true })
  if (state.approvalLoading) return base({ label: 'Checking approval…', disabled: true })
  if (state.needsApproval && !state.fromNative) {
    return base({
      label: state.flowKind === 'rejected' ? 'Try again' : `Approve ${state.fromSymbol}`,
      action: 'approve',
      note: `Step 1 of 2 · allow HemiSwap to spend your ${state.fromSymbol}`,
    })
  }
  if (state.impact === 'danger') {
    return base({
      label: state.ack ? 'Swap anyway' : 'Acknowledge price impact',
      disabled: !state.ack,
      variant: 'danger',
      action: 'swap',
    })
  }
  const retry = state.flowKind === 'rejected' || state.flowKind === 'reverted'
  return base({
    label: retry ? 'Try again' : 'Swap',
    action: 'swap',
    note: state.fromNative ? '' : `Step 2 of 2 · ${state.fromSymbol} approved`,
  })
}
