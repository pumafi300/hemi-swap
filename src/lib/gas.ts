/** Nordstern's gasEstimate runs about half of real gas. Double it before the buffer. */
export function scaleApiGas(apiGas: bigint): bigint {
  if (apiGas <= 0n) return 0n
  return apiGas * 2n
}

/** About 20% headroom on the gas limit and on the fee shown to the user. */
export function withGasBuffer(gas: bigint): bigint {
  if (gas <= 0n) return 0n
  return (gas * 120n) / 100n
}

export function networkFeeWei(gasLimit: bigint, gasPrice: bigint): bigint {
  if (gasLimit <= 0n || gasPrice <= 0n) return 0n
  return gasLimit * gasPrice
}
