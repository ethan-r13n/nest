import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { ArrowDownUp, ArrowRight, Route } from 'lucide-react';
import { useState } from 'react';

import { AssetIcon } from '../components/asset-icon.tsx';
import { AssetSelect, DecimalField, ReviewRequirements, UnavailableFacts } from '../components/financial-draft.tsx';
import { MarketChart } from '../components/market-chart.tsx';
import { SwapProposalCard, useCountdown } from '../components/swap-proposal.tsx';
import { EmptyState } from '../components/workspace.tsx';
import { amountDraftIssue } from '../lib/draft-validation.ts';
import { execution, type Quote, venueName } from '../lib/execution.ts';
import { formatUtc } from '../lib/format.ts';
import { useHealth } from '../lib/health.ts';

export function TradePage() {
  const [inputAsset, setInputAsset] = useState('XLM');
  const [outputAsset, setOutputAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const health = useHealth();
  const secondsLeft = useCountdown(quote?.expiresAt);
  const chartAsset = inputAsset === 'USDC' ? outputAsset : inputAsset;

  function invalidate() {
    setIntentId(null);
    setQuote(null);
    setError(null);
  }
  function reversePair() {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    setAmount('');
    invalidate();
  }
  async function compare() {
    const issue = amountDraftIssue(amount, true);
    if (issue) {
      setError(issue);
      return;
    }
    if ((inputAsset !== 'XLM' && inputAsset !== 'USDC') || (outputAsset !== 'XLM' && outputAsset !== 'USDC')) {
      setError('This pair is not supported by the connected swap adapter.');
      return;
    }
    if (inputAsset === outputAsset) {
      setError('Choose different input and output assets.');
      return;
    }
    setCreating(true);
    invalidate();
    try {
      const intent = await execution.createSwap({
        sellAsset: inputAsset,
        buyAsset: outputAsset,
        sellAmount: amount.trim(),
      });
      setIntentId(intent.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Swap comparison is unavailable.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="trade-workspace flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <AssetIcon symbol={chartAsset} className="size-11" />
          <div>
            <h1 className="font-serif text-[32px] font-semibold">
              {inputAsset} / {outputAsset}
            </h1>
            <p className="mt-1 text-xs text-subtle">Stellar spot · market orders</p>
          </div>
          <Select
            value={inputAsset}
            disabled={Boolean(intentId) || creating}
            onValueChange={(value) => {
              if (!value) return;
              setInputAsset(value);
              if (value === outputAsset) setOutputAsset(value === 'USDC' ? 'XLM' : 'USDC');
              invalidate();
            }}
          >
            <SelectTrigger
              aria-label="Choose market asset"
              className="ml-3 min-h-11 w-11 shrink-0 justify-center rounded-xl border border-primary/60 p-0 hover:border-primary focus-visible:border-primary"
            >
              <SelectValue className="sr-only" />
            </SelectTrigger>
            <SelectContent>
              {['XLM', 'USDC', 'USDT0'].map((asset) => (
                <SelectItem key={asset} value={asset}>
                  {asset}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {health.data?.network === 'testnet'
              ? 'Testnet execution network'
              : `Execution network: ${health.data?.network ?? 'loading'}`}
          </Badge>
          <Badge variant="outline">Historical chart · not a live quote</Badge>
        </div>
      </header>
      <div className="trade-grid">
        <section className="workspace-panel trade-chart min-w-0" aria-label="Price context">
          <MarketChart asset={chartAsset} />
        </section>
        <section className="workspace-panel trade-routes min-w-0" aria-labelledby="trade-routes-title">
          <div className="border-b px-5 py-4">
            <h2 id="trade-routes-title" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Route className="size-4" /> Routes
            </h2>
          </div>
          <div className="space-y-5 p-5">
            {quote ? (
              <>
                <Badge variant="outline">{secondsLeft === 0 ? 'Quote expired' : venueName(quote.venue)}</Badge>
                <dl className="space-y-4 text-xs">
                  <div>
                    <dt className="text-subtle">Expected output</dt>
                    <dd className="mt-1 font-mono">
                      {quote.expectedOut.amount} {quote.expectedOut.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Minimum received</dt>
                    <dd className="mt-1 font-mono">
                      {quote.minimumOut.amount} {quote.minimumOut.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Slippage limit</dt>
                    <dd className="mt-1 font-mono">{quote.slippageBps / 100}%</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Quote expires</dt>
                    <dd className="mt-1 font-mono">{formatUtc(quote.expiresAt)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-subtle">
                  The review card checks a fresh quote and exact transaction before a wallet signature.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Compare routes at your size.</p>
                <UnavailableFacts
                  labels={['Expected output', 'Minimum received', 'Price impact', 'Maximum fees', 'Quote expiry']}
                />
                <p className="text-xs leading-6 text-subtle">
                  Soroswap and Stellar DEX quotes come from the application’s registered adapters. Unavailable routes
                  remain unavailable.
                </p>
              </>
            )}
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
              disabled={Boolean(intentId) || creating}
              value={inputAsset}
              onChange={(value) => {
                setInputAsset(value);
                invalidate();
              }}
            />
            <DecimalField
              label="Amount"
              disabled={Boolean(intentId) || creating}
              unit={inputAsset}
              value={amount}
              onChange={(value) => {
                setAmount(value);
                invalidate();
              }}
            />
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                disabled={Boolean(intentId) || creating}
                aria-label="Reverse input and output assets"
                onClick={reversePair}
              >
                <ArrowDownUp />
              </Button>
            </div>
            <AssetSelect
              label="You receive"
              disabled={Boolean(intentId) || creating}
              value={outputAsset}
              onChange={(value) => {
                setOutputAsset(value);
                invalidate();
              }}
            />
            <p className="text-xs text-subtle">
              Balances and maximum fees are verified during transaction preparation. A chart price is context only.
            </p>
            <Button
              className="workspace-action w-full"
              disabled={Boolean(intentId) || creating || !amount.trim()}
              onClick={() => void compare()}
            >
              {creating ? 'Getting quotes…' : 'Compare routes'} <ArrowRight />
            </Button>
            {intentId ? (
              <Button
                variant="ghost"
                className="workspace-action w-full"
                disabled={interactionLocked}
                onClick={invalidate}
              >
                Edit order
              </Button>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {intentId ? (
              <SwapProposalCard
                key={intentId}
                intentId={intentId}
                onQuote={setQuote}
                onInteractionLock={setInteractionLocked}
              />
            ) : (
              <ReviewRequirements />
            )}
          </div>
        </section>
      </div>
      <section className="workspace-panel" aria-labelledby="trade-positions-title">
        <h2 id="trade-positions-title" className="border-b px-6 py-5 font-serif text-xl font-semibold">
          My positions
        </h2>
        <EmptyState
          title="No verified spot positions loaded"
          description="Confirmed balances and cost basis are needed before position size, value or P&L can be shown. Trade confirmations remain in their review cards."
        />
      </section>
    </div>
  );
}
