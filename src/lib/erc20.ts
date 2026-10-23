import { parseAbi, type Address, type PublicClient } from 'viem'

const stringAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

const bytesAbi = parseAbi([
  'function name() view returns (bytes32)',
  'function symbol() view returns (bytes32)',
])

function bytes32ToString(value: `0x${string}`): string {
  const hex = value.slice(2).replace(/(00)+$/i, '')
  if (hex.length % 2 !== 0) return ''
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return new TextDecoder().decode(bytes).replace(/\u0000/g, '').trim()
}

async function readLabel(client: PublicClient, address: Address, fn: 'name' | 'symbol'): Promise<string> {
  try {
    return await client.readContract({ address, abi: stringAbi, functionName: fn })
  } catch {
    const word = await client.readContract({ address, abi: bytesAbi, functionName: fn })
    return bytes32ToString(word)
  }
}

export async function readErc20Metadata(client: PublicClient, address: Address): Promise<{ name: string; symbol: string; decimals: number }> {
  const decimals = Number(await client.readContract({ address, abi: stringAbi, functionName: 'decimals' }))
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('Unsupported decimals')
  }
  const [name, symbol] = await Promise.all([readLabel(client, address, 'name'), readLabel(client, address, 'symbol')])
  return { name, symbol, decimals }
}
