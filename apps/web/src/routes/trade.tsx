import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, LoaderCircle, Route } from 'lucide-react';
import { useCallback, useState } from 'react';

import { AssetIcon } from '../components/asset-icon.tsx';
import { AssetSelect, DecimalField, ReviewRequirements } from '../components/financial-draft.tsx';
import { LimitOrderPanel } from '../components/limit-order.tsx';
import { MarketChart } from '../components/market-chart.tsx';
import { SwapProposalCard, useCountdown } from '../components/swap-proposal.tsx';
import { balanceHint, RouteFacts, useSwapDraft, WalletActivity } from '../components/trade-live.tsx';
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
  const [interactionLocked, setInteractionLocked] = useState(false);
  const outputAsset = inputAsset === 'XLM' ? 'USDC' : 'XLM';
  const health = useHealth();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const history = usePriceHistory('1h');
  const draft = useSwapDraft(inputAsset, outputAsset, amount);
  const { intentId, quote } = draft;
  const secondsLeft = useCountdown(quote?.expiresAt);
  const latest = history.data?.candles.at(-1)?.close;
  const referencePrice = latest ? (inputAsset === 'USDC' ? 1 / latest : latest) : null;
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
    setInputAsset(value === 'USDC' ? 'USDC' : 'XLM');
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
          <Select
            value={inputAsset}
            disabled={interactionLocked}
            onValueChange={(value) => value && chooseInput(value)}
          >
            <SelectTrigger
              aria-label="Choose market asset"
              className="ml-3 min-h-11 w-11 shrink-0 justify-center rounded-xl border border-primary/60 p-0 hover:border-primary focus-visible:border-primary"
            >
              <SelectValue className="sr-only" />
            </SelectTrigger>
            <SelectContent>
              {SWAP_ASSETS.map((asset) => (
                <SelectItem key={asset} value={asset}>
                  {asset}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <dl className="flex flex-wrap gap-5 text-xs">
          <div>
            <dt className="text-subtle">Spot / reference</dt>
            <dd className="mt-1 font-mono">
              {referencePrice === null ? 'Unavailable' : `${referencePrice.toFixed(6)} ${outputAsset}`}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">24h change</dt>
            <dd className="mt-1 font-mono">{change === null ? 'Unavailable' : formatPercentPoints(change)}</dd>
          </div>
          <div>
            <dt className="text-subtle">24h volume</dt>
            <dd className="mt-1 font-mono">{day ? `${VOLUME.format(day.counterVolume)} USDC` : 'Unavailable'}</dd>
          </div>
          <div>
            <dt className="text-subtle">24h trades</dt>
            <dd className="mt-1 font-mono">{day ? VOLUME.format(day.trades) : 'Unavailable'}</dd>
          </div>
          <div>
            <dt className="text-subtle">Network</dt>
            <dd className="mt-1">
              <Badge variant="outline">{health.data?.network ?? 'Loading'}</Badge>
            </dd>
          </div>
        </dl>
      </header>
      <div className="trade-grid">
        <section className="workspace-panel trade-chart min-w-0" aria-label="Price context">
          <MarketChart asset={inputAsset} />
        </section>
        <section className="workspace-panel trade-routes min-w-0" aria-labelledby="trade-routes-title">
          <div className="border-b px-5 py-4">
            <h2 id="trade-routes-title" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Route className="size-4" /> Routes
            </h2>
          </div>
          <div className="p-5">
            <RouteFacts quote={quote} referencePrice={referencePrice} network={health.data?.network} />
          </div>
        </section>
        <section className="workspace-panel trade-ticket min-w-0" aria-labelledby="trade-ticket-title">
          <div className="border-b p-5">
            <p className="mb-2 font-mono text-[10px] tracking-widest text-subtle uppercase">Market order</p>
            <h2 id="trade-ticket-title" className="font-serif text-2xl font-semibold">
              Swap
            </h2>
          </div>
          <div className="space-y-5 p-5">
            <AssetSelect
              label="You pay"
              value={inputAsset}
              assets={SWAP_ASSETS}
              disabled={interactionLocked}
              onChange={chooseInput}
            />
            <DecimalField
              label="Amount"
              unit={inputAsset}
              value={amount}
              disabled={interactionLocked}
              onChange={setAmount}
              hint={balanceHint(wallet.address, balances.data, spendable, inputAsset, balances.isError)}
            />
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
            <div className="space-y-2">
              <AssetSelect
                label="You receive"
                value={outputAsset}
                assets={SWAP_ASSETS}
                disabled={interactionLocked}
                onChange={(value) => chooseInput(value === 'USDC' ? 'XLM' : 'USDC')}
              />
              <output className="block font-mono text-2xl" aria-label="Estimated receive">
                {quote && secondsLeft !== 0 ? `${quote.expectedOut.amount} ${outputAsset}` : '—'}
              </output>
            </div>
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
      </div>
      <section className="workspace-panel p-5" aria-labelledby="limit-order-title">
        <h2 id="limit-order-title" className="mb-4 font-serif text-xl font-semibold">
          Limit order
        </h2>
        <LimitOrderPanel />
      </section>
      <section className="workspace-panel" aria-labelledby="trade-activity-title">
        <h2 id="trade-activity-title" className="border-b px-6 py-5 font-serif text-xl font-semibold">
          Wallet activity
        </h2>
        <div className="p-5">
          <WalletActivity />
        </div>
      </section>
    </div>
  );
}
