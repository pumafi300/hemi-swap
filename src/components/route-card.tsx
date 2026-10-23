import { useMemo } from 'react'
import { parseAbi } from 'viem'
import { useReadContracts } from 'wagmi'
import { checksumAddress, sameAddress, shortAddress } from '../lib/address'
import { formatUnitsFixed } from '../lib/format'
import { mapSwapsToPaths, type TokenRef } from '../lib/route'
import { useSwap } from '../state/SwapProvider'
import { IconBolt, IconInfo } from './icons'
import { TokenIcon } from './token-icon'

const feeAbi = parseAbi(['function fee() view returns (uint24)'])

export function RouteCard() {
  const swap = useSwap()
  const quote = swap.quote
  const pools = useMemo(() => {
    if (!quote) return []
    const set = new Set<string>()
    for (const swapRow of quote.swaps) {
      for (const leg of swapRow.route) set.add(leg.pool.toLowerCase())
    }
    return [...set]
  }, [quote])

  const feeReads = useReadContracts({
    contracts: pools.flatMap((pool) => {
      const address = checksumAddress(pool)
      if (!address) return []
      return [{ address, abi: feeAbi, functionName: 'fee' as const }]
    }),
    query: { enabled: pools.length > 0, staleTime: 60_000 },
  })

  const fees = useMemo(() => {
    const map: Record<string, number | null> = {}
    pools.forEach((pool, index) => {
      const row = feeReads.data?.[index]
      map[pool] = row && row.status === 'success' ? Number(row.result) : null
    })
    return map
  }, [pools, feeReads.data])

  const paths = useMemo(() => {
    if (!quote) return []
    const resolve = (address: string): TokenRef => {
      const known = swap.tokens.find((token) => sameAddress(token.address, address))
      if (known) return known
      return { address, symbol: shortAddress(address) }
    }
    const weth = swap.tokens.find((token) => token.symbol === 'WETH')
    if (!weth) return []
    return mapSwapsToPaths({
      swaps: quote.swaps,
      src: swap.fromToken,
      dst: swap.toToken,
      weth,
      resolve,
      fees,
    })
  }, [quote, swap.tokens, swap.fromToken, swap.toToken, fees])

  const poolCount = quote ? quote.swaps.reduce((sum, row) => sum + row.route.length, 0) : 0
  const ready = Boolean(quote) && paths.length > 0

  return (
    <section className={ready ? 'card route-card' : 'card route-card is-empty'}>
      <div className="card__head">
        <div>
          <h2 className="card__title">Best route</h2>
          <p className="card__sub">Your trade is split to get the best price</p>
        </div>
        <span className="badge badge--accent">
          {ready ? `Split across ${paths.length} ${paths.length === 1 ? 'route' : 'routes'}` : swap.quoteLoading ? 'Finding route' : 'No route yet'}
        </span>
      </div>
      <div
        className="splitbar"
        role="img"
        aria-label={ready ? paths.map((path) => `${path.pct}%`).join(', ') : 'No route split'}
      >
        {paths.map((path, index) => (
          <span key={index} className={`splitbar__seg seg-${index % 5}`} style={{ flex: `${Math.max(path.pct, 1)} 1 0` }} title={`${path.pct}%`} />
        ))}
      </div>
      {ready ? (
        <ol className="paths">
          {paths.map((path, index) => (
            <li className="path" key={`${path.pct}-${index}`}>
              <div className="path__head">
                <span className={`path__pct seg-${index % 5}-bg`}>{path.pct === 0 ? '<1%' : `${path.pct}%`}</span>
                <span className="path__amt">
                  {formatUnitsFixed(path.amountIn, swap.fromToken.decimals, swap.fromToken.displayDecimals)} {swap.fromToken.symbol}
                </span>
                <span className="path__hops-n">
                  {path.hopCount} hop{path.hopCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="path__hops">
                {path.hops.map((hop, hopIndex) => (
                  <span className="hop" key={`${hop.address}-${hopIndex}`}>
                    {hop.poolBefore ? (
                      <span className={hop.poolBefore.wrap ? 'pool pool--wrap' : 'pool'} title={hop.poolBefore.title}>
                        <span>{hop.poolBefore.label}</span>
                        <i />
                      </span>
                    ) : null}
                    <span className="hopchip">
                      <TokenIcon symbol={hop.symbol} icon={hop.icon} size="sm" />
                      {hop.symbol}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="paths">
          <li className="paths__empty">
            <IconInfo />
            <span>
              {swap.quoteError
                ? 'No route available for this pair.'
                : swap.quoteLoading
                  ? 'Fetching the best route on Hemi.'
                  : 'Enter an amount to see how your swap gets split across paths.'}
            </span>
          </li>
        </ol>
      )}
      <div className="route-card__foot">
        <span className="powered">
          <IconBolt /> Powered by <b>Nordstern Finance</b>
        </span>
        <span className="muted">{ready ? `${poolCount} pools · Hemi` : '–'}</span>
      </div>
    </section>
  )
}
