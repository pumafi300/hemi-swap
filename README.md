# HemiSwap

HemiSwap is a single-page DEX aggregator for [Hemi](https://hemi.xyz) mainnet (chain id `43111`). It asks [Nordstern Finance](https://api.nordstern.finance) for a quote and swap calldata, then sends that transaction to the Nordstern Guard from your wallet.

The interface follows the approved full-bleed orange mockup: ink and cream cards, hard offset shadows, Bricolage Grotesque and Space Grotesk (self-hosted), and a dark route panel.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # tsc --noEmit && vite build
npm run preview  # production build on http://localhost:4173
```

Injected wallets (MetaMask, Rabby, and other EIP-6963 wallets) work with no configuration. WalletConnect is optional.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | No | WalletConnect Cloud project id. Vite inlines it at build time. Leave it unset and the connect dialog only lists injected wallets. |

Copy `.env.example` to `.env.local` if you set it. Do not commit `.env` files.

## Deploy on Vercel

Import the GitHub repo. The included `vercel.json` selects the Vite framework, builds with `npm run build`, and publishes `dist`. The SPA rewrite sends every non-API path to `index.html`.

`api/quote.ts` and `api/prices.ts` are Node functions. Each exports `GET(request)` and returns JSON for every outcome, including a Nordstern outage, a plain-text rate limit, or a bad query. They forward only chain `43111` and always send a `Referer` (the browser `Origin` or `Referer` when it is an http(s) URL, otherwise `https://hemiswap.xyz`).

`npm run dev` and `npm run preview` do not execute those files. Vite proxies `/api/quote` and `/api/prices` straight to Nordstern. The functions are what production runs.

The first deploy crashed both routes with `FUNCTION_INVOCATION_FAILED` before the handler ran. `package.json` is `"type": "module"`, so Vercel loads the compiled function with Node's native ESM resolver. The handlers imported `../src/lib/address` with no file extension, and that module also imports `viem`. Node threw `ERR_MODULE_NOT_FOUND` while evaluating the module. The handlers now import only extensioned local files (`./nordstern.js`, `../src/lib/slippage.js`) and do not import `viem`.

Set `VITE_WALLETCONNECT_PROJECT_ID` in the Vercel project only if you want WalletConnect. No other secrets are required. Nordstern does not use an API key.

## How a swap works

1. The wallet must be on Hemi. If it is on another chain, the app asks it to switch or add chain `43111` (`https://rpc.hemi.network/rpc`).
2. Quotes are `GET /api/quote?src&dst&amount&from&slippage`. `amount` is raw base units. `slippage` is a percent, clamped to `0.01`–`50` (default `0.5`). A warning appears above 5%.
3. Nordstern requires `from`. Before a wallet connects, quotes use a fixed indicative address and the button stays **Connect Wallet**.
4. The response includes `toAmount`, `minToAmount`, `gasEstimate`, `swaps` (split routes), and `tx`.
5. The app refuses to sign unless `tx.to` is the Nordstern Guard `0xC87De04e2EC1F4282dFF2933A2D58199f688fC3d`, the calldata is present, native swaps send exactly the entered ETH value, and ERC-20 swaps send zero ETH.
6. ERC-20s use a plain `approve(Guard, amount)`. The default is the exact sell amount. An optional toggle approves unlimited. There is no Permit2.
7. Quotes go stale in about 12 seconds. A ring counts that down and refreshes. Immediately before signing, the app quotes again. If the output moves by more than 0.5%, a confirmation shows the new amount instead of swapping silently.
8. Pending and success states link to `https://explorer.hemi.xyz/tx/<hash>`.

Native ETH uses the sentinel `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`. Wrapped ETH is `0x4200000000000000000000000000000000000006`.

Default tokens: ETH, WETH, USDC.e (`0xad11…5afA`, 6 decimals), USDT (`0xbB0D…1C2e`, 6), hemiBTC (`0xAA40…ef28`, 8), WBTC (`0x03C7…Cfa3`, 8), HEMI (`0x99e3…591D`, 18), VUSD (`0xD359…345B`, 18, Vetro USD). Any other Hemi ERC-20 can be imported by address. Symbol, name, and decimals are read on-chain. Imported tokens stay in `localStorage` and are shown with a warning.

## Nordstern quirks

- Calls with no `Referer` can be rate-limited with a plain-text body. The proxy always sends one, and non-JSON bodies are shown as a retryable error instead of crashing.
- `from` is required. A missing or invalid address is HTTP 400. `src == dst` is HTTP 403. An unknown token is HTTP 422 (`no known liquidity` is shown as no route). An unknown chain id is an HTML 404.
- `gasEstimate` from the API is about half of a real `eth_estimateGas`. The displayed fee and the gas limit use an on-chain estimate when the wallet is connected, otherwise `gasEstimate * 2`, then add 20%. If estimation fails (for example before the token is approved), the app falls back to that scaled figure. A gas limit of 0 is omitted so the wallet estimates it.
- The API labels every pool `uniswap_v3`, including Algebra pools such as BrownFi that hold most VUSD liquidity. Those labels are not shown. Pool chips use the on-chain `fee()` when it returns a normal fee tier (`v3 · 0.3%`, `v3 · 0.01%`, …). Anything else is `Pool` or `Pool · x%`. A native wrap is labeled `wrap`.
- Price impact is `(usd in − usd out) / usd in` from Nordstern's `/prices/43111` feed. If either price is missing, the row is left blank. At 3% or more the swap stays disabled until the warning is acknowledged.
- Nordstern documents no protocol fee, so the row says 0%. If execution is better than the quote, Nordstern keeps the surplus above the quoted output. That is described in the Risks dialog, not as a fee.
- There is no deadline parameter. The mockup's deadline control is not in the app.
- Slippage above 50 is still accepted by the API, so the client and the serverless function clamp it.

## Tests

`npm test` covers amount parsing, slippage clamping, the Guard address check, the material re-quote threshold, gas scaling, route mapping (including the native wrap hop and the ban on venue names), Nordstern error mapping, the swap button state machine, and the `/api/quote` and `/api/prices` handlers (JSON errors, Referer, and upstream failures).
