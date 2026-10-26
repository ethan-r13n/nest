import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AssetIcon } from '../components/asset-icon.tsx';
import {
  AssetSelect,
  CreditNavigation,
  DecimalField,
  ReviewRequirements,
  WithdrawalTiming,
} from '../components/financial-draft.tsx';
import { LendingProposalCard } from '../components/lending-proposal.tsx';
import { LiveLendingRates } from '../components/live-lending.tsx';
import { EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { useWorkspaceSession } from '../components/workspace-session.tsx';
import { amountDraftIssue } from '../lib/draft-validation.ts';
import { execution } from '../lib/execution.ts';

const INTENT_FIELDS = [
  { id: 'collateral', label: 'Collateral', shortLabel: 'Collat.', number: '01' },
  { id: 'debt', label: 'Debt', shortLabel: 'Debt', number: '02' },
  { id: 'horizon', label: 'Horizon', shortLabel: 'Horizon', number: '03' },
  { id: 'rate', label: 'Maximum APR', shortLabel: 'Max APR', number: '04' },
  { id: 'venue', label: 'Venue', shortLabel: 'Venue', number: '05' },
];
const VENUES = ['Best available', 'Blend', 'Templar', 'XOXNO'];

export function CreditPage() {
  const { setDraft, setAssistantOpen } = useWorkspaceSession();
  const [activeField, setActiveField] = useState('debt');
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest) document.getElementById(`borrow-${activeField}`)?.focus();
  }, [activeField, focusRequest]);
  const [collateralAsset, setCollateralAsset] = useState('XLM');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [debtAsset, setDebtAsset] = useState('USDC');
  const [debtAmount, setDebtAmount] = useState('');
  const [horizonDays, setHorizonDays] = useState('');
  const [maxApr, setMaxApr] = useState('');
  const [venue, setVenue] = useState('Best available');
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState('');
  const values: Record<string, string> = {
    collateral: collateralAmount ? `${collateralAmount} ${collateralAsset}` : 'Choose asset and amount',
    debt: debtAmount ? `${debtAmount} ${debtAsset}` : 'Choose asset and amount',
    horizon: horizonDays ? `${horizonDays} days · comparison` : 'Optional',
    rate: maxApr ? `Up to ${maxApr}% APR` : 'Optional',
    venue,
  };
  const selected = INTENT_FIELDS.find((field) => field.id === activeField);
  const headings: Record<string, string> = {
    collateral: 'What will you put up?',
    debt: 'What would you like to borrow?',
    horizon: 'How long is your horizon?',
    rate: 'Set your maximum rate.',
    venue: 'Keep your options visible.',
  };
  const labels: Record<string, string> = {
    collateral: 'Use collateral',
    debt: 'Use debt amount',
    horizon: 'Use comparison horizon',
    rate: 'Use maximum APR',
    venue: 'Use venue preference',
  };

  function validate() {
    setChecked(true);
    const invalid = amountDraftIssue(collateralAmount, true)
      ? 'collateral'
      : amountDraftIssue(debtAmount, true)
        ? 'debt'
        : horizonDays && !/^[1-9]\d*$/.test(horizonDays)
          ? 'horizon'
          : amountDraftIssue(maxApr, false, true)
            ? 'rate'
            : null;
    if (invalid) {
      setActiveField(invalid);
      setFocusRequest((value) => value + 1);
      setStatus('Check the highlighted amount or duration.');
      return false;
    }
    return true;
  }

  function ask() {
    if (!validate()) return;
    setDraft(
      'Compare borrowing ' +
        debtAmount +
        ' ' +
        debtAsset +
        ' against ' +
        collateralAmount +
        ' ' +
        collateralAsset +
        (horizonDays ? ` for a comparison horizon of ${horizonDays} days` : '') +
        (maxApr ? `, with maximum borrow APR ${maxApr}%` : '') +
        '. Venue preference: ' +
        venue +
        '. Preserve these exact constraints and explain any unsupported terms before proposing an action.',
    );
    setAssistantOpen(true);
    setStatus('Your complete intent is in Ask Nest for review. It has not been sent.');
  }

  function reset() {
    setCollateralAmount('');
    setDebtAmount('');
    setHorizonDays('');
    setMaxApr('');
    setCollateralAsset('XLM');
    setDebtAsset('USDC');
    setVenue('Best available');
    setChecked(false);
    setStatus('');
    setActiveField('debt');
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Borrow on your terms."
        kicker="Credit / Amount-aware borrowing"
        description="Set the collateral, debt and constraints. Compare the same intent across integrated venues."
        actions={
          <Button variant="ghost" className="workspace-action" onClick={ask}>
            Ask Nest <ArrowUpRight />
          </Button>
        }
      />
      <CreditNavigation current="borrow" />
      <div className="credit-builder">
        <section className="workspace-panel credit-terms" aria-labelledby="credit-terms-title">
          <p className="mb-3 font-mono text-[11px] tracking-widest text-subtle uppercase">Build an intent</p>
          <h2 id="credit-terms-title">Your terms</h2>
          <fieldset>
            <legend className="sr-only">Borrowing terms</legend>
            {INTENT_FIELDS.map((field) => (
              <Button
                key={field.id}
                type="button"
                variant="ghost"
                className="credit-step"
                aria-pressed={activeField === field.id}
                aria-controls="credit-term-editor"
                onClick={() => {
                  setActiveField(field.id);
                  setStatus('');
                }}
              >
                <span className="flex items-center gap-3 text-sm font-normal">
                  <span className="font-mono text-[11px] text-subtle">{field.number}</span>
                  {field.id === 'rate' ? 'Max rate' : field.label}
                </span>
                <span className="credit-step-value flex items-center gap-2">
                  {values[field.id]} <ChevronRight className="size-3 shrink-0" />
                </span>
              </Button>
            ))}
          </fieldset>
          <div className="mt-6 flex gap-3">
            <Button className="workspace-action flex-1" onClick={ask}>
              Compare venues <ArrowRight />
            </Button>
            <Button variant="ghost" className="workspace-action" onClick={reset}>
              Reset
            </Button>
          </div>
          <p className="mt-4 font-mono text-[11px] leading-6 text-subtle">
            Compare before connecting a wallet.
            <br />
            No funds move until you review and sign a transaction.
          </p>
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {status}
          </p>
        </section>
        <section
          id="credit-term-editor"
          className="workspace-panel credit-editor"
          aria-labelledby="credit-editor-title"
        >
          <div className="flex-1">
            <p className="mb-3 font-mono text-[11px] tracking-widest text-subtle uppercase">
              {selected?.number} / {selected?.label}
            </p>
            <h2 id="credit-editor-title">{headings[activeField]}</h2>
            {activeField === 'collateral' || activeField === 'debt' ? (
              <>
                <div className="credit-asset-picker">
                  <AssetIcon symbol={activeField === 'debt' ? debtAsset : collateralAsset} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {activeField === 'debt' ? 'Borrow asset' : 'Collateral asset'}
                    </p>
                    <p className="mt-1 text-[11px] text-subtle">Stellar · verified asset identity required</p>
                  </div>
                  <div className="w-28 min-w-0 [&_label]:sr-only">
                    <AssetSelect
                      label={activeField === 'debt' ? 'Debt asset' : 'Collateral asset'}
                      value={activeField === 'debt' ? debtAsset : collateralAsset}
                      onChange={activeField === 'debt' ? setDebtAsset : setCollateralAsset}
                    />
                  </div>
                </div>
                <div className="credit-amount-editor">
                  <DecimalField
                    label={activeField === 'debt' ? 'Desired debt amount' : 'Collateral amount'}
                    inputId={activeField === 'debt' ? 'borrow-debt' : 'borrow-collateral'}
                    unit={activeField === 'debt' ? debtAsset : collateralAsset}
                    value={activeField === 'debt' ? debtAmount : collateralAmount}
                    onChange={activeField === 'debt' ? setDebtAmount : setCollateralAmount}
                    required={checked}
                  />
                </div>
                {activeField === 'debt' ? (
                  <div className="mt-4 rounded-xl border p-4">
                    <div role="img" aria-label="LTV unavailable" className="h-2 rounded-full border bg-secondary" />
                    <p className="mt-2 text-[11px] text-subtle">
                      LTV and maximum debt require verified prices and venue collateral terms.
                    </p>
                  </div>
                ) : null}
                <p className="credit-explainer">
                  {activeField === 'debt'
                    ? 'Borrow exactly the amount requested. Any unavailable pair, capacity or collateral requirement must remain visible before review.'
                    : 'Collateral value and borrowing capacity come from verified prices and venue terms. Review withdrawal timing before any deposit.'}
                </p>
              </>
            ) : null}
            {activeField === 'horizon' ? (
              <div className="space-y-5">
                <Label htmlFor="borrow-horizon">Comparison horizon · days</Label>
                <Input
                  id="borrow-horizon"
                  inputMode="numeric"
                  className="min-h-16 bg-background font-mono text-2xl"
                  value={horizonDays}
                  onChange={(event) => setHorizonDays(event.currentTarget.value)}
                  placeholder="Enter days"
                  aria-invalid={Boolean(horizonDays && !/^[1-9]\d*$/.test(horizonDays))}
                />
                <p className="credit-explainer">
                  A comparison horizon does not promise a fixed rate, maturity or guaranteed exit.
                </p>
              </div>
            ) : null}
            {activeField === 'rate' ? (
              <div className="credit-amount-editor">
                <DecimalField
                  label="Maximum borrow APR"
                  unit="% APR"
                  value={maxApr}
                  onChange={setMaxApr}
                  inputId="borrow-rate"
                  allowZero
                />
                <p className="credit-explainer">
                  Optional. A ceiling constrains your request; it never changes saved Guardrails. Presets require
                  current venue quotes.
                </p>
              </div>
            ) : null}
            {activeField === 'venue' ? (
              <div className="space-y-5">
                <Label htmlFor="borrow-venue">Compare venues</Label>
                <Select value={venue} onValueChange={(next) => next !== null && setVenue(next)}>
                  <SelectTrigger id="borrow-venue" className="min-h-11 w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENUES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="credit-explainer">
                  Best available means eligible integrated venues at the same inputs. The review must disclose
                  unsupported constraints, missing capacity and excluded markets.
                </p>
              </div>
            ) : null}
          </div>
          <Button
            className="workspace-action mt-6 w-full"
            onClick={() => {
              setChecked(true);
              const issue =
                activeField === 'collateral'
                  ? amountDraftIssue(collateralAmount, true)
                  : activeField === 'debt'
                    ? amountDraftIssue(debtAmount, true)
                    : activeField === 'rate'
                      ? amountDraftIssue(maxApr, false, true)
                      : activeField === 'horizon' && horizonDays && !/^[1-9]\d*$/.test(horizonDays)
                        ? 'Use a positive whole number of days.'
                        : null;
              setStatus(issue || 'Selection retained in your local intent. Compare venues when ready.');
            }}
          >
            {labels[activeField]}
          </Button>
        </section>
      </div>
      <section className="credit-comparison space-y-5" aria-label="Borrow comparison">
        <LiveLendingRates />
        <div className="workspace-panel p-6">
          <h2 className="mb-3 font-serif text-2xl font-semibold">One review, wherever you start.</h2>
          <p className="mb-4 text-xs leading-6 text-muted-foreground">
            The table shows current reference rates. Ask Nest carries your exact collateral, debt, horizon and rate
            constraints into a draft; the transaction card must obtain its own amount-specific quote. Templar and XOXNO
            execution are not connected yet.
          </p>
          <WithdrawalTiming />
          <div className="mt-4">
            <ReviewRequirements />
          </div>
        </div>
      </section>
    </div>
  );
}

export function SupplyPage() {
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [horizon, setHorizon] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function compare() {
    const issue = amountDraftIssue(amount, true);
    if (issue) {
      setError(issue);
      return;
    }
    if (asset !== 'USDC' && asset !== 'XLM') {
      setError('This asset is not supported by the connected lending adapter.');
      return;
    }
    setCreating(true);
    setError(null);
    setIntentId(null);
    try {
      const intent = await execution.createLending({ kind: 'supply', asset, amount: amount.trim() });
      setIntentId(intent.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Supply comparison is unavailable.');
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Put your assets to work."
        kicker="Credit / Direct supply"
        description="Compare direct lending at the same amount. Keep base yield, incentives and withdrawal conditions in view."
      />
      <CreditNavigation current="supply" />
      <div className="supply-workspace space-y-6">
        <section className="workspace-panel p-6" aria-labelledby="supply-intent-title">
          <p className="mb-3 font-mono text-[11px] tracking-widest text-subtle uppercase">Build an intent</p>
          <h2 id="supply-intent-title" className="mb-6 font-serif text-[28px] font-semibold">
            Supply intent
          </h2>
          <div className="grid items-start gap-6 sm:grid-cols-2">
            <AssetSelect
              label="Supply asset"
              disabled={Boolean(intentId) || creating}
              value={asset}
              onChange={(value) => {
                setAsset(value);
                setIntentId(null);
              }}
            />
            <DecimalField
              unit={asset}
              label="Supply amount"
              disabled={Boolean(intentId) || creating}
              value={amount}
              onChange={(value) => {
                setAmount(value);
                setIntentId(null);
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="supply-horizon">Comparison horizon · days</Label>
              <Input
                id="supply-horizon"
                className="min-h-11 bg-background font-mono"
                inputMode="numeric"
                value={horizon}
                placeholder="Optional"
                onChange={(event) => setHorizon(event.currentTarget.value)}
              />
              <p className="text-xs text-subtle">Research context only. The connected pool offers a variable rate.</p>
            </div>
            <WithdrawalTiming />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              className="workspace-action min-w-52"
              disabled={Boolean(intentId) || creating || !amount.trim()}
              onClick={() => void compare()}
            >
              {creating ? 'Comparing…' : 'Compare supply venues'} <ArrowRight />
            </Button>
            <p className="text-xs text-subtle">Comparison uses live Blend pools. Your wallet signs every deposit.</p>
          </div>
          {intentId ? (
            <Button
              variant="ghost"
              className="workspace-action mt-4"
              disabled={interactionLocked}
              onClick={() => setIntentId(null)}
            >
              Edit supply intent
            </Button>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
        <section className="workspace-panel p-6" aria-labelledby="supply-comparison-title">
          <h2 id="supply-comparison-title" className="mb-5 font-serif text-[28px] font-semibold">
            Supply comparison
          </h2>
          {intentId ? (
            <LendingProposalCard key={intentId} intentId={intentId} onInteractionLock={setInteractionLocked} />
          ) : (
            <LiveLendingRates />
          )}
          <p className="mt-4 text-xs leading-6 text-subtle">
            Templar and XOXNO are research coverage; their execution adapters are not connected. No rates or
            availability are inferred for them.
          </p>
        </section>
      </div>
    </div>
  );
}

export function PositionsPage() {
  const [amount, setAmount] = useState('');
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Keep the position in view."
        kicker="Credit · my positions"
        description="Monitor exposure, collateral and debt, then use each venue's supported repayment and exit actions."
      />
      <CreditNavigation current="positions" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {['Confirmed collateral', 'Outstanding debt', 'Net credit value', 'Supplied liquidity'].map((label) => (
          <StatCard key={label} label={label} value="—" detail="No verified position loaded" />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Open positions</CardTitle>
              <CardDescription>Confirmed positions are separate from pending settlement.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="Position access is not connected"
                description="No balances, debt or collateral have been loaded. An empty screen is not a claim that your wallet has no positions."
              >
                <div className="flex flex-wrap justify-center gap-3">
                  <Link to="/credit" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
                    Explore borrowing
                  </Link>
                  <Link
                    to="/credit/supply"
                    className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                  >
                    Explore supply
                  </Link>
                </div>
              </EmptyState>
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0 w-full">
          <CardHeader>
            <CardTitle className="text-2xl">Manage position</CardTitle>
            <CardDescription>Choose a verified position first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs defaultValue="add">
              <TabsList className="h-auto w-full justify-start overflow-x-auto whitespace-nowrap">
                <TabsTrigger className="min-h-11" value="add">
                  Add collateral
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="repay">
                  Repay
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="withdraw">
                  Withdraw
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="close">
                  Close
                </TabsTrigger>
              </TabsList>
              <TabsContent value="add" className="space-y-4">
                <DecimalField label="Collateral amount" value={amount} onChange={setAmount} disabled />
                <WithdrawalTiming />
              </TabsContent>
              <TabsContent value="repay">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Exact principal, accrual, debt rounding and fees are needed before a repayment amount can be reviewed.
                </p>
              </TabsContent>
              <TabsContent value="withdraw">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Withdrawable collateral depends on current debt, liquidity and the venue's native safety constraints.
                </p>
              </TabsContent>
              <TabsContent value="close">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Full close may require repayment followed by separately reviewed collateral release and settlement
                  steps.
                </p>
              </TabsContent>
            </Tabs>
            <Button disabled className="min-h-11 w-full">
              Review position action
            </Button>
            <ReviewRequirements />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
