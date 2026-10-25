import { z } from 'zod';

const CONTRACT = z.string().regex(/^C[A-Z2-7]{55}$/);
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const DECIMAL = z.string().regex(/^\d+(?:\.\d+)?$/);
const VALUE = z.number().finite().nonnegative().nullable();
const NetworkSchema = z.enum(['mainnet', 'testnet']);
const ExternalPoolSchema = z
  .object({
    index: HASH,
    address: CONTRACT,
    tokens_addresses: z.array(CONTRACT).min(2).max(8),
    tokens_str: z.array(z.string().min(1)).min(2).max(8),
    pool_type: z.string().min(1),
    fee: DECIMAL.refine((value) => Number(value) < 1),
  })
  .refine((pool) => pool.tokens_addresses.length === pool.tokens_str.length);
const IndexedPoolSchema = z.object({
  index: HASH,
  address: CONTRACT,
  tokens_addresses: z.array(CONTRACT),
  pool_type: z.string(),
  fee: DECIMAL,
  share_token_address: CONTRACT.nullish(),
  share_token_decimals: z.int().min(0).max(38).nullish(),
  liquidity_usd: DECIMAL.nullish(),
  volume_usd: DECIMAL.nullish(),
  apy: DECIMAL.nullish(),
  rewards_apy: DECIMAL.nullish(),
  incentive_apy: DECIMAL.nullish(),
  total_apy: DECIMAL.nullish(),
  deposit_killed: z.boolean().nullish(),
  version: z.int().nonnegative().nullish(),
});
export const AquariusPoolSchema = z.object({
  id: z.string().regex(/^aquarius-c[a-z2-7]{55}$/),
  network: NetworkSchema,
  contractId: CONTRACT,
  poolHash: HASH,
  routerContractId: CONTRACT,
  type: z.enum(['volatile', 'stable']),
  feeBps: z.number().finite().nonnegative().max(10_000),
  tokens: z.tuple([
    z.object({ contractId: CONTRACT, identity: z.string(), symbol: z.string() }),
    z.object({ contractId: CONTRACT, identity: z.string(), symbol: z.string() }),
  ]),
  shareContractId: CONTRACT.nullable(),
  shareDecimals: z.int().min(0).max(38).nullable(),
  tvlUsd: VALUE,
  volume24hUsd: VALUE,
  feeAprPct: VALUE,
  aquaAprPct: VALUE,
  incentiveAprPct: VALUE,
  totalAprPct: VALUE,
  measurementWindow: z.literal(null),
  upstreamAsOf: z.literal(null),
  retrievedAt: z.iso.datetime(),
  depositPaused: z.boolean().nullable(),
  version: z.int().nonnegative().nullable(),
  executable: z.literal(false),
  verification: z.literal('unverified'),
});
export const AquariusSnapshotSchema = z.object({
  schemaVersion: z.literal('nest.aquarius.pools.v1'),
  network: NetworkSchema,
  retrievedAt: z.iso.datetime(),
  upstreamAsOf: z.literal(null),
  sourceUrl: z.url(),
  statisticsUrl: z.url(),
  indexedPoolCount: z.int().nonnegative(),
  excludedPoolCount: z.int().nonnegative(),
  eligiblePoolCount: z.int().nonnegative(),
  omittedPoolCount: z.int().nonnegative(),
  selection: z.literal('top_tvl'),
  limit: z.literal(15),
  statisticsAvailable: z.boolean(),
  pools: z.array(AquariusPoolSchema).max(15),
});

export type AquariusPool = z.infer<typeof AquariusPoolSchema>;
export type AquariusSnapshot = z.infer<typeof AquariusSnapshotSchema>;
export type AquariusNetwork = z.infer<typeof NetworkSchema>;

export function parseAquariusPage(input: unknown) {
  return z
    .object({
      count: z.int().nonnegative().max(500),
      next: z.url().nullable(),
      results: z.array(ExternalPoolSchema).max(100),
    })
    .parse(input);
}

export function parseAquariusStatisticsPage(input: unknown) {
  return z
    .object({
      total: z.int().nonnegative().max(500),
      pages: z.int().nonnegative().max(50),
      items: z.array(IndexedPoolSchema).max(100),
    })
    .parse(input);
}

export function rankAquariusPoolCandidates(input: unknown[]) {
  const statistics = z.array(IndexedPoolSchema).max(500).parse(input);
  const eligible = statistics.filter(
    (pool) => pool.tokens_addresses.length === 2 && ['constant_product', 'stable'].includes(pool.pool_type),
  );
  return {
    indexedPoolCount: statistics.length,
    eligiblePoolCount: eligible.length,
    addresses: eligible
      .filter((pool) => scaled(pool.liquidity_usd, 1e7) !== null && Number(pool.liquidity_usd) > 0)
      .sort((a, b) => Number(b.liquidity_usd) - Number(a.liquidity_usd))
      .slice(0, 30)
      .map((pool) => pool.address),
  };
}

export function makeAquariusSnapshot(
  external: unknown[],
  statistics: unknown[] | null,
  network: AquariusNetwork,
  retrievedAt: string,
): AquariusSnapshot {
  const catalog = z.array(ExternalPoolSchema).max(500).parse(external);
  const indexed = statistics === null ? [] : z.array(IndexedPoolSchema).max(500).parse(statistics);
  if (new Set(catalog.map((pool) => pool.address)).size !== catalog.length) throw new Error('Duplicate pool identity.');
  if (new Set(indexed.map((pool) => pool.address)).size !== indexed.length)
    throw new Error('Duplicate pool statistics.');
  const base = aquariusBase(network);
  const pools: AquariusPool[] = [];
  for (const pool of catalog) {
    if (pool.tokens_addresses.length !== 2 || !['constant_product', 'stable'].includes(pool.pool_type)) continue;
    const stat = indexed.find((row) => row.address === pool.address);
    const matched =
      stat &&
      stat.index === pool.index &&
      stat.pool_type === pool.pool_type &&
      Number(stat.fee) === Number(pool.fee) &&
      stat.tokens_addresses.join(',') === pool.tokens_addresses.join(',')
        ? stat
        : null;
    const tokens = pool.tokens_addresses.map((contractId, index) => {
      const identity = pool.tokens_str[index] ?? contractId;
      return { contractId, identity, symbol: identity === 'native' ? 'XLM' : (identity.split(':')[0] ?? identity) };
    });
    const first = tokens[0];
    const second = tokens[1];
    if (!first || !second || first.contractId === second.contractId) throw new Error('Invalid pool token order.');
    pools.push({
      id: `aquarius-${pool.address.toLowerCase()}`,
      network,
      contractId: pool.address,
      poolHash: pool.index,
      routerContractId:
        network === 'mainnet'
          ? 'CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK'
          : 'CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD',
      type: pool.pool_type === 'stable' ? 'stable' : 'volatile',
      feeBps: Number(pool.fee) * 10_000,
      tokens: [first, second],
      shareContractId: matched?.share_token_address ?? null,
      shareDecimals: matched?.share_token_decimals ?? null,
      tvlUsd: scaled(matched?.liquidity_usd, 1e7),
      volume24hUsd: scaled(matched?.volume_usd, 1e7),
      feeAprPct: scaled(matched?.apy, 0.01),
      aquaAprPct: scaled(matched?.rewards_apy, 0.01),
      incentiveAprPct: scaled(matched?.incentive_apy, 0.01),
      totalAprPct: scaled(matched?.total_apy, 0.01),
      measurementWindow: null,
      upstreamAsOf: null,
      retrievedAt,
      depositPaused: matched?.deposit_killed ?? null,
      version: matched?.version ?? null,
      executable: false,
      verification: 'unverified',
    });
  }
  const featured = pools
    .filter((pool) => pool.tvlUsd !== null && pool.tvlUsd > 0)
    .sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1))
    .slice(0, 15);
  return AquariusSnapshotSchema.parse({
    schemaVersion: 'nest.aquarius.pools.v1',
    network,
    retrievedAt,
    upstreamAsOf: null,
    sourceUrl: `${base}/api/external/v2/pools/`,
    statisticsUrl: `${base}/pools/`,
    indexedPoolCount: catalog.length,
    excludedPoolCount: catalog.length - pools.length,
    eligiblePoolCount: pools.length,
    omittedPoolCount: pools.length - featured.length,
    selection: 'top_tvl',
    limit: 15,
    statisticsAvailable: statistics !== null,
    pools: featured,
  });
}

export function aquariusBase(network: AquariusNetwork): string {
  return network === 'mainnet' ? 'https://amm-api.aqua.network' : 'https://amm-api-testnet.aqua.network';
}

function scaled(value: string | null | undefined, divisor: number): number | null {
  if (value === null || value === undefined) return null;
  const result = Number(value) / divisor;
  return Number.isFinite(result) ? result : null;
}
