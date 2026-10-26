import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  ExecutionRequestError,
  execution,
  isPending,
  type LimitIntent,
  type LimitOffer,
  type LimitOrderRow,
  type LimitPlan,
  planProblem,
  signAndSubmit,
} from '../lib/execution.ts';
import { shortAddress, useWallet } from '../lib/wallet.tsx';
import { Fact, useCountdown } from './swap-proposal.tsx';
import { TrustlineStep } from './trustline-step.tsx';

type Phase =
  | 'needs_wallet'
  | 'comparing'
  | 'compared'
  | 'preparing'
  | 'review'
  | 'signing'
  | 'confirming'
  | 'done'
  | 'stopped';

const POOL_REFRESH_MS = 20_000;
const PRICE_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,7})?$/;
const STATUS_LABELS: Record<LimitOrderRow['status'], string> = {
  waiting: 'Waiting',
  filling: 'Filling',
  filled: 'Filled · withdraw',
  in_range: 'In range',
  out_of_range: 'Out of range',
};

/**
 * A limit order placed as a one-sided Aquarius concentrated-liquidity position, or the withdrawal
 * of one. Everything shown comes from Nest's records and the live pool; the wallet signs.
 */
export function LimitOrderCard({ intentId, onClosed }: { intentId: string; onClosed?(): void }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('comparing');
  const [intent, setIntent] = useState<LimitIntent | null>(null);
  const [offer, setOffer] = useState<LimitOffer | null>(null);
  const [plan, setPlan] = useState<LimitPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(
    phase === 'compared' ? offer?.expiresAt : phase === 'review' ? plan?.prepared?.validUntil : undefined,
  );
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fail = useCallback((caught: unknown) => {
    setError(
      caught instanceof ExecutionRequestError || caught instanceof Error ? caught.message : 'Something went wrong.',
    );
  }, []);

  const compare = useCallback(async (): Promise<string | null> => {
    setPhase('comparing');
    setError(null);
    setPlan(null);
    try {
      const loaded = await execution.limitIntent(intentId);
      setIntent(loaded);
      if (loaded.kind === 'limit_close' && !wallet.address) {
        setPhase('needs_wallet');
        return null;
      }
      const compared = await execution.compareLimit(intentId, wallet.address ?? undefined);
      const [fresh] = compared.quotes;
      setOffer(fresh ?? null);
      setPhase('compared');
      return fresh?.id ?? null;
    } catch (caught) {
      fail(caught);
      setPhase('stopped');
      return null;
    }
  }, [intentId, fail, wallet.address]);

  useEffect(() => {
    void compare();
  }, [compare]);

  async function review(quoteId = offer?.id) {
    if (!quoteId || !wallet.address) return;
    setError(null);
    setPhase('preparing');
    try {
      const created = await execution.plan<LimitPlan>({ intentId, quoteId, accountId: wallet.address });
      const prepared = created.status === 'policy_checked' ? await execution.prepare<LimitPlan>(created.id) : created;
      setPlan(prepared);
      setPhase(prepared.status === 'awaiting_review' ? 'review' : 'stopped');
    } catch (caught) {
      fail(caught);
      setPhase('compared');
    }
  }

  async function continueAfterTrustline() {
    const quoteId = await compare();
    if (quoteId) await review(quoteId);
  }

  async function sign() {
    if (!plan?.prepared) return;
    setError(null);
    setPhase('signing');
    try {
      const settled = await signAndSubmit(plan, {
        sign: wallet.sign,
        onSigned: () => setPhase('confirming'),
        onUpdate: setPlan,
        stillWatching: () => mounted.current,
      });
      setPlan(settled);
      const confirmed = settled.status === 'confirmed';
      setPhase(confirmed ? 'done' : isPending(settled) ? 'confirming' : 'stopped');
      if (confirmed) {
        void queryClient.invalidateQueries({ queryKey: ['limit-orders'] });
        if (intent?.kind === 'limit_close') onClosed?.();
      }
    } catch (caught) {
      fail(caught);
      setPhase('review');
    }
  }

  const closing = intent?.kind === 'limit_close';
  const order = offer?.order;
  const title = closing
    ? 'Withdraw limit order'
    : intent
      ? `Limit ${intent.side} XLM at ${intent.limitPrice} USDC`
      : '…';
  const expired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <section aria-label={title} className="mt-3 space-y-3 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <div className="flex gap-1.5">
          {intent ? <Badge variant="outline">{intent.network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Badge> : null}
          <Badge variant="secondary">Aquarius</Badge>
        </div>
      </div>

      {phase === 'comparing' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Reading the pool…
        </p>
      ) : null}
      {phase === 'needs_wallet' ? (
        <p className="text-muted-foreground">Connect your wallet to read this order.</p>
      ) : null}

      {offer && (phase === 'compared' || phase === 'preparing') ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Fact label="Price now" value={`${offer.currentPrice.toFixed(4)} USDC per XLM`} />
            <Fact label="Band" value={`${offer.band.prices[0].toFixed(4)} – ${offer.band.prices[1].toFixed(4)}`} />
            {order ? (
              <>
                <Fact label="You deposit" value={`${order.deposit.amount} ${order.deposit.symbol}`} />
                <Fact label="When filled" value={`≈ ${trim(order.onFill.amount)} ${order.onFill.symbol}`} />
                <Fact label="Pool fee earned" value={`${offer.pool.feeBps / 100}% of the volume that fills you`} />
              </>
            ) : null}
            {offer.position ? (
              <>
                {offer.position.returns.map((amount) => (
                  <Fact key={amount.symbol} label={`You receive ${amount.symbol}`} value={trim(amount.amount)} />
                ))}
                <Fact
                  label="Fees included"
                  value={offer.position.fees.map((fee) => `${trim(fee.amount)} ${fee.symbol}`).join(' · ')}
                />
              </>
            ) : null}
            <Fact label="Nest fee" value="0" />
          </dl>
          {order ? (
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              Fills only {order.side === 'buy' ? 'at or below' : 'at or above'} {order.limitPrice} USDC per XLM. Once
              the price crosses the whole band, withdraw it: if the price moves back through the band, it converts back.
            </p>
          ) : null}
        </div>
      ) : null}

      {plan?.prepared && (phase === 'review' || phase === 'signing') ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-subtle">
            Exact transaction you will sign · {plan.offer.pool.name}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Fact
              label="Pool call"
              value={plan.prepared.method === 'deposit_position' ? 'Deposit to band' : 'Withdraw band'}
            />
            <Fact label="Network fee" value={`${plan.prepared.fee.amount} XLM (limit ${plan.maxFee.amount})`} />
            <Fact label="From and to" value={shortAddress(plan.account)} />
          </dl>
        </div>
      ) : null}

      {phase === 'confirming' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Submitted. Waiting for the network to confirm…
        </p>
      ) : null}
      {phase === 'done' && plan ? (
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" />
          {closing ? 'Withdrawn' : 'Limit order placed'}. Confirmed in ledger {plan.ledger}.
        </p>
      ) : null}
      {plan && phase === 'stopped' ? (
        <p className="text-destructive">{planProblem(plan) ?? 'This action stopped.'}</p>
      ) : null}
      {plan && phase === 'stopped' && plan.errorCode === 'TRUSTLINE_MISSING' ? (
        <TrustlineStep use="aquarius" onAdded={continueAfterTrustline} />
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {plan?.explorerUrl ? (
        <a
          href={plan.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View transaction <ExternalLink className="size-3" />
        </a>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {secondsLeft !== null && !expired ? (
          <span className="text-xs text-subtle">Valid for {secondsLeft}s</span>
        ) : null}
        {((phase === 'compared' || phase === 'review') && expired) || (phase === 'stopped' && !error) ? (
          <Button variant="outline" size="sm" onClick={() => compare()}>
            <RefreshCw /> Check again
          </Button>
        ) : null}
        {(phase === 'needs_wallet' || (phase === 'compared' && !expired)) && !wallet.address ? (
          <Button size="sm" onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet to review'}
          </Button>
        ) : null}
        {phase === 'compared' && offer && !expired && wallet.address ? (
          <Button size="sm" onClick={() => review()}>
            {closing ? 'Review withdrawal' : 'Review limit order'}
          </Button>
        ) : null}
        {phase === 'preparing' ? (
          <Button size="sm" disabled>
            <LoaderCircle className="animate-spin" /> Building and checking…
          </Button>
        ) : null}
        {phase === 'review' && !expired ? (
          <Button size="sm" onClick={sign}>
            <Wallet /> Sign in wallet
          </Button>
        ) : null}
        {phase === 'signing' ? (
          <Button size="sm" disabled>
            <LoaderCircle className="animate-spin" /> Waiting for wallet…
          </Button>
        ) : null}
      </div>
      {wallet.error ? <p className="text-xs text-destructive">{wallet.error}</p> : null}
    </section>
  );
}

/** The Trade page's limit order form over the live pool, and the wallet's open orders. */
export function LimitOrderPanel() {
  const wallet = useWallet();
  const amountId = useId();
  const priceId = useId();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('100');
  const [price, setPrice] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pool = useQuery({ queryKey: ['limit-pool'], queryFn: execution.limitPool, refetchInterval: POOL_REFRESH_MS });
  const orders = useQuery({
    queryKey: ['limit-orders', wallet.address],
    queryFn: () => execution.limitOrders(wallet.address ?? ''),
    enabled: Boolean(wallet.address) && pool.data?.available === true,
    refetchInterval: POOL_REFRESH_MS,
  });

  if (pool.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Reading the Aquarius pool…
      </p>
    );
  }
  if (pool.isError) return <p className="text-sm text-destructive">{messageOf(pool.error)}</p>;
  if (!pool.data.available) return <p className="text-sm text-muted-foreground">{pool.data.reason}</p>;
  const live = pool.data;
  const priceValue = Number(price);
  const valid = PRICE_PATTERN.test(amount) && Number(amount) > 0 && PRICE_PATTERN.test(price) && priceValue > 0;
  const wrongSide = valid && (side === 'buy' ? priceValue >= live.usdcPerXlm : priceValue <= live.usdcPerXlm);

  async function place(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await execution.createLimitOrder({ side, amountXlm: amount, priceUsdc: price });
      setIntentId(created.id);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setCreating(false);
    }
  }

  async function withdraw(row: LimitOrderRow) {
    setError(null);
    try {
      const created = await execution.createLimitClose({
        poolId: row.poolId,
        tickLower: row.tickLower,
        tickUpper: row.tickUpper,
      });
      setCloseId(created.id);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {live.name} · {live.usdcPerXlm.toFixed(4)} USDC per XLM now · {live.feeBps / 100}% pool fee
      </p>
      {intentId ? (
        <div className="space-y-2">
          <LimitOrderCard intentId={intentId} />
          <Button variant="ghost" size="sm" onClick={() => setIntentId(null)}>
            New limit order
          </Button>
        </div>
      ) : (
        <form onSubmit={place} className="space-y-4">
          <fieldset className="flex gap-2">
            <legend className="sr-only">Side</legend>
            {(['buy', 'sell'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={side === option ? 'default' : 'outline'}
                aria-pressed={side === option}
                onClick={() => setSide(option)}
              >
                {option === 'buy' ? 'Buy XLM' : 'Sell XLM'}
              </Button>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={amountId}>Amount (XLM)</Label>
              <Input
                id={amountId}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value.trim())}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={priceId}>Limit price (USDC per XLM)</Label>
              <Input
                id={priceId}
                inputMode="decimal"
                placeholder={(side === 'buy' ? live.usdcPerXlm * 0.95 : live.usdcPerXlm * 1.05).toFixed(4)}
                value={price}
                onChange={(event) => setPrice(event.currentTarget.value.trim())}
              />
            </div>
          </div>
          {wrongSide ? (
            <p className="text-xs text-destructive">
              {side === 'buy'
                ? 'A limit buy must be below the current price.'
                : 'A limit sell must be above the current price.'}
            </p>
          ) : (
            <p className="text-xs text-subtle">
              {side === 'buy'
                ? `Deposits about ${valid ? (Number(amount) * priceValue).toFixed(2) : '—'} USDC, filled as the price falls to your limit.`
                : `Deposits ${valid ? amount : '—'} XLM, filled as the price rises to your limit.`}
            </p>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={!valid || wrongSide || creating || !live.depositsEnabled}>
            {creating ? <LoaderCircle className="animate-spin" /> : null} Review limit order
          </Button>
        </form>
      )}

      <section aria-label="Your limit orders" className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Your limit orders</h3>
        {!wallet.address ? (
          <p className="text-sm text-muted-foreground">Connect your wallet to see your orders.</p>
        ) : orders.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orders.isError ? (
          <p className="text-sm text-destructive">{messageOf(orders.error)}</p>
        ) : orders.data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open limit orders.</p>
        ) : (
          <ul className="space-y-2">
            {orders.data.orders.map((row) => (
              <li
                key={`${row.tickLower}:${row.tickUpper}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span>
                  <span className="font-medium">
                    {row.side ? `${row.side === 'buy' ? 'Buy' : 'Sell'} XLM` : 'Position'}
                    {row.limitPrice ? ` at ${row.limitPrice}` : ''}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.prices[0].toFixed(4)} – {row.prices[1].toFixed(4)} ·{' '}
                    {row.returns.map((amount) => `${trim(amount.amount)} ${amount.symbol}`).join(' + ')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={row.status === 'filled' ? 'default' : 'outline'}>{STATUS_LABELS[row.status]}</Badge>
                  <Button size="sm" variant="outline" onClick={() => withdraw(row)}>
                    Withdraw
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {closeId ? <LimitOrderCard intentId={closeId} onClosed={() => setCloseId(null)} /> : null}
      </section>
    </div>
  );
}

function trim(amount: string): string {
  const value = Number(amount);
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 7 : 4 });
}

function messageOf(error: unknown): string {
  return error instanceof ExecutionRequestError || error instanceof Error ? error.message : 'Something went wrong.';
}
