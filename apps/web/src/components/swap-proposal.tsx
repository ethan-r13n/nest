import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExecutionRequestError,
  execution,
  type Intent,
  isPending,
  type Plan,
  planProblem,
  type Quote,
  signAndSubmit,
  venueName,
} from '../lib/execution.ts';
import { shortAddress, useWallet } from '../lib/wallet.tsx';
import { TrustlineStep } from './trustline-step.tsx';

type Phase = 'quoting' | 'quoted' | 'preparing' | 'review' | 'signing' | 'confirming' | 'done' | 'stopped';

/**
 * A swap proposal from chat. Everything shown comes from Nest's own records: the live quote, then
 * the exact transaction the wallet will sign. Only the user's signature in their wallet executes it.
 */
export function SwapProposalCard({
  intentId,
  onQuote,
  onInteractionLock,
}: {
  intentId: string;
  onQuote?: (quote: Quote | null) => void;
  onInteractionLock?: (locked: boolean) => void;
}) {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>('quoting');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(
    phase === 'quoted' ? quote?.expiresAt : phase === 'review' ? plan?.prepared?.validUntil : undefined,
  );
  useEffect(() => {
    onInteractionLock?.(phase === 'preparing' || phase === 'signing' || phase === 'confirming');
  }, [phase, onInteractionLock]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback((caught: unknown) => {
    setError(
      caught instanceof ExecutionRequestError || caught instanceof Error ? caught.message : 'Something went wrong.',
    );
  }, []);

  /** Quotes again and returns the new quote's ID, or null. */
  const requote = useCallback(async (): Promise<string | null> => {
    setPhase('quoting');
    setError(null);
    setPlan(null);
    try {
      // The request itself always shows, even when no live quote can be had.
      setIntent(await execution.intent(intentId));
      const fresh = (await execution.quote(intentId)) ?? null;
      setQuote(fresh);
      if (mounted.current) onQuote?.(fresh);
      setPhase('quoted');
      return fresh?.id ?? null;
    } catch (caught) {
      fail(caught);
      setPhase('stopped');
      return null;
    }
  }, [intentId, fail, onQuote]);

  useEffect(() => {
    void requote();
  }, [requote]);

  async function review(quoteId = quote?.id) {
    if (!quoteId || !wallet.address) return;
    setError(null);
    setPhase('preparing');
    try {
      const created = await execution.plan({ intentId, quoteId, accountId: wallet.address });
      const prepared = await execution.prepare(created.id);
      setPlan(prepared);
      setPhase(prepared.status === 'awaiting_review' ? 'review' : 'stopped');
    } catch (caught) {
      fail(caught);
      setPhase('quoted');
    }
  }

  async function continueAfterTrustline() {
    const quoteId = await requote();
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
      setPhase(settled.status === 'confirmed' ? 'done' : isPending(settled) ? 'confirming' : 'stopped');
    } catch (caught) {
      fail(caught);
      // The plan is still waiting for a signature unless the submit itself reported otherwise.
      setPhase('review');
    }
  }

  const sell = intent?.sell;
  const buySymbol = intent?.buy.symbol ?? quote?.expectedOut.symbol ?? '';
  const expired = secondsLeft !== null && secondsLeft <= 0;
  const warnings = plan?.policy.reasons.filter((reason) => !reason.pass && reason.severity === 'warn') ?? [];

  return (
    <section aria-label="Swap proposal" className="mt-3 space-y-3 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          {sell ? `${sell.amount} ${sell.symbol}` : '…'} <ArrowRight className="size-4" /> {buySymbol}
        </p>
        <div className="flex gap-1.5">
          {intent ? <Badge variant="outline">{intent.network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Badge> : null}
          <Badge variant="secondary">{venueName(plan?.quote.venue ?? quote?.venue)}</Badge>
        </div>
      </div>

      {phase === 'quoting' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Getting a live quote…
        </p>
      ) : null}

      {quote && (phase === 'quoted' || phase === 'preparing') ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Fact label="Expected" value={`${quote.expectedOut.amount} ${quote.expectedOut.symbol}`} />
          <Fact
            label="At least"
            value={`${quote.minimumOut.amount} ${quote.minimumOut.symbol} (${quote.slippageBps / 100}% slippage)`}
          />
          <Fact
            label="Price impact"
            value={quote.priceImpactBps === null ? 'Not reported' : `${quote.priceImpactBps / 100}%`}
          />
          <Fact label="Route" value={quote.protocols.join(', ') || venueName(quote.venue)} />
          <Fact label="Nest fee" value="0" />
        </dl>
      ) : null}

      {plan?.prepared && (phase === 'review' || phase === 'signing') ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-subtle">Exact transaction you will sign</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Fact label="You send" value={`${plan.quote.sell.amount} ${plan.quote.sell.symbol}`} />
            <Fact
              label="You receive at least"
              value={`${plan.prepared.enforcedMinimumOut.amount} ${plan.prepared.enforcedMinimumOut.symbol}`}
            />
            {plan.prepared.simulatedOut ? (
              <Fact
                label="Simulated"
                value={`${plan.prepared.simulatedOut.amount} ${plan.prepared.simulatedOut.symbol}`}
              />
            ) : null}
            <Fact
              label={`${venueName(plan.quote.venue)} fee`}
              value={`${plan.prepared.providerFee.amount} ${plan.prepared.providerFee.symbol} (${(plan.prepared.providerFee.bps / 100).toFixed(2)}%)`}
            />
            <Fact label="Network fee" value={`${plan.prepared.fee.amount} XLM (limit ${plan.maxFee.amount})`} />
            <Fact label="From" value={shortAddress(plan.account)} />
          </dl>
          {warnings.map((reason) => (
            <p key={reason.code} className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0" /> {reason.detail}
            </p>
          ))}
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
          Swapped.{' '}
          {plan.received ? `Received ${plan.received.amount} ${plan.received.symbol}.` : 'Confirmed on the network.'}
        </p>
      ) : null}

      {plan && phase === 'stopped' ? (
        <p className="text-destructive">{planProblem(plan) ?? 'This swap stopped.'}</p>
      ) : null}
      {plan && phase === 'stopped' && plan.errorCode === 'TRUSTLINE_MISSING' ? (
        <TrustlineStep use="swap" onAdded={continueAfterTrustline} />
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
        {(phase === 'quoted' || phase === 'review') && expired ? (
          <Button variant="outline" size="sm" onClick={() => requote()}>
            <RefreshCw /> New quote
          </Button>
        ) : null}
        {phase === 'stopped' && !error ? (
          <Button variant="outline" size="sm" onClick={() => requote()}>
            <RefreshCw /> Try again
          </Button>
        ) : null}
        {phase === 'quoted' && !expired && !wallet.address ? (
          <Button size="sm" onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet to review'}
          </Button>
        ) : null}
        {phase === 'quoted' && !expired && wallet.address ? (
          <Button size="sm" onClick={() => review()}>
            Review swap
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

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono tabular-nums">{value}</dd>
    </>
  );
}

export function useCountdown(until: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
}
