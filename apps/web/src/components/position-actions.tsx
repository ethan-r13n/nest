import { Button } from '@nest/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@nest/ui/components/dialog';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LoaderCircle, Wallet } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import {
  execution,
  isPending,
  planProblem,
  signAndSubmit,
  type VaultPosition,
  type VaultWithdrawPlan,
} from '../lib/execution.ts';
import { useHealth } from '../lib/health.ts';
import { assertPositionScope, type LendingExit, positionAmountIssue } from '../lib/position-management.ts';
import { useWallet } from '../lib/wallet.tsx';
import { LendingProposalCard } from './lending-proposal.tsx';
import { useCountdown } from './swap-proposal.tsx';
import { TrustlineStep } from './trustline-step.tsx';

export function LendingPositionAction({ position }: { position: LendingExit }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const wallet = useWallet();
  const health = useHealth();
  const queries = useQueryClient();
  const id = useId();
  const verb = position.kind === 'repay' ? 'Repay' : 'Withdraw';
  const issue = amount ? positionAmountIssue(amount, position.held, 7) : null;

  async function review() {
    setProblem(null);
    try {
      assertPositionScope(position, { network: health.data?.network, owner: wallet.address });
      const invalid = positionAmountIssue(amount, position.held, 7);
      if (invalid) throw new Error(invalid);
      setBusy(true);
      const intent = await execution.createLending({
        kind: position.kind,
        asset: position.symbol,
        amount: amount.trim().toLowerCase(),
        poolId: position.poolId,
        ...(position.lendingAccountId ? { lendingAccountId: position.lendingAccountId } : {}),
      });
      if (intent.network !== position.network)
        throw new Error('The action returned a different network. Compare again.');
      setIntentId(intent.id);
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) {
          setIntentId(null);
          setAmount('');
          setProblem(null);
          void queries.invalidateQueries();
        }
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {verb}
      </Button>
      <DialogContent className="nest-workspace max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogTitle>
          {verb} {position.symbol}
        </DialogTitle>
        <DialogDescription>
          {position.poolName} · {position.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
        </DialogDescription>
        {intentId ? (
          <LendingProposalCard key={intentId} intentId={intentId} onInteractionLock={setBusy} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {position.kind === 'repay' ? 'Debt' : position.kind === 'withdraw_collateral' ? 'Collateral' : 'Supplied'}
              : {position.held} {position.symbol}
              {position.health !== null ? ` · health ${position.health.toFixed(2)}` : ''}
            </p>
            <div className="space-y-2">
              <Label htmlFor={id}>Amount ({position.symbol})</Label>
              <div className="flex gap-2">
                <Input
                  id={id}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.currentTarget.value)}
                  aria-invalid={Boolean(issue)}
                  placeholder="Enter an amount"
                />
                <Button variant="outline" onClick={() => setAmount('all')}>
                  Use all
                </Button>
              </div>
              {issue ? <p className="text-sm text-destructive">{issue}</p> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {position.kind === 'repay'
                ? 'All re-reads accrued debt before preparing. Review the maximum spend and any excess refund.'
                : 'Withdrawal depends on current liquidity and collateral requirements. The review checks the position again.'}
            </p>
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
            <Button onClick={review} disabled={!amount || Boolean(issue) || busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : null} Review {verb.toLowerCase()}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function VaultPositionAction({
  position,
  network,
  owner,
}: {
  position: VaultPosition;
  network: 'mainnet' | 'testnet';
  owner: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<VaultWithdrawPlan | null>(null);
  const [phase, setPhase] = useState<'amount' | 'checking' | 'review' | 'signing' | 'pending' | 'done' | 'stopped'>(
    'amount',
  );
  const [problem, setProblem] = useState<string | null>(null);
  const wallet = useWallet();
  const health = useHealth();
  const queries = useQueryClient();
  const current = useRef({ owner: wallet.address, network: health.data?.network });
  current.current = { owner: wallet.address, network: health.data?.network };
  const id = useId();
  const issue = amount ? positionAmountIssue(amount, position.shares.amount, position.shares.decimals) : null;
  const busy = phase === 'checking' || phase === 'signing';
  const secondsLeft = useCountdown(phase === 'review' ? plan?.prepared?.validUntil : undefined);
  const expired = secondsLeft !== null && secondsLeft <= 0;

  async function review() {
    setProblem(null);
    try {
      assertPositionScope({ owner, network }, current.current);
      const invalid = positionAmountIssue(amount, position.shares.amount, position.shares.decimals);
      if (invalid) throw new Error(invalid);
      setPhase('checking');
      const intent = await execution.createVaultWithdraw({
        vaultId: position.vault.id,
        amount: amount.trim().toLowerCase(),
      });
      if (intent.network !== network) throw new Error('The withdrawal returned a different network.');
      const compared = await execution.compareVaultWithdraw(intent.id, owner);
      const offer = compared.quotes.find((quote) => quote.id === compared.selectedQuoteId);
      if (!offer)
        throw new Error(
          compared.excluded.map((entry) => entry.reason).join(' ') || 'This vault cannot withdraw right now.',
        );
      const created = await execution.plan<VaultWithdrawPlan>({
        intentId: intent.id,
        quoteId: offer.id,
        accountId: owner,
      });
      const prepared =
        created.status === 'policy_checked' ? await execution.prepare<VaultWithdrawPlan>(created.id) : created;
      setPlan(prepared);
      setPhase(prepared.status === 'awaiting_review' ? 'review' : 'stopped');
      if (prepared.status !== 'awaiting_review')
        setProblem(planProblem(prepared) ?? 'This withdrawal could not be prepared.');
    } catch (caught) {
      setProblem(messageOf(caught));
      setPhase('amount');
    }
  }

  async function sign() {
    if (!plan?.prepared) return;
    setProblem(null);
    try {
      assertPositionScope({ owner, network }, current.current);
      assertPositionScope({ owner: plan.account, network: plan.network }, current.current);
      setPhase('signing');
      const settled = await signAndSubmit(plan, {
        sign: wallet.sign,
        onSigned: () => setPhase('pending'),
        onUpdate: setPlan,
        stillWatching: () => current.current.owner === owner && current.current.network === network,
      });
      setPlan(settled);
      setPhase(settled.status === 'confirmed' ? 'done' : isPending(settled) ? 'pending' : 'stopped');
      if (settled.status === 'confirmed') void queries.invalidateQueries();
      else if (!isPending(settled)) setProblem(planProblem(settled) ?? 'The withdrawal stopped.');
    } catch (caught) {
      setProblem(messageOf(caught));
      setPhase('review');
    }
  }

  async function refresh() {
    if (!plan) return;
    try {
      const latest = await execution.read<VaultWithdrawPlan>(plan.id);
      setPlan(latest);
      if (latest.status === 'confirmed') {
        setPhase('done');
        void queries.invalidateQueries();
      } else if (!isPending(latest)) {
        setPhase('stopped');
        setProblem(planProblem(latest) ?? 'The withdrawal stopped.');
      }
    } catch (caught) {
      setProblem(messageOf(caught));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next && phase === 'done') {
          setAmount('');
          setPlan(null);
          setPhase('amount');
        }
      }}
    >
      <Button variant="outline" size="sm" disabled={!position.verified} onClick={() => setOpen(true)}>
        Withdraw
      </Button>
      <DialogContent className="nest-workspace max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogTitle>Withdraw vault shares</DialogTitle>
        <DialogDescription>
          {position.vault.name} · {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
        </DialogDescription>
        {phase === 'amount' || phase === 'checking' ? (
          <div className="space-y-4">
            <p className="text-sm">You hold {position.shares.amount} shares.</p>
            <Label htmlFor={id}>Shares to withdraw</Label>
            <div className="flex gap-2">
              <Input
                id={id}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                disabled={busy}
                aria-invalid={Boolean(issue)}
                placeholder="Enter shares"
              />
              <Button variant="outline" disabled={busy} onClick={() => setAmount('all')}>
                Use all
              </Button>
            </div>
            {issue ? <p className="text-sm text-destructive">{issue}</p> : null}
            <Button onClick={review} disabled={!amount || Boolean(issue) || busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : null} Review withdrawal
            </Button>
          </div>
        ) : null}
        {plan?.prepared && (phase === 'review' || phase === 'signing') ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-3 text-sm">
              <dt>Shares burned</dt>
              <dd className="text-right font-mono">{plan.prepared.shares.amount}</dd>
              <dt>Expected receipt</dt>
              <dd className="text-right font-mono">
                {plan.prepared.expected.amount} {plan.prepared.expected.symbol}
              </dd>
              <dt>Minimum receipt</dt>
              <dd className="text-right font-mono">
                {plan.prepared.minimum.amount} {plan.prepared.minimum.symbol}
              </dd>
              <dt>Network fee</dt>
              <dd className="text-right font-mono">{plan.prepared.fee.amount} XLM</dd>
              <dt>Fee maximum</dt>
              <dd className="text-right font-mono">{plan.maxFee.amount} XLM</dd>
            </dl>
            {plan.policy.reasons
              .filter((reason) => !reason.pass)
              .map((reason) => (
                <p key={reason.code} className="text-xs text-muted-foreground">
                  {reason.detail}
                </p>
              ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setPhase('amount')}>
                Change shares
              </Button>
              {expired ? (
                <Button onClick={review}>Build again</Button>
              ) : (
                <Button onClick={sign} disabled={busy}>
                  <Wallet /> {busy ? 'Waiting for wallet…' : 'Sign in wallet'}
                </Button>
              )}
            </div>
            {phase === 'review' && secondsLeft !== null ? (
              <p className="text-xs text-muted-foreground">
                {expired ? 'This review expired. Build again with current amounts.' : `Valid for ${secondsLeft}s`}
              </p>
            ) : null}
          </div>
        ) : null}
        {phase === 'pending' ? (
          <p role="status" className="text-sm">
            Withdrawal submitted; confirmation is pending. Keep the original transaction hash.
          </p>
        ) : null}
        {phase === 'pending' ? (
          <Button variant="outline" onClick={refresh}>
            Check confirmation
          </Button>
        ) : null}
        {phase === 'done' ? (
          <p role="status" className="text-sm">
            Withdrawal confirmed in ledger {plan?.ledger}. The receipt is in your wallet.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{position.withdrawalTiming.summary}</p>
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        {plan?.explorerUrl ? (
          <a
            href={plan.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary"
          >
            View transaction <ExternalLink className="size-3" />
          </a>
        ) : null}
        {phase === 'stopped' ? (
          <Button variant="outline" onClick={() => setPhase('amount')}>
            Compare again
          </Button>
        ) : null}
        {phase === 'stopped' && plan?.errorCode === 'TRUSTLINE_MISSING' ? (
          <TrustlineStep use="lending" onAdded={review} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'The position could not be reviewed.';
}
