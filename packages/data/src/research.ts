import { z } from 'zod';

const NUMBER_OR_NULL = z.number().finite().nullable();

const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  attribution: z.string(),
  live: z.literal(false),
});

const SnapshotSchema = z.object({
  schema_version: z.literal('nest.stellar.research.ui.v1'),
  chain: z.literal('Stellar'),
  live: z.literal(false),
  executable: z.literal(false),
  constraints: z.array(z.string()),
  sources: z.object({
    rwa_xyz_stellar: SourceSchema.extend({ capturedAt: z.iso.datetime() }),
    defillama_stellar: SourceSchema.extend({ captured_at: z.iso.datetime() }),
  }),
  defillama: z.object({
    summary: z.object({
      chain_defi_tvl_usd: z.number().finite(),
      dex_volume_24h_usd: NUMBER_OR_NULL,
      fees_24h_usd: NUMBER_OR_NULL,
      stablecoin_value_usd_by_peg: z.record(z.string(), z.number().finite()),
    }),
    protocols: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        category: z.string(),
        url: z.string(),
        logo: z.string(),
        stellar_tvl_usd: NUMBER_OR_NULL,
        protocol_change_pct: z.object({
          scope: z.string(),
          '1d': NUMBER_OR_NULL.optional(),
          '7d': NUMBER_OR_NULL.optional(),
        }),
        source_id: z.string(),
        observed_at: z.iso.datetime(),
        executable: z.literal(false),
      }),
    ),
    yield_pools: z.array(
      z.object({
        pool_id: z.string(),
        project: z.string(),
        symbol: z.string(),
        pool_meta: z.string().nullable(),
        tvl_usd: NUMBER_OR_NULL,
        total_apy_pct: NUMBER_OR_NULL,
        base_apy_pct: NUMBER_OR_NULL,
        reward_apy_pct: NUMBER_OR_NULL,
        observed_at: z.iso.datetime(),
      }),
    ),
  }),
  rwa: z.object({
    networkMetrics: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        display: z.string(),
        change30dPercent: NUMBER_OR_NULL.optional(),
        unit: z.string(),
        rounded: z.boolean(),
      }),
    ),
    caveats: z.array(z.string()),
  }),
});

export interface ResearchSource {
  id: string;
  name: string;
  url: string;
  attribution: string;
  capturedAt: string;
}

export interface ProtocolRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  url: string;
  logo: string;
  stellarTvlUsd: number | null;
  /** DefiLlama reports these changes for the protocol across all chains, not for Stellar alone. */
  change: { scope: string; day: number | null; week: number | null };
  observedAt: string;
}

export interface YieldPoolRow {
  id: string;
  project: string;
  symbol: string;
  meta: string | null;
  tvlUsd: number | null;
  totalApyPct: number | null;
  baseApyPct: number | null;
  rewardApyPct: number | null;
  observedAt: string;
}

export interface RwaMetric {
  key: string;
  label: string;
  display: string;
  change30dPercent: number | null;
  unit: string;
  rounded: boolean;
}

/** A dated research observation for display. It is never live data and never authorizes an action. */
export interface ResearchSnapshot {
  live: false;
  executable: false;
  sources: { defillama: ResearchSource; rwa: ResearchSource };
  chain: {
    defiTvlUsd: number;
    dexVolume24hUsd: number | null;
    fees24hUsd: number | null;
    stablecoinUsdByPeg: Record<string, number>;
  };
  protocols: ProtocolRow[];
  yieldPools: YieldPoolRow[];
  rwaMetrics: RwaMetric[];
  caveats: string[];
}

export function parseResearchSnapshot(input: unknown): ResearchSnapshot {
  const data = SnapshotSchema.parse(input);
  const { defillama_stellar: defillama, rwa_xyz_stellar: rwa } = data.sources;
  return {
    live: false,
    executable: false,
    sources: {
      defillama: { ...pickSource(defillama), capturedAt: defillama.captured_at },
      rwa: { ...pickSource(rwa), capturedAt: rwa.capturedAt },
    },
    chain: {
      defiTvlUsd: data.defillama.summary.chain_defi_tvl_usd,
      dexVolume24hUsd: data.defillama.summary.dex_volume_24h_usd,
      fees24hUsd: data.defillama.summary.fees_24h_usd,
      stablecoinUsdByPeg: data.defillama.summary.stablecoin_value_usd_by_peg,
    },
    protocols: data.defillama.protocols.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      url: row.url,
      logo: row.logo,
      stellarTvlUsd: row.stellar_tvl_usd,
      change: {
        scope: row.protocol_change_pct.scope,
        day: row.protocol_change_pct['1d'] ?? null,
        week: row.protocol_change_pct['7d'] ?? null,
      },
      observedAt: row.observed_at,
    })),
    yieldPools: data.defillama.yield_pools.map((row) => ({
      id: row.pool_id,
      project: row.project,
      symbol: row.symbol,
      meta: row.pool_meta,
      tvlUsd: row.tvl_usd,
      totalApyPct: row.total_apy_pct,
      baseApyPct: row.base_apy_pct,
      rewardApyPct: row.reward_apy_pct,
      observedAt: row.observed_at,
    })),
    rwaMetrics: data.rwa.networkMetrics.map((metric) => ({
      ...metric,
      change30dPercent: metric.change30dPercent ?? null,
    })),
    caveats: [...data.constraints, ...data.rwa.caveats],
  };
}

function pickSource(source: z.infer<typeof SourceSchema>) {
  return { id: source.id, name: source.name, url: source.url, attribution: source.attribution };
}
