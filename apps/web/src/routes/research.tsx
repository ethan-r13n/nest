import { type ProtocolRow, type RavenCatalog, type ResearchSource, safeResearchUrl } from '@nest/data/research';
import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Input } from '@nest/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { useClipboard } from '@nest/ui/hooks/use-clipboard';
import { Link } from '@tanstack/react-router';
import { ArrowDownUp, Download, ExternalLink, Search } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { AssetIcon } from '../components/asset-icon.tsx';
import { LiveLendingRates } from '../components/live-lending.tsx';
import { ProtocolResearchDetail } from '../components/protocol-detail.tsx';
import { ProtocolLogo } from '../components/protocol-logo.tsx';
import { ResearchDataTable } from '../components/research-data-table.tsx';
import { ResearchHistoryChart } from '../components/research-history.tsx';
import { SelectionCommand } from '../components/selection-command.tsx';
import { DraftNotice, EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { formatPercentPoints, formatUsd, formatUtc, UNAVAILABLE } from '../lib/format.ts';
import { findPool, findProtocol, projectEvidence, ravenCatalog, research, rwaAssetRouteId } from '../lib/research.ts';

const PAGE_SIZE = 10;
const RESEARCH_LINKS = [
  { to: '/research', label: 'DeFi' },
  { to: '/research/rwas', label: 'RWAs' },
  { to: '/research/markets', label: 'MCP Contents' },
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
    slug: 'stellar-defi-hub',
    description: 'Evergreen and campaign products have distinct exit models.',
  },
] as const;

export function ResearchPage() {
  return (
    <SelectionCommand className="research-workspace min-w-0 space-y-5">
      <ResearchTabs />
      <ResearchHeader
        title="Stellar DeFi"
        description="Track network activity, compare protocols, and inspect their markets."
      />
      <NetworkSummary />
      <ResearchHistoryChart />
      <ProtocolDirectory />
      <LiveLendingRates />
      <ResearchCaveats />
    </SelectionCommand>
  );
}

function NetworkSummary() {
  const metrics = [
    { label: 'DeFi TVL', value: research.chain.defiTvlUsd },
    {
      label: 'Stablecoins · all pegs',
      value: Object.values(research.chain.stablecoinUsdByPeg).reduce((sum, value) => sum + value, 0),
    },
    { label: 'DEX volume · 24h', value: research.chain.dexVolume24hUsd },
    { label: 'Fees · 24h', value: research.chain.fees24hUsd },
  ];
  return (
    <section className="research-network-summary workspace-panel" aria-label="Stellar network summary">
      <div className="flex items-center gap-3 p-5">
        <AssetIcon symbol="XLM" className="size-[30px]" />
        <strong className="font-serif text-xl font-semibold">Stellar</strong>
      </div>
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 border-l px-5 py-4">
          <span className="block text-[11px] text-muted-foreground">{metric.label}</span>
          <strong className="mt-1 block font-mono text-2xl font-normal tracking-tight tabular-nums">
            {formatUsd(metric.value)}
          </strong>
        </div>
      ))}
    </section>
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
    <div className="research-workspace min-w-0 space-y-5">
      <ResearchTabs />
      <ResearchHeader
        title="Stellar Real-World Assets"
        description="Explore tokenized assets, issuers, and capital on Stellar. Keep distributed and represented value distinct."
      />
      <div className="research-rwa-metrics">
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
      <section className="research-rwa-overview">
        <RwaComposition />
        <RwaLeague />
      </section>
      <section className="space-y-4" aria-labelledby="rwa-assets">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rwa-assets" className="text-2xl font-semibold">
            Assets on Stellar <span className="font-mono text-sm text-subtle">{research.rwaAssets.length} records</span>
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
        <ResearchDataTable
          controls={
            <div className="research-filters flex min-w-0 flex-1 flex-wrap items-end gap-2">
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
                options={[
                  { value: 'all', label: 'All classes' },
                  ...categories.map((value) => ({ value, label: value })),
                ]}
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
          }
          tableKey="rwa-assets"
          label="RWA assets"
          rows={rows}
          getRowId={(asset) => asset.id}
          columns={[
            {
              id: 'identity',
              label: 'Asset / ticker',
              cell: (asset) => (
                <div className="flex items-center gap-2.5">
                  <ProtocolLogo name={asset.name} />
                  <div className="min-w-0">
                    <a
                      href={safeResearchUrl(asset.assetUrl ?? '') ?? 'https://app.rwa.xyz/networks/stellar'}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-primary"
                    >
                      {asset.name}
                    </a>
                    <span className="block font-mono text-xs text-subtle">{asset.ticker}</span>
                  </div>
                </div>
              ),
            },
            {
              id: 'platform',
              label: 'Platform',
              cell: (asset) => (
                <div className="flex items-center gap-2.5">
                  <ProtocolLogo name={asset.platform} />
                  <span>{asset.platform}</span>
                </div>
              ),
            },
            {
              id: 'class',
              label: 'Asset class',
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
            { id: 'access', label: 'Access', cell: (asset) => asset.regulatoryFramework ?? UNAVAILABLE },
            { id: 'type', label: 'Type', cell: (asset) => asset.tokenizationType },
            {
              id: 'source',
              label: 'Identity',
              cell: (asset) => <WebsiteLink url={asset.contractExplorerUrl ?? ''}>Source identity</WebsiteLink>,
            },
          ]}
        />
      </section>
      <ResearchCaveats />
    </div>
  );
}

export function MarketsPage() {
  return (
    <div className="research-workspace mcp-workspace min-w-0">
      <ResearchTabs />
      <ResearchHeader
        title="MCP Contents"
        description="Explore the ecosystem, then inspect the tools and sources behind the research."
      />
      <VenueMap />
      <CatalogDirectory />
    </div>
  );
}

export function VenuesPage() {
  return <MarketsPage />;
}

function VenueMap() {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [selectedId, setSelectedId] = useState('soroswap');
  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = ['Spot', 'Lending', 'Vaults', 'Infrastructure'];
  const targets = VENUES.map((venue) => ({ ...venue, target: venue.id !== 'templar' }));
  const projectIds = new Set(
    targets.flatMap((node) => {
      const record = node.slug ? projectEvidence.records[node.slug] : undefined;
      return record ? [record.projectSlug] : [];
    }),
  );
  const other = research.protocols
    .filter((protocol) => {
      const record = projectEvidence.records[protocol.slug];
      if (protocol.category === 'CEX' || !record || projectIds.has(record.projectSlug)) return false;
      projectIds.add(record.projectSlug);
      return true;
    })
    .map((protocol) => ({
      id: protocol.slug,
      name: projectEvidence.records[protocol.slug]?.name ?? protocol.name,
      role: protocol.category,
      slug: protocol.slug,
      description: projectEvidence.records[protocol.slug]?.description ?? '',
      group: /Dexs/.test(protocol.category)
        ? 'Spot'
        : /Lending/.test(protocol.category)
          ? 'Lending'
          : /Farm|Yield|Allocator|Curator|Basis/.test(protocol.category)
            ? 'Vaults'
            : 'Infrastructure',
      target: false,
    }));
  const nodes = [...targets, ...other];
  const visible = nodes.filter(
    (node) =>
      `${node.name} ${node.role}`.toLowerCase().includes(query.toLowerCase()) &&
      (scope === 'all' || (scope === 'targets' ? node.target : !node.target)),
  );
  const selected = visible.find((node) => node.id === selectedId) ?? visible[0];
  const protocol = selected?.slug ? findProtocol(selected.slug) : undefined;
  const record = selected?.slug ? projectEvidence.records[selected.slug] : undefined;
  return (
    <section className="workspace-panel venue-map">
      <div className="venue-map-heading">
        <div>
          <p className="font-mono text-[10px] text-primary">01 / ECOSYSTEM COVERAGE</p>
          <h2>
            Venue map{' '}
            <span className="ml-3 font-mono text-[11px] font-normal text-subtle">
              {visible.length} of {nodes.length} projects
            </span>
          </h2>
        </div>
        <span className="text-[10px] text-subtle">● Integration target · ○ Research only</span>
      </div>
      <div className="venue-map-toolbar">
        <Input
          aria-label="Search projects"
          placeholder="Search project, asset or capability…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Filter
          label="Project scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All projects' },
            { value: 'targets', label: 'Integration targets' },
            { value: 'research', label: 'Research only' },
          ]}
        />
        <Button
          variant="ghost"
          onClick={() => {
            setQuery('');
            setScope('all');
          }}
        >
          Reset
        </Button>
      </div>
      <div className="venue-map-layout">
        <div className="venue-network">
          <div className="venue-map-trunk">
            <span className="font-mono text-primary">Raven / Scout</span>
            <span>→</span>
            <span>Stellar ecosystem</span>
            <span className="ml-auto text-subtle">Project relationships & evidence</span>
          </div>
          <div className="venue-map-groups">
            {groups.map((group) => {
              const matches = visible.filter((node) => node.group === group);
              return (
                <section key={group} className="venue-map-group">
                  <h3>
                    {group === 'Vaults' ? 'Vaults & Yield' : group}
                    <span>{matches.length}</span>
                  </h3>
                  {matches.slice(0, expanded.includes(group) ? undefined : 4).map((node) => (
                    <Button
                      key={node.id}
                      variant="outline"
                      className="venue-map-node"
                      aria-pressed={node.id === selected?.id}
                      onClick={() => setSelectedId(node.id)}
                    >
                      <ProtocolLogo name={node.name} fallback={node.slug ? findProtocol(node.slug)?.logo : undefined} />
                      <span>
                        <strong>{node.name}</strong>
                        <small>{node.role}</small>
                      </span>
                      <span
                        className={node.target ? 'text-primary' : 'text-subtle'}
                        title={node.target ? 'Integration target' : 'Research only'}
                      >
                        {node.target ? '●' : '○'}
                      </span>
                    </Button>
                  ))}
                  {matches.length > 4 ? (
                    <Button
                      variant="ghost"
                      className="venue-map-more"
                      onClick={() =>
                        setExpanded(
                          expanded.includes(group) ? expanded.filter((value) => value !== group) : [...expanded, group],
                        )
                      }
                    >
                      {expanded.includes(group) ? 'Show fewer' : `+ ${matches.length - 4} more projects ↓`}
                    </Button>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
        <aside className="venue-map-inspector" aria-label="Selected project">
          {selected ? (
            <>
              <ProtocolIdentity protocol={protocol} name={selected.name} />
              <p className="mt-3 text-[10px] text-subtle">
                {selected.target ? '● Integration target' : '○ Research coverage'} · {selected.role}
              </p>
              <p className="my-3 text-xs leading-7 text-muted-foreground">
                {record?.description.split(/(?<=\.)\s/)[0] || selected.description}
              </p>
              {record ? (
                <div className="venue-evidence-counts">
                  <span>
                    <strong>{record.auditReferences}</strong>audit refs
                  </span>
                  <span>
                    <strong>{record.repositories}</strong>repos
                  </span>
                  <span>
                    <strong>{record.contractReferences}</strong>contracts
                  </span>
                </div>
              ) : (
                <p className="text-xs text-subtle">Project evidence unavailable.</p>
              )}
              {record?.status ? (
                <p className="text-xs text-muted-foreground">
                  Status: {record.status}
                  {record.statusAsOf ? ` · as of ${formatUtc(record.statusAsOf)}` : ''}
                </p>
              ) : null}
              {record?.statusCaveat ? <p className="mt-2 text-xs text-subtle">{record.statusCaveat}</p> : null}
              {record?.scfAwarded ? (
                <p className="my-3 text-xs">
                  SCF funding ·{' '}
                  {record.scfTotalAwardedUsd === null ? 'Amount undisclosed' : formatUsd(record.scfTotalAwardedUsd)}
                  {record.scfAsOf ? (
                    <small className="mt-1 block text-subtle">Project record · {evidenceDate(record.scfAsOf)}</small>
                  ) : null}
                </p>
              ) : null}
              <details className="my-4 border-y py-3 text-xs">
                <summary className="cursor-pointer">Readable context</summary>
                <p className="mt-3 leading-7 text-muted-foreground">
                  Published protocol records, dated observations and Raven documentation. Live execution availability is
                  checked separately for each action.
                </p>
              </details>
              {protocol ? (
                <Button
                  nativeButton={false}
                  className="w-full"
                  render={<Link to="/protocols/$protocolId" params={{ protocolId: protocol.slug }} />}
                >
                  Open protocol research ↗
                </Button>
              ) : (
                <p className="text-xs text-subtle">No matched protocol record.</p>
              )}
            </>
          ) : (
            <EmptyState title="No matching projects" description="Try another search or project filter." />
          )}
        </aside>
      </div>
      <p className="border-t px-5 py-3 text-[10px] leading-relaxed text-subtle">
        Scout source snapshot · {formatUtc(projectEvidence.capturedAt)}. Versions are grouped by their captured project
        identity. Research coverage and execution readiness are separate facts.
      </p>
    </section>
  );
}

export function ProtocolDetailPage({ protocolId }: { protocolId: string }) {
  return <ProtocolResearchDetail protocolId={protocolId} />;
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
  const venue = VENUES.find((item) => item.id === venueId);
  return venue ? <ProtocolResearchDetail protocolId={venue.slug} /> : <MissingRecord title="Venue not found" />;
}

export function MarketDetailPage({ marketId }: { marketId: string }) {
  const pool = findPool(marketId);
  return pool ? <ProtocolResearchDetail protocolId={pool.project} /> : <MissingRecord title="Market not found" />;
}

export function SavedResearchPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Bookmarks"
        description="Keep protocols, assets, filters and theses together once wallet-verified saving is available."
        kicker="Research / Saved"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          disabled
          className="min-h-11 w-full sm:max-w-sm"
          aria-label="Search bookmarks"
          placeholder="Search bookmarks…"
        />
        <Button disabled variant="outline">
          Export bookmarks
        </Button>
      </div>
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
    <header className="workspace-page-header flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-widest text-subtle uppercase">
          {title === 'MCP Contents' ? 'Research / Sources & coverage' : 'Research / Stellar network'}
        </p>
        <h1>{title}</h1>
        <p className="text-[13px] leading-6 text-muted-foreground">{description}</p>
      </div>
      {title === 'MCP Contents' ? (
        <a href="#published-catalog" className="workspace-action inline-flex items-center border">
          Browse {ravenCatalog.entries.length} catalog entries ↓
        </a>
      ) : (
        <a
          className="research-source-stamp"
          href={title === 'Stellar Real-World Assets' ? research.sources.rwa.url : research.sources.defillama.url}
          target="_blank"
          rel="noreferrer"
        >
          ◷ {title === 'Stellar Real-World Assets' ? 'RWA.xyz' : 'DefiLlama'} ·{' '}
          {formatUtc(
            title === 'Stellar Real-World Assets'
              ? research.sources.rwa.capturedAt
              : research.sources.defillama.capturedAt,
          )}{' '}
          snapshot
        </a>
      )}
    </header>
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
    <nav aria-label="Research views" className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <div className="flex flex-wrap gap-2">
        {RESEARCH_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: true }}
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-xs text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'bg-accent text-primary' }}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Button
        nativeButton={false}
        variant="outline"
        className="workspace-action"
        render={<Link to="/research/saved" />}
      >
        Bookmarks ↗
      </Button>
    </nav>
  );
}

function ProtocolDirectory() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'tvl' | 'day' | 'week'>('tvl');
  const [descending, setDescending] = useState(true);
  const protocols = research.protocols.filter(
    (protocol) => protocol.category !== 'CEX' && protocol.stellarTvlUsd !== null,
  );
  const categories = [...new Set(protocols.map((protocol) => protocol.category))].sort();
  const rows = protocols
    .filter(
      (protocol) =>
        `${protocol.name} ${protocol.category}`.toLowerCase().includes(query.toLowerCase()) &&
        (category === 'all' || category === protocol.category),
    )
    .sort((a, b) => {
      const left = sort === 'tvl' ? a.stellarTvlUsd : a.change[sort];
      const right = sort === 'tvl' ? b.stellarTvlUsd : b.change[sort];
      return descending ? (right ?? -Infinity) - (left ?? -Infinity) : (left ?? Infinity) - (right ?? Infinity);
    });
  function sortBy(value: 'tvl' | 'day' | 'week') {
    setDescending(value === sort ? !descending : true);
    setSort(value);
  }
  return (
    <section className="research-protocols min-w-0" aria-labelledby="protocols">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="protocols" className="text-[22px] font-semibold">
          Protocols <span className="ml-2 font-mono text-[11px] font-normal text-subtle">{rows.length} Results</span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            exportCsv(
              'stellar-protocol-observations.csv',
              ['Protocol', 'Category', 'Stellar TVL USD', 'Protocol-wide 1d change percent', 'Observed at'],
              rows.map((row) => [row.name, row.category, row.stellarTvlUsd, row.change.day, row.observedAt]),
            )
          }
        >
          Export snapshot CSV ↗
        </Button>
      </div>
      <ResearchDataTable
        controls={
          <div className="research-filters flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <SearchField label="Search protocols" value={query} onChange={setQuery} />
            <Filter
              label="Protocol category"
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: 'All DeFi categories' },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setCategory('all');
                setSort('tvl');
                setDescending(true);
              }}
            >
              Reset filters
            </Button>
          </div>
        }
        tableKey="defi-protocols"
        label="Protocols"
        rows={rows}
        getRowId={(protocol) => protocol.id}
        columns={[
          { id: 'rank', label: '#', required: true, cell: (protocol) => rows.indexOf(protocol) + 1 },
          {
            id: 'identity',
            label: 'Protocol',
            required: true,
            cell: (protocol) => (
              <Link to="/protocols/$protocolId" params={{ protocolId: protocol.slug }} className="hover:text-primary">
                <ProtocolIdentity protocol={protocol} name={protocol.name} />
              </Link>
            ),
          },
          { id: 'category', label: 'Category', cell: (protocol) => protocol.category },
          {
            id: 'tvl',
            label: `Stellar TVL ${sort === 'tvl' ? (descending ? '↓' : '↑') : ''}`,
            numeric: true,
            onSort: () => sortBy('tvl'),
            cell: (protocol) => formatUsd(protocol.stellarTvlUsd),
          },
          {
            id: 'day',
            label: '1d Δ*',
            numeric: true,
            onSort: () => sortBy('day'),
            cell: (protocol) => (
              <span
                className={
                  protocol.change.day === null ? '' : protocol.change.day < 0 ? 'text-destructive' : 'text-success'
                }
              >
                {formatPercentPoints(protocol.change.day)}
              </span>
            ),
          },
          {
            id: 'week',
            label: '7d Δ*',
            numeric: true,
            onSort: () => sortBy('week'),
            cell: (protocol) => (
              <span
                className={
                  protocol.change.week === null ? '' : protocol.change.week < 0 ? 'text-destructive' : 'text-success'
                }
              >
                {formatPercentPoints(protocol.change.week)}
              </span>
            ),
          },
          {
            id: 'all-chains',
            label: 'All-chain TVL',
            numeric: true,
            cell: (protocol) => formatUsd(protocol.allChainsTvlUsd ?? null),
          },
        ]}
      />
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        * Percentage changes are protocol-wide across all chains, as supplied by DefiLlama. Stellar TVL uses the Stellar
        component. CEX rows are excluded from this DeFi ranking. Do not sum overlapping rows into a new chain total.
      </p>
    </section>
  );
}

function RwaComposition() {
  const [view, setView] = useState('composition');
  const [includeStablecoins, setIncludeStablecoins] = useState(true);
  const table = research.rwaLeagueTables.find(
    (item) => item.assetType === 'distributed' && item.groupBy === 'assetClass',
  );
  const rows = table?.rows.filter((row) => includeStablecoins || !/stablecoin/i.test(row.name ?? '')) ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Stellar Metrics</CardTitle>
          <span className="text-[10px] text-subtle">As of {formatUtc(research.sources.rwa.capturedAt)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {['composition', 'history'].map((value) => (
              <Button
                key={value}
                variant={view === value ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {value === 'composition' ? 'Composition' : 'History'}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeStablecoins}
              onChange={(event) => setIncludeStablecoins(event.currentTarget.checked)}
            />
            Include stablecoins
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'history' ? (
          <EmptyState
            title="Historical series unavailable"
            description="No history was included in this collection. Composition uses the captured asset-class shares."
          />
        ) : (
          <>
            <div className="research-composition-bars">
              {rows.map((row, index) => {
                const value =
                  row.shareDisplay && /[0-9]/.test(row.shareDisplay)
                    ? Number(row.shareDisplay.replace(/[^0-9.]/g, ''))
                    : NaN;
                const share = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
                return (
                  <div key={row.name ?? index}>
                    <div className="mb-2 flex justify-between gap-3 text-xs">
                      <span>{row.name ?? UNAVAILABLE}</span>
                      <span className="font-mono text-subtle">{row.shareDisplay ?? UNAVAILABLE}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      {share !== null ? (
                        <div className={`rwa-share rwa-share-${index % 4}`} style={{ width: `${share}%` }} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-16 text-[10px] leading-6 text-subtle">
              Distributed asset-class shares from collected source rows. Rounded provider precision is retained; this is
              a snapshot, not historical performance.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RwaLeague() {
  const [type, setType] = useState('distributed');
  const [group, setGroup] = useState('platform');
  const table = research.rwaLeagueTables.find((row) => row.assetType === type && row.groupBy === group);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>RWA League Table</CardTitle>
          <Filter
            label="League grouping"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'platform', label: 'By platform' },
              { value: 'assetClass', label: 'By asset class' },
              { value: 'manager', label: 'By manager' },
            ]}
          />
        </div>
        <fieldset className="mt-3 flex gap-1" aria-label="RWA league asset type">
          {['distributed', 'represented', 'all'].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={type === value ? 'secondary' : 'ghost'}
              aria-pressed={type === value}
              onClick={() => setType(value)}
            >
              {value === 'distributed' ? 'Distributed' : value === 'represented' ? 'Represented' : 'All'}
            </Button>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent>
        {table?.rows.length ? (
          <Table containerClassName="max-h-[280px] overflow-auto">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>
                  {group === 'platform' ? 'Platform' : group === 'assetClass' ? 'Asset class' : 'Manager'}
                </TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">30d</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, index) => (
                <TableRow key={row.name ?? index}>
                  <TableCell className="text-xs text-subtle">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProtocolLogo name={row.name ?? ''} />
                      <div>
                        {row.url ? (
                          <WebsiteLink url={row.url}>{row.name ?? UNAVAILABLE}</WebsiteLink>
                        ) : (
                          (row.name ?? UNAVAILABLE)
                        )}
                        <small className="mt-1 block text-[10px] text-subtle">
                          {row.countDisplay ?? 'Count unavailable'} {row.countDisplay ? 'RWAs' : ''}
                        </small>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{row.valueDisplay ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{row.changeDisplay ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{row.shareDisplay ?? '—'}</TableCell>
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
        <p className="mt-3 text-[10px] text-subtle">
          {table?.rows.length ?? 0} captured rows · {type} view · scroll within the table · rounded source values.
        </p>
      </CardContent>
    </Card>
  );
}

function CatalogDirectory() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [family, setFamily] = useState('all');
  const [page, setPage] = useState(0);
  const families = [...new Set(ravenCatalog.entries.map((entry) => entry.family))];
  const rows = ravenCatalog.entries.filter(
    (entry) =>
      `${entry.id} ${entry.summary} ${entry.sections.join(' ')}`.toLowerCase().includes(query.toLowerCase()) &&
      (kind === 'all' || entry.kind === kind) &&
      (family === 'all' || entry.family === family),
  );
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  return (
    <section id="published-catalog" className="catalog-directory min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-[10px] text-primary">02 / PUBLISHED RAVEN CATALOG</p>
          <h2 className="text-[23px] font-semibold">
            Tools & Playbooks{' '}
            <span className="ml-3 font-mono text-[11px] font-normal text-subtle">{rows.length} Entries</span>
          </h2>
        </div>
        <Button
          variant="ghost"
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
          Export snapshot CSV ↗
        </Button>
      </div>
      <div className="catalog-family-filters">
        {families.map((value) => (
          <Button
            key={value}
            variant="outline"
            aria-pressed={family === value}
            onClick={() => {
              setFamily(family === value ? 'all' : value);
              setPage(0);
            }}
          >
            <span className="text-xl text-primary">{value === 'skills' ? '◇' : value === 'scout' ? '⌘' : '▤'}</span>
            <span>
              <strong>{familyName(value)}</strong>
              <small>
                {value === 'skills'
                  ? 'Build & security playbooks'
                  : value === 'scout'
                    ? 'Projects & evidence'
                    : value === 'stellarDocs'
                      ? 'Protocol documentation'
                      : 'Research & content'}
              </small>
            </span>
            <b>{ravenCatalog.entries.filter((entry) => entry.family === value).length}</b>
          </Button>
        ))}
      </div>
      <div className="research-table-toolbar">
        <div className="research-filters flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <SearchField
            label="Search tools and playbooks"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(0);
            }}
          />
          <Filter
            label="Entry kind"
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
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('');
              setFamily('all');
              setKind('all');
              setPage(0);
            }}
          >
            Reset
          </Button>
        </div>
      </div>
      <div className="workspace-panel catalog-entries">
        {rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((entry) => (
          <CatalogEntry key={entry.id} entry={entry} />
        ))}
        {!rows.length ? (
          <EmptyState title="No matching entries" description="Try a broader search or clear the filters." />
        ) : null}
      </div>
      <Pagination page={safePage} total={rows.length} onChange={setPage} />
      <details className="border-t pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Source provenance · {formatUtc(ravenCatalog.generatedAt)}</summary>
        <p className="mt-3 leading-7">
          Raven manifest captured {ravenCatalog.capturedAt}. Published metadata does not establish current runtime
          availability or grant execution permissions.
        </p>
      </details>
    </section>
  );
}

function CatalogEntry({ entry }: { entry: RavenCatalog['entries'][number] }) {
  return (
    <details className="catalog-entry">
      <summary>
        <span className="text-xl text-subtle" aria-hidden="true">
          ◇
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block break-words font-mono text-xs font-medium">{entry.id}</strong>
          <span className="mt-1 block text-[11px] leading-6 text-muted-foreground">{entry.summary}</span>
        </span>
        <Badge variant="outline">{entry.kind}</Badge>
        <span className="text-lg text-primary" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="catalog-entry-contract">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt>Source family</dt>
            <dd>{familyName(entry.family)}</dd>
          </div>
          <div>
            <dt>Parameters</dt>
            <dd>{entry.parameters.join(' · ') || 'See published schema'}</dd>
          </div>
          <div>
            <dt>Source captured</dt>
            <dd>{formatUtc(entry.sourceFetchedAt)}</dd>
          </div>
          {entry.sections.length ? (
            <div>
              <dt>Sections · {entry.sections.length}</dt>
              <dd>{entry.sections.join(' · ')}</dd>
            </div>
          ) : null}
        </dl>
        <WebsiteLink url={entry.source}>Upstream source</WebsiteLink>
        <p className="mt-3 text-[10px] text-subtle">
          Published metadata. Runtime availability and response content have not been verified.
        </p>
      </div>
    </details>
  );
}

function evidenceDate(value: string) {
  return value.length === 10
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : formatUtc(value);
}

function familyName(value: string) {
  return value === 'stellarDocs'
    ? 'Stellar Docs'
    : value === 'lumenloop'
      ? 'Lumenloop'
      : value === 'scout'
        ? 'Scout'
        : value === 'skills'
          ? 'Skills'
          : value;
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="research-search-field min-w-48 flex-1 space-y-2">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
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
    </div>
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
  return (
    <div className="protocol-identity flex min-w-0 items-center gap-2.5">
      <ProtocolLogo name={name} fallback={protocol?.logo} />
      <span className="min-w-0">
        <strong className="font-medium">{name}</strong>
        {protocol ? (
          <small>
            {protocol.chains?.length
              ? `${protocol.chains.length} ${protocol.chains.length === 1 ? 'chain' : 'chains'}`
              : 'Source observation'}
            {protocol.symbol && protocol.symbol !== '-' ? ` · ${protocol.symbol}` : ''}{' '}
            <span className="ml-2 text-primary">↗</span>
          </small>
        ) : null}
      </span>
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
