import { formatAmountInput } from '../lib/amount'
import { shortAddress } from '../lib/address'
import { txUrl } from '../lib/constants'
import { formatEth, formatUnitsFixed } from '../lib/format'
import { useSwap } from '../state/SwapProvider'
import { IconArrow, IconCheck, IconClose, IconExternal, Spinner } from './icons'
import { TokenIcon } from './token-icon'

export function TxModals() {
  const swap = useSwap()
  return (
    <>
      {swap.txOpen && swap.tx ? <TxDialog /> : null}
      {swap.confirm ? <ConfirmDialog /> : null}
    </>
  )
}

function TxDialog() {
  const swap = useSwap()
  const tx = swap.tx
  if (!tx) return null
  const success = tx.status === 'success'
  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => swap.closeTx()} />
      <div className="modal__panel modal__panel--tx" role="dialog" aria-modal="true" aria-labelledby="tx-title">
        <button className="tool modal__x" type="button" aria-label="Close" onClick={() => swap.closeTx()}>
          <IconClose />
        </button>
        <div className={success ? 'txstate txstate--success' : 'txstate txstate--pending'}>
          <div className="txstate__ico">{success ? <IconCheck /> : <Spinner />}</div>
          <h3 id="tx-title">{success ? 'Swap complete' : 'Swap submitted'}</h3>
          <p>
            {success
              ? 'Your tokens are in your wallet.'
              : 'Waiting for confirmation on Hemi. This usually takes a few seconds.'}
          </p>
        </div>
        <div className="txsum">
          <div>
            <TokenIcon symbol={tx.from.symbol} icon={tx.from.icon} size="sm" />
            <b>{trimAmount(tx.amountIn, tx.from.decimals)}</b> {tx.from.symbol}
          </div>
          <span className="txsum__arrow">
            <IconArrow />
          </span>
          <div>
            <TokenIcon symbol={tx.to.symbol} icon={tx.to.icon} size="sm" />
            <b>{formatUnitsFixed(tx.amountOut, tx.to.decimals, tx.to.displayDecimals)}</b> {tx.to.symbol}
          </div>
        </div>
        <dl className="txmeta">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={success ? 'tag tag--good' : 'tag tag--warn'}>{success ? 'Confirmed' : 'Pending'}</span>
            </dd>
          </div>
          {success ? (
            <div>
              <dt>Routes used</dt>
              <dd>{tx.paths} paths</dd>
            </div>
          ) : null}
          <div>
            <dt>Network fee</dt>
            <dd>{tx.feeWei != null ? formatEth(tx.feeWei) : '–'}</dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>
              <a href={txUrl(tx.hash)} target="_blank" rel="noopener noreferrer">
                {shortAddress(tx.hash)} <IconExternal />
              </a>
            </dd>
          </div>
        </dl>
        {success ? (
          <a className="btn btn--primary btn--block" href={txUrl(tx.hash)} target="_blank" rel="noopener noreferrer">
            View on explorer.hemi.xyz <IconExternal />
          </a>
        ) : null}
        <button className={success ? 'btn btn--ghost btn--block' : 'btn btn--secondary btn--block'} type="button" onClick={() => swap.closeTx()}>
          {success ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  )
}

function ConfirmDialog() {
  const swap = useSwap()
  const confirm = swap.confirm
  if (!confirm) return null
  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => swap.dismissConfirm()} />
      <div className="modal__panel modal__panel--tx" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="tool modal__x" type="button" aria-label="Close" onClick={() => swap.dismissConfirm()}>
          <IconClose />
        </button>
        <div className="txstate">
          <h3 id="confirm-title">Quote updated</h3>
          <p>The price moved before signing. Review the new amount instead of swapping the old one.</p>
        </div>
        <dl className="txmeta">
          <div>
            <dt>Shown</dt>
            <dd>
              {formatUnitsFixed(confirm.shown, swap.toToken.decimals, swap.toToken.displayDecimals)} {swap.toToken.symbol}
            </dd>
          </div>
          <div>
            <dt>New quote</dt>
            <dd>
              {formatUnitsFixed(BigInt(confirm.next.toAmount), swap.toToken.decimals, swap.toToken.displayDecimals)} {swap.toToken.symbol}
            </dd>
          </div>
        </dl>
        <button className="btn btn--primary btn--block" type="button" onClick={() => swap.acceptConfirm()}>
          Swap at new price
        </button>
        <button className="btn btn--ghost btn--block" type="button" onClick={() => swap.dismissConfirm()}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function trimAmount(amount: bigint, decimals: number): string {
  const text = formatAmountInput(amount, decimals)
  const [whole, frac = ''] = text.split('.')
  return frac ? `${whole}.${frac.slice(0, 6)}` : whole!
}
