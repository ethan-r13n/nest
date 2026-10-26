import { Button } from '@nest/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, LoaderCircle, Route } from 'lucide-react';
import { useCallback, useState } from 'react';

import { AssetIcon } from '../components/asset-icon.tsx';
import { AssetPicker } from '../components/asset-picker.tsx';
import { ReviewRequirements } from '../components/financial-draft.tsx';
import { LimitOrderPanel } from '../components/limit-order.tsx';
import { type ChartContext, MarketChart } from '../components/market-chart.tsx';
import { SwapProposalCard, useCountdown } from '../components/swap-proposal.tsx';
import { balanceHint, RouteFacts, useSwapDraft, WalletActivity } from '../components/trade-live.tsx';
import { EmptyState } from '../components/workspace.tsx';
import { execution } from '../lib/execution.ts';
import { useHealth } from '../lib/health.ts';
import { MARKET_SYMBOLS } from '../lib/market-assets.ts';
import { maxSwapAmount } from '../lib/trade-amount.ts';
import { useWallet } from '../lib/wallet.tsx';

export function TradePage() {
  const [marketAsset, setMarketAsset] = useState('XLM');
  const [inputAsset, setInputAsset] = useState('XLM');
  const [outputAsset, setOutputAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [chartContext, setChartContext] = useState<ChartContext | null>(null);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [limitInteractionLocked, setLimitInteractionLocked] = useState(false);
  const orderLocked = interactionLocked || limitInteractionLocked;
  const supportedPair =
    (inputAsset === 'XLM' && outputAsset === 'USDC') || (inputAsset === 'USDC' && outputAsset === 'XLM');
  const swapAsset = inputAsset === 'XLM' || inputAsset === 'USDC' ? inputAsset : null;
  const health = useHealth();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const draft = useSwapDraft(inputAsset, outputAsset, amount);
  const { intentId, quote } = draft;
  const secondsLeft = useCountdown(quote?.expiresAt);
  const balances = useQuery({
    queryKey: ['balances', wallet.address],
    queryFn: () => execution.balances(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 30_000,
  });
  const spendable = balances.data?.balances.find((balance) => balance.symbol === inputAsset)?.spendable ?? null;
  const maximum = spendable === null || swapAsset === null ? null : maxSwapAmount(spendable, swapAsset);
  const refreshWallet = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['balances'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
  }, [queryClient]);

  function chooseMarket(value: string) {
    setMarketAsset(value);
    if (value !== marketAsset) setChartContext(null);
    setInputAsset(value);
    setOutputAsset('USDC');
    setAmount('');
  }

  function chooseInput(value: string) {
    setInputAsset(value);
    setOutputAsset(value === 'USDC' ? marketAsset : 'USDC');
    if (value !== 'USDC') {
      setMarketAsset(value);
      if (value !== marketAsset) setChartContext(null);
    }
    setAmount('');
  }

  function chooseOutput(value: string) {
    setOutputAsset(value);
    setInputAsset(value === 'USDC' ? marketAsset : 'USDC');
    if (value !== 'USDC') {
      setMarketAsset(value);
      if (value !== marketAsset) setChartContext(null);
    }
    setAmount('');
  }

  function reversePair() {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    setAmount('');
  }

  return (
    <div className="trade-workspace flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <AssetIcon symbol={marketAsset} className="size-11" />
          <div>
            <h1 className="font-serif text-[32px] font-semibold">{marketAsset} / USDC</h1>
            <p className="mt-1 text-xs text-subtle">Stellar spot · market orders</p>
          </div>
          <AssetPicker
            compact
            label="Choose market asset"
            value={marketAsset}
            disabled={orderLocked}
            assets={MARKET_SYMBOLS}
            onChange={chooseMarket}
          />
        </div>
        <div className="trade-market-context">
          <div>
            <span>Spot / reference</span>
            <strong>{chartContext ? `${chartContext.close.toFixed(6)} USDC` : 'Unavailable'}</strong>
          </div>
          <div>
            <span>Captured change · 24h</span>
            <strong>{chartContext?.changePct == null ? 'Unavailable' : `${chartContext.changePct.toFixed(2)}%`}</strong>
          </div>
          <div>
            <span>History coverage</span>
            <strong>{chartContext ? `${chartContext.count} candles` : 'Unavailable'}</strong>
          </div>
          <div>
            <span>Data</span>
            <strong>Captured · {health.data?.network ?? 'Loading'} execution</strong>
          </div>
        </div>
      </header>
      <div className="trade-grid">
        <section className="workspace-panel trade-chart min-w-0" aria-label="Price context">
          <MarketChart asset={marketAsset} onContext={setChartContext} />
        </section>
        <section className="workspace-panel trade-routes min-w-0" aria-labelledby="trade-routes-title">
          <div className="border-b px-5 py-4">
            <h2 id="trade-routes-title" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Route className="size-4" /> Routes
            </h2>
          </div>
          <div className="space-y-5 p-5">
            {supportedPair ? (
              <RouteFacts quote={quote} referencePrice={null} network={health.data?.network} />
            ) : (
              <p className="text-xs leading-relaxed text-subtle">
                This market is available for research. Swap execution for this pair is not connected.
              </p>
            )}
          </div>
        </section>
        <section className="workspace-panel trade-ticket min-w-0" aria-labelledby="trade-ticket-title">
          <Tabs defaultValue="market" className="gap-0">
            <h2 id="trade-ticket-title" className="sr-only">
              Trade order ticket
            </h2>
            <div className="trade-ticket-heading">
              <TabsList variant="line" className="trade-ticket-tabs" aria-label="Order type">
                <TabsTrigger value="market" disabled={orderLocked}>
                  Market swap
                </TabsTrigger>
                <TabsTrigger value="limit" disabled={orderLocked}>
                  Limit order
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="market" keepMounted className="space-y-5 p-5">
              <div className="trade-asset-box">
                <p className="mb-3 text-[11px] text-subtle">You pay</p>
                <div className="flex items-center gap-3">
                  <label className="sr-only" htmlFor="trade-amount">
                    Amount
                  </label>
                  <input
                    id="trade-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    disabled={orderLocked}
                    value={amount}
                    onChange={(event) => setAmount(event.currentTarget.value)}
                    className="trade-amount-input"
                  />
                  <AssetPicker label="You pay" value={inputAsset} disabled={orderLocked} onChange={chooseInput} />
                </div>
                <p className="mt-3 text-[10px] leading-5 text-subtle">
                  {swapAsset
                    ? balanceHint(wallet.address, balances.data, spendable, swapAsset, balances.isError)
                    : 'Research asset · execution is not connected.'}
                </p>
              </div>
              {maximum ? (
                <Button variant="ghost" size="sm" disabled={orderLocked} onClick={() => setAmount(maximum)}>
                  Use max
                </Button>
              ) : null}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  disabled={orderLocked}
                  aria-label="Reverse input and output assets"
                  onClick={reversePair}
                >
                  <ArrowDownUp />
                </Button>
              </div>
              <div className="trade-asset-box">
                <p className="mb-3 flex justify-between gap-3 text-[11px] text-subtle">
                  <span>Estimated receive</span>
                  <span>{quote ? (secondsLeft === 0 ? 'Expired quote' : 'Current quote') : 'Quote required'}</span>
                </p>
                <div className="flex items-center gap-3">
                  <output
                    className="min-w-0 flex-1 overflow-wrap-anywhere font-mono text-[28px]"
                    aria-label="Estimated receive"
                  >
                    {quote && secondsLeft !== 0 ? quote.expectedOut.amount : '—'}
                  </output>
                  <AssetPicker label="You receive" value={outputAsset} disabled={orderLocked} onChange={chooseOutput} />
                </div>
                <p className="mt-3 text-[10px] leading-5 text-subtle">
                  Final asset changes come from your reviewed transaction.
                </p>
              </div>
              <fieldset className="grid grid-cols-4 gap-1" aria-label="Amount shortcuts">
                {['100', '500', '1000', '5000'].map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    size="sm"
                    disabled={orderLocked}
                    onClick={() => setAmount(value)}
                  >
                    {Number(value).toLocaleString('en-US')}
                  </Button>
                ))}
              </fieldset>
              <dl className="trade-order-facts">
                <div>
                  <dt>Minimum received</dt>
                  <dd>{quote ? `${quote.minimumOut.amount} ${quote.minimumOut.symbol}` : '—'}</dd>
                </div>
                <div>
                  <dt>Max slippage</dt>
                  <dd>{quote ? `${quote.slippageBps / 100}%` : 'From fresh quote'}</dd>
                </div>
                <div>
                  <dt>Price impact</dt>
                  <dd>
                    {quote?.priceImpactBps === null || quote?.priceImpactBps === undefined
                      ? 'Unavailable'
                      : `${quote.priceImpactBps / 100}%`}
                  </dd>
                </div>
                <div>
                  <dt>Maximum fees</dt>
                  <dd>Shown before signing</dd>
                </div>
                <div>
                  <dt>Quote validity</dt>
                  <dd>
                    {quote
                      ? secondsLeft === 0
                        ? 'Refresh required'
                        : `${secondsLeft ?? '—'}s remaining`
                      : 'Quote required'}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-subtle">
                Balances and maximum fees are verified during transaction preparation. A chart price is context only.
              </p>
              {!supportedPair ? (
                <p className="text-xs text-subtle">
                  Execution is unavailable for this pair. You can still inspect its captured chart and research.
                </p>
              ) : intentId ? (
                <SwapProposalCard
                  key={intentId}
                  intentId={intentId}
                  onQuote={draft.setQuote}
                  onSettled={refreshWallet}
                  onInteractionLock={setInteractionLocked}
                />
              ) : draft.waiting ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Getting a live quote…
                </p>
              ) : draft.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {draft.error}
                </p>
              ) : (
                <p className="text-xs text-subtle">Enter an amount to get a live quote.</p>
              )}
              <ReviewRequirements />
            </TabsContent>
            <TabsContent value="limit" keepMounted className="trade-limit-ticket p-5">
              <LimitOrderPanel onInteractionLock={setLimitInteractionLocked} />
            </TabsContent>
          </Tabs>
        </section>
        <section className="workspace-panel trade-positions" aria-labelledby="trade-positions-title">
          <h2 id="trade-positions-title" className="border-b px-6 py-5 font-serif text-xl font-semibold">
            My positions
          </h2>
          <Tabs defaultValue="positions" className="px-5 pb-5">
            <TabsList className="my-3 h-auto bg-transparent">
              <TabsTrigger value="positions" className="min-h-11">
                Positions
              </TabsTrigger>
              <TabsTrigger value="history" className="min-h-11">
                Swap history
              </TabsTrigger>
            </TabsList>
            <TabsContent value="positions">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Asset / Market',
                      'Quantity',
                      'USD notional',
                      'Avg. entry',
                      'Mark',
                      'Unrealized P&L',
                      'Action',
                    ].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        title="No verified spot positions loaded"
                        description="Confirmed balances and cost basis are needed before position size, value or P&L can be shown. Missing data is not a zero balance."
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="history">
              <WalletActivity />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
