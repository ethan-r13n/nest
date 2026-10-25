import {
  type ProtocolRow,
  type RavenCatalog,
  type ResearchSource,
  safeResearchUrl,
  type YieldPoolRow,
} from '@nest/data/research';
import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { useClipboard } from '@nest/ui/hooks/use-clipboard';
import { Link } from '@tanstack/react-router';
import { ArrowDownUp, ArrowRight, Bookmark, Building2, Download, ExternalLink, Search } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { LiveLendingRates } from '../components/live-lending.tsx';
import { ResearchDataTable } from '../components/research-data-table.tsx';
import { ResearchHistoryChart } from '../components/research-history.tsx';
import { DraftNotice, EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { formatPercentPoints, formatUsd, formatUtc, UNAVAILABLE } from '../lib/format.ts';
import { findPool, findProtocol, ravenCatalog, research, rwaAssetRouteId } from '../lib/research.ts';

const PAGE_SIZE = 12;
const RESEARCH_LINKS = [
  { to: '/research', label: 'DeFi' },
  { to: '/research/rwas', label: 'RWAs' },
  { to: '/research/markets', label: 'Markets' },
  { to: '/research/venues', label: 'Venue map' },
] as const;
const VENUES = [
  {
    id: 'soroswap',
    name: 'Soroswap',
    group: 'Spot',
    role: 'DEX routing',
    slug: 'soroswap-amm',
    description: 'Compare swap routes at the requested amount.',
  },
  {
    id: 'blend',
    name: 'Blend',
    group: 'Lending',
    role: 'Lending protocol',
    slug: 'blend-pools-v2',
    description: 'Supply, borrow and manage collateral with native pool rules.',
  },
  {
    id: 'templar',
    name: 'Templar',
    group: 'Lending',
    role: 'Lending protocol',
    slug: 'templar-protocol',
    description: 'Credit with a multi-step funding and settlement lifecycle.',
  },
  {
    id: 'xoxno',
    name: 'XOXNO',
    group: 'Lending',
    role: 'Lending protocol',
    slug: 'xoxno-lending',
    description: 'Credit markets with lending-account ownership checks.',
  },
  {
    id: 'defindex',
    name: 'DeFindex',
    group: 'Vaults',
    role: 'Vault platform',
    slug: 'defindex',
    description: 'Vault shares, strategies and product-specific redemption.',
  },
  {
    id: 'upshift',
    name: 'Upshift',
    group: 'Vaults',
    role: 'Vault platform',
    slug: 'upshift',
    description: 'Vault access with asset-specific share and exit accounting.',
  },
  {
    id: 'gami',
    name: 'Gami Labs',
    group: 'Vaults',
    role: 'Curator',
    slug: 'gami-labs',
    description: 'Curated earn products; curator and platform capital can overlap.',
  },
  {
    id: 'sentora',
    name: 'Sentora',
    group: 'Vaults',
    role: 'Curator and products',
    slug: null,
    description: 'Evergreen and campaign products have distinct exit models.',
  },
] as const;

export function ResearchPage() {
  return (
    <div className="min-w-0 space-y-7">
      <ResearchHeader
        title="Stellar DeFi"
        description="Find the protocols, follow the capital, and compare the next step at your size."
      />
      <ResearchTabs />
      <ResearchIntent />
      <LiveLendingRates />
      <section className="grid min-w-0 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]" aria-label="Stellar overview">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <StatCard
            label="DeFi TVL"
            value={formatUsd(research.chain.defiTvlUsd)}
            detail="DefiLlama · Stellar chain value"
          />
          <StatCard
            label="DEX volume · 24h"
            value={formatUsd(research.chain.dexVolume24hUsd)}
            detail="Reported chain activity"
          />
          <StatCard
            label="Fees · 24h"
            value={formatUsd(research.chain.fees24hUsd)}
            detail="Coverage differs by venue"
          />
          <StatCard
            label="USD stablecoin value"
            value={formatUsd(research.chain.stablecoinUsdByPeg.peggedUSD ?? null)}
            detail="Provider-converted USD value"
          />
        </div>
        <ResearchHistoryChart />
      </section>
      <ProtocolDirectory />
      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Yield observations</CardTitle>
            <CardDescription>Base return and incentives stay separate.</CardDescription>
          </CardHeader>
          <CardContent>
            <PoolTable rows={research.yieldPools.slice(0, 5)} compact />
            <Button nativeButton={false} variant="link" render={<Link to="/research/markets" />}>
              Explore all observed markets <ArrowRight />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Stablecoin composition</CardTitle>
            <CardDescription>Quantities retain their own peg units; they are not a single USD total.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Peg</TableHead>
                  <TableHead className="text-right">Reported circulation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {research.stablecoins.slice(0, 6).map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <strong>{asset.symbol}</strong>
                      <span className="block text-xs text-muted-foreground">{asset.name}</span>
                    </TableCell>
                    <TableCell>{asset.peg.replace('pegged', '')}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {Object.entries(asset.circulatingByPeg)
                        .map(
                          ([peg, value]) =>
                            `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${peg.replace('pegged', '')}`,
                        )
                        .join(' · ') || UNAVAILABLE}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
      <ResearchCaveats />
    </div>
  );
}

export function RwaPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');
  const [descending, setDescending] = useState(true);
  const categories = [...new Set(research.rwaAssets.map((asset) => asset.assetClass))].sort();
  const rows = research.rwaAssets
    .filter(
      (asset) =>
        `${asset.name} ${asset.ticker} ${asset.platform} ${asset.manager ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (category === 'all' || category === asset.assetClass) &&
        (type === 'all' || type === asset.tokenizationType),
    )
    .sort((a, b) =>
      descending
        ? displayNumber(b.totalValueDisplay) - displayNumber(a.totalValueDisplay)
        : a.name.localeCompare(b.name),
    );
  return (
    <div className="min-w-0 space-y-7">
      <ResearchHeader
        title="Real-world assets"
        description="Explore Stellar's tokenized assets with their source classification, holders and issuer context."
      />
      <ResearchTabs />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {research.rwaMetrics.map((metric) => (
          <StatCard
            key={metric.key}
            label={metric.label}
            value={metric.display}
            detail={
              metric.change30dPercent === null
                ? 'RWA.xyz · dated observation'
                : `${formatPercentPoints(metric.change30dPercent)} over 30 days`
            }
          />
        ))}
      </div>
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RwaLeague />
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">A current composition, not a price chart</CardTitle>
            <CardDescription>Historical series were not part of this collection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <EmptyState
              title="RWA history unavailable"
              description="The collected network and asset figures are available below. No historical curve is inferred from a single observation."
            />
            <p className="text-xs leading-relaxed text-subtle">
              The provider's RWA count and the asset-table count use different universes. Stablecoins and multiple token
              representations appear in the table. RWA values can overlap with DeFi TVL.
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="space-y-4" aria-labelledby="rwa-assets">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rwa-assets" className="text-2xl font-semibold">
            Asset screener <span className="font-mono text-sm text-subtle">{research.rwaAssets.length} records</span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCsv(
                'stellar-rwa-observations.csv',
                [
                  'Name',
                  'Ticker',
                  'Platform',
                  'Class',
                  'Tokenization',
                  'Value display',
                  'Holders display',
                  'Source identity',
                  'Observed at',
                ],
                rows.map((asset) => [
                  asset.name,
                  asset.ticker,
                  asset.platform,
                  asset.assetClass,
                  asset.tokenizationType,
                  asset.totalValueDisplay,
                  asset.holdersDisplay,
                  asset.id,
                  asset.observedAt,
                ]),
              )
            }
          >
            <Download />
            Export observations
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SearchField
            label="Search assets"
            value={query}
            onChange={(value) => {
              setQuery(value);
            }}
          />
          <Filter
            label="Asset class"
            value={category}
            options={[{ value: 'all', label: 'All classes' }, ...categories.map((value) => ({ value, label: value }))]}
            onChange={(value) => {
              setCategory(value);
            }}
          />
          <Filter
            label="Tokenization"
            value={type}
            options={[
              { value: 'all', label: 'All types' },
              { value: 'Distributed', label: 'Distributed' },
              { value: 'Represented', label: 'Represented' },
            ]}
            onChange={(value) => {
              setType(value);
            }}
          />
          <Button variant="outline" onClick={() => setDescending(!descending)}>
            <ArrowDownUp />
            {descending ? 'Value order' : 'Name order'}
          </Button>
        </div>
        <ResearchDataTable
          tableKey="rwa-assets"
          label="RWA assets"
          rows={rows}
          getRowId={(asset) => asset.id}
          columns={[
            {
              id: 'identity',
              label: 'Asset',
              cell: (asset) => (
                <>
                  <Link
                    to="/assets/$assetId"
                    params={{ assetId: rwaAssetRouteId(asset.id) }}
                    className="font-medium hover:text-primary"
                  >
                    {asset.name}
                  </Link>
                  <span className="block font-mono text-xs text-subtle">{asset.ticker}</span>
                </>
              ),
            },
            { id: 'platform', label: 'Platform', cell: (asset) => asset.platform },
            {
              id: 'class',
              label: 'Class / type',
              cell: (asset) => (
                <>
                  {asset.assetClass}
                  <span className="block text-xs text-muted-foreground">{asset.tokenizationType}</span>
                </>
              ),
            },
            {
              id: 'value',
              label: 'Total value',
              numeric: true,
              cell: (asset) => asset.totalValueDisplay ?? UNAVAILABLE,
            },
            { id: 'holders', label: 'Holders', numeric: true, cell: (asset) => asset.holdersDisplay ?? UNAVAILABLE },
            { id: 'domicile', label: 'Domicile', cell: (asset) => asset.domicile ?? UNAVAILABLE },
          ]}
        />
      </section>
      <ResearchCaveats />
    </div>
  );
}

export function MarketsPage() {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const rows = research.yieldPools.filter(
    (pool) =>
      `${pool.project} ${pool.symbol} ${pool.meta ?? ''}`.toLowerCase().includes(query.toLowerCase()) &&
      (project === 'all' || pool.project === project),
  );
  return (
    <div className="min-w-0 space-y-7">
      <ResearchHeader
        title="Markets & research reads"
        description="Inspect observed yield markets and the published research catalog. Neither is an executable quote."
      />
      <ResearchTabs />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Observed pools"
          value={String(research.yieldPools.length)}
          detail="DefiLlama · dated pool coverage"
        />
        <StatCard
          label="Published operations"
          value={String(ravenCatalog.counts.operation)}
          detail="Catalog metadata; runtime not verified"
        />
        <StatCard
          label="Published skills"
          value={String(ravenCatalog.counts.skill)}
          detail={`${ravenCatalog.counts['skill-section']} section identifiers in the manifest`}
        />
      </div>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Observed markets</h2>
          <Badge variant="outline">Research only</Badge>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SearchField label="Search markets" value={query} onChange={setQuery} />
          <Filter
            label="Project"
            value={project}
            onChange={setProject}
            options={[
              { value: 'all', label: 'All projects' },
              ...[...new Set(research.yieldPools.map((pool) => pool.project))].map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </div>
        <Card className="min-w-0 py-0">
          <PoolTable rows={rows} />
          {!rows.length ? <EmptyState title="No matching markets" description="Try another asset or project." /> : null}
        </Card>
        <p className="text-xs leading-relaxed text-subtle">
          Pool names and token identifiers are source observations, not verified asset or deployment identities. Live
          capacity, eligibility, fees, native risk and withdrawal terms remain unavailable.
        </p>
      </section>
      <CatalogDirectory />
    </div>
  );
}

export function VenuesPage() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const venues = VENUES.filter(
    (venue) =>
      `${venue.name} ${venue.role} ${venue.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (group === 'all' || venue.group === group),
  );
  return (
    <div className="min-w-0 space-y-7">
      <ResearchHeader
        title="The venue map"
        description="See how routing, lending, vault platforms and curators fit together. Design coverage is separate from verified execution."
      />
      <ResearchTabs />
      <div className="flex flex-wrap items-end gap-3">
        <SearchField label="Find a venue" value={query} onChange={setQuery} />
        <Filter
          label="Category"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'all', label: 'All categories' },
            ...['Spot', 'Lending', 'Vaults'].map((value) => ({ value, label: value })),
          ]}
        />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {['Spot', 'Lending', 'Vaults']
          .filter((item) => group === 'all' || group === item)
          .map((category) => (
            <section key={category} className="min-w-0 space-y-3">
              <h2 className="text-xl font-semibold">{category}</h2>
              {venues
                .filter((venue) => venue.group === category)
                .map((venue) => {
                  const protocol = venue.slug ? findProtocol(venue.slug) : undefined;
                  return (
                    <Card key={venue.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <ProtocolIdentity protocol={protocol} name={venue.name} />
                          <Badge variant="outline">{venue.role}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">{venue.description}</p>
                        <dl className="flex justify-between gap-3 text-xs">
                          <dt className="text-subtle">Observed Stellar TVL</dt>
                          <dd className="font-mono tabular-nums">{formatUsd(protocol?.stellarTvlUsd ?? null)}</dd>
                        </dl>
                        <Button
                          nativeButton={false}
                          className="w-full"
                          variant="outline"
                          render={<Link to="/venues/$venueId" params={{ venueId: venue.id }} />}
                        >
                          Inspect venue <ArrowRight />
                        </Button>
                        <p className="text-xs text-subtle">Live availability has not been verified.</p>
                      </CardContent>
                    </Card>
                  );
                })}
              {!venues.some((venue) => venue.group === category) ? (
                <Card>
                  <EmptyState title="No matching venues" description="Try another search or category." />
                </Card>
              ) : null}
            </section>
          ))}
      </div>
      <DraftNotice>
        Platforms and curators can refer to the same underlying vault. Their TVL and positions are not additive. Raven
        supplies research context; it does not grant execution authority.
      </DraftNotice>
    </div>
  );
}

export function ProtocolDetailPage({ protocolId }: { protocolId: string }) {
  const protocol = findProtocol(protocolId);
  if (!protocol) return <MissingRecord title="Protocol not found" />;
  const pools = research.yieldPools.filter((pool) => pool.project === protocol.slug);
  return (
    <div className="space-y-7">
      <Breadcrumb to="protocols" />
      <PageHeader
        title={protocol.name}
        description="Inspect the reported protocol scope and market observations before considering an action."
        kicker="Research / Protocol"
        actions={<Badge variant="outline">Dated snapshot</Badge>}
      />
      <SnapshotNotice />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Stellar TVL"
          value={formatUsd(protocol.stellarTvlUsd)}
          detail="Chain-specific reported value"
        />
        <StatCard
          label="Protocol change · 1d"
          value={formatPercentPoints(protocol.change.day)}
          detail="All-chain protocol scope"
        />
        <StatCard
          label="Protocol change · 7d"
          value={formatPercentPoints(protocol.change.week)}
          detail="All-chain protocol scope"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Reported markets</CardTitle>
            <CardDescription>Matched by the provider's project identifier.</CardDescription>
          </CardHeader>
          <CardContent>
            {pools.length ? (
              <PoolTable rows={pools} />
            ) : (
              <EmptyState
                title="No pool observations in this dataset"
                description="Missing coverage does not establish that a protocol has no active markets."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Protocol facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FactList
              facts={[
                ['Category', protocol.category],
                ['Provider identifier', protocol.slug],
                ['Observed at', formatUtc(protocol.observedAt)],
                ['Execution status', 'Not verified'],
                ['Audit / admin / oracle coverage', 'Unavailable in this dataset'],
              ]}
            />
            <WebsiteLink url={protocol.url}>Visit protocol website</WebsiteLink>
          </CardContent>
        </Card>
      </div>
      <Card>
        <EmptyState
          title="Protocol-specific history unavailable"
          description="Chain-level history cannot stand in for this protocol's own historical series."
        />
      </Card>
    </div>
  );
}

export function RwaDetailPage({ assetId }: { assetId: string }) {
  const { copy, status } = useClipboard();
  const asset = research.rwaAssets.find((row) => rwaAssetRouteId(row.id) === assetId || row.id === assetId);
  if (!asset) return <MissingRecord title="Asset not found" />;
  const sourceUrl = asset.assetUrl ? safeResearchUrl(asset.assetUrl) : null;
  return (
    <div className="min-w-0 space-y-7">
      <Breadcrumb to="rwas" />
      <PageHeader
        title={asset.name}
        description="Published classification and identity references. Eligibility, liquidity and redemption terms need independent verification."
        kicker={`Research / ${asset.ticker}`}
        actions={<Badge variant="outline">Identity not verified for execution</Badge>}
      />
      <SnapshotNotice />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Reported total value"
          value={asset.totalValueDisplay ?? UNAVAILABLE}
          detail="Provider display precision preserved"
        />
        <StatCard
          label="Reported holders"
          value={asset.holdersDisplay ?? UNAVAILABLE}
          detail="Source asset representation"
        />
        <StatCard label="Tokenization type" value={asset.tokenizationType} detail={asset.assetClass} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Asset facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FactList
              facts={[
                ['Platform', asset.platform],
                ['Manager', asset.manager ?? UNAVAILABLE],
                ['Domicile', asset.domicile ?? UNAVAILABLE],
                ['Regulatory framework', asset.regulatoryFramework ?? UNAVAILABLE],
                ['Observed at', formatUtc(asset.observedAt)],
              ]}
            />
            {sourceUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <WebsiteLink url={sourceUrl}>View source asset record</WebsiteLink>
                <Button size="sm" variant="outline" onClick={() => void copy(sourceUrl)}>
                  {status === 'copied' ? 'Source URL copied' : 'Copy source URL'}
                </Button>
                <span aria-live="polite" className="text-xs text-muted-foreground">
                  {status === 'unavailable' ? 'Clipboard unavailable. Open the source link to copy its URL.' : null}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Before an action</CardTitle>
            <CardDescription>Discovery does not establish permission to acquire or redeem.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactList
              facts={[
                ['Eligibility / transfer restrictions', 'Not collected'],
                ['Redemption and withdrawal timing', 'Unknown'],
                ['Executable liquidity', 'Unavailable'],
                ['Canonical issuer / contract validation', 'Pending verification'],
                ['Source identity reference', asset.contractLabel],
              ]}
            />
            {asset.contractExplorerUrl ? (
              <div className="mt-5">
                <WebsiteLink url={asset.contractExplorerUrl}>Open source explorer reference</WebsiteLink>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <DraftNotice>
        Individual detail pages were not collected. Facts here come from the network asset table; missing yield,
        eligibility and redemption facts have not been inferred.
      </DraftNotice>
    </div>
  );
}

export function VenueDetailPage({ venueId }: { venueId: string }) {
  const venue = VENUES.find((row) => row.id === venueId);
  if (!venue) return <MissingRecord title="Venue not found" />;
  const protocol = venue.slug ? findProtocol(venue.slug) : undefined;
  const pools = venue.slug ? research.yieldPools.filter((pool) => pool.project === venue.slug) : [];
  return (
    <div className="space-y-7">
      <Breadcrumb to="venues" />
      <PageHeader
        title={venue.name}
        description={venue.description}
        kicker={`Venue map / ${venue.role}`}
        actions={<Badge variant="outline">Live availability unverified</Badge>}
      />
      <SnapshotNotice />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Role" value={venue.role} detail="Design integration record" />
        <StatCard
          label="Observed Stellar TVL"
          value={formatUsd(protocol?.stellarTvlUsd ?? null)}
          detail={protocol ? 'DefiLlama snapshot' : 'No matched protocol observation'}
        />
        <StatCard
          label="Current action availability"
          value={UNAVAILABLE}
          detail="Deployment and capability checks are pending"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Market observations</CardTitle>
          </CardHeader>
          <CardContent>
            {pools.length ? (
              <PoolTable rows={pools} />
            ) : (
              <EmptyState
                title="No matched pool data"
                description="Venue-native rates, assets and withdrawal terms are not available from the current connection."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Prepare with the full lifecycle in view</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FactList
              facts={[
                ['Read coverage', 'Published research observations only'],
                ['Quotes / native safety', 'Not connected'],
                ['Build / simulate / approve', 'Unavailable'],
                ['Withdrawal timing', 'Must be disclosed before a deposit'],
                [
                  'Settlement',
                  venue.id === 'templar'
                    ? 'Multi-step; funding confirmation is not borrow completion'
                    : 'Verify the selected product lifecycle',
                ],
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                nativeButton={false}
                variant="outline"
                render={
                  <Link to={venue.group === 'Spot' ? '/trade' : venue.group === 'Lending' ? '/credit' : '/vaults'} />
                }
              >
                Open manual form
              </Button>
              {protocol ? (
                <Button
                  nativeButton={false}
                  variant="ghost"
                  render={<Link to="/protocols/$protocolId" params={{ protocolId: protocol.slug }} />}
                >
                  Protocol observation
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
      <DraftNotice>
        A curator, platform and access provider may describe one product. Verify canonical identity before joining
        records, comparing execution or aggregating exposure.
      </DraftNotice>
    </div>
  );
}

export function MarketDetailPage({ marketId }: { marketId: string }) {
  const pool = findPool(marketId);
  if (!pool) return <MissingRecord title="Market not found" />;
  return (
    <div className="min-w-0 space-y-7">
      <Breadcrumb to="markets" />
      <PageHeader
        title={pool.symbol}
        description={pool.meta ?? 'A dated yield-market observation.'}
        kicker={`Market / ${pool.project}`}
        actions={<Badge variant="outline">Research only</Badge>}
      />
      <SnapshotNotice />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Observed TVL" value={formatUsd(pool.tvlUsd)} />
        <StatCard label="Base APY" value={percent(pool.baseApyPct)} />
        <StatCard label="Reward APY" value={percent(pool.rewardApyPct)} />
        <StatCard label="Total APY" value={percent(pool.totalApyPct)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms and identity</CardTitle>
            <CardDescription>
              Rates are dated observations, not an executable comparison or guaranteed net yield.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FactList
              facts={[
                ['Observed at', formatUtc(pool.observedAt)],
                ['Source', 'DefiLlama yield pools'],
                ['Base borrow APY', percent(pool.baseBorrowApyPct)],
                ['Reward borrow APY', percent(pool.rewardBorrowApyPct)],
                ['Reported available borrow', formatUsd(pool.availableBorrowUsd)],
                ['Native risk interpretation', 'Unavailable; no common health factor inferred'],
                ['Withdrawals / lockup / queue', 'Not collected'],
              ]}
            />
            <details className="mt-5 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">Source token identifiers · not execution identities</summary>
              <ul className="mt-3 space-y-2 break-all font-mono text-xs text-muted-foreground">
                {pool.underlyingTokens.map((token) => (
                  <li key={token}>{token}</li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Compare at your size</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <DraftNotice>
              Fresh rates, available liquidity, fees and withdrawal terms are not connected. This observation cannot
              produce a transaction.
            </DraftNotice>
            <Button nativeButton={false} className="w-full" variant="outline" render={<Link to="/credit/supply" />}>
              Open supply form
            </Button>
            <Button className="w-full" disabled>
              Review action unavailable
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SavedResearchPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Saved research"
        description="Keep protocols, assets, filters and theses together once wallet-verified saving is available."
        kicker="Research / Saved"
      />
      <Card>
        <EmptyState
          title="Your research library is not connected"
          description="No bookmarks have been loaded. Explore public research without treating this state as an empty saved account."
        >
          <Button nativeButton={false} variant="outline" render={<Link to="/research" />}>
            Explore research
          </Button>
        </EmptyState>
      </Card>
    </div>
  );
}

function ResearchHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={description}
        kicker="Research / Stellar"
        actions={
          <Button nativeButton={false} variant="outline" size="sm" render={<Link to="/research/saved" />}>
            <Bookmark />
            Saved research
          </Button>
        }
      />
      <SnapshotNotice />
    </div>
  );
}

function SnapshotNotice() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge variant="outline">Stellar mainnet snapshot · not live</Badge>
        <SourceStamp source={research.sources.defillama} />
        <SourceStamp source={research.sources.rwa} />
      </div>
      <p className="text-muted-foreground">
        Research follows the sources' Stellar mainnet coverage, independently of your connected wallet network.
      </p>
    </div>
  );
}

function ResearchTabs() {
  return (
    <nav aria-label="Research views" className="flex flex-wrap gap-1 border-b pb-3">
      {RESEARCH_LINKS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'bg-accent text-foreground' }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function ResearchIntent() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-2">
          <Label htmlFor="research-capital">Capital to explore</Label>
          <Input id="research-capital" placeholder="Enter an amount" inputMode="decimal" />
        </div>
        <div className="w-32 space-y-2">
          <Label htmlFor="research-asset">Asset</Label>
          <Input id="research-asset" defaultValue="USDC" />
        </div>
        <div className="w-32 space-y-2">
          <Label htmlFor="research-horizon">Horizon · days</Label>
          <Input id="research-horizon" placeholder="Optional" inputMode="numeric" />
        </div>
        <Button disabled>Compare with Nest</Button>
        <p className="w-full text-xs text-subtle">
          Amount-aware comparison is not connected. These inputs remain a local, unsaved draft.
        </p>
      </CardContent>
    </Card>
  );
}

function ProtocolDirectory() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('tvl');
  const categories = [...new Set(research.protocols.map((protocol) => protocol.category))].sort();
  const rows = research.protocols
    .filter(
      (protocol) =>
        `${protocol.name} ${protocol.category}`.toLowerCase().includes(query.toLowerCase()) &&
        (category === 'all' || category === protocol.category),
    )
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : byStellarTvl(a, b)));
  return (
    <section className="min-w-0 space-y-4" aria-labelledby="protocols">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="protocols" className="text-2xl font-semibold">
            Protocol directory
          </h2>
          <p className="mt-1 text-xs text-subtle">
            {research.protocols.length} Stellar-associated records, including exchanges and infrastructure.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCsv(
              'stellar-protocol-observations.csv',
              ['Protocol', 'Category', 'Stellar TVL USD', 'Protocol-wide 1d change percent', 'Observed at'],
              rows.map((row) => [row.name, row.category, row.stellarTvlUsd, row.change.day, row.observedAt]),
            )
          }
        >
          <Download />
          Export observations
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          label="Search protocols"
          value={query}
          onChange={(value) => {
            setQuery(value);
          }}
        />
        <Filter
          label="Category"
          value={category}
          onChange={(value) => {
            setCategory(value);
          }}
          options={[{ value: 'all', label: 'All categories' }, ...categories.map((value) => ({ value, label: value }))]}
        />
        <Filter
          label="Order"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'tvl', label: 'Stellar TVL' },
            { value: 'name', label: 'Name' },
          ]}
        />
      </div>
      <ResearchDataTable
        tableKey="defi-protocols"
        label="Protocols"
        rows={rows}
        getRowId={(protocol) => protocol.id}
        columns={[
          {
            id: 'identity',
            label: 'Protocol',
            cell: (protocol) => (
              <Link to="/protocols/$protocolId" params={{ protocolId: protocol.slug }} className="hover:text-primary">
                <ProtocolIdentity protocol={protocol} name={protocol.name} />
              </Link>
            ),
          },
          { id: 'category', label: 'Category', cell: (protocol) => protocol.category },
          { id: 'tvl', label: 'Stellar TVL', numeric: true, cell: (protocol) => formatUsd(protocol.stellarTvlUsd) },
          {
            id: 'day',
            label: 'Protocol 1d change',
            numeric: true,
            cell: (protocol) => formatPercentPoints(protocol.change.day),
          },
          {
            id: 'week',
            label: 'Protocol 7d change',
            numeric: true,
            cell: (protocol) => formatPercentPoints(protocol.change.week),
          },
          {
            id: 'inspect',
            label: 'Inspect',
            cell: (protocol) => (
              <Button
                nativeButton={false}
                variant="ghost"
                size="icon"
                aria-label={`Inspect ${protocol.name}`}
                render={<Link to="/protocols/$protocolId" params={{ protocolId: protocol.slug }} />}
              >
                <ArrowRight />
              </Button>
            ),
          },
        ]}
      />
      <p className="text-xs text-subtle">
        TVL is Stellar-specific when reported. Changes are protocol-wide across all chains; they are not Stellar-only
        performance.
      </p>
    </section>
  );
}

function PoolTable({ rows, compact = false }: { rows: YieldPoolRow[]; compact?: boolean }) {
  return (
    <ResearchDataTable
      tableKey="venue-markets"
      label="Markets"
      rows={rows}
      getRowId={(pool) => pool.id}
      compact={compact}
      columns={[
        {
          id: 'identity',
          label: 'Market',
          cell: (pool) => (
            <>
              <Link to="/markets/$marketId" params={{ marketId: pool.id }} className="font-medium hover:text-primary">
                {pool.symbol}
              </Link>
              <span className="block text-xs text-subtle">
                {pool.project}
                {pool.meta ? ` · ${pool.meta}` : ''}
              </span>
            </>
          ),
        },
        { id: 'tvl', label: 'TVL', numeric: true, cell: (pool) => formatUsd(pool.tvlUsd) },
        ...(!compact
          ? [
              { id: 'base', label: 'Base APY', numeric: true, cell: (pool: YieldPoolRow) => percent(pool.baseApyPct) },
              {
                id: 'reward',
                label: 'Reward APY',
                numeric: true,
                cell: (pool: YieldPoolRow) => percent(pool.rewardApyPct),
              },
            ]
          : []),
        { id: 'total', label: 'Total APY', numeric: true, cell: (pool) => percent(pool.totalApyPct) },
      ]}
    />
  );
}

function RwaLeague() {
  const [type, setType] = useState('distributed');
  const [group, setGroup] = useState('platform');
  const table = research.rwaLeagueTables.find((row) => row.assetType === type && row.groupBy === group);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-2xl">RWA league table</CardTitle>
        <CardDescription>Provider-selected universe and visible top rows; rounded display values.</CardDescription>
        <div className="mt-3 flex flex-wrap gap-3">
          <Filter
            label="Asset type"
            value={type}
            onChange={setType}
            options={[
              { value: 'distributed', label: 'Distributed' },
              { value: 'represented', label: 'Represented' },
              { value: 'all', label: 'All types' },
            ]}
          />
          <Filter
            label="Group by"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'platform', label: 'Platform' },
              { value: 'assetClass', label: 'Asset class' },
              { value: 'manager', label: 'Manager' },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        {table?.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">30d</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, index) => (
                <TableRow key={row.name ?? String(index)}>
                  <TableCell>
                    {row.url ? (
                      <WebsiteLink url={row.url}>{row.name ?? UNAVAILABLE}</WebsiteLink>
                    ) : (
                      (row.name ?? UNAVAILABLE)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.countDisplay ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{row.valueDisplay ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{row.changeDisplay ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{row.shareDisplay ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No rows supplied for this view"
            description="The source displayed no represented-manager rows. This is missing coverage, not zero assets."
          />
        )}
      </CardContent>
    </Card>
  );
}

function CatalogDirectory() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [family, setFamily] = useState('all');
  const [page, setPage] = useState(0);
  const rows = ravenCatalog.entries.filter(
    (entry) =>
      `${entry.id} ${entry.summary} ${entry.sections.join(' ')}`.toLowerCase().includes(query.toLowerCase()) &&
      (kind === 'all' || entry.kind === kind) &&
      (family === 'all' || entry.family === family),
  );
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Published read catalog</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-subtle">
            Raven manifest generated {formatUtc(ravenCatalog.generatedAt)}, captured {ravenCatalog.capturedAt}. Runtime
            access, current coverage and permissions are not verified.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCsv(
              'raven-catalog-observations.csv',
              ['Identifier', 'Kind', 'Family', 'Summary', 'Source', 'Source fetched at', 'Sections'],
              rows.map((entry) => [
                entry.id,
                entry.kind,
                entry.family,
                entry.summary,
                entry.source,
                entry.sourceFetchedAt,
                entry.sections.join(' | '),
              ]),
            )
          }
        >
          <Download />
          Export catalog
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          label="Search catalog"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
        <Filter
          label="Kind"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPage(0);
          }}
          options={[
            { value: 'all', label: 'All entries' },
            { value: 'operation', label: 'Operations' },
            { value: 'skill', label: 'Skills' },
          ]}
        />
        <Filter
          label="Source family"
          value={family}
          onChange={(value) => {
            setFamily(value);
            setPage(0);
          }}
          options={[
            { value: 'all', label: 'All families' },
            ...[...new Set(ravenCatalog.entries.map((entry) => entry.family))].map((value) => ({
              value,
              label: value,
            })),
          ]}
        />
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((entry) => (
          <CatalogEntry key={entry.id} entry={entry} />
        ))}
      </div>
      {!rows.length ? (
        <Card>
          <EmptyState title="No matching catalog entries" description="Try another source family, kind or term." />
        </Card>
      ) : null}
      <Pagination page={safePage} total={rows.length} onChange={setPage} />
    </section>
  );
}

function CatalogEntry({ entry }: { entry: RavenCatalog['entries'][number] }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex gap-2">
          <Badge variant="outline">{entry.kind}</Badge>
          <span className="text-xs text-subtle">{entry.family}</span>
        </div>
        <CardTitle className="break-all font-mono text-sm">{entry.id}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{entry.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-subtle">Source fetched {formatUtc(entry.sourceFetchedAt)}</p>
        {entry.parameters.length ? (
          <p className="break-words">
            <span className="text-subtle">Parameters: </span>
            {entry.parameters.join(', ')}
          </p>
        ) : null}
        {entry.sections.length ? (
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {entry.sections.length} section identifiers
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto break-all font-mono text-subtle">
              {entry.sections.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <WebsiteLink url={entry.source}>Published source</WebsiteLink>
      </CardContent>
    </Card>
  );
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="min-w-48 flex-1 space-y-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="relative block">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={label}
          className="pl-9"
        />
      </span>
    </label>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-36 space-y-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        value={value}
        onValueChange={(selected) => {
          if (typeof selected === 'string') onChange(selected);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>{options.find((option) => option.value === value)?.label ?? label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
      <span aria-live="polite">
        {total
          ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`
          : 'No matching records'}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <span>
          {page + 1} / {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function ProtocolIdentity({ protocol, name }: { protocol?: ProtocolRow | undefined; name: string }) {
  const logo = protocol ? safeResearchUrl(protocol.logo) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
        <Building2 className="size-4 text-subtle" aria-hidden="true" />
        {logo ? (
          <img
            src={logo}
            alt=""
            className="absolute inset-0 size-full object-contain"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
      </span>
      <span className="min-w-0 font-medium">{name}</span>
    </div>
  );
}

function SourceStamp({ source }: { source: ResearchSource }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
      {source.attribution} · {formatUtc(source.capturedAt)}
    </a>
  );
}

function WebsiteLink({ url, children }: { url: string; children: ReactNode }) {
  const safe = safeResearchUrl(url);
  return safe ? (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <span className="text-subtle">Source link unavailable</span>
  );
}

function FactList({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="space-y-3 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="grid gap-1 border-b pb-3 sm:grid-cols-[minmax(100px,1fr)_minmax(0,1.5fr)]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Breadcrumb({ to }: { to: 'protocols' | 'rwas' | 'venues' | 'markets' }) {
  const path =
    to === 'rwas'
      ? '/research/rwas'
      : to === 'venues'
        ? '/research/venues'
        : to === 'markets'
          ? '/research/markets'
          : '/research';
  return (
    <Link to={path} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      ← Back to research
    </Link>
  );
}

function MissingRecord({ title }: { title: string }) {
  return (
    <Card>
      <EmptyState title={title} description="Choose a record from the current dated dataset.">
        <Button nativeButton={false} variant="outline" render={<Link to="/research" />}>
          Open research
        </Button>
      </EmptyState>
    </Card>
  );
}

function ResearchCaveats() {
  return (
    <details className="rounded-xl border bg-card px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium">Sources, definitions and coverage</summary>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
        {research.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
    </details>
  );
}

function byStellarTvl(left: ProtocolRow, right: ProtocolRow) {
  return (right.stellarTvlUsd ?? -1) - (left.stellarTvlUsd ?? -1);
}

function percent(value: number | null) {
  return value === null ? UNAVAILABLE : `${value.toFixed(2)}%`;
}

function displayNumber(value: string | null) {
  const number = Number(value?.replace(/[^\d.]/g, '') ?? '');
  return value !== null && Number.isFinite(number) ? number : -1;
}

function exportCsv(name: string, headings: string[], rows: (string | number | null)[][]) {
  const csv = [headings, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '');
          return `"${(/^[\s\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
