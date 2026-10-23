import { defineChain } from 'viem'
import { HEMI_CHAIN_ID, HEMI_EXPLORER, HEMI_RPC_URL } from './lib/constants'

export const hemi = defineChain({
  id: HEMI_CHAIN_ID,
  name: 'Hemi',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [HEMI_RPC_URL] } },
  blockExplorers: { default: { name: 'Hemi Explorer', url: HEMI_EXPLORER } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
})
