import { type ProtocolContext, type ProtocolVenue, parseProtocolDetails } from '@nest/data/protocol-details';
import { type ProtocolRow, safeResearchUrl, type YieldPoolRow } from '@nest/data/research';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Popover, PopoverContent, PopoverTrigger } from '@nest/ui/components/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import detailsJson from '../../../../research/data/protocol-details.json' with { type: 'json' };
import { formatUtc } from '../lib/format.ts';
import { findProtocol, research } from '../lib/research.ts';
import { ProtocolLogo } from './protocol-logo.tsx';
import { EmptyState } from './workspace.tsx';

const details = parseProtocolDetails(detailsJson);
const RESEARCH_LINKS = [
  { to: '/research', label: 'DeFi' },
  { to: '/research/rwas', label: 'RWAs' },
  { to: '/research/markets', label: 'MCP Contents' },
] as const;

export function ProtocolResearchDetail({ protocolId }: { protocolId: string }) {
  const protocol = findProtocol(protocolId);
  if (!protocol)
    return <EmptyState title="Protocol unavailable" description="This protocol is not in the captured dataset." />;
  const metadata = details.protocols[protocol.slug];
  const context = details.contexts[protocol.slug];
  const pools = research.yieldPools.filter((pool) => pool.project === protocol.slug);
  const venue = details.venues.find((item) => item.slugs.includes(protocol.slug));
  const sourceUrl = `https://defillama.com/protocol/${encodeURIComponent(protocol.slug)}`;
  const overview: [string, ReactNode][] = [
    ['Networks', protocol.chains?.join(' · ') || 'Not supplied'],
    ['1d change · protocol-wide', rate(protocol.change.day)],
    ['7d change · protocol-wide', rate(protocol.change.week)],
  ];
  const borrowed = metadata?.stellar_tvl_components_usd?.['Stellar-borrowed'];
  if (borrowed != null) overview.push(['Stellar borrowed value', money(borrowed)]);
  if (protocol.symbol && protocol.symbol !== '-') overview.push(['Protocol token', protocol.symbol]);
  if (metadata?.listed_at_unix) overview.push(['Listed on DeFiLlama', date(metadata.listed_at_unix * 1000)]);
  if (!pools.length) overview.push(['Yield coverage', 'No matching Stellar pools in the captured yield feed.']);
  return (
    <div className="protocol-detail" key={protocol.slug}>
      <div className="protocol-research-nav">
        <nav aria-label="Research sections">
          {RESEARCH_LINKS.map((item) => (
            <Link key={item.to} to={item.to} aria-current={item.to === '/research' ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link to="/research/saved" className="protocol-button">
          Bookmarks ↗
        </Link>
      </div>
      <header className="protocol-page-header workspace-page-header">
        <div>
          <p className="protocol-eyebrow">
            <Link to="/research">Research / DeFi</Link> / Protocol
          </p>
          <h1>
            <ProtocolLogo name={protocol.name} fallback={protocol.logo} />
            {protocol.name}
            <Help label="About this page">
              Source-reported protocol observations and project references. Each section retains its own scope and
              observation date; current execution requires a fresh quote.
            </Help>
          </h1>
          <p>{metadata?.description || 'Protocol description unavailable in the captured source.'}</p>
        </div>
        <div className="protocol-page-actions">
          <Link to="/research" className="protocol-button">
            ← All protocols
          </Link>
          <Button nativeButton={false} variant="outline" render={<Link to="/research/saved" />}>
            Save protocol
          </Button>
        </div>
      </header>
      <div className="protocol-layout">
        <div className="protocol-stack">
          <Card className="protocol-summary">
            <Metric
              label="Stellar TVL"
              value={money(protocol.stellarTvlUsd)}
              detail={`Observed · ${date(protocol.observedAt)}`}
            />
            {(protocol.chains?.length ?? 0) > 1 ? (
              <Metric
                label="Protocol-wide TVL"
                value={money(metadata?.protocol_tvl_all_chains_usd)}
                detail={`${protocol.chains?.length} chains · distinct scope`}
              />
            ) : (
              <Metric
                label="Stellar yield pools"
                value={String(pools.length)}
                detail="Exact protocol matches in the captured feed"
              />
            )}
            <Metric label="Category" value={protocol.category} detail="Source classification" />
          </Card>
          {pools.length > 0 && <YieldOpportunities protocol={protocol} pools={pools} />}
          {venue && <Capabilities venue={venue} />}
          <Panel title="Protocol overview" action={<External url={sourceUrl}>DeFiLlama protocol</External>}>
            <Facts rows={overview} />
            <p className="protocol-note mt-6">
              Percentage changes cover the protocol across all chains. Values retain their source definitions.
            </p>
          </Panel>
          <RavenResearch context={context} />
        </div>
        <aside className="protocol-stack protocol-sidebar" aria-label="Protocol references">
          <Panel title="Explore this protocol">
            <div className="protocol-identity">
              <ProtocolLogo name={protocol.name} fallback={protocol.logo} />
              <div>
                <strong>{protocol.name}</strong>
                <small>{protocol.category}</small>
              </div>
            </div>
            <p className="protocol-muted mt-6">Explore source-reported opportunities and the protocol’s own website.</p>
            <div className="protocol-explore-actions">
              {pools.length ? (
                <a className="protocol-button protocol-primary" href="#protocol-yields">
                  View opportunities
                </a>
              ) : (
                <Link className="protocol-button protocol-primary" to="/earn">
                  View opportunities
                </Link>
              )}
              <External url={protocol.url || sourceUrl} className="protocol-button">
                Protocol website
              </External>
            </div>
          </Panel>
          <Panel title="Source boundaries">
            <p className="protocol-muted">
              TVL, yield pools and project context retain their own scope and observation dates. Research data does not
              establish executable capacity.
            </p>
            <div className="protocol-source-links">
              <External url={sourceUrl}>DeFiLlama protocol</External>
              {context?.project && <External url={context.project.url}>Scout project context</External>}
            </div>
          </Panel>
          <Panel title="Dependencies & controls" className="protocol-controls">
            <Facts
              compact
              rows={[
                ['Network', 'Stellar'],
                [
                  'Audit evidence',
                  metadata?.audit_links?.length
                    ? metadata.audit_links.map((url, index) => (
                        <External key={url} url={url}>
                          Source audit{(metadata.audit_links?.length ?? 0) > 1 ? ` ${index + 1}` : ''}
                        </External>
                      ))
                    : 'No report in this snapshot',
                ],
                ['Admin / upgrades', 'Not captured'],
                ['Oracle / liquidations', 'Not captured'],
                ['Observed', formatUtc(protocol.observedAt)],
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function YieldOpportunities({ protocol, pools }: { protocol: ProtocolRow; pools: YieldPoolRow[] }) {
  return (
    <Card className="protocol-yields" id="protocol-yields">
      <CardHeader>
        <div>
          <p className="protocol-eyebrow">Stellar · {pools.length} source pools</p>
          <CardTitle>
            <h2>Yield opportunities</h2>
          </CardTitle>
        </div>
        <External
          url={`https://defillama.com/yields?${new URLSearchParams({ protocol: protocol.name, chain: 'Stellar' })}`}
        >
          DeFiLlama yields
        </External>
      </CardHeader>
      <Table className="protocol-yield-table">
        <caption className="sr-only">{protocol.name} Stellar yield pools</caption>
        <TableHeader>
          <TableRow>
            {['Asset / pool', 'Pool TVL', 'APY', 'Base APY', '30d mean APY'].map((label) => (
              <TableHead key={label}>
                {label}
                {label === 'APY' && (
                  <Help label="About APY">
                    Annualized source-reported yield. Rates are variable; a historical mean is not a guaranteed future
                    return.
                  </Help>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pools.map((pool) => (
            <TableRow key={pool.id}>
              <TableCell>
                <strong>
                  <External url={`https://defillama.com/yields/pool/${encodeURIComponent(pool.id)}`}>
                    {pool.symbol}
                  </External>
                </strong>
                <small>{pool.meta || protocol.name}</small>
              </TableCell>
              <TableCell>{money(pool.tvlUsd)}</TableCell>
              <TableCell>{rate(pool.totalApyPct)}</TableCell>
              <TableCell>{rate(pool.baseApyPct)}</TableCell>
              <TableCell>{rate(pool.mean30dApyPct)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="protocol-panel-note">
        <p>
          DeFiLlama snapshot · {formatUtc(pools[0]?.observedAt ?? protocol.observedAt)}. Rates are variable; — means not
          reported.
        </p>
        <p>These are source-reported yields. Pool TVL does not establish available deposit or withdrawal capacity.</p>
      </div>
    </Card>
  );
}

function Capabilities({ venue }: { venue: ProtocolVenue }) {
  const lending = venue.category === 'Lending';
  const spot = venue.category === 'Spot';
  const role =
    venue.id === 'gami'
      ? 'Curator · products accessed through Upshift'
      : venue.id === 'sentora'
        ? 'Product / campaign · confirm the canonical deployment'
        : venue.id === 'upshift'
          ? 'Platform · curators and underlying venues are separate roles'
          : venue.type;
  return (
    <Panel title="Markets & capabilities" className="protocol-capabilities">
      <div className="protocol-market-intro">
        <strong>{venue.assets}</strong>
        <span className="protocol-status">Amount-specific verification required</span>
      </div>
      <Facts
        rows={[
          ['Product role', role],
          ['Actions in the integration design', venue.actions.join(' · ')],
          [spot ? 'Quotes & routes' : 'Rates & capacity', 'Fresh, amount-specific adapter reads required.'],
          ['State source', venue.source],
          [
            'Network & identity',
            'Stellar Mainnet · verify deployment, asset issuer and contract before use. Testnet is a separate scope.',
          ],
          ['Withdrawal & settlement', venue.exit],
        ]}
      />
      <details className="protocol-readable">
        <summary>What Nest can inspect · {venue.reads.length} read groups</summary>
        <ul>
          {venue.reads.map((read) => (
            <li key={read}>{read}</li>
          ))}
        </ul>
      </details>
      {['gami', 'sentora', 'upshift'].includes(venue.id) && (
        <div className="protocol-related">
          <span>Related roles</span>
          {(venue.id === 'upshift' ? ['gami-labs', 'stellar-defi-hub'] : ['upshift']).map((slug) => (
            <Link key={slug} to="/protocols/$protocolId" params={{ protocolId: slug }}>
              {findProtocol(slug)?.name ?? slug} ↗
            </Link>
          ))}
        </div>
      )}
      <div className="protocol-market-actions">
        {spot ? (
          <Link className="protocol-button" to="/trade">
            Compare swap routes ↗
          </Link>
        ) : lending ? (
          <>
            <Link className="protocol-button" to="/credit/supply">
              Compare supply ↗
            </Link>
            <Link className="protocol-button" to="/credit">
              Compare borrowing ↗
            </Link>
          </>
        ) : (
          <Link className="protocol-button" to="/earn">
            Compare vault products ↗
          </Link>
        )}
        <Link
          className="protocol-button"
          to="/chat"
          search={{ ask: `Help me research ${venue.name} markets and execution requirements.` }}
        >
          Discuss in chat ↗
        </Link>
      </div>
      <p className="protocol-note">
        Integration design metadata applies to verified markets only. Curator, platform and underlying exposure are not
        additive positions. Current rates, liquidity and native risk require a fresh quote.
      </p>
    </Panel>
  );
}

function RavenResearch({ context }: { context: ProtocolContext | undefined }) {
  const project = context?.project;
  const facts: [string, ReactNode][] = [];
  if (project?.status)
    facts.push([
      'Project status',
      <>
        <External url={project.statusSourceUrl}>{project.status}</External>
        <small>As of {date(project.statusAsOf)}</small>
      </>,
    ]);
  if (project?.builtBy?.name) facts.push(['Built by', project.builtBy.name]);
  if (project?.types?.length) facts.push(['Project focus', project.types.join(' · ')]);
  if (project?.scfAwarded)
    facts.push([
      'SCF funding · project',
      <>
        <External url={project.scfSourceUrl}>
          {project.scfTotalAwardedUSD == null
            ? 'Award reported · amount not disclosed'
            : money(project.scfTotalAwardedUSD)}
        </External>
        <small>Source record · {date(project.scfAsOf)}</small>
      </>,
    ]);
  return (
    <Panel title="Raven research" action={project && <External url={project.url}>Scout project</External>}>
      {project ? (
        <>
          <div className="protocol-context-heading">
            <span className="protocol-eyebrow">Scout / {project.name}</span>
            <span className="protocol-note">{date(context?.observed_at)} snapshot</span>
          </div>
          {context?.scope === 'project_family' && (
            <p className="protocol-scope protocol-note">
              Project context: {project.name}. These references can cover other versions or products in the same
              project.
            </p>
          )}
          <p className="protocol-project-summary">{project.shortDescription}</p>
          <Facts rows={facts} />
          {project.statusCaveat && <p className="protocol-note mt-6">{project.statusCaveat}</p>}
          <div className="protocol-source-links">
            {Object.entries(project.links ?? {})
              .filter(([key]) => key !== 'website')
              .map(([key, url]) => (
                <External key={key} url={url}>
                  {{ github: 'GitHub', twitter: 'X', discord: 'Discord', docs: 'Documentation' }[key] ?? key}
                </External>
              ))}
          </div>
          {context && context.audits.length > 0 && (
            <References title="Project audit references" count={context.audits.length}>
              <ul>
                {context.audits.map((audit) => (
                  <li key={audit.reportUrl}>
                    <External url={audit.reportUrl}>{audit.title}</External>
                    <small>
                      {audit.auditor || 'Auditor not supplied'} · Portal date {date(audit.publishedAt)}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="protocol-note">
                Project-level registry entries; check the audited code and version. A report listing is not a safety
                rating.
              </p>
            </References>
          )}
          {context && context.repos.length > 0 && (
            <References title="Repositories" count={context.repos.length}>
              <ul>
                {context.repos.map((repo) => (
                  <li key={repo.url}>
                    <External url={repo.url}>{repo.fullName}</External>
                    <small>
                      {repo.primaryLanguage || 'Language not supplied'} · Last commit {date(repo.lastCommitAt)}
                    </small>
                  </li>
                ))}
              </ul>
            </References>
          )}
          {context && context.contracts.length > 0 && (
            <References title="Source-reported contracts" count={context.contracts.length}>
              <p className="protocol-note">
                Project-level references · {date(context.contracts_as_of)}. Verify network and deployment before use.
              </p>
              <ul>
                {context.contracts.map((contract) => (
                  <li key={contract.address}>
                    <External url={`https://stellar.expert/explorer/public/contract/${contract.address}`}>
                      {contract.label || 'Contract'}
                    </External>
                    <small className="font-mono">{contract.address}</small>
                  </li>
                ))}
              </ul>
            </References>
          )}
        </>
      ) : (
        <p className="protocol-muted">
          No verified project match in the retrieved Scout results. The available DeFiLlama facts are shown above.
        </p>
      )}
      <p className="protocol-note mt-5">
        Scout is a Raven source family. This dated snapshot was read from Scout’s public API; it does not establish a
        live MCP connection.
      </p>
    </Panel>
  );
}

function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <span>
        {label}
        {label === 'Stellar TVL' && (
          <Help label="About Stellar TVL">
            The reported Stellar component of this protocol’s TVL, with the observation date shown below.
          </Help>
        )}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger className="protocol-help" aria-label={label}>
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="text-xs leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}

function Facts({ rows, compact = false }: { rows: [string, ReactNode][]; compact?: boolean }) {
  return (
    <dl className={compact ? 'protocol-facts protocol-facts-compact' : 'protocol-facts'}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function References({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="protocol-references">
      <summary>
        {title}
        <span>{count}</span>
      </summary>
      {children}
    </details>
  );
}

function External({
  url,
  children,
  className = '',
}: {
  url: string | undefined | null;
  children: ReactNode;
  className?: string;
}) {
  const safe = safeResearchUrl(url ?? '');
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer" className={className}>
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}

function money(value: number | null | undefined) {
  return value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
}

function rate(value: number | null | undefined) {
  return value == null
    ? '—'
    : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 5 : 2 }).format(value)}%`;
}

function date(value: string | number | null | undefined) {
  return value == null
    ? 'Not supplied'
    : new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
