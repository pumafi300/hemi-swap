import { ConnectModal, Footer, Header, Hero, Toasts } from './components/chrome'
import { RouteCard } from './components/route-card'
import { SwapCard } from './components/swap-card'
import { TokenModal } from './components/token-modal'
import { TxModals } from './components/tx-modals'
import { useSwap } from './state/SwapProvider'

export function App() {
  const swap = useSwap()
  return (
    <div className="app" id="app" data-connected={swap.connected ? 'true' : 'false'} data-phase={swap.phaseAttr}>
      <Header />
      <main className="main">
        <Hero />
        <section className="swap-col" aria-label="Swap">
          <SwapCard />
        </section>
        <aside className="route-col" aria-label="Best route">
          <RouteCard />
        </aside>
      </main>
      <Footer />
      <ConnectModal />
      <TokenModal />
      <TxModals />
      <Toasts />
    </div>
  )
}
