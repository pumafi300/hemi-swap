import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnect, useConnectors, useDisconnect } from 'wagmi'
import { hemi } from '../chain'
import { shortAddress } from '../lib/address'
import { addressUrl } from '../lib/constants'
import { formatUnitsFixed } from '../lib/format'
import { walletConnectEnabled } from '../wallet/config'
import { useSwap } from '../state/SwapProvider'
import { HemiMark } from './hemi-mark'
import { IconCheck, IconClose, IconExternal, IconInfo, IconWallet, IconX, IconChevron } from './icons'

export function Header() {
  const swap = useSwap()
  const { mutate: disconnect } = useDisconnect()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  const balance =
    swap.nativeBalance == null ? null : `${formatUnitsFixed(swap.nativeBalance, 18, 3)} ETH`

  return (
    <header className="header">
      <a className="brand" href="/" aria-label="HemiSwap home">
        <span className="brand__word">
          Hemi<span className="brand__swap">Swap</span>
        </span>
        <span className="brand__tag">Beta</span>
      </a>
      <div className="header__right">
        <button
          className={swap.wrongNetwork ? 'chip network-pill is-wrong' : 'chip network-pill'}
          type="button"
          title={swap.wrongNetwork ? 'Switch to Hemi mainnet' : 'Hemi mainnet · chain 43111'}
          onClick={() => {
            if (swap.wrongNetwork) swap.switchToHemi()
          }}
        >
          <img className="network-pill__logo" src="/hemi-symbol.svg" alt="" width="20" height="20" />
          <span className="network-pill__name">{swap.wrongNetwork ? (swap.switching ? 'Switching' : 'Switch') : 'Hemi'}</span>
          <span className="network-pill__dot" aria-hidden="true" />
        </button>
        <button
          className="btn btn--connect"
          type="button"
          hidden={swap.connected}
          onClick={() => swap.setConnectOpen(true)}
        >
          <IconWallet />
          <span>{swap.connecting ? 'Connecting…' : 'Connect Wallet'}</span>
        </button>
        <div className="account-wrap" ref={menuRef} hidden={!swap.connected}>
          <button
            className="account"
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="account__avatar" aria-hidden="true" />
            <span className="account__col">
              <span className="account__addr">{swap.address ? shortAddress(swap.address) : ''}</span>
              <span className="account__bal">{balance ?? '–'}</span>
            </span>
            <IconChevron />
          </button>
          {menuOpen && swap.address ? (
            <div className="menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard?.writeText(swap.address ?? '')
                  swap.pushToast({ kind: 'info', title: 'Address copied' })
                  setMenuOpen(false)
                }}
              >
                Copy address
              </button>
              <a role="menuitem" href={addressUrl(swap.address)} target="_blank" rel="noopener noreferrer">
                View on explorer
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  disconnect()
                  setMenuOpen(false)
                }}
              >
                Disconnect
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function Hero() {
  return (
    <div className="hero">
      <span className="eyebrow">
        <HemiMark /> Hemi mainnet aggregator
      </span>
      <h2>
        <span>Every path.</span>
        <span className="out">One swap.</span>
      </h2>
      <p>HemiSwap splits your trade across the deepest routes on Hemi, so you keep more of every swap.</p>
      <div className="hero__stats">
        <span>
          Protocol fee <b>0%</b>
        </span>
        <span>
          Multi-hop <b>split routing</b>
        </span>
        <span>
          Powered by <b>Nordstern</b>
        </span>
      </div>
    </div>
  )
}

export function Footer() {
  const [info, setInfo] = useState<null | 'risks' | 'terms'>(null)
  useEffect(() => {
    if (!info) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setInfo(null)
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [info])
  return (
    <>
      <footer className="footer">
        <div className="footer__left">
          <HemiMark className="footer__mark" />
          <span>HemiSwap · Hemi mainnet (43111)</span>
        </div>
        <div className="footer__links">
          <a href="https://nordstern.finance" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
          <button type="button" onClick={() => setInfo('terms')}>
            Terms
          </button>
          <button type="button" onClick={() => setInfo('risks')}>
            Risks
          </button>
          <a href="https://explorer.hemi.xyz" target="_blank" rel="noopener noreferrer">
            Explorer ↗
          </a>
        </div>
        <p className="footer__disc">
          Quotes and swap transactions are provided by Nordstern Finance. Trades execute on Hemi. Not financial advice.
        </p>
      </footer>
      {info ? (
        <div className="modal">
          <div className="modal__backdrop" onClick={() => setInfo(null)} />
          <div className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
            <div className="modal__head">
              <h3 id="info-title">{info === 'risks' ? 'Risks' : 'Terms'}</h3>
              <button className="tool" type="button" aria-label="Close" onClick={() => setInfo(null)}>
                <IconClose />
              </button>
            </div>
            <div className="prose">
              {info === 'risks' ? (
                <>
                  <p>HemiSwap is a beta interface. You can lose funds to price movement, slippage, a bad token, or a contract bug.</p>
                  <p>Nordstern does not charge a protocol fee on the quoted amount. If a swap executes better than the quote, Nordstern keeps the surplus above the quoted output.</p>
                  <p>Always confirm the token, amount, and contract in your wallet before you sign. Imported tokens are not reviewed.</p>
                </>
              ) : (
                <>
                  <p>HemiSwap is provided as-is, without a warranty. You are responsible for the transactions you sign.</p>
                  <p>Nothing in this interface is an offer, solicitation, or financial advice.</p>
                </>
              )}
            </div>
            <button className="btn btn--primary btn--block" type="button" onClick={() => setInfo(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function Toasts() {
  const { toasts, dismissToast } = useSwap()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast--${toast.kind}`} key={toast.id}>
          <span className="toast__ico">{toast.kind === 'success' ? <IconCheck /> : toast.kind === 'error' ? <IconX /> : <IconInfo />}</span>
          <div>
            <b>{toast.title}</b>
            {toast.message ? <p>{toast.message}</p> : null}
            {toast.href ? (
              <a href={toast.href} target="_blank" rel="noopener noreferrer">
                View on explorer <IconExternal />
              </a>
            ) : null}
          </div>
          <button className="tool" type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  )
}

export function ConnectModal() {
  const swap = useSwap()
  const connectors = useConnectors()
  const connect = useConnect()
  const visible = useMemo(() => {
    const named = connectors.some((connector) => connector.type === 'injected' && connector.id !== 'injected')
    return connectors.filter((connector) => !(named && connector.id === 'injected'))
  }, [connectors])

  if (!swap.connectOpen) return null
  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => swap.setConnectOpen(false)} />
      <div className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="connect-title">
        <div className="modal__head">
          <h3 id="connect-title">Connect wallet</h3>
          <button className="tool" type="button" aria-label="Close" onClick={() => swap.setConnectOpen(false)}>
            <IconClose />
          </button>
        </div>
        <ul className="tokenlist">
          {visible.length === 0 ? (
            <li className="tokenlist__empty">
              <IconWallet />
              <b>No wallet found</b>
              <span>Install MetaMask, Rabby, or another injected wallet.</span>
            </li>
          ) : (
            visible.map((connector) => (
              <li key={connector.uid}>
                <button
                  type="button"
                  className="tokrow"
                  onClick={() => {
                    connect.mutate(
                      { connector, chainId: hemi.id },
                      {
                        onSuccess: () => swap.setConnectOpen(false),
                        onError: (error) => {
                          const message = error instanceof Error ? error.message : 'The wallet rejected the request.'
                          if (!/rejected|denied/i.test(message)) {
                            swap.pushToast({ kind: 'error', title: 'Could not connect', message })
                          }
                        },
                      },
                    )
                  }}
                >
                  {connector.icon ? (
                    <img className="tokico tokico--lg" src={connector.icon} alt="" width="36" height="36" />
                  ) : (
                    <span className="tokico tokico--lg tokico--blank" aria-hidden="true">
                      {connector.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="tokrow__id">
                    <b>{connector.name}</b>
                    <span>{connector.type === 'walletConnect' ? 'WalletConnect' : 'Browser wallet'}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="modal__foot">
          <IconInfo />
          <span>
            {walletConnectEnabled
              ? 'Injected wallets connect directly. WalletConnect opens a QR code.'
              : 'Injected wallets work without setup. WalletConnect appears when a project id is configured.'}
          </span>
        </div>
      </div>
    </div>
  )
}
