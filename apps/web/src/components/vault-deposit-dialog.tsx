import { Button } from '@nest/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@nest/ui/components/dialog';
import { cn } from '@nest/ui/lib/utils';
import { AlertTriangle, Check, CircleCheck, ExternalLink, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { decimalToRaw, rawToDecimal, useSpendable } from '../lib/balance.ts';
import {
  ExecutionRequestError,
  execution,
  isPending,
  planProblem,
  signAndSubmit,
  type VaultPlan,
  type VaultSummary,
} from '../lib/execution.ts';
import { shortAddress, useWallet } from '../lib/wallet.tsx';
import { useCountdown } from './swap-proposal.tsx';

type Step = 'amount' | 'checking' | 'review' | 'signing' | 'confirming' | 'done';

const STEPS = ['Amount', 'Review', 'Sign', 'Done'] as const;
const STEP_INDEX: Record<Step, number> = { amount: 0, checking: 1, review: 1, signing: 2, confirming: 2, done: 3 };
const AMOUNT_PATTERN = /^(0|[1-9][0-9]*)([.][0-9]{1,7})?$/;
const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const AMOUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * Deposit into one DeFindex vault in four steps. Nothing is created until the user asks to review;
 * then Nest checks the vault's code, builds the deposit and shows exactly what the wallet will sign.
 */
export function VaultDepositDialog({
  vault,
  network,
  open,
  onOpenChange,
}: {
  vault: VaultSummary;
  network: 'mainnet' | 'testnet';
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const wallet = useWallet();
  const amountId = useId();
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<VaultPlan | null>(null);
  const [checking, setChecking] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const spendable = useSpendable(network, wallet.address, vault.asset);
  const secondsLeft = useCountdown(step === 'review' ? plan?.prepared?.validUntil : undefined);
  const watching = useRef(true);
  const symbol = vault.symbol ?? '';

  useEffect(() => {
    watching.current = open;
    if (!open) {
      setStep('amount');
      setPlan(null);
      setProblem(null);
    }
  }, [open]);

  const value = AMOUNT_PATTERN.test(amount) ? Number(amount) : 0;
  const yearly = vault.apyPct === null ? null : (value * vault.apyPct) / 100;
  const total = Number(vault.totalRaw);
  const investedShare = total > 0 ? Number(vault.investedRaw) / total : 0;
  const overBalance =
    spendable.data !== undefined && spendable.data !== null && AMOUNT_PATTERN.test(amount)
      ? decimalToRaw(amount) > spendable.data
      : false;
  const expired = secondsLeft !== null && secondsLeft <= 0;

  async function review(event?: FormEvent) {
    event?.preventDefault();
    if (!wallet.address) {
      await wallet.connect();
      return;
    }
    setProblem(null);
    setStep('checking');
    try {
      setChecking('Checking the vault’s code on chain');
      const intent = await execution.createVaultDeposit({ vaultId: vault.address, amount });
      const compared = await execution.compareVault(intent.id);
      const offer = compared.quotes[0];
      if (!offer)
        throw new Error(`Nest won’t deposit here: ${compared.excluded.map((entry) => entry.reason).join(' ')}`);
      setChecking('Building and checking the deposit');
      const created = await execution.plan<VaultPlan>({
        intentId: intent.id,
        quoteId: offer.id,
        accountId: wallet.address,
      });
      const prepared = created.status === 'policy_checked' ? await execution.prepare<VaultPlan>(created.id) : created;
      if (prepared.status !== 'awaiting_review') throw new Error(planProblem(prepared) ?? 'Nest stopped this deposit.');
      setPlan(prepared);
      setStep('review');
    } catch (caught) {
      setProblem(messageOf(caught));
      setStep('amount');
    }
  }

  async function sign() {
    if (!plan?.prepared) return;
    setProblem(null);
    setStep('signing');
    try {
      const settled = await signAndSubmit(plan, {
        sign: wallet.sign,
        onSigned: () => setStep('confirming'),
        onUpdate: setPlan,
        stillWatching: () => watching.current,
      });
      setPlan(settled);
      if (settled.status === 'confirmed') setStep('done');
      else if (isPending(settled)) setStep('confirming');
      else {
        setProblem(planProblem(settled) ?? 'The deposit did not go through.');
        setStep('amount');
      }
    } catch (caught) {
      setProblem(messageOf(caught));
      setStep('review');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <header className="space-y-4 border-b px-6 pt-6 pb-5">
          <div className="pr-8">
            <DialogTitle>{vault.name}</DialogTitle>
            <DialogDescription>
              Deposit {symbol} on {network === 'mainnet' ? 'Mainnet' : 'Testnet'} through DeFindex. Withdraw any time.
            </DialogDescription>
          </div>
          <Stepper current={STEP_INDEX[step]} />
        </header>

        {step === 'amount' || step === 'checking' ? (
          <form onSubmit={review} className="flex flex-col">
            <div className="space-y-5 px-6 py-6">
              <div>
                <label htmlFor={amountId} className="text-sm text-muted-foreground">
                  How much {symbol} to deposit
                </label>
                <div className="mt-2 flex items-baseline gap-3 border-b border-foreground/20 pb-2 focus-within:border-primary">
                  <input
                    id={amountId}
                    value={amount}
                    onChange={(event) => setAmount(event.currentTarget.value.replace(',', '.'))}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    disabled={step === 'checking'}
                    aria-invalid={amount !== '' && !AMOUNT_PATTERN.test(amount)}
                    className="min-w-0 flex-1 bg-transparent font-serif text-5xl leading-tight font-semibold tabular-nums outline-none placeholder:text-foreground/25"
                  />
                  <span className="font-serif text-2xl text-muted-foreground">{symbol}</span>
                </div>
                <div className="mt-2 flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm">
                  <span className={cn('text-muted-foreground', overBalance && 'text-destructive')}>
                    {balanceLine(spendable.data, spendable.isFetching, Boolean(wallet.address), symbol, overBalance)}
                  </span>
                  {spendable.data ? (
                    <button
                      type="button"
                      onClick={() => setAmount(rawToDecimal(spendable.data ?? 0n))}
                      className="rounded-md px-2 py-1 text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Use max
                    </button>
                  ) : null}
                </div>
              </div>

              <p className="text-base">
                {yearly === null
                  ? 'This vault has not reported a yield yet.'
                  : value > 0
                    ? `${investedShare > 0 ? 'Earns' : 'Once invested, earns'} about ${AMOUNT.format(yearly)} ${symbol} a year at the vault’s ${PERCENT.format(vault.apyPct ?? 0)}% 30-day rate.`
                    : `The vault’s 30-day rate is ${PERCENT.format(vault.apyPct ?? 0)}% a year, after its fee.`}
                <span className="text-muted-foreground"> Rates change.</span>
              </p>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span>{Math.round(investedShare * 100)}% of the vault is invested</span>
                  <span className="text-muted-foreground tabular-nums">
                    {AMOUNT.format(total / 1e7)} {symbol} held
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${investedShare * 100}%` }} />
                </div>
                {investedShare === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing is invested yet, so a deposit waits idle until the vault’s manager rebalances.
                  </p>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-sm">
                <Term
                  label="Invests through"
                  value={vault.strategies.map((strategy) => strategy.name).join(', ') || 'No strategy listed'}
                />
                <Term label="Fee on gains" value={`${PERCENT.format(vault.vaultFeeBps / 100)}%`} />
                <Term label="Withdrawals" value="Any time, no lockup" />
                <Term label="Nest fee" value="None" />
              </dl>

              {problem ? <Notice tone="error">{problem}</Notice> : null}
            </div>

            <footer className="flex items-center justify-end gap-3 border-t px-6 py-4">
              {step === 'checking' ? (
                <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> {checking}…
                </span>
              ) : null}
              {wallet.address ? (
                <Button type="submit" disabled={step === 'checking' || value <= 0 || overBalance}>
                  Review deposit
                </Button>
              ) : (
                <Button type="submit" disabled={wallet.connecting}>
                  <Wallet /> {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
                </Button>
              )}
            </footer>
          </form>
        ) : null}

        {plan?.prepared && (step === 'review' || step === 'signing' || step === 'confirming') ? (
          <div className="flex flex-col">
            <div className="space-y-5 px-6 py-6">
              <p className="text-muted-foreground">
                Nest built this deposit and checked it matches. This is what you sign.
              </p>
              <dl className="divide-y rounded-xl border">
                <Row
                  label="You deposit"
                  value={`${plan.prepared.deposit.amount} ${plan.prepared.deposit.symbol}`}
                  strong
                />
                <Row
                  label="Vault takes at least"
                  value={`${plan.prepared.minimum.amount} ${plan.prepared.minimum.symbol}`}
                />
                <Row label="Shares go to" value={shortAddress(plan.account)} />
                <Row label="Invested on arrival" value={plan.prepared.invest ? 'Yes' : 'No, held idle'} />
                <Row label="Network fee" value={`${plan.prepared.fee.amount} XLM`} />
              </dl>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary" /> The vault runs DeFindex’s published code,
                checked on chain just now.
              </p>
              {plan.policy.reasons
                .filter((reason) => !reason.pass && reason.severity === 'warn')
                .map((reason) => (
                  <Notice key={reason.code} tone="warn">
                    {reason.detail}
                  </Notice>
                ))}
              {step !== 'review' ? <Progress step={step} /> : null}
              {problem ? <Notice tone="error">{problem}</Notice> : null}
            </div>
            <footer className="flex items-center justify-end gap-3 border-t px-6 py-4">
              {step === 'review' && secondsLeft !== null ? (
                <span className="mr-auto text-sm text-muted-foreground tabular-nums">
                  {expired ? 'This build expired.' : `Valid for ${secondsLeft}s`}
                </span>
              ) : null}
              {step === 'review' ? (
                <>
                  <Button variant="ghost" onClick={() => setStep('amount')}>
                    Change amount
                  </Button>
                  {expired ? (
                    <Button onClick={() => review()}>Build again</Button>
                  ) : (
                    <Button onClick={sign}>
                      <Wallet /> Sign and deposit
                    </Button>
                  )}
                </>
              ) : (
                <Button disabled>
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  {step === 'signing' ? 'Waiting for your wallet…' : 'Confirming…'}
                </Button>
              )}
            </footer>
          </div>
        ) : null}

        {step === 'done' && plan ? (
          <div className="flex flex-col">
            <div className="space-y-4 px-6 py-8 text-center">
              <CircleCheck className="mx-auto size-10 text-primary" />
              <p className="font-serif text-2xl font-semibold">
                {plan.prepared?.deposit.amount ?? amount} {symbol} deposited
              </p>
              <p className="text-muted-foreground">
                Confirmed in ledger {plan.ledger}. Your vault shares are in {shortAddress(plan.account)}.
              </p>
              {plan.explorerUrl ? (
                <a
                  href={plan.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View the transaction <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
            <footer className="flex justify-end border-t px-6 py-4">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </footer>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Deposit steps">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-2" aria-current={index === current ? 'step' : undefined}>
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border tabular-nums',
              index < current && 'border-primary bg-primary text-primary-foreground',
              index === current && 'border-primary text-primary',
              index > current && 'text-muted-foreground',
            )}
          >
            {index < current ? <Check className="size-3" /> : index + 1}
          </span>
          <span className={index === current ? 'text-foreground' : 'hidden text-muted-foreground sm:inline'}>
            {label}
          </span>
          {index < STEPS.length - 1 ? <span className="h-px w-4 bg-border sm:w-8" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Progress({ step }: { step: Step }) {
  const stages = [
    { label: 'Signed in your wallet', done: step === 'confirming' },
    { label: 'Submitted to the network', done: step === 'confirming' },
    { label: 'Confirmed', done: false },
  ];
  return (
    <ol className="space-y-2 text-sm" role="status">
      {stages.map((stage, index) => {
        const active = !stage.done && (index === 0 ? step === 'signing' : stages[index - 1]?.done);
        return (
          <li key={stage.label} className="flex items-center gap-2">
            {stage.done ? (
              <Check className="size-4 text-primary" />
            ) : active ? (
              <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" />
            ) : (
              <span className="size-4 rounded-full border" />
            )}
            <span className={stage.done || active ? 'text-foreground' : 'text-muted-foreground'}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-mono tabular-nums', strong && 'text-base text-foreground')}>{value}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
        tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-foreground/5 text-muted-foreground',
      )}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

function balanceLine(
  spendable: bigint | null | undefined,
  loading: boolean,
  connected: boolean,
  symbol: string,
  over: boolean,
): string {
  if (!connected) return 'Connect a wallet to see your balance.';
  if (loading && spendable === undefined) return 'Reading your balance…';
  if (spendable === undefined) return '';
  if (spendable === null) return `This wallet holds no ${symbol}.`;
  if (over) return `More than the ${rawToDecimal(spendable)} ${symbol} you can spend.`;
  return `${rawToDecimal(spendable)} ${symbol} available${symbol === 'XLM' ? ' after the reserve and fees' : ''}.`;
}

function messageOf(caught: unknown): string {
  return caught instanceof ExecutionRequestError || caught instanceof Error ? caught.message : 'Something went wrong.';
}
