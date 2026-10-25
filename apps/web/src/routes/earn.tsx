import { parseResearchSnapshot, type YieldPoolRow } from '@nest/data/research';
import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Checkbox } from '@nest/ui/components/checkbox';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ExternalLink, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };
import {
  DecimalField,
  ReviewRequirements,
  UnavailableFacts,
  WithdrawalTiming,
} from '../components/financial-draft.tsx';
import { DraftNotice, EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { formatUsd, formatUtc } from '../lib/format.ts';

const research = parseResearchSnapshot(snapshotJson);
const CATEGORIES = ['All opportunities', 'Direct supply', 'Vaults', 'Campaigns'];
const PROJECT_NAMES: Record<string, string> = {
  'blend-pools-v2': 'Blend',
  'xoxno-lending': 'XOXNO',
  'gami-labs': 'Gami Labs',
  'ondo-yield-assets': 'Ondo',
};
const PROVIDER_REFERENCES = [
  { name: 'DeFindex', description: 'Vaults and strategy allocations', url: 'https://defindex.io/' },
  { name: 'Upshift / Gami', description: 'Curated Stellar vaults', url: 'https://app.upshift.finance/' },
  {
    name: 'Sentora',
    description: 'Evergreen vaults and separate campaigns',
    url: 'https://app.upshift.finance/vaults/stellar/sentora-usdc',
  },
];

export function EarnPage() {
  const [category, setCategory] = useState('All opportunities');
  const [query, setQuery] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [project, setProject] = useState('all');
  const [sort, setSort] = useState('tvl');
  const [withoutRewards, setWithoutRewards] = useState(false);
  const projects = [...new Set(research.yieldPools.map((pool) => pool.project))].sort();
  const rows = research.yieldPools.filter(matchesFilters).sort(compareRows);

  function matchesFilters(pool: YieldPoolRow) {
    return (
      (category === 'All opportunities' || poolCategory(pool) === category) &&
      (project === 'all' || pool.project === project) &&
      `${pool.symbol} ${pool.meta ?? ''} ${projectName(pool.project)}`.toLowerCase().includes(query.toLowerCase()) &&
      pool.symbol.toLowerCase().includes(assetQuery.toLowerCase()) &&
      (!withoutRewards || pool.rewardApyPct === 0)
    );
  }

  function compareRows(left: YieldPoolRow, right: YieldPoolRow) {
    if (sort === 'name') return left.symbol.localeCompare(right.symbol);
    if (sort === 'apy') return (right.totalApyPct ?? -1) - (left.totalApyPct ?? -1);
    return (right.tvlUsd ?? -1) - (left.tvlUsd ?? -1);
  }

  function resetFilters() {
    setCategory('All opportunities');
    setQuery('');
    setAssetQuery('');
    setProject('all');
    setSort('tvl');
    setWithoutRewards(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="A home for idle capital."
        kicker="Vaults & yield"
        description="Explore supply and vault observations, then inspect fees, incentives and withdrawal conditions before choosing a product."
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Mainnet snapshot · dated, not live</Badge>
        <a
          href={research.sources.defillama.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground hover:underline"
        >
          DefiLlama · captured {formatUtc(research.sources.defillama.capturedAt)}
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        These are Mainnet observations. The connected network does not change their scope or make them Testnet data.
      </p>
      <fieldset className="flex flex-wrap gap-1 border-b pb-3">
        <legend className="sr-only">Opportunity category</legend>
        {CATEGORIES.map((item) => (
          <Button
            key={item}
            variant={category === item ? 'secondary' : 'ghost'}
            className="min-h-11"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </Button>
        ))}
      </fieldset>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="size-4" />
              Filters
            </CardTitle>
            <Button variant="ghost" className="min-h-11" onClick={resetFilters}>
              Reset
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="vault-asset-filter">Asset</Label>
              <Input
                id="vault-asset-filter"
                className="min-h-11"
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.currentTarget.value)}
                placeholder="Filter by symbol"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vault-project-filter">Project</Label>
              <Select value={project} onValueChange={(next) => next !== null && setProject(next)}>
                <SelectTrigger id="vault-project-filter" className="min-h-11 w-full">
                  <SelectValue>{project === 'all' ? 'All projects' : projectName(project)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="min-h-11" value="all">
                    All projects
                  </SelectItem>
                  {projects.map((item) => (
                    <SelectItem className="min-h-11" key={item} value={item}>
                      {projectName(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="vault-no-rewards" checked={withoutRewards} onCheckedChange={setWithoutRewards} />
              <Label htmlFor="vault-no-rewards" className="min-h-11 leading-relaxed">
                Only observations reporting zero reward APY
              </Label>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Exit terms and eligibility are unverified in this snapshot. A research row is not an available deposit
              route.
            </p>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {rows.length} of {research.yieldPools.length} dated observations
            </p>
            <div className="flex items-center gap-2">
              <Label htmlFor="vault-sort" className="text-xs">
                Sort
              </Label>
              <Select value={sort} onValueChange={(next) => next !== null && setSort(next)}>
                <SelectTrigger id="vault-sort" className="min-h-11 w-44">
                  <SelectValue>
                    {sort === 'tvl' ? 'Reported TVL' : sort === 'apy' ? 'Reported APY' : 'Asset name'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="min-h-11" value="tvl">
                    Reported TVL
                  </SelectItem>
                  <SelectItem className="min-h-11" value="apy">
                    Reported APY
                  </SelectItem>
                  <SelectItem className="min-h-11" value="name">
                    Asset name
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search assets or projects"
              aria-label="Search yield observations"
              className="min-h-11 pl-10"
            />
          </div>
          {rows.length ? (
            rows.map((pool) => <OpportunityRow key={pool.id} pool={pool} />)
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  title="No observations match"
                  description={
                    category === 'Campaigns'
                      ? 'Campaign lots and reward terms are not represented in this source snapshot. No current campaign availability is implied.'
                      : 'Try another asset, project or incentive filter. Missing data does not mean a venue has no liquidity.'
                  }
                >
                  <Button variant="outline" className="min-h-11" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </EmptyState>
              </CardContent>
            </Card>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reported APY is not a promised or necessarily net return. Base and reward components stay separate;
            overlapping protocol and vault TVL must not be added into a new total.
          </p>
        </div>
      </div>

      <section className="space-y-4" aria-labelledby="vault-provider-references">
        <div>
          <h2 id="vault-provider-references" className="text-2xl font-semibold">
            More vault providers
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reference links for products outside this dated pool coverage. Current terms and executable access are not
            connected.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PROVIDER_REFERENCES.map((provider) => (
            <Card key={provider.name} size="sm">
              <CardHeader>
                <CardTitle className="text-lg">{provider.name}</CardTitle>
                <CardDescription>{provider.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"
                >
                  Provider site
                  <ExternalLink className="size-3" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export function VaultDetailPage({ vaultId }: { vaultId: string }) {
  const [amount, setAmount] = useState('');
  const pool = research.yieldPools.find((item) => item.id === vaultId);
  if (!pool) return <MissingOpportunity />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link
        to="/vaults"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All yield opportunities
      </Link>
      <PageHeader
        title={pool.symbol}
        kicker={projectName(pool.project)}
        description="An observed yield opportunity. Current product identity, eligibility and execution terms still require verification."
        actions={<Badge variant="outline">Mainnet snapshot · research only</Badge>}
      />
      <p className="text-xs text-muted-foreground">
        Mainnet observation · {formatUtc(pool.observedAt)}. This dated record is independent of the connected network.
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Reported TVL" value={formatUsd(pool.tvlUsd)} />
            <StatCard label="Base APY" value={formatApy(pool.baseApyPct)} />
            <StatCard label="Reward APY" value={formatApy(pool.rewardApyPct)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Product overview</CardTitle>
              <CardDescription>
                {pool.meta ?? 'Additional product methodology is not included in this observation.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Project</dt>
                  <dd className="mt-1">{projectName(pool.project)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Observation type</dt>
                  <dd className="mt-1">{poolCategory(pool)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reported total APY</dt>
                  <dd className="mt-1 font-mono">{formatApy(pool.totalApyPct)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Observed</dt>
                  <dd className="mt-1 text-xs">{formatUtc(pool.observedAt)}</dd>
                </div>
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Total APY is the provider's reported percentage, not a guaranteed net return. Exact fees, receipt/share
                mechanics, underlying allocations and capacity are unavailable here.
              </p>
              <details className="rounded-lg border p-3 text-xs">
                <summary className="min-h-6 cursor-pointer text-muted-foreground">Source identifier</summary>
                <p className="mt-2 break-all font-mono text-subtle">{pool.id}</p>
                <p className="mt-2 text-muted-foreground">
                  This source identifier is not a verified contract or asset address.
                </p>
              </details>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Performance history</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="No product history in this snapshot"
                description="One APY observation cannot establish historical returns or share-price performance. No synthetic curve is substituted."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Understand the product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UnavailableFacts
                labels={[
                  'Curator and underlying exposure',
                  'Entry and ongoing fees',
                  'Verified contract version',
                  'Share or campaign-lot model',
                  'Current deposit capacity',
                ]}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Share vaults and campaign deposits have different accounting. Do not infer receipt shares, reward
                entitlement or redemption steps from the asset symbol.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0 self-start lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="text-2xl">Your next action</CardTitle>
            <CardDescription>Prepare a draft, then verify current terms.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs defaultValue="deposit">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger className="min-h-11" value="deposit">
                  Deposit
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="withdraw">
                  Withdraw
                </TabsTrigger>
              </TabsList>
              <TabsContent value="deposit" className="space-y-4">
                <DecimalField unit={pool.symbol} label="Amount" value={amount} onChange={setAmount} />
                <WithdrawalTiming />
                <Button disabled className="min-h-11 w-full" aria-describedby="vault-deposit-unavailable">
                  Review deposit
                </Button>
                <p id="vault-deposit-unavailable" className="text-xs leading-relaxed text-muted-foreground">
                  Verified product details, live deposit preview and wallet approval are not available in this build.
                </p>
              </TabsContent>
              <TabsContent value="withdraw" className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Owned positions and current withdrawal capacity must be loaded before redemption can be prepared.
                </p>
                <Link
                  to="/vaults/$vaultId/manage"
                  params={{ vaultId: pool.id }}
                  className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"
                >
                  Position management
                  <ArrowRight className="size-4" />
                </Link>
              </TabsContent>
            </Tabs>
            <DraftNotice />
            <ReviewRequirements />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function VaultManagePage({ vaultId }: { vaultId: string }) {
  const pool = research.yieldPools.find((item) => item.id === vaultId);
  if (!pool) return <MissingOpportunity />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link
        to="/vaults/$vaultId"
        params={{ vaultId: pool.id }}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {pool.symbol}
      </Link>
      <PageHeader
        title="Redemptions & deposit lots"
        kicker={projectName(pool.project)}
        description="Keep requested withdrawals, settled assets and campaign rewards separate. Only confirmed position data can establish what you own."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Owned position" value="—" detail="Wallet position access not connected" />
        <StatCard label="Pending redemption" value="—" detail="No settlement record loaded" />
        <StatCard label="Claimable rewards" value="—" detail="Entitlement not verified" />
      </div>
      <Card>
        <CardContent className="pt-2">
          <Tabs defaultValue="redemptions">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger className="min-h-11" value="redemptions">
                Redemptions
              </TabsTrigger>
              <TabsTrigger className="min-h-11" value="lots">
                Campaign lots
              </TabsTrigger>
              <TabsTrigger className="min-h-11" value="claims">
                Reward claims
              </TabsTrigger>
            </TabsList>
            <TabsContent value="redemptions">
              <EmptyState
                title="No owned redemption loaded"
                description="A product may require request, queue, settlement and claim steps. Pending receivables must not be counted twice with receipt shares."
              />
            </TabsContent>
            <TabsContent value="lots">
              <EmptyState
                title="Deposit lots unavailable"
                description="Campaign deposits need their own lot identity, principal and reward-forfeiture terms. No shares or lots are inferred from this research row."
              />
            </TabsContent>
            <TabsContent value="claims">
              <EmptyState
                title="No verified claim entitlement"
                description="A reward is not claimable until current entitlement and the required proof or settlement state are verified."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Withdrawal conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <WithdrawalTiming />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review an exit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UnavailableFacts
              labels={['Amount available', 'Fees and forfeited rewards', 'Earliest settlement', 'Required steps']}
            />
            <Button disabled className="min-h-11 w-full">
              Review withdrawal or claim
            </Button>
            <ReviewRequirements />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OpportunityRow({ pool }: { pool: YieldPoolRow }) {
  return (
    <Card className="py-0">
      <CardContent className="grid gap-5 py-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto]">
        <div className="min-w-0 space-y-1">
          <Link
            to="/vaults/$vaultId"
            params={{ vaultId: pool.id }}
            className="inline-flex min-h-11 items-center font-medium hover:text-primary"
          >
            {pool.symbol}
          </Link>
          <p className="text-xs text-muted-foreground">
            {projectName(pool.project)} · {poolCategory(pool)}
          </p>
          {pool.meta ? <p className="text-xs text-subtle">{pool.meta}</p> : null}
        </div>
        <OpportunityMetric
          label="Reported APY"
          value={formatApy(pool.totalApyPct)}
          detail={`Base ${formatApy(pool.baseApyPct)} · rewards ${formatApy(pool.rewardApyPct)}`}
        />
        <OpportunityMetric label="Reported TVL" value={formatUsd(pool.tvlUsd)} detail="Mainnet observation" />
        <OpportunityMetric label="Withdrawal" value="Unverified" detail="Current terms unavailable" />
        <div className="flex items-center">
          <Link
            to="/vaults/$vaultId"
            params={{ vaultId: pool.id }}
            className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"
          >
            Inspect
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function OpportunityMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col justify-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums">{value}</span>
      <span className="text-xs leading-relaxed text-subtle">{detail}</span>
    </div>
  );
}

function MissingOpportunity() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunity not found"
        description="This identifier is not present in the dated research snapshot. No product is substituted."
      />
      <Card>
        <CardContent>
          <EmptyState
            title="No matching observation"
            description="Return to the list to inspect an available source record."
          >
            <Link to="/vaults" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
              Explore yield observations
            </Link>
          </EmptyState>
        </CardContent>
      </Card>
    </div>
  );
}

function poolCategory(pool: YieldPoolRow) {
  if (pool.project === 'blend-pools-v2' || pool.project === 'xoxno-lending') return 'Direct supply';
  if (pool.project === 'gami-labs') return 'Vaults';
  return 'Other yield';
}

function projectName(project: string) {
  return PROJECT_NAMES[project] ?? project;
}

function formatApy(value: number | null) {
  return value === null ? 'Unavailable' : `${value.toFixed(2)}%`;
}
