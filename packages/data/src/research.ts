import { z } from 'zod';

const NUMBER_OR_NULL = z.number().finite().nullable();
const HTTP_URL = z.url().refine((value) => /^https?:\/\//i.test(value));
const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: HTTP_URL,
  attribution: z.string(),
  live: z.literal(false),
});
const RwaAssetSchema = z.object({
  identity: z.string().min(1),
  name: z.string(),
  ticker: z.string(),
  assetUrl: HTTP_URL.nullable(),
  manager: z.string().nullable(),
  totalValueDisplay: z.string(),
  holdersDisplay: z.string(),
  assetClass: z.string(),
  tokenizationType: z.string(),
  platform: z.string(),
  platformUrl: HTTP_URL.nullable(),
  domicile: z.string().nullable(),
  regulatoryFramework: z.string().nullable(),
  contractLabel: z.string(),
  contractExplorerUrl: HTTP_URL.nullable(),
  observed_at: z.iso.datetime(),
  executable: z.literal(false),
  asset_identity_verified: z.literal(false),
});
const LeagueSchema = z.object({
  assetType: z.enum(['distributed', 'represented', 'all']),
  groupBy: z.enum(['platform', 'assetClass', 'manager']),
  coverageNote: z.string().nullable(),
  rows: z.array(
    z.object({
      rankDisplay: z.string().nullable(),
      entityDisplay: z.string().nullable(),
      entityLinks: z.array(z.object({ text: z.string(), href: HTTP_URL })),
      rwaCountDisplay: z.string().nullable(),
      totalValueDisplay: z.string().nullable(),
      change30dDisplay: z.string().nullable(),
      marketShareDisplay: z.string().nullable(),
      executable: z.literal(false),
    }),
  ),
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
        symbol: z.string().nullable().optional(),
        protocol_chains: z.array(z.string()).optional(),
        url: z.string(),
        logo: z.string(),
        stellar_tvl_usd: NUMBER_OR_NULL,
        protocol_change_pct: z.object({
          scope: z.literal('protocol_all_chains'),
          '1d': NUMBER_OR_NULL.optional(),
          '7d': NUMBER_OR_NULL.optional(),
        }),
        observed_at: z.iso.datetime(),
        executable: z.literal(false),
      }),
    ),
    yield_pools: z.array(
      z.object({
        pool_id: z.string(),
        chain: z.literal('Stellar'),
        project: z.string(),
        symbol: z.string(),
        pool_meta: z.string().nullable(),
        tvl_usd: NUMBER_OR_NULL,
        total_apy_pct: NUMBER_OR_NULL,
        base_apy_pct: NUMBER_OR_NULL,
        reward_apy_pct: NUMBER_OR_NULL,
        base_borrow_apy_pct: NUMBER_OR_NULL,
        reward_borrow_apy_pct: NUMBER_OR_NULL,
        available_borrow_usd: NUMBER_OR_NULL,
        ltv: NUMBER_OR_NULL,
        underlying_tokens: z.array(z.string()),
        observed_at: z.iso.datetime(),
        executable: z.literal(false),
        asset_identity_verified: z.literal(false),
      }),
    ),
    stablecoin_assets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        peg_type: z.string(),
        peg_mechanism: z.string(),
        reference_price_usd: NUMBER_OR_NULL,
        stellar_circulating_by_peg: z.object({ current: z.record(z.string(), z.number().finite()) }),
        observed_at: z.iso.datetime(),
        executable: z.literal(false),
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
    assets: z.array(RwaAssetSchema),
    leagueTables: z.array(LeagueSchema),
    caveats: z.array(z.string()),
  }),
});
const CatalogSchema = z.object({
  source: HTTP_URL,
  revision: z.string(),
  generatedAt: z.iso.datetime(),
  capturedAt: z.iso.date(),
  runtimeVerified: z.literal(false),
  counts: z.object({
    operation: z.number().int().nonnegative(),
    skill: z.number().int().nonnegative(),
    'skill-section': z.number().int().nonnegative(),
  }),
  entries: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['operation', 'skill']),
      family: z.string(),
      summary: z.string(),
      parameters: z.array(z.string()),
      source: HTTP_URL,
      sourceFetchedAt: z.iso.datetime(),
      sections: z.array(z.string()),
    }),
  ),
});
const HistorySchema = z.object({
  chain: z.literal('Stellar'),
  captured_at: z.iso.datetime(),
  timeseries: z.object({
    defi_tvl: z.object({
      points: z.array(z.object({ timestamp_unix: z.number().int(), tvl_usd: z.number().finite() })),
    }),
    dex_volume: z.object({
      points: z.array(z.object({ timestamp_unix: z.number().int(), volume_usd: z.number().finite() })),
    }),
    stablecoin_value: z.object({
      points: z.array(
        z.object({ date: z.string().regex(/^\d+$/), totalCirculatingUSD: z.record(z.string(), z.number().finite()) }),
      ),
    }),
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
  symbol?: string | null;
  chains?: string[];
  url: string;
  logo: string;
  stellarTvlUsd: number | null;
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
  baseBorrowApyPct: number | null;
  rewardBorrowApyPct: number | null;
  availableBorrowUsd: number | null;
  ltv: number | null;
  underlyingTokens: string[];
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

export interface RwaAssetRow {
  id: string;
  name: string;
  ticker: string;
  assetUrl: string | null;
  manager: string | null;
  totalValueDisplay: string | null;
  holdersDisplay: string | null;
  assetClass: string;
  tokenizationType: string;
  platform: string;
  platformUrl: string | null;
  domicile: string | null;
  regulatoryFramework: string | null;
  contractLabel: string;
  contractExplorerUrl: string | null;
  observedAt: string;
}

export interface RwaLeagueTable {
  assetType: 'distributed' | 'represented' | 'all';
  groupBy: 'platform' | 'assetClass' | 'manager';
  coverageNote: string | null;
  rows: {
    name: string | null;
    url: string | null;
    countDisplay: string | null;
    valueDisplay: string | null;
    changeDisplay: string | null;
    shareDisplay: string | null;
  }[];
}

export interface StablecoinRow {
  id: string;
  name: string;
  symbol: string;
  peg: string;
  mechanism: string;
  referencePriceUsd: number | null;
  circulatingByPeg: Record<string, number>;
  observedAt: string;
}

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
  rwaAssets: RwaAssetRow[];
  rwaLeagueTables: RwaLeagueTable[];
  stablecoins: StablecoinRow[];
  caveats: string[];
}

export interface RavenCatalog {
  source: string;
  revision: string;
  generatedAt: string;
  capturedAt: string;
  runtimeVerified: false;
  counts: { operation: number; skill: number; 'skill-section': number };
  entries: {
    id: string;
    kind: 'operation' | 'skill';
    family: string;
    summary: string;
    parameters: string[];
    source: string;
    sourceFetchedAt: string;
    sections: string[];
  }[];
}

export interface ResearchHistory {
  capturedAt: string;
  series: { id: string; label: string; points: { timestamp: number; valueUsd: number }[] }[];
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
      symbol: row.symbol ?? null,
      chains: row.protocol_chains ?? [],
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
      baseBorrowApyPct: row.base_borrow_apy_pct,
      rewardBorrowApyPct: row.reward_borrow_apy_pct,
      availableBorrowUsd: row.available_borrow_usd,
      ltv: row.ltv,
      underlyingTokens: row.underlying_tokens,
      observedAt: row.observed_at,
    })),
    rwaMetrics: data.rwa.networkMetrics.map((metric) => ({
      ...metric,
      change30dPercent: metric.change30dPercent ?? null,
    })),
    rwaAssets: data.rwa.assets.map((row) => ({
      id: row.identity,
      name: row.name,
      ticker: row.ticker,
      assetUrl: row.assetUrl,
      manager: row.manager,
      totalValueDisplay: cleanDisplay(row.totalValueDisplay),
      holdersDisplay: cleanDisplay(row.holdersDisplay),
      assetClass: row.assetClass,
      tokenizationType: row.tokenizationType,
      platform: row.platform,
      platformUrl: row.platformUrl,
      domicile: row.domicile,
      regulatoryFramework: row.regulatoryFramework,
      contractLabel: row.contractLabel,
      contractExplorerUrl: row.contractExplorerUrl,
      observedAt: row.observed_at,
    })),
    rwaLeagueTables: data.rwa.leagueTables.map((table) => ({
      assetType: table.assetType,
      groupBy: table.groupBy,
      coverageNote: table.coverageNote,
      rows: table.rows.map((row) => ({
        name: row.entityDisplay,
        url: row.entityLinks[0]?.href ?? null,
        countDisplay: cleanDisplay(row.rwaCountDisplay),
        valueDisplay: cleanDisplay(row.totalValueDisplay),
        changeDisplay: cleanDisplay(row.change30dDisplay),
        shareDisplay: cleanDisplay(row.marketShareDisplay),
      })),
    })),
    stablecoins: data.defillama.stablecoin_assets.map((row) => ({
      id: row.id,
      name: row.name,
      symbol: row.symbol,
      peg: row.peg_type,
      mechanism: row.peg_mechanism,
      referencePriceUsd: row.reference_price_usd,
      circulatingByPeg: row.stellar_circulating_by_peg.current,
      observedAt: row.observed_at,
    })),
    caveats: [...data.constraints, ...data.rwa.caveats],
  };
}

export function parseRavenCatalog(input: unknown): RavenCatalog {
  const catalog = CatalogSchema.parse(input);
  const operations = catalog.entries.filter((entry) => entry.kind === 'operation').length;
  const skills = catalog.entries.filter((entry) => entry.kind === 'skill').length;
  const sections = catalog.entries.reduce((sum, entry) => sum + entry.sections.length, 0);
  if (
    operations !== catalog.counts.operation ||
    skills !== catalog.counts.skill ||
    sections !== catalog.counts['skill-section']
  ) {
    throw new Error('Catalog coverage does not match its declared counts.');
  }
  return catalog;
}

export function parseResearchHistory(input: unknown): ResearchHistory {
  const data = HistorySchema.parse(input);
  return {
    capturedAt: data.captured_at,
    series: [
      {
        id: 'tvl',
        label: 'DeFi TVL',
        points: data.timeseries.defi_tvl.points.map((point) => ({
          timestamp: point.timestamp_unix * 1000,
          valueUsd: point.tvl_usd,
        })),
      },
      {
        id: 'volume',
        label: 'DEX volume',
        points: data.timeseries.dex_volume.points.map((point) => ({
          timestamp: point.timestamp_unix * 1000,
          valueUsd: point.volume_usd,
        })),
      },
      {
        id: 'stablecoins',
        label: 'Stablecoin value',
        points: data.timeseries.stablecoin_value.points.map((point) => ({
          timestamp: Number(point.date) * 1000,
          valueUsd: Object.values(point.totalCirculatingUSD).reduce((sum, value) => sum + value, 0),
        })),
      },
    ],
  };
}

export function safeResearchUrl(value: string): string | null {
  const parsed = HTTP_URL.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function pickSource(source: z.infer<typeof SourceSchema>) {
  return { id: source.id, name: source.name, url: source.url, attribution: source.attribution };
}

function cleanDisplay(value: string | null): string | null {
  const display = value?.replace(/\s+/g, ' ').trim() ?? '';
  return display === '' || display === '—' ? null : display;
}
