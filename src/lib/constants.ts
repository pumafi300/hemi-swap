/** Hemi mainnet and the Nordstern Guard. Addresses are the ones verified against the live API. */
export const HEMI_CHAIN_ID = 43111
export const HEMI_RPC_URL = 'https://rpc.hemi.network/rpc'
export const HEMI_EXPLORER = 'https://explorer.hemi.xyz'
export const NORDSTERN_ORIGIN = 'https://api.nordstern.finance'

/** Native token sentinel Nordstern expects. Not an EIP-55 checksum. */
export const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const GUARD_ADDRESS = '0xC87De04e2EC1F4282dFF2933A2D58199f688fC3d'

/**
 * Used only for indicative quotes before a wallet connects.
 * Nordstern requires `from` and simulates against it; this address is known to quote.
 */
export const INDICATIVE_FROM = '0x7a3F00000000000000000000000000000000c91E'

export const QUOTE_TTL_MS = 12_000
/** Re-quote before signing. Ask the user to confirm if output moves by more than this. */
export const MATERIAL_BPS = 50n

export const GAS_RESERVE_FLOOR = 50_000_000_000_000n // 0.00005 ETH
export const GAS_RESERVE_FALLBACK = 500_000_000_000_000n // 0.0005 ETH

export function txUrl(hash: string): string {
  return `${HEMI_EXPLORER}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${HEMI_EXPLORER}/address/${address}`
}
