import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { cn } from '@nest/ui/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExecutionRequestError,
  execution,
  isExitKind,
  isPending,
  type LendingComparison,
  type LendingIntent,
  type LendingOffer,
  type LendingPlan,
  planProblem,
  signAndSubmit,
} from '../lib/execution.ts';
import { continuationQuote } from '../lib/lending-continuation.ts';
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

const REQUEST_LABELS = {
  supply: 'Supply',
  supplyCollateral: 'Deposit collateral',
  borrow: 'Borrow',
  repay: 'Repay',
  withdraw: 'Withdraw',
  withdrawCollateral: 'Withdraw collateral',
} as const;
const VERBS = {
  supply: ['Supply', 'Supplied'],
  borrow: ['Borrow', 'Borrowed'],
  repay: ['Repay', 'Repaid'],
  withdraw: ['Withdraw', 'Withdrew'],
  withdraw_collateral: ['Withdraw collateral', 'Withdrew collateral'],
} as const;
const HELD_LABELS = { debt: 'You owe', supplied: 'You supplied', collateral: 'Your collateral' } as const;

/**
 * A lending proposal. Supply compares every registered Blend pool, borrow adds XOXNO, and repay
 * and withdraw read the connected wallet's Blend position in each pool. Excluded venues show their
 * reason, then the card shows the exact transaction the wallet will sign. A first XOXNO loan takes
 * two: the collateral, then the loan, which the card builds once the collateral confirms.
 */
export function LendingProposalCard({
  intentId,
  onInteractionLock,
}: {
  intentId: string;
  onInteractionLock?: (locked: boolean) => void;
}) {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>('comparing');
  const [intent, setIntent] = useState<LendingIntent | null>(null);
  const [comparison, setComparison] = useState<LendingComparison | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<LendingPlan | null>(null);
  /** The confirmed XOXNO collateral deposit, kept while its loan is reviewed. */
  const [collateralPlan, setCollateralPlan] = useState<LendingPlan | null>(null);
  const continuationPoolId = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const offer = comparison?.quotes.find((quote) => quote.id === selectedId) ?? null;
  const secondsLeft = useCountdown(
    phase === 'compared' ? offer?.expiresAt : phase === 'review' ? plan?.prepared?.validUntil : undefined,
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

  /** Compares again; returns the fresh offer from `poolId` when given, else the best one. */
  const compare = useCallback(
    async (poolId = continuationPoolId.current): Promise<string | null> => {
      continuationPoolId.current = poolId;
      setPhase('comparing');
      setError(null);
      setPlan(null);
      try {
        const loaded = await execution.lendingIntent(intentId);
        setIntent(loaded);
        if (isExitKind(loaded.kind) && !wallet.address) {
          setPhase('needs_wallet');
          return null;
        }
        const compared = await execution.compareLending(intentId, wallet.address ?? undefined);
        setComparison(compared);
        const continuation = poolId ? continuationQuote(compared, poolId) : null;
        if (continuation && 'stop' in continuation) {
          setSelectedId(null);
          setError(continuation.stop);
          setPhase('stopped');
          return null;
        }
        const chosen = continuation?.quoteId ?? compared.selectedQuoteId;
        setSelectedId(chosen);
        setPhase('compared');
        return chosen;
      } catch (caught) {
        fail(caught);
        setPhase('stopped');
        return null;
      }
    },
    [intentId, fail, wallet.address],
  );

  useEffect(() => {
    void compare();
  }, [compare]);

  async function review(quoteId = offer?.id) {
    if (!quoteId || !wallet.address) return;
    setError(null);
    setPhase('preparing');
    try {
      const created = await execution.plan<LendingPlan>({ intentId, quoteId, accountId: wallet.address });
      const prepared = created.status === 'policy_checked' ? await execution.prepare<LendingPlan>(created.id) : created;
      setPlan(prepared);
      setPhase(prepared.status === 'awaiting_review' ? 'review' : 'stopped');
    } catch (caught) {
      fail(caught);
      setPhase('compared');
    }
  }

  /** Compares again and prepares the fresh offer from the same venue, after a step it needed first. */
  async function continueOn(poolId: string) {
    const quoteId = await compare(poolId);
    if (quoteId) await review(quoteId);
  }

  async function sign() {
    if (!plan?.prepared) return;
    setError(null);
    setPhase('signing');
    setPolling(true);
    try {
      const settled = await signAndSubmit(plan, {
        sign: wallet.sign,
        onSigned: () => setPhase('confirming'),
        onUpdate: setPlan,
        stillWatching: () => mounted.current,
      });
      setPlan(settled);
      setPhase(settled.status === 'confirmed' ? 'done' : isPending(settled) ? 'confirming' : 'stopped');
      if (settled.status === 'confirmed' && settled.prepared?.step === 'collateral') {
        setCollateralPlan(settled);
        await continueOn(settled.offer.pool.id);
      }
    } catch (caught) {
      fail(caught);
      setPhase('review');
    } finally {
      setPolling(false);
    }
  }

  async function checkConfirmation() {
    if (!plan || !isPending(plan) || polling) return;
    setError(null);
    setPolling(true);
    try {
      const latest = await execution.read<LendingPlan>(plan.id);
      setPlan(latest);
      setPhase(latest.status === 'confirmed' ? 'done' : isPending(latest) ? 'confirming' : 'stopped');
      if (latest.status === 'confirmed' && latest.prepared?.step === 'collateral') {
        setCollateralPlan(latest);
        await continueOn(latest.offer.pool.id);
      }
    } catch (caught) {
      fail(caught);
    } finally {
      setPolling(false);
    }
  }

  const kind = intent?.kind ?? 'supply';
  const exit = isExitKind(kind);
  const [verb, done] = VERBS[kind];
  const title = intent
    ? exit
      ? `${verb} ${intent.wholePosition ? `all ${intent.asset.symbol}` : `${intent.asset.amount} ${intent.asset.symbol}`}`
      : `${verb} ${intent.asset.amount} ${intent.asset.symbol}${intent.collateral ? ` against ${intent.collateral.symbol}` : ''}`
    : '…';
  const expired = secondsLeft !== null && secondsLeft <= 0;
  const venue =
    (plan?.offer ?? offer)?.venue === 'xoxno' ? 'XOXNO' : kind === 'borrow' && !offer ? 'Blend · XOXNO' : 'Blend';
  const step = plan?.prepared?.step ?? null;
  const warnings = plan?.policy.reasons.filter((reason) => !reason.pass && reason.severity === 'warn') ?? [];

  return (
    <section aria-label={`${verb} proposal`} className="mt-3 space-y-3 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <div className="flex gap-1.5">
          {intent ? <Badge variant="outline">{intent.network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Badge> : null}
          <Badge variant="secondary">{venue}</Badge>
        </div>
      </div>

      {phase === 'comparing' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />{' '}
          {exit
            ? 'Reading your Blend positions…'
            : kind === 'borrow'
              ? 'Comparing Blend and XOXNO…'
              : 'Comparing Blend pools…'}
        </p>
      ) : null}
      {phase === 'needs_wallet' ? (
        <p className="text-muted-foreground">Connect your wallet so Nest can read your position in each Blend pool.</p>
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
            <p className="text-destructive">
              {exit
                ? 'Nest found no matching position in a Blend pool.'
                : kind === 'borrow'
                  ? 'Neither Blend nor XOXNO can take this right now.'
                  : 'No Blend pool can take this right now.'}
            </p>
          )}
          {offer ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {offer.position ? (
                <>
                  <Fact
                    label={HELD_LABELS[offer.position.kind]}
                    value={`${offer.position.held.amount} ${offer.position.held.symbol}`}
                  />
                  <Fact
                    label="Request"
                    value={`${offer.position.requested.amount} ${offer.position.requested.symbol}`}
                  />
                  {offer.position.health !== null ? (
                    <Fact label="Health factor now" value={offer.position.health.toFixed(2)} />
                  ) : null}
                </>
              ) : null}
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
          {offer && kind === 'repay' ? (
            <p className="text-xs text-muted-foreground">
              {intent?.wholePosition
                ? 'The request is slightly above the debt to cover interest that accrues before it lands; Blend refunds the excess in the same transaction.'
                : 'Any amount above what you owe is refunded in the same transaction.'}
            </p>
          ) : null}
          {offer && !exit ? <WithdrawalTiming summary={offer.withdrawalTiming.summary} /> : null}
          {offer && (kind === 'borrow' || kind === 'withdraw_collateral') ? (
            <p className="text-xs text-muted-foreground">
              {offer.venue === 'xoxno'
                ? 'XOXNO liquidates a position whose health factor falls below 1. Rates are variable. A first XOXNO loan takes two signatures: the collateral, then the loan.'
                : 'Blend liquidates a position whose health factor falls below 1. Rates are variable.'}
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

      {collateralPlan && collateralPlan.id !== plan?.id ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-primary" /> Step 1 of 2 done: collateral deposited on{' '}
          {collateralPlan.offer.pool.name}.
          {collateralPlan.explorerUrl ? (
            <a
              href={collateralPlan.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              View transaction
            </a>
          ) : null}
        </p>
      ) : null}

      {plan?.prepared && (phase === 'review' || phase === 'signing') ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-subtle">
            {step === 'collateral' ? 'Step 1 of 2 · ' : step === 'borrow' && collateralPlan ? 'Step 2 of 2 · ' : ''}
            Exact transaction you will sign · {plan.offer.pool.name}
          </p>
          {step === 'collateral' ? (
            <p className="text-xs text-muted-foreground">
              XOXNO takes collateral and the loan in separate transactions. Once this deposit confirms, Nest builds the
              loan for you to review and sign.
            </p>
          ) : null}
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
          {exit ? null : <WithdrawalTiming summary={plan.offer.withdrawalTiming.summary} />}
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
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Submitted. Waiting for the network to confirm…
          </p>
          <Button variant="outline" size="sm" onClick={checkConfirmation} disabled={polling}>
            Check confirmation
          </Button>
        </div>
      ) : null}
      {phase === 'done' && plan ? (
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" />
          {step === 'collateral' ? 'Collateral deposited' : done} on {plan.offer.pool.name}. Confirmed in ledger{' '}
          {plan.ledger}.
        </p>
      ) : null}
      {plan && phase === 'stopped' ? (
        <p className="text-destructive">{planProblem(plan) ?? 'This action stopped.'}</p>
      ) : null}
      {plan && phase === 'stopped' && plan.errorCode === 'TRUSTLINE_MISSING' ? (
        <TrustlineStep
          use={plan.offer.venue === 'xoxno' ? 'xoxno' : 'lending'}
          onAdded={() => continueOn(plan.offer.pool.id)}
        />
      ) : null}
      {error ? (
        <p className="text-destructive">
          {error}
          {phase === 'stopped' && collateralPlan?.offer.venue === 'xoxno'
            ? ' Your collateral stays deposited on XOXNO; compare again to continue there.'
            : null}
        </p>
      ) : null}
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
        {((phase === 'compared' || phase === 'review') && expired) || phase === 'stopped' ? (
          <Button variant="outline" size="sm" onClick={() => compare()}>
            <RefreshCw /> Compare again
          </Button>
        ) : null}
        {(phase === 'needs_wallet' || (phase === 'compared' && offer && !expired)) && !wallet.address ? (
          <Button size="sm" onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet to review'}
          </Button>
        ) : null}
        {phase === 'compared' && offer && !expired && wallet.address ? (
          <Button size="sm" onClick={() => review()}>
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
  const supplyYield = offer.kind === 'supply' || offer.kind === 'withdraw' || offer.kind === 'withdraw_collateral';
  const apy = supplyYield ? offer.supplyApyPct : offer.borrowApyPct;
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
          {offer.position
            ? ` · ${HELD_LABELS[offer.position.kind].toLowerCase()} ${offer.position.held.amount} ${offer.position.held.symbol}`
            : best
              ? ' · best rate'
              : ''}
        </span>
      </span>
      <span className="text-right font-mono tabular-nums">
        {apy.toFixed(2)}%
        <span className="block font-sans text-xs text-subtle">{supplyYield ? 'supply APY' : 'borrow APY'}</span>
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
