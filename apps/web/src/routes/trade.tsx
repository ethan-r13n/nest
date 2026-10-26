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
import { execution, type SwapSymbol } from '../lib/execution.ts';
import { formatPercentPoints } from '../lib/format.ts';
import { useHealth } from '../lib/health.ts';
import { usePriceHistory } from '../lib/market.ts';
import { maxSwapAmount } from '../lib/trade-amount.ts';
import { useWallet } from '../lib/wallet.tsx';

const SWAP_ASSETS: readonly SwapSymbol[] = ['XLM', 'USDC'];
const VOLUME = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export function TradePage() {
  const [inputAsset, setInputAsset] = useState<SwapSymbol>('XLM');
  const [amount, setAmount] = useState('');
  const [chartContext, setChartContext] = useState<ChartContext | null>(null);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const outputAsset = inputAsset === 'XLM' ? 'USDC' : 'XLM';
  const health = useHealth();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const history = usePriceHistory('1h');
  const draft = useSwapDraft(inputAsset, outputAsset, amount);
  const { intentId, quote } = draft;
  const secondsLeft = useCountdown(quote?.expiresAt);
  const day = history.data?.day;
  const change = day ? (inputAsset === 'USDC' ? (day.open / day.close - 1) * 100 : day.changePct) : null;
  const balances = useQuery({
    queryKey: ['balances', wallet.address],
    queryFn: () => execution.balances(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 30_000,
  });
  const spendable = balances.data?.balances.find((balance) => balance.symbol === inputAsset)?.spendable ?? null;
  const maximum = spendable === null ? null : maxSwapAmount(spendable, inputAsset);
  const refreshWallet = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['balances'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
  }, [queryClient]);

  function chooseInput(value: string) {
    if (value !== 'USDC' && value !== 'XLM') return;
    setInputAsset(value);
    setChartContext(null);
    setAmount('');
  }

  return (
    <div className="trade-workspace flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <AssetIcon symbol={inputAsset} className="size-11" />
          <div>
            <h1 className="font-serif text-[32px] font-semibold">
              {inputAsset} / {outputAsset}
            </h1>
            <p className="mt-1 text-xs text-subtle">Stellar spot · market orders</p>
          </div>
          <AssetPicker
            compact
            label="Choose market asset"
            value={inputAsset}
            disabled={interactionLocked}
            assets={SWAP_ASSETS}
            onChange={chooseInput}
          />
        </div>
        <div className="trade-market-context">
          <div>
            <span>Spot / reference</span>
            <strong>{chartContext ? `${chartContext.close.toFixed(6)} ${outputAsset}` : 'Unavailable'}</strong>
          </div>
          <div>
            <span>24h change</span>
            <strong>{change === null ? 'Unavailable' : formatPercentPoints(change)}</strong>
          </div>
          <div>
            <span>24h volume</span>
            <strong>{day ? `${VOLUME.format(day.counterVolume)} USDC` : 'Unavailable'}</strong>
          </div>
          <div>
            <span>24h trades</span>
            <strong>{day ? VOLUME.format(day.trades) : 'Unavailable'}</strong>
          </div>
          <div>
            <span>History coverage</span>
            <strong>{chartContext ? `${chartContext.count} candles` : 'Unavailable'}</strong>
          </div>
          <div>
            <span>Data</span>
            <strong>Live · {health.data?.network ?? 'Loading'}</strong>
          </div>
        </div>
      </header>
      <div className="trade-grid">
        <section className="workspace-panel trade-chart min-w-0" aria-label="Price context">
          <MarketChart asset={inputAsset} onContext={setChartContext} />
        </section>
        <section className="workspace-panel trade-routes min-w-0" aria-labelledby="trade-routes-title">
          <div className="border-b px-5 py-4">
            <h2 id="trade-routes-title" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Route className="size-4" /> Routes
            </h2>
          </div>
          <div className="space-y-5 p-5">
            <RouteFacts quote={quote} referencePrice={chartContext?.close ?? null} network={health.data?.network} />
          </div>
        </section>
        <section className="workspace-panel trade-ticket min-w-0" aria-labelledby="trade-ticket-title">
          <div className="trade-ticket-heading">
            <h2 id="trade-ticket-title">Market swap</h2>
          </div>
          <div className="space-y-5 p-5">
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
                  disabled={interactionLocked}
                  value={amount}
                  onChange={(event) => setAmount(event.currentTarget.value)}
                  className="trade-amount-input"
                />
                <AssetPicker
                  label="You pay"
                  value={inputAsset}
                  disabled={interactionLocked}
                  assets={SWAP_ASSETS}
                  onChange={chooseInput}
                />
              </div>
              <p className="mt-3 text-[10px] leading-5 text-subtle">
                {balanceHint(wallet.address, balances.data, spendable, inputAsset, balances.isError)}
              </p>
            </div>
            {maximum ? (
              <Button variant="ghost" size="sm" disabled={interactionLocked} onClick={() => setAmount(maximum)}>
                Use max
              </Button>
            ) : null}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                disabled={interactionLocked}
                aria-label="Reverse input and output assets"
                onClick={() => chooseInput(outputAsset)}
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
                <AssetPicker
                  label="You receive"
                  value={outputAsset}
                  disabled={interactionLocked}
                  assets={SWAP_ASSETS}
                  onChange={(value) => chooseInput(value === 'USDC' ? 'XLM' : 'USDC')}
                />
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
                  disabled={interactionLocked}
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
            {intentId ? (
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
          </div>
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
      <section className="workspace-panel w-full max-w-3xl self-start p-5" aria-labelledby="limit-order-title">
        <h2 id="limit-order-title" className="mb-4 font-serif text-xl font-semibold">
          Limit orders
        </h2>
        <LimitOrderPanel />
      </section>
    </div>
  );
}
