import { parseResearchSnapshot, type YieldPoolRow } from '@nest/data/research';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Checkbox } from '@nest/ui/components/checkbox';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };
import {
  DecimalField,
  ReviewRequirements,
  UnavailableFacts,
  WithdrawalTiming,
} from '../components/financial-draft.tsx';
import { ProtocolLogo } from '../components/protocol-logo.tsx';
import { VaultDepositButton } from '../components/vault-deposit-button.tsx';
import { strategyFor, VaultStrategyAside, VaultStrategyMain } from '../components/vault-strategy.tsx';
import { EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { useWorkspaceSession } from '../components/workspace-session.tsx';
import type { VaultSummary } from '../lib/execution.ts';
import { formatUsd, formatUtc } from '../lib/format.ts';
import { useLiquidityPools } from '../lib/liquidity.ts';
import { useVaults } from '../lib/vaults.ts';

const research = parseResearchSnapshot(snapshotJson);
const CATEGORIES = ['All opportunities', 'Direct supply', 'Vaults', 'Campaigns', 'Liquidity'];
const PROJECT_NAMES: Record<string, string> = {
  'blend-pools-v2': 'Blend',
  'xoxno-lending': 'XOXNO',
  'gami-labs': 'Gami Labs',
  aquarius: 'Aquarius',
  defindex: 'DeFindex',
  'ondo-yield-assets': 'Ondo',
};

type EarnOpportunity = {
  id: string;
  kind: 'yield' | 'liquidity' | 'vault';
  vault?: VaultSummary;
  network?: 'mainnet' | 'testnet' | undefined;
  symbol: string;
  project: string;
  category: string;
  meta: string | null;
  rateKind: 'APY' | 'APR';
  totalRatePct: number | null;
  baseRatePct: number | null;
  rewardRatePct: number | null;
  tvlUsd: number | null;
  searchText: string;
  poolType: string | null;
  feeBps: number | null;
};

export function EarnPage({ initialCategory = 'All opportunities' }: { initialCategory?: string }) {
  const { setDraft, setAssistantOpen } = useWorkspaceSession();
  const liquidity = useLiquidityPools();
  const vaults = useVaults();
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [exitFilter, setExitFilter] = useState('all');
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [project, setProject] = useState('all');
  const [sort, setSort] = useState('tvl');
  const [withoutRewards, setWithoutRewards] = useState(false);
  const [poolType, setPoolType] = useState('all');
  const [fee, setFee] = useState('all');
  const [page, setPage] = useState(0);
  const opportunities: EarnOpportunity[] = [
    ...(vaults.data?.vaults ?? []).map(
      (vault): EarnOpportunity => ({
        id: vault.address,
        kind: 'vault',
        vault,
        network: vaults.data?.network,
        symbol: vault.symbol ?? 'Other',
        project: 'defindex',
        category: 'Vaults',
        meta: vault.name,
        rateKind: 'APY',
        totalRatePct: vault.apyPct,
        baseRatePct: null,
        rewardRatePct: null,
        tvlUsd: null,
        searchText: `${vault.name} ${vault.symbol ?? ''} DeFindex ${vault.address}`,
        poolType: null,
        feeBps: null,
      }),
    ),
    ...research.yieldPools.map(
      (pool): EarnOpportunity => ({
        id: pool.id,
        kind: 'yield',
        symbol: pool.symbol,
        project: pool.project,
        category: poolCategory(pool),
        meta: pool.meta,
        rateKind: 'APY',
        totalRatePct: pool.totalApyPct,
        baseRatePct: pool.baseApyPct,
        rewardRatePct: pool.rewardApyPct,
        tvlUsd: pool.tvlUsd,
        searchText: `${pool.symbol} ${pool.meta ?? ''} ${projectName(pool.project)}`,
        poolType: null,
        feeBps: null,
      }),
    ),
    ...(liquidity.data?.pools ?? []).map(
      (pool): EarnOpportunity => ({
        id: pool.id,
        kind: 'liquidity',
        symbol: pool.tokens.map((token) => token.symbol).join(' / '),
        project: 'aquarius',
        category: 'Liquidity',
        meta: `${pool.type === 'stable' ? 'Stable' : 'Volatile'} · ${pool.feeBps / 100}% swap fee`,
        rateKind: 'APR',
        totalRatePct: pool.totalAprPct,
        baseRatePct: pool.feeAprPct,
        rewardRatePct:
          pool.aquaAprPct === null || pool.incentiveAprPct === null ? null : pool.aquaAprPct + pool.incentiveAprPct,
        tvlUsd: pool.tvlUsd,
        searchText: `${pool.tokens.map((token) => `${token.symbol} ${token.identity} ${token.contractId}`).join(' ')} Aquarius`,
        poolType: pool.type,
        feeBps: pool.feeBps,
      }),
    ),
  ];
  const projects = [...new Set(opportunities.map((row) => row.project))].sort();
  const fees = [...new Set(opportunities.flatMap((row) => (row.feeBps === null ? [] : [row.feeBps])))].sort(
    (a, b) => a - b,
  );
  const rows = opportunities
    .filter(
      (row) =>
        (category === 'All opportunities' || row.category === category) &&
        (selectedAssets.length === 0 ||
          selectedAssets.some((asset) => row.searchText.toLowerCase().includes(asset.toLowerCase()))) &&
        (exitFilter === 'all' || (exitFilter === 'supported' ? row.kind === 'vault' : row.kind !== 'vault')) &&
        (project === 'all' || row.project === project) &&
        row.searchText.toLowerCase().includes(query.toLowerCase()) &&
        row.searchText.toLowerCase().includes(assetQuery.toLowerCase()) &&
        (!withoutRewards || row.rewardRatePct === 0) &&
        (poolType === 'all' || row.poolType === poolType) &&
        (fee === 'all' || row.feeBps === Number(fee)),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.symbol.localeCompare(b.symbol)
        : sort === 'apy'
          ? (b.totalRatePct ?? -1) - (a.totalRatePct ?? -1)
          : (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1),
    );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const visibleRows = rows.slice(currentPage * 25, currentPage * 25 + 25);

  function chooseCategory(value: string) {
    setCategory(value);
    setPage(0);
    setPoolType('all');
    setFee('all');
  }
  function resetFilters() {
    setCategory('All opportunities');
    setSelectedAssets([]);
    setExitFilter('all');
    setQuery('');
    setAssetQuery('');
    setProject('all');
    setSort('tvl');
    setWithoutRewards(false);
    setPoolType('all');
    setFee('all');
    setPage(0);
  }

  return (
    <div className="earn-workspace flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Put Your Capital In Context."
        kicker="Earn / Stellar opportunities"
        description="Compare lending, vaults, campaigns and liquidity on Stellar."
        actions={
          <Button
            variant="outline"
            className="workspace-action"
            onClick={() => {
              setDraft('Compare earn opportunities at my size, with fees, risks and withdrawal timing.');
              setAssistantOpen(true);
            }}
          >
            Ask Nest ↗
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>Research snapshots and live vaults retain their source and network.</span>
        <a href={research.sources.defillama.url} target="_blank" rel="noreferrer" className="hover:underline">
          DefiLlama · {formatUtc(research.sources.defillama.capturedAt)}
        </a>
        {liquidity.data && (
          <a href={liquidity.data.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
            Aquarius top 15 · {liquidity.data.network} · retrieved {formatUtc(liquidity.data.retrievedAt)}
          </a>
        )}
      </div>
      <fieldset className="earn-categories flex flex-wrap gap-2">
        <legend className="sr-only">Opportunity category</legend>
        {CATEGORIES.map((item) => (
          <Button
            key={item}
            variant={category === item ? 'secondary' : 'ghost'}
            className="min-h-11"
            aria-pressed={category === item}
            onClick={() => chooseCategory(item)}
          >
            {item}
          </Button>
        ))}
      </fieldset>
      <div className="earn-list-layout">
        <Card className="min-w-0 self-start">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="size-4" />
              Filters
            </CardTitle>
            <Button variant="ghost" className="min-h-11" onClick={resetFilters}>
              Reset
            </Button>
          </CardHeader>
          <CardContent className="earn-filter-content space-y-5">
            <div className="space-y-2">
              <Label htmlFor="earn-search">Search opportunities</Label>
              <Input
                id="earn-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setPage(0);
                }}
                placeholder="Name or curator…"
              />
            </div>
            <fieldset className="earn-asset-filters">
              <legend>Underlying asset</legend>
              {['USDC', 'XLM', 'AQUA', 'EURC', 'USDT0', 'PYUSD', 'SolvBTC', 'EUTBL'].map((asset) => (
                <label key={asset} htmlFor={`earn-filter-${asset}`}>
                  <Checkbox
                    id={`earn-filter-${asset}`}
                    checked={selectedAssets.includes(asset)}
                    onCheckedChange={(checked) => {
                      setSelectedAssets(
                        checked ? [...selectedAssets, asset] : selectedAssets.filter((value) => value !== asset),
                      );
                      setPage(0);
                    }}
                  />
                  <span>{asset}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-2 text-sm">
              Protocol
              <select
                className="min-h-11 rounded-lg border bg-background px-3"
                value={project}
                onChange={(event) => {
                  setProject(event.currentTarget.value);
                  setPage(0);
                }}
              >
                <option value="all">All protocols</option>
                {projects.map((item) => (
                  <option key={item} value={item}>
                    {projectName(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Exit availability
              <select
                className="min-h-11 rounded-lg border bg-background px-3"
                value={exitFilter}
                onChange={(event) => {
                  setExitFilter(event.currentTarget.value);
                  setPage(0);
                }}
              >
                <option value="all">Any exit condition</option>
                <option value="supported">Connected vaults</option>
                <option value="unknown">Research only</option>
              </select>
            </label>
            <details className="border-t pt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground">More filters</summary>
              <div className="mt-3 space-y-3">
                <Input
                  id="earn-asset-filter"
                  aria-label="Asset identity filter"
                  value={assetQuery}
                  onChange={(event) => {
                    setAssetQuery(event.currentTarget.value);
                    setPage(0);
                  }}
                  placeholder="Symbol, issuer or contract"
                />
                <label htmlFor="earn-without-rewards" className="flex items-start gap-2 text-xs">
                  <Checkbox
                    id="earn-without-rewards"
                    checked={withoutRewards}
                    onCheckedChange={(checked) => {
                      setWithoutRewards(checked);
                      setPage(0);
                    }}
                  />
                  Only observations reporting zero incentives
                </label>
              </div>
            </details>
            {category === 'Liquidity' && (
              <>
                <label className="flex flex-col gap-2 text-sm">
                  Pool type
                  <select
                    className="min-h-11 rounded-lg border bg-background px-3"
                    value={poolType}
                    onChange={(event) => {
                      setPoolType(event.currentTarget.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All types</option>
                    <option value="stable">Stable</option>
                    <option value="volatile">Volatile</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Fee tier
                  <select
                    className="min-h-11 rounded-lg border bg-background px-3"
                    value={fee}
                    onChange={(event) => {
                      setFee(event.currentTarget.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All fees</option>
                    {fees.map((value) => (
                      <option key={value} value={String(value)}>
                        {value / 100}%
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          <div className="earn-list-toolbar">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {rows.length} opportunities
            </p>
            <label className="flex items-center gap-2 text-xs">
              Sort
              <select
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                value={sort}
                onChange={(event) => {
                  setSort(event.currentTarget.value);
                  setPage(0);
                }}
              >
                <option value="tvl">Reported TVL</option>
                <option value="apy">Reported annualized rate</option>
                <option value="name">Asset name</option>
              </select>
            </label>
          </div>
          {vaults.isPending ? (
            <p role="status" className="text-xs text-muted-foreground">
              Reading DeFindex vaults…
            </p>
          ) : null}
          {vaults.isError ? (
            <p role="status" className="text-xs text-destructive">
              Live vaults are unavailable.{' '}
              <Button variant="ghost" onClick={() => void vaults.refetch()}>
                Retry vaults
              </Button>
            </p>
          ) : null}
          {liquidity.isPending && (
            <p role="status" className="text-xs text-muted-foreground">
              Loading Aquarius liquidity opportunities…
            </p>
          )}
          {liquidity.isError && (
            <div role="status" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              Aquarius refresh unavailable. Showing the captured data when available.
              <Button variant="outline" className="min-h-11" onClick={() => void liquidity.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {visibleRows.map((row) => (
            <OpportunityRow key={`${row.kind}-${row.id}`} row={row} />
          ))}
          {!rows.length && !liquidity.isPending && (
            <Card>
              <CardContent>
                <EmptyState
                  title="No observations match"
                  description={
                    category === 'Campaigns'
                      ? 'No campaign observations are included in this source coverage.'
                      : 'Try another asset, project or incentive filter.'
                  }
                >
                  <Button variant="outline" className="min-h-11" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </EmptyState>
              </CardContent>
            </Card>
          )}
          {rows.length > 25 && (
            <div className="flex items-center justify-end gap-4 text-sm">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span>
                {currentPage * 25 + 1}–{Math.min(rows.length, currentPage * 25 + 25)} of {rows.length}
              </span>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={(currentPage + 1) * 25 >= rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            APY and APR retain their source definitions. Aquarius APR excludes account-specific boosts; its measurement
            window is not supplied. Indexed data does not verify an executable pool or current exit availability.
          </p>
        </div>
      </div>
    </div>
  );
}

export function VaultDetailPage({ vaultId }: { vaultId: string }) {
  return /^C[A-Z2-7]{55}$/.test(vaultId) ? (
    <LiveVaultDetailPage vaultId={vaultId} />
  ) : (
    <ResearchVaultDetailPage vaultId={vaultId} />
  );
}

function ResearchVaultDetailPage({ vaultId }: { vaultId: string }) {
  const [amount, setAmount] = useState('');
  const pool = research.yieldPools.find((item) => item.id === vaultId);
  if (!pool) return <MissingOpportunity />;
  const strategy = strategyFor(pool.project, pool.symbol);
  const depositAsset = strategy?.facts.find((fact) => fact.label === 'Deposit asset')?.value ?? pool.symbol;
  const metrics = [
    { label: 'Reported TVL', value: pool.tvlUsd, display: formatUsd(pool.tvlUsd) },
    { label: 'Base APY', value: pool.baseApyPct, display: formatApy(pool.baseApyPct) },
    { label: 'Reward APY', value: pool.rewardApyPct, display: formatApy(pool.rewardApyPct) },
  ].filter((metric) => metric.value !== null);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link
        to="/earn"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Earn
      </Link>
      <PageHeader title={pool.symbol} kicker={projectName(pool.project)} description={strategy?.description ?? ''} />
      <p className="text-xs text-muted-foreground">Mainnet observation · {formatUtc(pool.observedAt)}</p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-5">
          {metrics.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              {metrics.map((metric) => (
                <StatCard key={metric.label} label={metric.label} value={metric.display} />
              ))}
            </div>
          )}
          <VaultStrategyMain strategy={strategy} />
        </div>
        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Manage position</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs defaultValue="deposit">
                <TabsList className="h-auto">
                  <TabsTrigger className="min-h-11" value="deposit">
                    Deposit
                  </TabsTrigger>
                  <TabsTrigger className="min-h-11" value="withdraw">
                    Withdraw
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="deposit" className="space-y-4">
                  <DecimalField unit={depositAsset} label="Amount" value={amount} onChange={setAmount} />
                  {strategy?.withdrawal ? (
                    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-xs leading-relaxed">
                      <p className="mb-2 font-medium">Withdrawal timing</p>
                      <p className="text-muted-foreground">{strategy.withdrawal}</p>
                    </div>
                  ) : (
                    <WithdrawalTiming />
                  )}
                  <Button disabled className="min-h-11 w-full">
                    Review deposit
                  </Button>
                </TabsContent>
                <TabsContent value="withdraw" className="space-y-4">
                  {strategy?.withdrawal && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{strategy.withdrawal}</p>
                  )}
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
              <p className="text-xs text-muted-foreground">Transactions are not connected in this preview.</p>
            </CardContent>
          </Card>
          <VaultStrategyAside strategy={strategy} />
        </aside>
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

function OpportunityRow({ row }: { row: EarnOpportunity }) {
  const displayName =
    row.kind === 'vault'
      ? row.vault?.name
      : row.project === 'gami-labs'
        ? `Gami ${row.symbol.replace('EARN', '')} Vault`
        : row.project === 'blend-pools-v2'
          ? `Blend ${row.symbol} Supply`
          : row.symbol;
  return (
    <Card className="earn-opportunity">
      <CardContent>
        <div className="earn-opportunity-identity">
          <ProtocolLogo name={projectName(row.project)} />
          <div>
            {row.kind === 'liquidity' ? (
              <Link to="/earn/liquidity/$poolId" params={{ poolId: row.id }}>
                {displayName}
              </Link>
            ) : (
              <Link to="/earn/$vaultId" params={{ vaultId: row.id }}>
                {displayName}
              </Link>
            )}
            <small>
              {projectName(row.project)}
              {row.network ? ` · ${row.network === 'testnet' ? 'Testnet' : 'Mainnet'} · live` : ' · Mainnet snapshot'}
            </small>
            <small>
              {row.category}
              {row.kind === 'liquidity' && row.meta ? ` · ${row.meta}` : ''}
            </small>
          </div>
        </div>
        <OpportunityMetric
          label={`${row.kind === 'vault' ? 'Live' : 'Reported'} ${row.rateKind}`}
          value={formatApy(row.totalRatePct)}
          detail={
            row.kind === 'vault'
              ? '30-day APY · net of vault fee'
              : [
                  row.baseRatePct === null
                    ? ''
                    : `${row.kind === 'liquidity' ? 'Fees' : 'Base'} ${formatApy(row.baseRatePct)}`,
                  row.rewardRatePct === null ? '' : `Rewards ${formatApy(row.rewardRatePct)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
        />
        <OpportunityMetric
          label={row.kind === 'vault' ? 'Vault assets' : 'Reported TVL'}
          value={
            row.vault
              ? `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(row.vault.totalRaw) / 1e7)} ${row.symbol}`
              : formatUsd(row.tvlUsd)
          }
          detail={
            row.kind === 'vault'
              ? 'DeFindex · live'
              : row.kind === 'liquidity'
                ? 'Aquarius indexed observation'
                : 'DefiLlama snapshot'
          }
        />
        <OpportunityMetric
          label="Withdrawal"
          value={row.kind === 'vault' ? 'Review required' : 'Unverified'}
          detail={row.kind === 'vault' ? 'Liquidity and strategy unwind apply' : 'Current exit terms need verification'}
        />
        <div className="earn-opportunity-actions">
          {row.kind === 'vault' && row.vault && row.network ? (
            <VaultDepositButton vault={row.vault} network={row.network} />
          ) : row.kind === 'liquidity' ? (
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link to="/earn/liquidity/$poolId" params={{ poolId: row.id }} />}
            >
              Inspect →
            </Button>
          ) : (
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link to="/earn/$vaultId" params={{ vaultId: row.id }} />}
            >
              Inspect →
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveVaultDetailPage({ vaultId }: { vaultId: string }) {
  const vaults = useVaults();
  const [amount, setAmount] = useState('');
  const vault = vaults.data?.vaults.find((item) => item.address === vaultId);
  if (vaults.isPending) return <p role="status">Reading vault…</p>;
  if (!vault || !vaults.data) return <MissingOpportunity />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link to="/earn" className="text-sm text-muted-foreground">
        ← Earn
      </Link>
      <PageHeader
        title={vault.name}
        kicker={`DeFindex / ${vaults.data.network}`}
        description="Deposit into the selected vault with a fresh code check, transaction review and your wallet signature."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="30-day APY" value={formatApy(vault.apyPct)} detail="Net of the vault’s fee" />
            <StatCard
              label="Vault assets"
              value={`${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(vault.totalRaw) / 1e7)} ${vault.symbol ?? ''}`}
            />
            <StatCard label="Fee on gains" value={`${vault.vaultFeeBps / 100}%`} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {vault.name} holds {vault.symbol ?? 'its supported asset'} and allocates through the listed strategies.
              </p>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-subtle">Strategies</dt>
                  <dd>{vault.strategies.map((strategy) => strategy.name).join(', ') || 'No strategies listed'}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Vault contract</dt>
                  <dd className="break-all font-mono text-xs">{vault.address}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Current allocation</dt>
                  <dd>
                    {BigInt(vault.investedRaw) > 0n
                      ? 'Invested and idle assets'
                      : 'Held idle until the manager rebalances'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-7 text-muted-foreground">
                No scheduled lockup is reported for this vault. Redemption depends on available liquidity and strategy
                unwind; exact completion timing is not verified by this observation. Review the current terms before
                depositing.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Manage position</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm">Deposit {vault.symbol}</p>
            <DecimalField label="Amount" unit={vault.symbol ?? ''} value={amount} onChange={setAmount} />
            <WithdrawalTiming />
            <VaultDepositButton vault={vault} network={vaults.data.network} initialAmount={amount} />
            <p className="text-xs text-subtle">Review → sign in your wallet → on-chain confirmation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OpportunityMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  if (!value) return <div aria-hidden="true" />;
  return (
    <div
      className={`earn-metric ${label === 'Withdrawal' ? 'earn-withdrawal' : ''} flex flex-col justify-center gap-1`}
    >
      <span className="earn-metric-label text-xs text-muted-foreground">{label}</span>
      <span className="earn-metric-value font-mono text-lg tabular-nums">{value}</span>
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
  return value === null ? 'Unavailable' : value > 0 && value < 0.01 ? '<0.01%' : `${value.toFixed(2)}%`;
}
