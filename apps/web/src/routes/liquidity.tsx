import { type AquariusPool, aquariusBase } from '@nest/data/aquarius';
import type { VaultStrategy } from '@nest/data/vault-strategies';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nest/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { DecimalField } from '../components/financial-draft.tsx';
import { VaultStrategyAside, VaultStrategyMain } from '../components/vault-strategy.tsx';
import { EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { formatUsd, formatUtc } from '../lib/format.ts';
import { useLiquidityPools } from '../lib/liquidity.ts';
import { EarnPage } from './earn.tsx';

export function LiquidityPage() {
  return <EarnPage initialCategory="Liquidity" />;
}

export function LiquidityDetailPage({ poolId }: { poolId: string }) {
  const query = useLiquidityPools();
  const pool = query.data?.pools.find((item) => item.id === poolId);
  if (query.isPending) return <p role="status">Loading pool…</p>;
  if (!pool)
    return (
      <EmptyState title="Pool unavailable" description="This pool is not in the current network’s two-asset catalog.">
        <Link to="/earn">All opportunities</Link>
      </EmptyState>
    );
  const strategy = liquidityStrategy(pool);
  const reward =
    pool.aquaAprPct === null || pool.incentiveAprPct === null ? null : pool.aquaAprPct + pool.incentiveAprPct;
  const metrics = [
    { label: 'Reported TVL', value: pool.tvlUsd === null ? null : formatUsd(pool.tvlUsd) },
    { label: 'Reported APR', value: pool.totalAprPct === null ? null : apr(pool.totalAprPct) },
    { label: 'Fee APR', value: pool.feeAprPct === null ? null : apr(pool.feeAprPct) },
    { label: 'Rewards APR', value: reward === null ? null : apr(reward) },
  ].filter((metric) => metric.value !== null);
  const sources = {
    aquarius: { label: 'Aquarius · pool data', url: `${aquariusBase(pool.network)}/pools/${pool.contractId}/` },
    terms: { label: 'Aquarius · risks', url: 'https://aqua.network/terms/' },
    migration: {
      label: 'Aquarius · token migrations',
      url: 'https://docs.aqua.network/amm-and-pools/system-limitations/aquarius-amm-token-address-migration-limitations-and-mitigation-strategy',
    },
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link to="/earn" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" />
        Earn
      </Link>
      <PageHeader title={pair(pool)} kicker="Aquarius / Liquidity" description={strategy.description} />
      <p className="text-xs text-muted-foreground">
        {pool.network} indexed observation · retrieved {formatUtc(pool.retrievedAt)} · pool verification pending
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-5">
          {metrics.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <StatCard key={metric.label} label={metric.label} value={metric.value ?? ''} />
              ))}
            </div>
          )}
          <VaultStrategyMain
            strategy={strategy}
            sources={sources}
            capturedAt={pool.retrievedAt}
            network={pool.network}
          />
        </div>
        <aside className="min-w-0 space-y-5">
          <LiquidityTicket pool={pool} />
          <VaultStrategyAside strategy={strategy} />
        </aside>
      </div>
    </div>
  );
}

function liquidityStrategy(pool: AquariusPool): VaultStrategy {
  const facts = [
    { label: 'Deposit assets', value: pair(pool), sourceId: 'aquarius' },
    { label: 'Pool type', value: pool.type === 'stable' ? 'Stable-swap' : 'Constant product', sourceId: 'aquarius' },
    { label: 'Pool index', value: pool.poolHash, sourceId: 'aquarius' },
  ];
  if (pool.volume24hUsd !== null)
    facts.push({ label: '24h volume', value: formatUsd(pool.volume24hUsd), sourceId: 'aquarius' });
  if (pool.aquaAprPct !== null)
    facts.push({ label: 'AQUA rewards APR', value: apr(pool.aquaAprPct), sourceId: 'aquarius' });
  if (pool.incentiveAprPct !== null)
    facts.push({ label: 'Other incentives APR', value: apr(pool.incentiveAprPct), sourceId: 'aquarius' });
  return {
    description: `Provide ${pool.tokens[0].symbol} and ${pool.tokens[1].symbol} to an Aquarius ${pool.type === 'stable' ? 'stable-swap' : 'constant-product'} pool. Trading fees accrue in pool value; AQUA and other incentives are separate.`,
    scope: 'product',
    sourceIds: ['aquarius', 'terms', 'migration'],
    facts,
    risks: [
      { category: 'Market', text: 'Token price changes can reduce the value of deposited assets.', sourceId: 'terms' },
      {
        category: 'System',
        text: 'Pool token addresses are fixed. A token migration can require withdrawing and moving to a new pool.',
        sourceId: 'migration',
      },
    ],
    counterparties: [{ name: 'Aquarius', role: 'AMM venue', sourceId: 'aquarius' }],
    fees: [{ label: 'Swap fee tier', value: `${pool.feeBps / 100}%`, sourceId: 'aquarius' }],
    contracts: [
      { label: 'Pool contract', value: pool.contractId, sourceId: 'aquarius' },
      { label: 'Router', value: pool.routerContractId, sourceId: 'aquarius' },
      ...pool.tokens.map((token) => ({
        label: `${token.symbol} token`,
        value: token.contractId,
        sourceId: 'aquarius',
      })),
      ...(pool.shareContractId ? [{ label: 'LP share token', value: pool.shareContractId, sourceId: 'aquarius' }] : []),
    ],
  };
}

function LiquidityTicket({ pool }: { pool: AquariusPool }) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [shares, setShares] = useState('');
  return (
    <Card className="min-w-0 self-start lg:sticky lg:top-24">
      <CardHeader>
        <CardTitle>Manage liquidity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs defaultValue="add">
          <TabsList className="h-auto">
            <TabsTrigger value="add" className="min-h-11">
              Add
            </TabsTrigger>
            <TabsTrigger value="remove" className="min-h-11">
              Remove
            </TabsTrigger>
          </TabsList>
          <TabsContent value="add" className="space-y-4 pt-3">
            <DecimalField label="Maximum contribution" unit={pool.tokens[0].symbol} value={first} onChange={setFirst} />
            <DecimalField
              label="Maximum contribution"
              unit={pool.tokens[1].symbol}
              value={second}
              onChange={setSecond}
            />
            <p className="text-xs text-muted-foreground">
              Both amounts are budgets. A simulation must show actual usage, unused amounts and minimum LP shares.
            </p>
            <ExitTiming />
            <Button disabled className="min-h-11 w-full">
              Review addition
            </Button>
          </TabsContent>
          <TabsContent value="remove" className="space-y-4 pt-3">
            <DecimalField label="LP shares to remove" unit="LP shares" value={shares} onChange={setShares} />
            <p className="text-xs text-muted-foreground">
              An owned share balance is required. Review the expected receipt and a separate minimum for each token.
              Rewards are not claimed with this withdrawal.
            </p>
            <ExitTiming />
            <Button disabled className="min-h-11 w-full">
              Review removal
            </Button>
          </TabsContent>
        </Tabs>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pool verification, balances, simulation and wallet approval are required before transactions are available.
        </p>
        <a
          href={`https://${pool.network === 'testnet' ? 'testnet.' : ''}aqua.network/pools/${pool.contractId}/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"
        >
          View on Aquarius
          <ArrowUpRight className="size-4" />
        </a>
      </CardContent>
    </Card>
  );
}

function ExitTiming() {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
      <p className="mb-1 font-semibold">Withdrawal timing</p>
      <p>
        Exit timing is unverified. Pool state, liquidity and token transfer restrictions must be checked before review.
      </p>
    </div>
  );
}

function pair(pool: AquariusPool) {
  return pool.tokens.map((token) => token.symbol).join(' / ');
}
function apr(value: number | null) {
  return value === null
    ? '—'
    : value > 0 && value < 0.01
      ? '<0.01%'
      : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}
