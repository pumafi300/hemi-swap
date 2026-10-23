import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { hemi } from '../chain'
import { HEMI_RPC_URL } from '../lib/constants'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()

const connectors = [injected({ shimDisconnect: true })]

if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: 'HemiSwap',
        description: 'DEX aggregator on Hemi mainnet, routed by Nordstern Finance.',
        url: typeof location !== 'undefined' ? location.origin : 'https://hemiswap.app',
        icons: [],
      },
    }),
  )
}

export const walletConnectEnabled = Boolean(projectId)

export const wagmiConfig = createConfig({
  chains: [hemi],
  connectors,
  multiInjectedProviderDiscovery: true,
  ssr: false,
  transports: {
    [hemi.id]: http(HEMI_RPC_URL, { timeout: 20_000, retryCount: 1 }),
  },
})
