import type { Address, Hex, PublicClient } from 'viem'
import { checksumAddress } from './address'
import { scaleApiGas, withGasBuffer } from './gas'
import { parseTxValue, type SwapTx } from './guard'

export type GasEstimate = { gasLimit: bigint; feeWei: bigint; source: 'rpc' | 'api' }

export async function estimateSwapGas(
  client: PublicClient,
  args: { account?: Address; tx: SwapTx; apiGas: bigint },
): Promise<GasEstimate> {
  const gasPrice = await client.getGasPrice()
  const apiScaled = scaleApiGas(args.apiGas)
  let estimated = apiScaled
  let source: 'rpc' | 'api' = 'api'
  const to = checksumAddress(args.tx.to)
  const value = parseTxValue(args.tx.value)
  if (args.account && to && value != null && /^0x[0-9a-fA-F]+$/.test(args.tx.data)) {
    try {
      estimated = await client.estimateGas({
        account: args.account,
        to,
        data: args.tx.data as Hex,
        value,
      })
      source = 'rpc'
    } catch {
      estimated = apiScaled
      source = 'api'
    }
  }
  const gasLimit = withGasBuffer(estimated)
  return { gasLimit, feeWei: gasLimit > 0n ? gasLimit * gasPrice : 0n, source }
}
