import { type ProtocolRow, parseResearchSnapshot, type ResearchSource } from '@nest/data/research';
import { Badge } from '@nest/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nest/ui/components/tooltip';

import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };
import { formatPercentPoints, formatUsd, formatUtc, UNAVAILABLE } from '../lib/format.ts';

const research = parseResearchSnapshot(snapshotJson);
const protocols = [...research.protocols].sort(byStellarTvl);
const usdStablecoins = research.chain.stablecoinUsdByPeg.peggedUSD ?? null;

export function ResearchPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold">Research</h1>
        <p className="text-muted-foreground">Discovery, research, and execution across Stellar DeFi.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">Dated snapshot · not live</Badge>
          <SourceStamp source={research.sources.defillama} />
          <SourceStamp source={research.sources.rwa} />
        </div>
      </header>

      <section aria-labelledby="chain-metrics" className="flex flex-col gap-3">
        <h2 id="chain-metrics" className="text-2xl font-semibold">
          Stellar DeFi
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="DeFi TVL" value={formatUsd(research.chain.defiTvlUsd)} source="DefiLlama" />
          <Metric label="DEX volume, 24h" value={formatUsd(research.chain.dexVolume24hUsd)} source="DefiLlama" />
          <Metric label="Fees, 24h" value={formatUsd(research.chain.fees24hUsd)} source="DefiLlama" />
          <Metric label="USD stablecoins" value={formatUsd(usdStablecoins)} source="DefiLlama" />
        </div>
      </section>

      <section aria-labelledby="rwa-metrics" className="flex flex-col gap-3">
        <h2 id="rwa-metrics" className="text-2xl font-semibold">
          Real-world assets
        </h2>
        <p className="text-sm text-muted-foreground">
          RWA.xyz figures use their own definitions and can overlap with DeFi TVL, so they are never added to it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {research.rwaMetrics.map((metric) => (
            <Metric
              key={metric.key}
              label={metric.label}
              value={metric.display}
              source="RWA.xyz"
              detail={
                metric.change30dPercent === null
                  ? undefined
                  : `${formatPercentPoints(metric.change30dPercent)} over 30 days`
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="protocols" className="flex flex-col gap-3">
        <h2 id="protocols" className="text-2xl font-semibold">
          Protocols
        </h2>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocol</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stellar TVL</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help underline decoration-dotted" />}>
                      1d change
                    </TooltipTrigger>
                    <TooltipContent>DefiLlama reports this change for the protocol across all chains.</TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {protocols.map((protocol) => (
                <TableRow key={protocol.id}>
                  <TableCell>
                    <a href={protocol.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {protocol.name}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{protocol.category}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(protocol.stellarTvlUsd)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercentPoints(protocol.change.day)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="yield-pools" className="flex flex-col gap-3">
        <h2 id="yield-pools" className="text-2xl font-semibold">
          Yield pools
        </h2>
        <p className="text-sm text-muted-foreground">
          Discovery data only. Live rates and capacity come from each venue before any action.
        </p>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">TVL</TableHead>
                <TableHead className="text-right">Base APY</TableHead>
                <TableHead className="text-right">Reward APY</TableHead>
                <TableHead className="text-right">Total APY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {research.yieldPools.map((pool) => (
                <TableRow key={pool.id}>
                  <TableCell className="font-medium">{pool.project}</TableCell>
                  <TableCell>
                    {pool.symbol}
                    {pool.meta ? <span className="text-muted-foreground"> · {pool.meta}</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatUsd(pool.tvlUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {percentOrUnavailable(pool.baseApyPct)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {percentOrUnavailable(pool.rewardApyPct)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {percentOrUnavailable(pool.totalApyPct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="caveats" className="flex flex-col gap-3">
        <h2 id="caveats" className="text-2xl font-semibold">
          How to read this data
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {research.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  source,
  detail,
}: {
  label: string;
  value: string;
  source: string;
  detail?: string | undefined;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-xs text-subtle">
        {detail ? <span>{detail}</span> : null}
        <span>{source}</span>
      </CardContent>
    </Card>
  );
}

function SourceStamp({ source }: { source: ResearchSource }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
      {source.attribution}, captured {formatUtc(source.capturedAt)}
    </a>
  );
}

function byStellarTvl(left: ProtocolRow, right: ProtocolRow) {
  return (right.stellarTvlUsd ?? -1) - (left.stellarTvlUsd ?? -1);
}

function percentOrUnavailable(value: number | null) {
  // APYs are already percentages; only changes get a sign.
  return value === null ? UNAVAILABLE : `${value.toFixed(2)}%`;
}
