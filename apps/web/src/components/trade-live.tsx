import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Skeleton } from '@nest/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
  type ActivityItem,
  ExecutionRequestError,
  execution,
  type Quote,
  type SwapSymbol,
  venueName,
} from '../lib/execution.ts';
import { formatPercentPoints, formatUsd } from '../lib/format.ts';
import { useHealth } from '../lib/health.ts';
import { useXlmUsd } from '../lib/portfolio.ts';
import { spotRows } from '../lib/spot-positions.ts';
import { swapDraftRequest } from '../lib/swap-draft.ts';
import { useWallet } from '../lib/wallet.tsx';
import { AssetIcon } from './asset-icon.tsx';
import { Fact, useCountdown } from './swap-proposal.tsx';
import { EmptyState } from './workspace.tsx';

const QUOTE_DELAY_MS = 600;
const ACTIVITY_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const SIGNED_USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(price);
}

export function useSwapDraft(sell: string, buy: string, amount: string) {
  const [intentId, setIntentId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const key = `${sell}:${buy}:${amount}`;
  const ready = swapDraftRequest(sell, buy, amount) !== null;

  useEffect(() => {
    setIntentId(null);
    setQuote(null);
    setError(null);
    const request = swapDraftRequest(sell, buy, amount);
    if (!request) return;
    let active = true;
    const timer = setTimeout(() => {
      execution.createSwap(request).then(
        (intent) => {
          if (active) {
            setDraftKey(key);
            setIntentId(intent.id);
          }
        },
        (caught: unknown) => {
          if (active) setError(caught instanceof ExecutionRequestError ? caught.message : 'The quote request failed.');
        },
      );
    }, QUOTE_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sell, buy, amount, ready, key]);

  const current = ready && draftKey === key;
  return {
    intentId: current ? intentId : null,
    quote: current ? quote : null,
    setQuote,
    error,
    waiting: ready && (!current || !intentId) && !error,
  };
}

export function RouteFacts({
  quote,
  referencePrice,
  network,
}: {
  quote: Quote | null;
  referencePrice: number | null;
  network: 'mainnet' | 'testnet' | undefined;
}) {
  const secondsLeft = useCountdown(quote?.expiresAt);
  if (!quote) {
    return (
      <div className="space-y-3 text-sm">
        <Badge variant="outline">{network === 'testnet' ? 'Stellar DEX' : 'Soroswap aggregation'}</Badge>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Enter an amount in Market swap. The route, minimum received and price impact appear here for that exact size.
        </p>
      </div>
    );
  }
  const rate = Number(quote.expectedOut.amount) / Number(quote.sell.amount);
  const versus = referencePrice ? (rate / referencePrice - 1) * 100 : null;
  return (
    <div className="space-y-3 text-sm">
      <Badge variant="secondary">{venueName(quote.venue)}</Badge>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <Fact label="Expected" value={`${quote.expectedOut.amount} ${quote.expectedOut.symbol}`} />
        <Fact label="At least" value={`${quote.minimumOut.amount} ${quote.minimumOut.symbol}`} />
        <Fact label="Rate" value={`${formatPrice(rate)} ${quote.expectedOut.symbol}/${quote.sell.symbol}`} />
        {versus === null ? null : <Fact label="vs reference" value={formatPercentPoints(versus)} />}
        <Fact
          label="Price impact"
          value={quote.priceImpactBps === null ? 'Not reported' : `${quote.priceImpactBps / 100}%`}
        />
        <Fact label="Slippage" value={`${quote.slippageBps / 100}%`} />
        <Fact label="Through" value={quote.protocols.join(', ') || venueName(quote.venue)} />
        <Fact label="Nest fee" value="0" />
      </dl>
      <p className="text-xs text-subtle">
        {secondsLeft === null || secondsLeft > 0
          ? `Quote valid for ${secondsLeft ?? '…'}s. The venue fee and network fee are shown at review.`
          : 'Quote expired. Get a new quote in Market swap.'}
      </p>
    </div>
  );
}

export function WalletActivity() {
  const wallet = useWallet();
  const activity = useQuery({
    queryKey: ['activity', wallet.address],
    queryFn: () => execution.activity(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 20_000,
  });
  if (!wallet.address) {
    return (
      <EmptyState
        title="Connect a wallet to see its activity"
        description="Swaps, loans and limit orders you sign through Nest appear here once they reach the network."
      >
        <Button onClick={wallet.connect} disabled={wallet.connecting}>
          <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
        </Button>
      </EmptyState>
    );
  }
  if (activity.isPending) return <Skeleton className="h-44 w-full" />;
  if (activity.isError) {
    return (
      <EmptyState title="Activity could not be loaded" description={activity.error.message}>
        <Button variant="outline" size="sm" onClick={() => void activity.refetch()}>
          <RefreshCw /> Try again
        </Button>
      </EmptyState>
    );
  }
  const items = activity.data.items;
  const pending = items.filter((item) => item.status === 'submitted' || item.status === 'confirming');
  return (
    <Tabs defaultValue="swaps">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger className="min-h-11" value="swaps">
          Swaps
        </TabsTrigger>
        <TabsTrigger className="min-h-11" value="pending">
          Pending{pending.length > 0 ? ` (${pending.length})` : ''}
        </TabsTrigger>
        <TabsTrigger className="min-h-11" value="history">
          History
        </TabsTrigger>
      </TabsList>
      <TabsContent value="swaps">
        <ActivityTable
          items={items.filter((item) => item.kind === 'swap')}
          empty="No swaps from this wallet yet. Confirmed swaps appear here with what you sent and received."
        />
      </TabsContent>
      <TabsContent value="pending">
        <ActivityTable items={pending} empty="Nothing is waiting for the network to confirm." />
      </TabsContent>
      <TabsContent value="history">
        <ActivityTable
          items={items}
          empty="Nothing from this wallet has reached the network through Nest yet. Swaps, loans and limit orders appear here."
        />
      </TabsContent>
    </Tabs>
  );
}

/** The connected wallet's spot XLM and USDC, valued at the XLM reference price Portfolio uses. */
export function SpotPositions({ disabled, onSwap }: { disabled: boolean; onSwap: (symbol: SwapSymbol) => void }) {
  const wallet = useWallet();
  const health = useHealth();
  const xlmUsd = useXlmUsd(health.data?.network);
  const balances = useQuery({
    queryKey: ['balances', wallet.address],
    queryFn: () => execution.balances(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 30_000,
  });
  const activity = useQuery({
    queryKey: ['activity', wallet.address],
    queryFn: () => execution.activity(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 20_000,
  });
  const rows = spotRows(balances.data, activity.data?.items ?? [], xlmUsd);
  let state: ReactNode = null;
  if (!wallet.address) {
    state = (
      <EmptyState
        title="Connect a wallet to see its positions"
        description="Spot XLM and USDC in your wallet appear here."
      >
        <Button onClick={wallet.connect} disabled={wallet.connecting}>
          <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
        </Button>
      </EmptyState>
    );
  } else if (balances.isPending) {
    state = <Skeleton className="h-24 w-full" />;
  } else if (balances.isError) {
    state = (
      <EmptyState title="Balances could not be loaded" description={balances.error.message}>
        <Button variant="outline" size="sm" onClick={() => void balances.refetch()}>
          <RefreshCw /> Try again
        </Button>
      </EmptyState>
    );
  } else if (!balances.data.funded) {
    state = <EmptyState title="No spot positions" description="This account is not funded on this network yet." />;
  } else if (rows.length === 0) {
    state = <EmptyState title="No spot positions" description="This wallet holds no spendable XLM or USDC." />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {['Asset / Market', 'Quantity', 'USD notional', 'Avg. entry', 'Mark', 'Unrealized P&L', 'Action'].map(
            (label) => (
              <TableHead key={label}>{label}</TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {state ? (
          <TableRow>
            <TableCell colSpan={7} className="p-0">
              {state}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const xlm = row.symbol === 'XLM';
            return (
              <TableRow key={row.symbol}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AssetIcon symbol={row.symbol} className="size-6" />
                    <div>
                      <p className="font-medium">{row.symbol}</p>
                      <p className="text-xs text-muted-foreground">{xlm ? 'XLM / USDC' : 'Cash'}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.quantity} {row.symbol}
                  {xlm && <p className="font-sans text-xs text-muted-foreground">After the account reserve</p>}
                </TableCell>
                <TableCell className="font-mono tabular-nums">{formatUsd(row.usd)}</TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.entry === null ? '—' : `${formatPrice(row.entry)} USDC`}
                  {xlm && (
                    <p className="font-sans text-xs text-muted-foreground">
                      {row.entry === null ? 'No XLM bought through Nest' : 'Confirmed Nest buys'}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.mark === null ? 'Unavailable' : `${formatPrice(row.mark)} USDC`}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.pnl === null ? (
                    '—'
                  ) : (
                    <>
                      <span className={row.pnl < 0 ? 'text-destructive' : row.pnl > 0 ? 'text-success' : undefined}>
                        {SIGNED_USD.format(row.pnl)}
                      </span>
                      <p className="font-sans text-xs text-muted-foreground">
                        On {formatPrice(row.pnlQuantity)} XLM bought through Nest
                      </p>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" disabled={disabled} onClick={() => onSwap(row.symbol)}>
                    {xlm ? 'Sell XLM' : 'Buy XLM'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function ActivityTable({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Transaction</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {ACTIVITY_TIME.format(Date.parse(item.createdAt))}
            </TableCell>
            <TableCell>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.venue}</p>
            </TableCell>
            <TableCell className="font-mono tabular-nums">{amounts(item.sent)}</TableCell>
            <TableCell className="font-mono tabular-nums">{amounts(item.received)}</TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell className="text-right">
              {item.explorerUrl ? (
                <a
                  href={item.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View <ExternalLink className="size-3" />
                </a>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: ActivityItem['status'] }) {
  if (status === 'confirmed') return <Badge variant="secondary">Confirmed</Badge>;
  if (status === 'submitted' || status === 'confirming') return <Badge variant="outline">Pending</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">{status === 'expired' ? 'Expired' : status.replaceAll('_', ' ')}</Badge>;
}

function amounts(list: ActivityItem['sent']): string {
  return list.length === 0 ? '—' : list.map((amount) => `${amount.amount} ${amount.symbol}`).join(' + ');
}

export function balanceHint(
  address: string | null,
  balances: { funded: boolean } | undefined,
  spendable: string | null,
  symbol: SwapSymbol,
  failed: boolean,
): string {
  if (!address) return 'Connect a wallet to see what you can spend.';
  if (failed) return 'Your balance could not be read. The review still checks it before you sign.';
  if (!balances) return 'Reading your balance…';
  if (!balances.funded) return 'This account is not funded on this network yet.';
  if (spendable === null) return `No ${symbol} trustline yet. Add one when you review.`;
  return symbol === 'XLM'
    ? `Available ${spendable} XLM after the account reserve.`
    : `Available ${spendable} ${symbol}.`;
}
