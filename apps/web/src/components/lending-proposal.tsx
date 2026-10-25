import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { cn } from '@nest/ui/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExecutionRequestError,
  execution,
  isPending,
  type LendingComparison,
  type LendingIntent,
  type LendingOffer,
  type LendingPlan,
  planProblem,
  signAndSubmit,
} from '../lib/execution.ts';
import { shortAddress, useWallet } from '../lib/wallet.tsx';
import { Fact, useCountdown } from './swap-proposal.tsx';

type Phase = 'comparing' | 'compared' | 'preparing' | 'review' | 'signing' | 'confirming' | 'done' | 'stopped';

const REQUEST_LABELS = { supply: 'Supply', supplyCollateral: 'Deposit collateral', borrow: 'Borrow' } as const;

/**
 * A supply or borrow proposal. Nest compares every registered Blend pool, shows the excluded ones
 * with their reason, then the exact pool transaction the wallet will sign.
 */
export function LendingProposalCard({ intentId }: { intentId: string }) {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>('comparing');
  const [intent, setIntent] = useState<LendingIntent | null>(null);
  const [comparison, setComparison] = useState<LendingComparison | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<LendingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offer = comparison?.quotes.find((quote) => quote.id === selectedId) ?? null;
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

  const compare = useCallback(async () => {
    setPhase('comparing');
    setError(null);
    setPlan(null);
    try {
      setIntent(await execution.lendingIntent(intentId));
      const compared = await execution.compareLending(intentId);
      setComparison(compared);
      setSelectedId(compared.selectedQuoteId);
      setPhase('compared');
    } catch (caught) {
      fail(caught);
      setPhase('stopped');
    }
  }, [intentId, fail]);

  useEffect(() => {
    void compare();
  }, [compare]);

  async function review() {
    if (!offer || !wallet.address) return;
    setError(null);
    setPhase('preparing');
    try {
      const created = await execution.plan<LendingPlan>({ intentId, quoteId: offer.id, accountId: wallet.address });
      const prepared = created.status === 'policy_checked' ? await execution.prepare<LendingPlan>(created.id) : created;
      setPlan(prepared);
      setPhase(prepared.status === 'awaiting_review' ? 'review' : 'stopped');
    } catch (caught) {
      fail(caught);
      setPhase('compared');
    }
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
      setPhase('review');
    }
  }

  const supply = intent?.kind === 'supply';
  const verb = supply ? 'Supply' : 'Borrow';
  const expired = secondsLeft !== null && secondsLeft <= 0;
  const warnings = plan?.policy.reasons.filter((reason) => !reason.pass && reason.severity === 'warn') ?? [];

  return (
    <section aria-label={`${verb} proposal`} className="mt-3 space-y-3 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {intent
            ? `${verb} ${intent.asset.amount} ${intent.asset.symbol}${intent.collateral ? ` against ${intent.collateral.symbol}` : ''}`
            : '…'}
        </p>
        <div className="flex gap-1.5">
          {intent ? <Badge variant="outline">{intent.network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Badge> : null}
          <Badge variant="secondary">Blend</Badge>
        </div>
      </div>

      {phase === 'comparing' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Comparing Blend pools…
        </p>
      ) : null}

      {comparison && (phase === 'compared' || phase === 'preparing') ? (
        <div className="space-y-2">
          {comparison.quotes.length ? (
            <ul className="space-y-1.5" aria-label="Eligible pools, best first">
              {comparison.quotes.map((quote, index) => (
                <li key={quote.id}>
                  <OfferOption
                    offer={quote}
                    best={index === 0}
                    selected={quote.id === selectedId}
                    onSelect={() => setSelectedId(quote.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-destructive">No Blend pool can take this right now.</p>
          )}
          {offer ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {offer.collateral ? (
                <Fact label="Collateral" value={`${offer.collateral.amount} ${offer.collateral.symbol}`} />
              ) : null}
              {offer.estimatedHealth !== null ? (
                <Fact
                  label="Est. health factor"
                  value={`${offer.estimatedHealth.toFixed(2)}${offer.targetHealth ? ` (target ${offer.targetHealth})` : ''}`}
                />
              ) : null}
              <Fact label="Utilization" value={`${offer.utilizationPct.toFixed(1)}%`} />
              <Fact label="Nest fee" value="0" />
            </dl>
          ) : null}
          {offer ? <WithdrawalTiming summary={offer.withdrawalTiming.summary} /> : null}
          {offer && !supply ? (
            <p className="text-xs text-muted-foreground">
              Blend liquidates a position whose health factor falls below 1. Rates are variable.
            </p>
          ) : null}
          {comparison.excluded.length ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-subtle">Excluded</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {comparison.excluded.map((entry) => (
                  <li key={entry.poolId}>
                    <span className="text-foreground">{entry.name}</span>: {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {plan?.prepared && (phase === 'review' || phase === 'signing') ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-subtle">
            Exact transaction you will sign · {plan.offer.pool.name}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {plan.prepared.requests.map((request) => (
              <Fact
                key={request.type}
                label={REQUEST_LABELS[request.type]}
                value={`${request.amount} ${request.symbol}`}
              />
            ))}
            {plan.prepared.health.after !== null ? (
              <Fact label="Health factor after" value={plan.prepared.health.after.toFixed(2)} />
            ) : null}
            <Fact label="Network fee" value={`${plan.prepared.fee.amount} XLM (limit ${plan.maxFee.amount})`} />
            <Fact label="From and to" value={shortAddress(plan.account)} />
          </dl>
          <WithdrawalTiming summary={plan.offer.withdrawalTiming.summary} />
          {warnings.map((reason) => (
            <p key={reason.code} className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0" /> {reason.detail}
            </p>
          ))}
          {plan.prepared.health.warning ? (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" /> Health below 1.5 leaves little room if prices move.
            </p>
          ) : null}
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
          {supply ? 'Supplied' : 'Borrowed'} on {plan.offer.pool.name}. Confirmed in ledger {plan.ledger}.
        </p>
      ) : null}
      {plan && phase === 'stopped' ? (
        <p className="text-destructive">{planProblem(plan) ?? 'This action stopped.'}</p>
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
          <Button variant="outline" size="sm" onClick={compare}>
            <RefreshCw /> Compare again
          </Button>
        ) : null}
        {phase === 'compared' && offer && !expired && !wallet.address ? (
          <Button size="sm" onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect Freighter to review'}
          </Button>
        ) : null}
        {phase === 'compared' && offer && !expired && wallet.address ? (
          <Button size="sm" onClick={review}>
            Review {verb.toLowerCase()}
          </Button>
        ) : null}
        {phase === 'preparing' ? (
          <Button size="sm" disabled>
            <LoaderCircle className="animate-spin" /> Building and checking…
          </Button>
        ) : null}
        {phase === 'review' && !expired ? (
          <Button size="sm" onClick={sign}>
            <Wallet /> Sign in Freighter
          </Button>
        ) : null}
        {phase === 'signing' ? (
          <Button size="sm" disabled>
            <LoaderCircle className="animate-spin" /> Waiting for Freighter…
          </Button>
        ) : null}
      </div>
      {wallet.error ? <p className="text-xs text-destructive">{wallet.error}</p> : null}
    </section>
  );
}

function OfferOption({
  offer,
  best,
  selected,
  onSelect,
}: {
  offer: LendingOffer;
  best: boolean;
  selected: boolean;
  onSelect(): void;
}) {
  const apy = offer.kind === 'supply' ? offer.supplyApyPct : offer.borrowApyPct;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted',
      )}
    >
      <span>
        <span className="font-medium">{offer.pool.name}</span>
        <span className="block text-xs text-subtle">
          {offer.pool.status}
          {best ? ' · best rate' : ''}
        </span>
      </span>
      <span className="text-right font-mono tabular-nums">
        {apy.toFixed(2)}%
        <span className="block font-sans text-xs text-subtle">
          {offer.kind === 'supply' ? 'supply APY' : 'borrow APY'}
        </span>
      </span>
    </button>
  );
}

function WithdrawalTiming({ summary }: { summary: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
      <Clock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">Withdrawal timing.</span> {summary}
      </span>
    </p>
  );
}
