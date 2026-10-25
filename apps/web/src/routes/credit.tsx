import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  AssetSelect,
  CreditNavigation,
  DecimalField,
  ReviewRequirements,
  UnavailableFacts,
  VenueAvailability,
  WithdrawalTiming,
} from '../components/financial-draft.tsx';
import { DraftNotice, EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';

import { amountDraftIssue } from '../lib/draft-validation.ts';

const INTENT_FIELDS = [
  { id: 'collateral', label: 'Collateral', shortLabel: 'Collat.', number: '01' },
  { id: 'debt', label: 'Debt', shortLabel: 'Debt', number: '02' },
  { id: 'horizon', label: 'Horizon', shortLabel: 'Horizon', number: '03' },
  { id: 'rate', label: 'Maximum APR', shortLabel: 'Max APR', number: '04' },
  { id: 'venue', label: 'Venue', shortLabel: 'Venue', number: '05' },
];
const VENUES = ['Best available', 'Blend', 'Templar', 'XOXNO'];

export function CreditPage() {
  const [activeField, setActiveField] = useState('collateral');
  const [draftChecked, setDraftChecked] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [draftStatus, setDraftStatus] = useState('');
  useEffect(() => {
    if (focusRequest) document.getElementById(`borrow-${activeField}`)?.focus();
  }, [focusRequest, activeField]);
  const [collateralAsset, setCollateralAsset] = useState('XLM');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [debtAsset, setDebtAsset] = useState('USDC');
  const [debtAmount, setDebtAmount] = useState('');
  const [horizonDays, setHorizonDays] = useState('');
  const [maxApr, setMaxApr] = useState('');
  const [venue, setVenue] = useState('Best available');
  useEffect(() => {
    setDraftStatus('');
  }, [collateralAmount, debtAmount, horizonDays, maxApr, venue]);
  const values: Record<string, string> = {
    collateral: collateralAmount ? `${collateralAmount} ${collateralAsset}` : 'Choose asset and amount',
    debt: debtAmount ? `${debtAmount} ${debtAsset}` : 'Choose asset and amount',
    horizon: horizonDays ? `${horizonDays} days` : 'Optional',
    rate: maxApr ? `${maxApr}%` : 'Optional',
    venue,
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Credit, on your terms."
        kicker="Borrow"
        description="Start with what you want to borrow. Compare the same collateral, debt and horizon across supported venues."
      />
      <CreditNavigation current="borrow" />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="text-2xl">Your borrowing intent</CardTitle>
            <CardDescription>All five terms stay in view.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[8rem_minmax(0,1fr)]">
              <fieldset className="grid grid-cols-5 border-b bg-muted/40 sm:block sm:border-r sm:border-b-0">
                <legend className="sr-only">Borrowing terms</legend>
                {INTENT_FIELDS.map((field) => (
                  <Button
                    variant="ghost"
                    key={field.id}
                    type="button"
                    aria-pressed={activeField === field.id}
                    onClick={() => setActiveField(field.id)}
                    className={`flex h-auto min-h-20 w-full min-w-0 flex-col items-start justify-center gap-1 rounded-none border-b p-2 text-left sm:min-h-24 sm:p-3 whitespace-normal transition-colors ${activeField === field.id ? 'bg-accent' : 'hover:bg-muted'}`}
                  >
                    <span className="font-mono text-xs text-subtle">{field.number}</span>
                    <span className="max-w-full break-words text-xs font-medium sm:text-sm">
                      <span className="sm:hidden">{field.shortLabel}</span>
                      <span className="hidden sm:inline">{field.label}</span>
                    </span>
                    <span className="hidden max-w-full break-words text-xs text-muted-foreground sm:block">
                      {values[field.id]}
                    </span>
                  </Button>
                ))}
              </fieldset>
              <div className="min-w-0 space-y-5 p-4">
                {activeField === 'collateral' ? (
                  <>
                    <h2 className="text-xl font-semibold">Put up collateral</h2>
                    <AssetSelect label="Collateral asset" value={collateralAsset} onChange={setCollateralAsset} />
                    <DecimalField
                      label="Collateral amount"
                      unit={collateralAsset}
                      inputId="borrow-collateral"
                      required={draftChecked}
                      value={collateralAmount}
                      onChange={setCollateralAmount}
                    />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Collateral value and borrowing capacity need verified prices and venue terms.
                    </p>
                  </>
                ) : null}
                {activeField === 'debt' ? (
                  <>
                    <h2 className="text-xl font-semibold">Choose your debt</h2>
                    <AssetSelect label="Debt asset" value={debtAsset} onChange={setDebtAsset} />
                    <DecimalField
                      label="Debt amount"
                      unit={debtAsset}
                      inputId="borrow-debt"
                      required={draftChecked}
                      value={debtAmount}
                      onChange={setDebtAmount}
                    />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Your requested amount will not be silently reduced to fit a venue.
                    </p>
                  </>
                ) : null}
                {activeField === 'horizon' ? (
                  <>
                    <h2 className="text-xl font-semibold">Set your horizon</h2>
                    <div className="space-y-2">
                      <Label htmlFor="borrow-horizon">Expected duration · days</Label>
                      <Input
                        aria-invalid={horizonDays !== '' && !/^[1-9]\d*$/.test(horizonDays)}
                        aria-describedby="borrow-horizon-help"
                        id="borrow-horizon"
                        className="min-h-11 font-mono"
                        inputMode="numeric"
                        placeholder="Days"
                        value={horizonDays}
                        onChange={(event) => setHorizonDays(event.currentTarget.value)}
                      />
                    </div>
                    <p id="borrow-horizon-help" className="text-xs leading-relaxed text-muted-foreground">
                      Optional. Use a positive whole number of days. A horizon helps compare estimated costs; variable
                      rates can change.
                    </p>
                  </>
                ) : null}
                {activeField === 'rate' ? (
                  <>
                    <h2 className="text-xl font-semibold">Limit financing cost</h2>
                    <DecimalField
                      label="Maximum borrow APR"
                      unit="%"
                      inputId="borrow-rate"
                      allowZero
                      value={maxApr}
                      onChange={setMaxApr}
                      placeholder="Optional APR"
                      hint="Incentive yield is separate from the cost of borrowing."
                    />
                  </>
                ) : null}
                {activeField === 'venue' ? (
                  <>
                    <h2 className="text-xl font-semibold">Choose a venue preference</h2>
                    <div className="space-y-2">
                      <Label htmlFor="borrow-venue">Venue</Label>
                      <Select value={venue} onValueChange={(next) => next !== null && setVenue(next)}>
                        <SelectTrigger id="borrow-venue" className="min-h-11 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VENUES.map((item) => (
                            <SelectItem className="min-h-11" key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      A preference is not evidence of asset support, current liquidity or eligibility.
                    </p>
                  </>
                ) : null}
              </div>
            </div>
            <div className="space-y-4 border-t p-4">
              <DraftNotice />
              <Button
                variant="outline"
                className="min-h-11 w-full"
                onClick={() => {
                  setDraftChecked(true);
                  const invalidField = amountDraftIssue(collateralAmount, true)
                    ? 'collateral'
                    : amountDraftIssue(debtAmount, true)
                      ? 'debt'
                      : horizonDays && !/^[1-9]\d*$/.test(horizonDays)
                        ? 'horizon'
                        : amountDraftIssue(maxApr, false, true)
                          ? 'rate'
                          : null;
                  if (invalidField) {
                    setActiveField(invalidField);
                    setFocusRequest((value) => value + 1);
                    setDraftStatus('Check the highlighted amount or duration.');
                  } else
                    setDraftStatus(
                      'Draft format checked. Asset eligibility, liquidity and loan terms still require current venue data.',
                    );
                }}
              >
                Check draft
              </Button>
              <p role="status" className="text-xs text-muted-foreground">
                {draftStatus}
              </p>
              <Button disabled className="min-h-11 w-full" aria-describedby="borrow-compare-status">
                Compare venues
                <ArrowRight />
              </Button>
              <p id="borrow-compare-status" className="text-xs leading-relaxed text-muted-foreground">
                Live credit comparison is not available in this build. These inputs remain an unsaved draft.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">Compare at the same size</h2>
            <Badge variant="outline">Current terms unavailable</Badge>
          </div>
          <VenueAvailability />
          <Card>
            <CardContent>
              <EmptyState
                title="No amount-specific quotes yet"
                description="Borrowing rates, fees, capacity and the resulting native risk must be verified for your exact request. Dated research yields are not live loan offers."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="size-4" />
                Before you borrow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Review collateral and debt changes, native liquidation constraints, all fee maxima and the settlement
                path. A venue's health measure is not interchangeable with another venue's.
              </p>
              <WithdrawalTiming />
              <ReviewRequirements />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function SupplyPage() {
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [horizon, setHorizon] = useState('');
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Put idle assets to work."
        kicker="Direct supply"
        description="Compare direct lending at your amount, keeping base yield, incentives and exit conditions separate."
      />
      <CreditNavigation current="supply" />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle className="text-2xl">Supply draft</CardTitle>
            <CardDescription>No funds move from this form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <AssetSelect label="Supply asset" value={asset} onChange={setAsset} />
            <DecimalField unit={asset} label="Supply amount" value={amount} onChange={setAmount} />
            <div className="space-y-2">
              <Label htmlFor="supply-horizon">Expected horizon · days</Label>
              <Input
                id="supply-horizon"
                className="min-h-11 font-mono"
                inputMode="numeric"
                value={horizon}
                placeholder="Optional"
                onChange={(event) => setHorizon(event.currentTarget.value)}
              />
            </div>
            <WithdrawalTiming />
            <Button disabled className="min-h-11 w-full" aria-describedby="supply-status">
              Compare supply venues
            </Button>
            <p id="supply-status" className="text-xs leading-relaxed text-muted-foreground">
              Current rates, capacity and exit terms are not connected yet. No deposit can be reviewed.
            </p>
            <DraftNotice />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-5">
          <h2 className="text-2xl font-semibold">Direct lending venues</h2>
          <VenueAvailability />
          <Card>
            <CardContent>
              <EmptyState
                title="Supply comparison unavailable"
                description="A meaningful comparison needs current base yield, rewards, fees and withdrawable liquidity at the same amount and horizon."
              >
                <Link to="/research" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
                  Explore dated research
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </EmptyState>
            </CardContent>
          </Card>
          <ReviewRequirements />
        </div>
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
        {['Confirmed collateral', 'Outstanding debt', 'Net credit value', 'Pending workflows'].map((label) => (
          <StatCard key={label} label={label} value="—" detail="No verified position loaded" />
        ))}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Native position health</CardTitle>
            </CardHeader>
            <CardContent>
              <UnavailableFacts
                labels={[
                  'Risk metric',
                  'Liquidation boundary',
                  'Collateral valuation',
                  'Accrued debt',
                  'Observation time',
                ]}
              />
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                No common health factor is inferred. Each position keeps its venue's metric, ownership and withdrawal
                constraints.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle className="text-2xl">Manage position</CardTitle>
            <CardDescription>Choose a verified position first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs defaultValue="add">
              <TabsList className="h-auto flex-wrap">
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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Position activity</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No loaded receipts or workflows"
            description="A funding confirmation is not proof that borrowing completed. Actual receipts and pending settlement will appear separately when connected."
          />
        </CardContent>
      </Card>
    </div>
  );
}
