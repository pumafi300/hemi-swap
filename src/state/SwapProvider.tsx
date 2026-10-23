import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { erc20Abi, maxUint256, type Address, type Hex } from 'viem'
import {
  useBalance,
  useConnection,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { hemi } from '../chain'
import { useDebounced } from '../hooks/use-debounced'
import { checksumAddress, sameAddress, shortAddress } from '../lib/address'
import { formatAmountInput, parseAmount, sanitizeAmountInput } from '../lib/amount'
import { deriveCta, type CtaModel } from '../lib/cta'
import { readErc20Metadata } from '../lib/erc20'
import { estimateSwapGas } from '../lib/estimate-gas'
import { parseTxValue, quoteMovedMaterially, swapTxRejection } from '../lib/guard'
import { withGasBuffer, scaleApiGas } from '../lib/gas'
import { impactLevel, priceImpactPercent, type ImpactLevel } from '../lib/impact'
import {
  fetchPrices,
  fetchQuote,
  QuoteRequestError,
  type NormalizedQuote,
  type QuoteErrorKind,
} from '../lib/quote'
import { errorMessage, isUserReject } from '../lib/reject'
import { clampSlippage, SLIPPAGE_DEFAULT } from '../lib/slippage'
import {
  cleanTokenLabel,
  DEFAULT_TOKENS,
  findToken,
  loadImportedTokens,
  saveImportedTokens,
  type Token,
} from '../lib/tokens'
import {
  GAS_RESERVE_FALLBACK,
  GAS_RESERVE_FLOOR,
  GUARD_ADDRESS,
  INDICATIVE_FROM,
  NATIVE_SENTINEL,
  QUOTE_TTL_MS,
  txUrl,
} from '../lib/constants'

const GUARD = checksumAddress(GUARD_ADDRESS) ?? GUARD_ADDRESS

export type FlowError =
  | { kind: 'rejected'; where: 'approve' | 'swap' }
  | { kind: 'reverted'; hash: string }
  | { kind: 'guard'; message: string }
  | { kind: 'send'; message: string }

export type ToastItem = {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
  href?: string
}

export type TxSnapshot = {
  hash: `0x${string}`
  from: Token
  to: Token
  amountIn: bigint
  amountOut: bigint
  paths: number
  feeWei: bigint | null
  status: 'pending' | 'success'
}

type ConfirmState = {
  shown: bigint
  next: NormalizedQuote
  at: number
  amount: bigint
}

type Pending = { kind: 'approve' | 'swap'; hash: `0x${string}`; symbol?: string }

type SwapValue = {
  tokens: Token[]
  fromToken: Token
  toToken: Token
  selectToken: (token: Token) => void
  flip: () => void
  importToken: (address: string) => Promise<void>
  importing: boolean
  importError: string | null
  clearImportError: () => void
  amountText: string
  setAmountText: (value: string) => void
  setMax: () => void
  amount: bigint | null
  slippage: number
  setSlippage: (value: number) => void
  quote: NormalizedQuote | null
  quoteMatches: boolean
  quoteLoading: boolean
  refreshing: boolean
  quoteError: QuoteRequestError | null
  refreshQuote: () => void
  ring: { live: boolean; seconds: number; offset: number }
  priceOf: (token: Token) => number | null
  impact: number | null
  level: ImpactLevel
  address?: Address
  connected: boolean
  connecting: boolean
  wrongNetwork: boolean
  nativeBalance: bigint | null
  balanceOf: (token: Token) => bigint | null
  feeWei: bigint | null
  needsApproval: boolean
  approvalLoading: boolean
  overBalance: boolean
  unlimited: boolean
  setUnlimited: (value: boolean) => void
  ack: boolean
  setAck: (value: boolean) => void
  phase: 'idle' | 'approving' | 'swapping'
  phaseAttr: string
  flowError: FlowError | null
  connectOpen: boolean
  setConnectOpen: (open: boolean) => void
  picker: null | 'from' | 'to'
  setPicker: (side: null | 'from' | 'to') => void
  onCta: () => void
  switchToHemi: () => void
  switching: boolean
  cta: CtaModel
  showSteps: boolean
  tx: TxSnapshot | null
  txOpen: boolean
  closeTx: () => void
  confirm: ConfirmState | null
  acceptConfirm: () => void
  dismissConfirm: () => void
  toasts: ToastItem[]
  dismissToast: (id: number) => void
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
}

const SwapContext = createContext<SwapValue | null>(null)

export function useSwap(): SwapValue {
  const value = useContext(SwapContext)
  if (!value) throw new Error('useSwap must be used inside SwapProvider')
  return value
}

function nativeReserve(feeWei: bigint | null): bigint {
  if (feeWei && feeWei > 0n) return feeWei * 2n > GAS_RESERVE_FLOOR ? feeWei * 2n : GAS_RESERVE_FLOOR
  return GAS_RESERVE_FALLBACK
}

export function SwapProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: hemi.id })
  const { mutateAsync: sendTransactionAsync } = useSendTransaction()
  const { mutateAsync: writeContractAsync } = useWriteContract()
  const switchChain = useSwitchChain()
  const address = connection.address
  const chainId = connection.chainId
  const connected = connection.isConnected
  const connecting = connection.isConnecting || connection.isReconnecting

  const [imported, setImported] = useState<Token[]>(() => loadImportedTokens())
  const tokens = useMemo(() => [...DEFAULT_TOKENS, ...imported], [imported])
  const [fromAddress, setFromAddress] = useState<Address>(DEFAULT_TOKENS[0]!.address)
  const [toAddress, setToAddress] = useState<Address>(DEFAULT_TOKENS[2]!.address)
  const fromToken = findToken(tokens, fromAddress) ?? DEFAULT_TOKENS[0]!
  const toToken = findToken(tokens, toAddress) ?? DEFAULT_TOKENS[2]!

  const [amountText, setAmountTextState] = useState('')
  const [slippage, setSlippageState] = useState(SLIPPAGE_DEFAULT)
  const [unlimited, setUnlimited] = useState(false)
  const [ack, setAck] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'approving' | 'swapping'>('idle')
  const [flowError, setFlowError] = useState<FlowError | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [tx, setTx] = useState<TxSnapshot | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [now, setNow] = useState(() => Date.now())
  const toastSeq = useRef(1)
  const tradeGen = useRef(0)
  const handledHash = useRef<string | null>(null)

  const debouncedText = useDebounced(amountText, 400)
  const amount = parseAmount(amountText, fromToken.decimals)
  const debouncedAmount = parseAmount(debouncedText, fromToken.decimals)
  const wrongNetwork = Boolean(connected && chainId !== hemi.id)
  const fromForQuote = address ?? INDICATIVE_FROM
  const quoteEnabled = Boolean(debouncedAmount && debouncedAmount > 0n && !sameAddress(fromToken.address, toToken.address))

  const quoteKey = ['quote', fromToken.address, toToken.address, debouncedAmount?.toString() ?? '0', fromForQuote, slippage] as const
  const quoteQuery = useQuery({
    queryKey: quoteKey,
    enabled: quoteEnabled,
    queryFn: () =>
      fetchQuote({
        src: fromToken.address,
        dst: toToken.address,
        amount: (debouncedAmount ?? 0n).toString(),
        from: fromForQuote,
        slippage,
      }),
    retry: (count, error) => error instanceof QuoteRequestError && error.retryable && count < 2,
  })

  const priceAddresses = useMemo(() => tokens.map((token) => token.address), [tokens])
  const prices = useQuery({
    queryKey: ['prices', priceAddresses.join(',')],
    queryFn: () => fetchPrices(priceAddresses),
    staleTime: 15_000,
    refetchInterval: 20_000,
  })

  const nativeBal = useBalance({
    address,
    chainId: hemi.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  })

  const erc20Tokens = useMemo(() => tokens.filter((token) => !token.native), [tokens])
  const balanceReads = useReadContracts({
    contracts: address
      ? erc20Tokens.map((token) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [address] as const,
        }))
      : [],
    query: { enabled: Boolean(address) && erc20Tokens.length > 0, refetchInterval: 15_000 },
  })

  const allowance = useReadContract({
    address: fromToken.native ? undefined : fromToken.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && !fromToken.native ? [address, GUARD] : undefined,
    query: { enabled: Boolean(address) && !fromToken.native, refetchInterval: 12_000 },
  })

  const quote = quoteQuery.data ?? null
  const quoteMatches = Boolean(
    quote &&
      amount &&
      amount > 0n &&
      quote.fromAmount === amount.toString() &&
      sameAddress(quote.src, fromToken.address) &&
      sameAddress(quote.dst, toToken.address),
  )
  const pendingDebounce = Boolean(amount && amount > 0n && amountText !== debouncedText)
  const quoteLoading = !quoteMatches && (pendingDebounce || quoteQuery.isFetching || (quoteEnabled && quoteQuery.isPending))
  const refreshing = quoteQuery.isFetching && quoteMatches
  const quoteError =
    !quoteMatches && !quoteLoading && quoteQuery.error
      ? quoteQuery.error instanceof QuoteRequestError
        ? quoteQuery.error
        : new QuoteRequestError({
            kind: 'unavailable',
            detail: errorMessage(quoteQuery.error),
            retryable: true,
            status: 0,
          })
      : null

  const gasQuery = useQuery({
    queryKey: ['gas', quote?.tx.data, quote?.gasEstimate, address ?? 'none', chainId ?? 0],
    enabled: Boolean(publicClient && quote && quoteMatches),
    staleTime: 10_000,
    queryFn: () =>
      estimateSwapGas(publicClient!, {
        account: address && chainId === hemi.id ? address : undefined,
        tx: quote!.tx,
        apiGas: BigInt(quote!.gasEstimate),
      }),
  })

  const receiptQuery = useWaitForTransactionReceipt({
    hash: pending?.hash,
    chainId: hemi.id,
    query: { enabled: Boolean(pending?.hash) },
  })

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const pauseRefresh = phase !== 'idle' || confirm != null || txOpen
  useEffect(() => {
    if (!quoteEnabled || pauseRefresh || quoteQuery.isFetching || !quoteQuery.isSuccess) return
    if (now - quoteQuery.dataUpdatedAt < QUOTE_TTL_MS) return
    void quoteQuery.refetch()
  }, [now, quoteEnabled, pauseRefresh, quoteQuery.isFetching, quoteQuery.isSuccess, quoteQuery.dataUpdatedAt, quoteQuery.refetch])

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = toastSeq.current++
    setToasts((list) => [...list, { ...toast, id }].slice(-4))
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 6000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const receipt = receiptQuery.data
    if (!receipt || !pending) return
    if (handledHash.current === pending.hash) return
    if (receipt.transactionHash.toLowerCase() !== pending.hash.toLowerCase()) return
    handledHash.current = pending.hash
    if (receipt.status === 'reverted') {
      setPhase('idle')
      setPending(null)
      setTxOpen(false)
      if (pending.kind === 'swap') {
        setFlowError({ kind: 'reverted', hash: pending.hash })
        pushToast({
          kind: 'error',
          title: 'Swap reverted',
          message: 'Transaction failed on-chain.',
          href: txUrl(pending.hash),
        })
      } else {
        pushToast({
          kind: 'error',
          title: 'Approval reverted',
          message: 'The approval failed on-chain.',
          href: txUrl(pending.hash),
        })
      }
      return
    }
    if (pending.kind === 'approve') {
      setPhase('idle')
      setPending(null)
      void allowance.refetch()
      pushToast({ kind: 'success', title: `${pending.symbol ?? 'Token'} approved`, message: 'You can now swap.' })
      return
    }
    const paid = receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)
    setTx((current) =>
      current && current.hash === pending.hash
        ? { ...current, status: 'success', feeWei: paid > 0n ? paid : current.feeWei }
        : current,
    )
    setTxOpen(true)
    setPhase('idle')
    setPending(null)
    void nativeBal.refetch()
    void balanceReads.refetch()
    pushToast({
      kind: 'success',
      title: 'Swap confirmed',
      message: 'Your tokens are in your wallet.',
      href: txUrl(pending.hash),
    })
  }, [receiptQuery.data, pending, allowance, nativeBal, balanceReads, pushToast])

  useEffect(() => {
    document.body.classList.toggle('modal-open', connectOpen || picker != null || txOpen || confirm != null)
  }, [connectOpen, picker, txOpen, confirm])

  const sessionKey = `${address ?? ''}:${chainId ?? 0}`
  const sessionRef = useRef(sessionKey)
  useEffect(() => {
    if (sessionRef.current === sessionKey) return
    sessionRef.current = sessionKey
    setPhase('idle')
    setFlowError(null)
    setAck(false)
    setConfirm(null)
    setPending(null)
    setTx(null)
    setTxOpen(false)
  }, [sessionKey])

  const balanceOf = useCallback(
    (token: Token): bigint | null => {
      if (!address) return null
      if (token.native) return nativeBal.data?.value ?? (nativeBal.isLoading ? null : 0n)
      const index = erc20Tokens.findIndex((item) => sameAddress(item.address, token.address))
      const row = balanceReads.data?.[index]
      if (!row || row.status !== 'success') return null
      return row.result
    },
    [address, nativeBal.data?.value, nativeBal.isLoading, erc20Tokens, balanceReads.data],
  )

  const priceOf = useCallback(
    (token: Token): number | null => prices.data?.[token.address.toLowerCase()] ?? null,
    [prices.data],
  )

  const feeWei = gasQuery.data && gasQuery.data.gasLimit > 0n ? gasQuery.data.feeWei : null
  const reserve = fromToken.native ? nativeReserve(feeWei) : 0n
  const fromBalance = balanceOf(fromToken)
  const overBalance = Boolean(connected && amount && amount > 0n && fromBalance != null && amount + reserve > fromBalance)
  const unsafeReason = quoteMatches && quote && amount ? swapTxRejection(quote.tx, Boolean(fromToken.native), amount) : null
  const impact =
    quoteMatches && quote && amount
      ? priceImpactPercent({
          amountIn: amount,
          amountOut: BigInt(quote.toAmount),
          decimalsIn: fromToken.decimals,
          decimalsOut: toToken.decimals,
          priceIn: priceOf(fromToken),
          priceOut: priceOf(toToken),
        })
      : null
  const level = impactLevel(impact)
  const needsApproval = Boolean(
    connected &&
      !wrongNetwork &&
      !fromToken.native &&
      quoteMatches &&
      amount &&
      amount > 0n &&
      allowance.data != null &&
      allowance.data < amount,
  )
  const approvalLoading = Boolean(connected && !wrongNetwork && !fromToken.native && quoteMatches && allowance.isLoading)
  const quoteKind: QuoteErrorKind | null = quoteError?.kind ?? null

  const cta = deriveCta({
    connected,
    wrongNetwork,
    amount,
    quoteReady: quoteMatches,
    quoteLoading,
    quoteKind,
    unsafe: Boolean(unsafeReason),
    overBalance,
    fromSymbol: fromToken.symbol,
    fromNative: Boolean(fromToken.native),
    needsApproval,
    approvalLoading,
    phase,
    impact: level,
    ack,
    flowKind: flowError?.kind === 'rejected' || flowError?.kind === 'reverted' || flowError?.kind === 'send' ? flowError.kind : null,
  })

  const showSteps = Boolean(connected && !wrongNetwork && quoteMatches && !unsafeReason && !quoteError)

  function resetTradeFlags() {
    setAck(false)
    setFlowError(null)
    setConfirm(null)
  }

  function setAmountText(value: string) {
    setAmountTextState(sanitizeAmountInput(value, fromToken.decimals))
    resetTradeFlags()
  }

  function setSlippage(value: number) {
    const next = clampSlippage(value)
    if (next == null) return
    setSlippageState(next)
    setConfirm(null)
  }

  function selectToken(token: Token) {
    const side = picker ?? 'from'
    const other = side === 'from' ? toToken : fromToken
    if (sameAddress(token.address, other.address)) {
      setFromAddress(toToken.address)
      setToAddress(fromToken.address)
    } else if (side === 'from') {
      setFromAddress(token.address)
      setAmountTextState((current) => sanitizeAmountInput(current, token.decimals))
    } else {
      setToAddress(token.address)
    }
    resetTradeFlags()
    setPicker(null)
    setImportError(null)
  }

  function flip() {
    const output = quoteMatches && quote ? BigInt(quote.toAmount) : null
    const nextDecimals = toToken.decimals
    setFromAddress(toToken.address)
    setToAddress(fromToken.address)
    if (output != null) setAmountTextState(formatAmountInput(output, nextDecimals))
    resetTradeFlags()
  }

  function setMax() {
    if (fromBalance == null) return
    const spend = fromToken.native ? (fromBalance > reserve ? fromBalance - reserve : 0n) : fromBalance
    setAmountTextState(formatAmountInput(spend, fromToken.decimals))
    resetTradeFlags()
  }

  async function importToken(raw: string) {
    const parsed = checksumAddress(raw.trim())
    if (!parsed || sameAddress(parsed, NATIVE_SENTINEL)) {
      setImportError('Enter a token contract address on Hemi.')
      return
    }
    const existing = findToken(tokens, parsed)
    if (existing) {
      selectToken(existing)
      return
    }
    if (!publicClient) {
      setImportError('The Hemi network is not reachable right now.')
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      const meta = await readErc20Metadata(publicClient, parsed)
      const symbol = cleanTokenLabel(meta.symbol, 20) || shortAddress(parsed)
      const name = cleanTokenLabel(meta.name, 64) || 'Imported token'
      const token: Token = {
        address: parsed,
        symbol,
        name,
        decimals: meta.decimals,
        displayDecimals: Math.min(6, meta.decimals),
        imported: true,
      }
      const next = [...imported.filter((item) => !sameAddress(item.address, parsed)), token].slice(-24)
      setImported(next)
      saveImportedTokens(next)
      selectToken(token)
    } catch {
      setImportError('Could not read this contract on Hemi. Check the address and only import tokens you trust.')
    } finally {
      setImporting(false)
    }
  }

  async function execute(fresh: NormalizedQuote, amountIn: bigint, gen: number) {
    if (!address || !publicClient) return
    const rejection = swapTxRejection(fresh.tx, Boolean(fromToken.native), amountIn)
    if (rejection) {
      setFlowError({ kind: 'guard', message: rejection })
      setPhase('idle')
      return
    }
    const to = checksumAddress(fresh.tx.to)
    const value = parseTxValue(fresh.tx.value)
    if (!to || value == null) {
      setFlowError({ kind: 'guard', message: 'Swap transaction is incomplete.' })
      setPhase('idle')
      return
    }
    setPhase('swapping')
    try {
      let gasLimit = withGasBuffer(scaleApiGas(BigInt(fresh.gasEstimate)))
      let fee: bigint | null = null
      try {
        const gas = await estimateSwapGas(publicClient, {
          account: chainId === hemi.id ? address : undefined,
          tx: fresh.tx,
          apiGas: BigInt(fresh.gasEstimate),
        })
        gasLimit = gas.gasLimit
        fee = gas.feeWei
      } catch {
        fee = null
      }
      const hash = await sendTransactionAsync({
        chainId: hemi.id,
        to,
        data: fresh.tx.data as Hex,
        value,
        ...(gasLimit > 0n ? { gas: gasLimit } : {}),
      })
      if (tradeGen.current !== gen) return
      setTx({
        hash,
        from: fromToken,
        to: toToken,
        amountIn,
        amountOut: BigInt(fresh.toAmount),
        paths: fresh.swaps.length,
        feeWei: fee,
        status: 'pending',
      })
      setTxOpen(true)
      setPending({ kind: 'swap', hash })
    } catch (error) {
      if (tradeGen.current !== gen) return
      setPhase('idle')
      if (isUserReject(error)) {
        setFlowError({ kind: 'rejected', where: 'swap' })
        pushToast({ kind: 'error', title: 'Swap rejected', message: 'Request cancelled in wallet.' })
      } else {
        const message = errorMessage(error)
        setFlowError({ kind: 'send', message })
        pushToast({ kind: 'error', title: 'Swap failed', message })
      }
    }
  }

  async function beginSwap() {
    if (!address || !amount || !quote || !quoteMatches) return
    const gen = ++tradeGen.current
    const shown = BigInt(quote.toAmount)
    const amountIn = amount
    setFlowError(null)
    let fresh: NormalizedQuote
    try {
      fresh = await fetchQuote({
        src: fromToken.address,
        dst: toToken.address,
        amount: amountIn.toString(),
        from: address,
        slippage,
      })
    } catch (error) {
      if (tradeGen.current !== gen) return
      const message = error instanceof QuoteRequestError ? error.detail : errorMessage(error)
      pushToast({ kind: 'error', title: 'Could not refresh the quote', message })
      void quoteQuery.refetch()
      return
    }
    if (tradeGen.current !== gen) return
    queryClient.setQueryData(quoteKey, fresh)
    if (quoteMovedMaterially(shown, BigInt(fresh.toAmount))) {
      setConfirm({ shown, next: fresh, at: Date.now(), amount: amountIn })
      return
    }
    await execute(fresh, amountIn, gen)
  }

  async function approve() {
    if (!address || fromToken.native || !amount) return
    const spender = checksumAddress(GUARD_ADDRESS)
    if (!spender) return
    setPhase('approving')
    setFlowError(null)
    pushToast({
      kind: 'info',
      title: 'Confirm in your wallet',
      message: `Approve ${fromToken.symbol} spending for HemiSwap.`,
    })
    try {
      const hash = await writeContractAsync({
        chainId: hemi.id,
        address: fromToken.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, unlimited ? maxUint256 : amount],
      })
      setPending({ kind: 'approve', hash, symbol: fromToken.symbol })
    } catch (error) {
      setPhase('idle')
      if (isUserReject(error)) {
        setFlowError({ kind: 'rejected', where: 'approve' })
        pushToast({ kind: 'error', title: 'Approval rejected', message: 'Request cancelled in wallet.' })
      } else {
        const message = errorMessage(error)
        setFlowError({ kind: 'send', message })
        pushToast({ kind: 'error', title: 'Approval failed', message })
      }
    }
  }

  async function acceptConfirm() {
    if (!confirm || !address) return
    const gen = ++tradeGen.current
    let next = confirm.next
    if (Date.now() - confirm.at > 15_000) {
      try {
        const again = await fetchQuote({
          src: fromToken.address,
          dst: toToken.address,
          amount: confirm.amount.toString(),
          from: address,
          slippage,
        })
        if (quoteMovedMaterially(BigInt(next.toAmount), BigInt(again.toAmount))) {
          setConfirm({ shown: BigInt(next.toAmount), next: again, at: Date.now(), amount: confirm.amount })
          return
        }
        next = again
      } catch (error) {
        pushToast({
          kind: 'error',
          title: 'Could not refresh the quote',
          message: error instanceof QuoteRequestError ? error.detail : errorMessage(error),
        })
        return
      }
    }
    const amountIn = confirm.amount
    setConfirm(null)
    await execute(next, amountIn, gen)
  }

  function switchToHemi() {
    switchChain.mutate(
      { chainId: hemi.id },
      {
        onError: (error) => {
          if (!isUserReject(error)) {
            pushToast({ kind: 'error', title: 'Could not switch network', message: errorMessage(error) })
          }
        },
      },
    )
  }

  function onCta() {
    if (cta.action === 'connect') {
      setConnectOpen(true)
      return
    }
    if (cta.action === 'switch') {
      switchToHemi()
      return
    }
    if (cta.action === 'approve') {
      void approve()
      return
    }
    if (cta.action === 'swap') void beginSwap()
  }

  function closeTx() {
    const finished = tx?.status === 'success'
    setTxOpen(false)
    if (finished) {
      setAmountTextState('')
      setTx(null)
      setFlowError(null)
    }
  }

  const live = quoteMatches && !pauseRefresh
  const updatedAt = quoteQuery.dataUpdatedAt
  const remainingMs = live ? Math.max(0, QUOTE_TTL_MS - (now - updatedAt)) : 0
  const ring = {
    live,
    seconds: live ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0,
    offset: live ? 100 - (remainingMs / QUOTE_TTL_MS) * 100 : 100,
  }

  const value: SwapValue = {
    tokens,
    fromToken,
    toToken,
    selectToken,
    flip,
    importToken,
    importing,
    importError,
    clearImportError: () => setImportError(null),
    amountText,
    setAmountText,
    setMax,
    amount,
    slippage,
    setSlippage,
    quote: quoteMatches ? quote : null,
    quoteMatches,
    quoteLoading,
    refreshing,
    quoteError,
    refreshQuote: () => void quoteQuery.refetch(),
    ring,
    priceOf,
    impact,
    level,
    address,
    connected,
    connecting,
    wrongNetwork,
    nativeBalance: address ? (nativeBal.data?.value ?? null) : null,
    balanceOf,
    feeWei,
    needsApproval,
    approvalLoading,
    overBalance,
    unlimited,
    setUnlimited,
    ack,
    setAck,
    phase,
    phaseAttr: phase !== 'idle' ? phase : refreshing || quoteLoading ? 'refreshing' : 'idle',
    flowError,
    connectOpen,
    setConnectOpen,
    picker,
    setPicker: (side) => {
      setImportError(null)
      setPicker(side)
    },
    onCta,
    switchToHemi,
    switching: switchChain.isPending,
    cta,
    showSteps,
    tx,
    txOpen,
    closeTx,
    confirm,
    acceptConfirm: () => void acceptConfirm(),
    dismissConfirm: () => setConfirm(null),
    toasts,
    dismissToast,
    pushToast,
  }

  return <SwapContext.Provider value={value}>{children}</SwapContext.Provider>
}
