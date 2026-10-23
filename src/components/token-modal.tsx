import { useEffect, useMemo, useRef, useState } from 'react'
import { isHexAddress, sameAddress, shortAddress } from '../lib/address'
import { formatUnitsFixed, formatUsd } from '../lib/format'
import { decimalToNumber } from '../lib/impact'
import { QUICK_SYMBOLS, tokenBySymbol } from '../lib/tokens'
import { useSwap } from '../state/SwapProvider'
import { IconCheck, IconClose, IconInfo, IconSearch, IconWarn } from './icons'
import { TokenIcon } from './token-icon'

export function TokenModal() {
  const swap = useSwap()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const open = swap.picker != null

  useEffect(() => {
    if (!open) return
    setQuery('')
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open, swap.picker])

  const other = swap.picker === 'from' ? swap.toToken : swap.fromToken
  const current = swap.picker === 'from' ? swap.fromToken : swap.toToken
  const term = query.trim()
  const lowered = term.toLowerCase()
  const filtered = useMemo(() => {
    if (!lowered) return swap.tokens
    return swap.tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(lowered) ||
        token.name.toLowerCase().includes(lowered) ||
        token.address.toLowerCase() === lowered,
    )
  }, [swap.tokens, lowered])
  const showImport = isHexAddress(term) && !swap.tokens.some((token) => sameAddress(token.address, term))

  if (!open) return null

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => swap.setPicker(null)} />
      <div className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="tm-title">
        <div className="modal__head">
          <h3 id="tm-title">Select a token</h3>
          <button className="tool" type="button" aria-label="Close" onClick={() => swap.setPicker(null)}>
            <IconClose />
          </button>
        </div>
        <label className="search">
          <IconSearch />
          <input
            ref={inputRef}
            placeholder="Search name, symbol or paste address"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search tokens"
            value={query}
            onChange={(event) => {
              swap.clearImportError()
              setQuery(event.target.value)
            }}
          />
        </label>
        <div className="quickrow">
          {QUICK_SYMBOLS.map((symbol) => {
            const token = tokenBySymbol(swap.tokens, symbol)
            if (!token) return null
            return (
              <button key={symbol} type="button" className="qchip" onClick={() => swap.selectToken(token)}>
                <TokenIcon symbol={token.symbol} icon={token.icon} size="sm" />
                {token.symbol}
              </button>
            )
          })}
        </div>
        <ul className="tokenlist">
          {showImport ? (
            <li className="import">
              <div className="import__head">
                <IconWarn />
                <div>
                  <b>Import token by address</b>
                  <p>{shortAddress(term)} on Hemi · not in the default list</p>
                </div>
              </div>
              <p className="import__warn">
                Anyone can create a token, including fake versions of existing ones. Only import tokens you trust. Routing and
                prices may be unavailable.
              </p>
              {swap.importError ? <p className="import__warn">{swap.importError}</p> : null}
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={swap.importing}
                onClick={() => void swap.importToken(term)}
              >
                {swap.importing ? 'Reading token…' : 'I understand, import token'}
              </button>
            </li>
          ) : filtered.length === 0 ? (
            <li className="tokenlist__empty">
              <IconSearch />
              <b>No tokens found</b>
              <span>Paste a full 0x… contract address to import any token on Hemi.</span>
            </li>
          ) : (
            filtered.map((token) => {
              const balance = swap.balanceOf(token)
              const price = swap.priceOf(token)
              const selected = sameAddress(token.address, current.address)
              const isOther = sameAddress(token.address, other.address)
              return (
                <li key={token.address}>
                  <button
                    type="button"
                    className={selected ? 'tokrow is-selected' : 'tokrow'}
                    onClick={() => swap.selectToken(token)}
                  >
                    <TokenIcon symbol={token.symbol} icon={token.icon} size="lg" />
                    <span className="tokrow__id">
                      <b>{token.symbol}</b>
                      <span>
                        {token.name}
                        {token.native ? ' · native' : ''}
                        {token.imported ? ' · imported' : ''}
                      </span>
                    </span>
                    <span className="tokrow__bal">
                      {balance == null ? null : (
                        <>
                          <b>{formatUnitsFixed(balance, token.decimals, Math.min(token.displayDecimals, 4))}</b>
                          <span>{price == null ? '' : formatUsd(decimalToNumber(balance, token.decimals) * price)}</span>
                        </>
                      )}
                    </span>
                    {selected ? (
                      <span className="tokrow__check">
                        <IconCheck />
                      </span>
                    ) : isOther ? (
                      <span className="tokrow__tag">Other side</span>
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>
        <div className="modal__foot">
          <IconInfo />
          <span>Can’t find it? Paste any token contract address on Hemi to import it.</span>
        </div>
      </div>
    </div>
  )
}
