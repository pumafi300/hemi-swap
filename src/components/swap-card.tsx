import { useEffect, useRef, useState } from 'react'
import { formatEth, formatImpact, formatRate, formatUnitsFixed, formatUsd } from '../lib/format'
import { decimalToNumber } from '../lib/impact'
import { clampSlippage, slippageWarning, SLIPPAGE_MAX, SLIPPAGE_MIN } from '../lib/slippage'
import { useSwap } from '../state/SwapProvider'
import { IconArrowDown, IconCheck, IconChevron, IconGear, IconSwap, IconWarn, IconX, Spinner } from './icons'
import { TokenIcon } from './token-icon'

export function SwapCard() {
  const swap = useSwap()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customSlippage, setCustomSlippage] = useState('')
  const [flipped, setFlipped] = useState(false)
  const [rateInverted, setRateInverted] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fromBal = swap.balanceOf(swap.fromToken)
  const toBal = swap.balanceOf(swap.toToken)
  const quote = swap.quote
  const fromPrice = swap.priceOf(swap.fromToken)
  const toPrice = swap.priceOf(swap.toToken)
  const ethPrice = swap.priceOf(swap.tokens.find((token) => token.native) ?? swap.tokens[0]!)
  const fromUsd = swap.amount && fromPrice != null ? decimalToNumber(swap.amount, swap.fromToken.decimals) * fromPrice : null
  const toUsd = quote && toPrice != null ? decimalToNumber(BigInt(quote.toAmount), swap.toToken.decimals) * toPrice : null
  const typedSlippage = Number(customSlippage)
  const customOutOfRange =
    customSlippage !== '' && Number.isFinite(typedSlippage) && (typedSlippage < SLIPPAGE_MIN || typedSlippage > SLIPPAGE_MAX)
  const hint = slippageWarning(swap.slippage)
  const rate = quote && swap.amount && swap.amount > 0n
    ? decimalToNumber(BigInt(quote.toAmount), swap.toToken.decimals) / decimalToNumber(swap.amount, swap.fromToken.decimals)
    : null

  return (
    <div className="card swap-card" id="swap-card">
      <div className="card__head">
        <h1 className="card__title">Swap</h1>
        <div className="card__tools">
          <button
            className={swap.ring.live ? 'tool refresh' : 'tool refresh is-idle'}
            type="button"
            title="Quote refreshes every 12s"
            aria-label="Refresh quote"
            onClick={() => swap.refreshQuote()}
          >
            <svg className="refresh__ring" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="refresh__track" cx="12" cy="12" r="10" />
              <circle
                className="refresh__bar"
                cx="12"
                cy="12"
                r="10"
                pathLength={100}
                style={{ strokeDashoffset: swap.ring.offset }}
              />
            </svg>
            <span className="refresh__num">{swap.ring.live ? swap.ring.seconds : '–'}</span>
          </button>
          <div className="settings-wrap" ref={settingsRef}>
            <button
              className="tool"
              id="settings-btn"
              type="button"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <IconGear />
            </button>
            <div className="popover" id="settings-pop" hidden={!settingsOpen}>
              <div className="popover__title">Slippage tolerance</div>
              <div className="seg" role="group" aria-label="Slippage tolerance">
                {[0.1, 0.5, 1].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={!customSlippage && swap.slippage === value ? 'is-on' : ''}
                    onClick={() => {
                      swap.setSlippage(value)
                      setCustomSlippage('')
                    }}
                  >
                    {value}%
                  </button>
                ))}
                <label className="seg__custom">
                  <input
                    inputMode="decimal"
                    placeholder="Custom"
                    aria-label="Custom slippage"
                    value={customSlippage}
                    onChange={(event) => {
                      const next = event.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '')
                      setCustomSlippage(next)
                      const parsed = Number(next)
                      const clamped = clampSlippage(parsed)
                      if (next !== '' && next !== '.' && clamped != null) swap.setSlippage(clamped)
                    }}
                    onBlur={() => {
                      if (!customSlippage) return
                      const clamped = clampSlippage(Number(customSlippage))
                      if (clamped != null) {
                        swap.setSlippage(clamped)
                        setCustomSlippage(String(clamped))
                      }
                    }}
                  />
                  <span>%</span>
                </label>
              </div>
              <p className="popover__hint" data-warn={hint.warn || customOutOfRange ? '1' : undefined}>
                {customOutOfRange ? `Clamped to ${swap.slippage}% (allowed ${SLIPPAGE_MIN}–${SLIPPAGE_MAX}%). ` : ''}
                {hint.text}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={swap.overBalance ? 'field field--from is-error' : 'field field--from'}>
        <div className="field__top">
          <span className="field__label">You pay</span>
          <span className="field__balance">
            Balance: <b>{swap.connected && fromBal != null ? formatUnitsFixed(fromBal, swap.fromToken.decimals, Math.min(swap.fromToken.displayDecimals, 4)) : '–'}</b>
            <button className="max" type="button" hidden={!swap.connected} onClick={() => swap.setMax()}>
              MAX
            </button>
          </span>
        </div>
        <div className="field__main">
          <input
            className="field__input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-label="Amount to pay"
            value={swap.amountText}
            onChange={(event) => swap.setAmountText(event.target.value)}
          />
          <button className="token-pill" type="button" aria-label="Select token to pay" onClick={() => swap.setPicker('from')}>
            <TokenIcon symbol={swap.fromToken.symbol} icon={swap.fromToken.icon} />
            <span className="token-pill__sym">{swap.fromToken.symbol}</span>
            <IconChevron />
          </button>
        </div>
        <div className="field__bottom">
          <span className="muted">{fromUsd == null ? (swap.amount ? '–' : '$0.00') : `≈ ${formatUsd(fromUsd)}`}</span>
        </div>
      </div>

      <div className="flip-wrap">
        <button
          className={flipped ? 'flip is-flipped' : 'flip'}
          type="button"
          aria-label="Flip tokens"
          onClick={() => {
            setFlipped((value) => !value)
            setRateInverted(false)
            swap.flip()
          }}
        >
          <IconArrowDown />
        </button>
      </div>

      <div className={swap.quoteLoading || swap.refreshing ? 'field field--to is-loading' : 'field field--to'}>
        <div className="field__top">
          <span className="field__label">You receive</span>
          <span className="field__balance">
            Balance: <b>{swap.connected && toBal != null ? formatUnitsFixed(toBal, swap.toToken.decimals, Math.min(swap.toToken.displayDecimals, 4)) : '–'}</b>
          </span>
        </div>
        <div className="field__main">
          <input
            className="field__input"
            readOnly
            placeholder="0.00"
            aria-label="Amount to receive"
            value={quote ? formatUnitsFixed(BigInt(quote.toAmount), swap.toToken.decimals, swap.toToken.displayDecimals) : ''}
          />
          <button className="token-pill" type="button" aria-label="Select token to receive" onClick={() => swap.setPicker('to')}>
            <TokenIcon symbol={swap.toToken.symbol} icon={swap.toToken.icon} />
            <span className="token-pill__sym">{swap.toToken.symbol}</span>
            <IconChevron />
          </button>
        </div>
        <div className="field__bottom">
          <span className="muted">{toUsd == null ? '$0.00' : `≈ ${formatUsd(toUsd)}`}</span>
          {quote && swap.impact != null ? (
            <span className={`impact impact--${swap.level}`}>({formatImpact(swap.impact, true)})</span>
          ) : null}
        </div>
      </div>

      <Alert />

      <dl className={`quote${quote ? '' : ' is-empty'}${swap.refreshing ? ' is-loading' : ''}`}>
        <div className="quote__row">
          <dt>Rate</dt>
          <dd>
            <button className="linkish" type="button" onClick={() => setRateInverted((value) => !value)} disabled={!rate}>
              <span>
                {rate
                  ? rateInverted
                    ? `1 ${swap.toToken.symbol} = ${formatRate(1 / rate)} ${swap.fromToken.symbol}`
                    : `1 ${swap.fromToken.symbol} = ${formatRate(rate)} ${swap.toToken.symbol}`
                  : '–'}
              </span>
              <IconSwap />
            </button>
          </dd>
        </div>
        <div className="quote__row">
          <dt>Price impact</dt>
          <dd>
            {quote && swap.impact != null ? (
              <span className={`impact impact--${swap.level}`}>
                {swap.level === 'warn' || swap.level === 'danger' ? <IconWarn /> : null}
                {formatImpact(swap.impact, false)}
              </span>
            ) : (
              '–'
            )}
          </dd>
        </div>
        <div className="quote__row">
          <dt>
            Min. received <span className="muted">({swap.slippage}% slippage)</span>
          </dt>
          <dd>{quote ? `${formatUnitsFixed(BigInt(quote.minToAmount), swap.toToken.decimals, swap.toToken.displayDecimals)} ${swap.toToken.symbol}` : '–'}</dd>
        </div>
        <div className="quote__row">
          <dt>Network fee</dt>
          <dd>
            {swap.feeWei != null ? (
              <>
                {ethPrice != null ? `≈ ${formatUsd(decimalToNumber(swap.feeWei, 18) * ethPrice)}` : null}{' '}
                <span className="muted">({formatEth(swap.feeWei)})</span>
              </>
            ) : (
              '–'
            )}
          </dd>
        </div>
        <div className="quote__row">
          <dt>Protocol fee</dt>
          <dd>
            <span className="tag tag--good">0%</span>
          </dd>
        </div>
      </dl>

      {swap.showSteps ? (
        swap.fromToken.native ? (
          <ol className="steps steps--native">
            <li className="step is-done">
              <span className="step__n">
                <IconCheck />
              </span>
              <span>No approval needed for native ETH</span>
            </li>
          </ol>
        ) : (
          <ol className="steps">
            <li className={swap.needsApproval ? 'step is-active' : 'step is-done'}>
              <span className="step__n">{swap.needsApproval ? '1' : <IconCheck />}</span>
              <span>Approve {swap.fromToken.symbol}</span>
            </li>
            <li className="steps__line" />
            <li className={swap.needsApproval ? 'step' : 'step is-active'}>
              <span className="step__n">2</span>
              <span>Swap</span>
            </li>
          </ol>
        )
      ) : null}

      {swap.showSteps && !swap.fromToken.native && swap.needsApproval ? (
        <div className="approve-opt">
          <label className="ack">
            <input type="checkbox" checked={swap.unlimited} onChange={(event) => swap.setUnlimited(event.target.checked)} />
            Unlimited approval
          </label>
          <p className="muted">Exact amount is the default. Unlimited lets the Guard spend this token until you revoke it.</p>
        </div>
      ) : null}

      <button
        className={`btn btn--primary btn--cta${swap.cta.variant === 'danger' ? ' btn--danger' : ''}${swap.cta.busy ? ' is-busy' : ''}`}
        type="button"
        disabled={swap.cta.disabled}
        onClick={() => swap.onCta()}
      >
        {swap.cta.busy ? (
          <span className="btn__spin">
            <Spinner />
          </span>
        ) : null}
        {swap.cta.label}
      </button>
      <p className="swap-card__note">{swap.cta.note}</p>
    </div>
  )
}

function Alert() {
  const swap = useSwap()
  const quote = swap.quote
  if (swap.quoteError) {
    const copy = quoteCopy(swap.quoteError.kind, swap.fromToken.symbol, swap.toToken.symbol, swap.quoteError.detail)
    return (
      <div className={`alert alert--${copy.tone}`} role="alert">
        <IconX />
        <div>
          <b>{copy.title}</b>
          <p>{copy.body}</p>
        </div>
      </div>
    )
  }
  if (swap.flowError) {
    const flow = flowCopy(swap.flowError)
    return (
      <div className="alert alert--error" role="alert">
        <IconX />
        <div>
          <b>{flow.title}</b>
          <p>{flow.body}</p>
        </div>
      </div>
    )
  }
  if (swap.wrongNetwork) {
    return (
      <div className="alert alert--warn" role="status">
        <IconWarn />
        <div>
          <b>Wrong network</b>
          <p>HemiSwap only works on Hemi mainnet (chain 43111). Switch networks to continue.</p>
        </div>
      </div>
    )
  }
  if (quote && (swap.level === 'warn' || swap.level === 'danger')) {
    const loss =
      swap.amount && swap.priceOf(swap.fromToken) != null && swap.priceOf(swap.toToken) != null
        ? decimalToNumber(swap.amount, swap.fromToken.decimals) * (swap.priceOf(swap.fromToken) ?? 0) -
          decimalToNumber(BigInt(quote.toAmount), swap.toToken.decimals) * (swap.priceOf(swap.toToken) ?? 0)
        : null
    const danger = swap.level === 'danger'
    return (
      <div className={`alert alert--${danger ? 'danger' : 'warn'}`} role="status">
        <IconWarn />
        <div>
          <b>
            {danger ? 'Very high price impact' : 'High price impact'} ({swap.impact?.toFixed(2)}%)
          </b>
          <p>
            Liquidity for {swap.fromToken.symbol} → {swap.toToken.symbol} is thin at this size.
            {loss != null && loss > 0 ? ` You may receive ~${formatUsd(loss)} less than the market value.` : ''}
            {danger ? '' : ' Consider a smaller amount.'}
          </p>
          {danger ? (
            <label className="ack">
              <input type="checkbox" checked={swap.ack} onChange={(event) => swap.setAck(event.target.checked)} /> I understand the
              risk and want to swap anyway
            </label>
          ) : null}
        </div>
      </div>
    )
  }
  return <div className="alert" hidden />
}

function quoteCopy(kind: string, from: string, to: string, detail: string): { title: string; body: string; tone: 'error' | 'warn' } {
  if (kind === 'noroute') {
    return {
      tone: 'error',
      title: 'No route found',
      body: `Nordstern couldn’t find a path from ${from} to ${to} on Hemi. Try a different token or a smaller amount.`,
    }
  }
  if (kind === 'liquidity') {
    return {
      tone: 'error',
      title: 'Insufficient liquidity',
      body: 'This trade is larger than available pool depth on Hemi. Reduce the amount or split it into smaller swaps.',
    }
  }
  if (kind === 'same') {
    return { tone: 'error', title: 'Same token', body: 'Choose two different tokens.' }
  }
  if (kind === 'rateLimit') {
    return { tone: 'warn', title: 'Quotes are busy', body: detail || 'The quote service is busy. Try again in a moment.' }
  }
  if (kind === 'guard') {
    return {
      tone: 'error',
      title: 'Route blocked',
      body: 'This quote does not target the Nordstern Guard, so it cannot be signed.',
    }
  }
  return { tone: 'error', title: 'Quote unavailable', body: detail || 'Nordstern did not return a route. Try again.' }
}

function flowCopy(error: { kind: string; message?: string; hash?: string }): { title: string; body: string } {
  if (error.kind === 'rejected') {
    return { title: 'Transaction rejected', body: 'You rejected the request in your wallet. No funds were spent.' }
  }
  if (error.kind === 'reverted') {
    return {
      title: 'Transaction reverted',
      body: 'The swap failed on-chain, most likely because the price moved beyond your slippage. Nothing was swapped; only gas was used.',
    }
  }
  if (error.kind === 'guard') {
    return { title: 'Swap blocked', body: error.message || 'This quote was rejected before it reached your wallet.' }
  }
  return { title: 'Transaction failed', body: error.message || 'The wallet could not send this transaction.' }
}
