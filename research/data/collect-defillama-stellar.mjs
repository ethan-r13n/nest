import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const chain = 'Stellar';
const definitions = [
  ['chains', 'https://api.llama.fi/v2/chains'],
  ['protocols', 'https://api.llama.fi/protocols'],
  ['tvl_history', 'https://api.llama.fi/v2/historicalChainTvl/Stellar'],
  ['dex', 'https://api.llama.fi/overview/dexs/Stellar?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true'],
  ['fees', 'https://api.llama.fi/overview/fees/Stellar?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true'],
  ['yield_pools', 'https://yields.llama.fi/pools'],
  ['stablecoin_chains', 'https://stablecoins.llama.fi/stablecoinchains'],
  ['stablecoin_assets', 'https://stablecoins.llama.fi/stablecoins?includePrices=true'],
  ['stablecoin_history', 'https://stablecoins.llama.fi/stablecoincharts/Stellar'],
];

const records = {};
const sources = [];
for (let offset = 0; offset < definitions.length; offset += 3) {
  const results = await Promise.all(definitions.slice(offset, offset + 3).map(async ([id, url]) => {
    const observation = { id, url, observed_at: new Date().toISOString(), credential_required: false };
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      Object.assign(observation, {
        http_status: response.status,
        response_date: response.headers.get('date'),
        last_modified: response.headers.get('last-modified'),
        cache_control: response.headers.get('cache-control'),
        etag: response.headers.get('etag'),
        upstream_as_of: null,
      });
      if (!response.ok) return { observation, error: `HTTP_${response.status}` };
      return { observation, payload: await response.json() };
    } catch (error) {
      return { observation, error: error.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_ERROR' };
    }
  }));
  for (const result of results) {
    sources.push({ ...result.observation, status: result.error ? 'unavailable' : 'ok', error: result.error ?? null });
    if (!result.error) records[result.observation.id] = result.payload;
  }
}

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const array = value => Array.isArray(value) ? value : [];
const stablecoinChain = array(records.stablecoin_chains).find(row => row.name === chain) ?? null;
const chainRow = array(records.chains).find(row => row.name === chain) ?? null;
const sourceFor = id => sources.find(source => source.id === id);
const observed = id => sourceFor(id)?.observed_at ?? null;

const protocols = array(records.protocols)
  .filter(row => array(row.chains).includes(chain) || row.chain === chain || Object.hasOwn(row.chainTvls ?? {}, chain))
  .map(row => ({
    id: row.id,
    slug: row.slug ?? null,
    name: row.name,
    symbol: row.symbol ?? null,
    category: row.category ?? null,
    url: row.url ?? null,
    logo: row.logo ?? null,
    description: row.description ?? null,
    twitter: row.twitter ?? null,
    parent_protocol: row.parentProtocol ?? null,
    protocol_chains: row.chains ?? [],
    stellar_tvl_usd: finite(row.chainTvls?.Stellar),
    stellar_tvl_components_usd: Object.fromEntries(Object.entries(row.chainTvls ?? {}).filter(([key]) => key === chain || key.startsWith(`${chain}-`))),
    protocol_tvl_all_chains_usd: finite(row.tvl),
    protocol_change_pct: { scope: 'protocol_all_chains', '1h': finite(row.change_1h), '1d': finite(row.change_1d), '7d': finite(row.change_7d) },
    audits: row.audits ?? null,
    audit_links: row.audit_links ?? [],
    listed_at_unix: row.listedAt ?? null,
    source_id: 'protocols',
    observed_at: observed('protocols'),
    executable: false,
  })).sort((a, b) => (b.stellar_tvl_usd ?? -1) - (a.stellar_tvl_usd ?? -1));

const pools = array(records.yield_pools?.data).filter(row => row.chain === chain).map(row => ({
  pool_id: row.pool,
  chain: row.chain,
  project: row.project,
  symbol: row.symbol,
  pool_meta: row.poolMeta ?? null,
  tvl_usd: finite(row.tvlUsd),
  total_apy_pct: finite(row.apy),
  base_apy_pct: finite(row.apyBase),
  reward_apy_pct: finite(row.apyReward),
  reported_apy_change: { apyPct1D: finite(row.apyPct1D), apyPct7D: finite(row.apyPct7D), apyPct30D: finite(row.apyPct30D) },
  apy_mean_30d_pct: finite(row.apyMean30d),
  apy_base_7d_pct: finite(row.apyBase7d),
  apy_base_inception_pct: finite(row.apyBaseInception),
  reward_tokens: row.rewardTokens ?? [],
  underlying_tokens: row.underlyingTokens ?? [],
  stablecoin: row.stablecoin ?? null,
  impermanent_loss_risk: row.ilRisk ?? null,
  exposure: row.exposure ?? null,
  provider_predictions: row.predictions ?? null,
  provider_outlier: row.outlier ?? null,
  sample_count: row.count ?? null,
  volume_usd_1d: finite(row.volumeUsd1d),
  volume_usd_7d: finite(row.volumeUsd7d),
  base_borrow_apy_pct: finite(row.apyBaseBorrow),
  reward_borrow_apy_pct: finite(row.apyRewardBorrow),
  total_supply_usd: finite(row.totalSupplyUsd),
  total_borrow_usd: finite(row.totalBorrowUsd),
  available_borrow_usd: finite(row.availableBorrowUsd),
  ltv: finite(row.ltv),
  source_id: 'yield_pools',
  observed_at: observed('yield_pools'),
  asset_identity_verified: false,
  executable: false,
})).sort((a, b) => (b.tvl_usd ?? -1) - (a.tvl_usd ?? -1));

const stablecoins = array(records.stablecoin_assets?.peggedAssets)
  .filter(row => row.chainCirculating?.Stellar || array(row.chains).includes(chain))
  .map(row => ({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    gecko_id: row.gecko_id ?? null,
    peg_type: row.pegType ?? null,
    peg_mechanism: row.pegMechanism ?? null,
    reference_price_usd: finite(row.price),
    price_source: row.priceSource ?? null,
    stellar_circulating_by_peg: row.chainCirculating?.Stellar ?? null,
    source_id: 'stablecoin_assets',
    observed_at: observed('stablecoin_assets'),
    asset_identity_verified: false,
  }));

const overview = (payload, sourceId) => payload ? {
  chain: payload.chain ?? chain,
  total_24h_usd: finite(payload.total24h),
  total_7d_usd: finite(payload.total7d),
  total_30d_usd: finite(payload.total30d),
  total_all_time_usd: finite(payload.totalAllTime),
  change_pct: { '1d': finite(payload.change_1d), '7d': finite(payload.change_7d), '1m': finite(payload.change_1m) },
  protocols: array(payload.protocols),
  source_id: sourceId,
  observed_at: observed(sourceId),
} : null;

const snapshot = {
  schema_version: 'nest.defillama.stellar.snapshot.v1',
  dataset_kind: 'observed_provider_snapshot',
  provider: 'DefiLlama',
  chain,
  captured_at: new Date().toISOString(),
  documentation: ['https://api-docs.defillama.com/llms-free.txt', 'https://github.com/DefiLlama/yield-server'],
  summary: {
    chain_defi_tvl_usd: finite(chainRow?.tvl),
    chain_tvl_source_id: 'chains',
    stablecoin_value_usd_by_peg: stablecoinChain?.totalCirculatingUSD ?? null,
    stablecoin_source_id: 'stablecoin_chains',
    protocol_rows: protocols.length,
    yield_pool_rows: pools.length,
    stablecoin_asset_rows: stablecoins.length,
    dex_volume_24h_usd: finite(records.dex?.total24h),
    fees_24h_usd: finite(records.fees?.total24h),
  },
  chain_metadata: chainRow,
  protocols,
  yield_pools: pools,
  stablecoin_assets: stablecoins,
  dex_volume: overview(records.dex, 'dex'),
  fees: overview(records.fees, 'fees'),
  timeseries: {
    defi_tvl: { source_id: 'tvl_history', points: array(records.tvl_history).map(row => ({ timestamp_unix: Number(row.date), tvl_usd: finite(row.tvl) })) },
    dex_volume: { source_id: 'dex', points: array(records.dex?.totalDataChart).map(([timestamp, value]) => ({ timestamp_unix: Number(timestamp), volume_usd: finite(value) })) },
    stablecoin_value: { source_id: 'stablecoin_history', points: array(records.stablecoin_history) },
  },
  coverage: {
    status: sources.every(source => source.status === 'ok') ? 'complete_for_requested_public_feeds' : 'partial',
    requested_feeds: definitions.length,
    successful_feeds: sources.filter(source => source.status === 'ok').length,
    not_collected: ['Pro-only borrow pool history', 'Per-asset executable quotes', 'OHLCV candles', 'Private or gated datasets'],
    constraints: [
      'Chain TVL, stablecoin value, protocol capital and vault capital are distinct metrics and must not be added into one total.',
      'Parent and child protocol rows may overlap. Do not sum protocol rows to recompute chain TVL.',
      'Protocol percentage changes can describe the whole multichain protocol; they are not labeled Stellar-specific.',
      'Snapshot observation time is not an upstream market as-of timestamp. Current feeds without an explicit upstream timestamp keep upstream_as_of null.',
      'All data is for research. Live protocol state and verified canonical token identity are required before financial planning or execution.',
      'Provider predictions are stored as provider interpretations, not guaranteed returns or Nest safety ratings.',
      'Absent values stay null; missing supply/borrow fields are not zero.',
    ],
  },
  provenance: sources,
  host_resolution: {
    observed_documentation_mismatches: [
      { documented_url: 'https://api.llama.fi/pools', observed_http_status: 404, working_public_url: 'https://yields.llama.fi/pools' },
      { documented_url: 'https://api.llama.fi/stablecoinchains', observed_http_status: 404, working_public_url: 'https://stablecoins.llama.fi/stablecoinchains' },
    ],
  },
};

const directory = path.dirname(fileURLToPath(import.meta.url));
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'defillama-stellar.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({
  output: 'research/data/defillama-stellar.json',
  captured_at: snapshot.captured_at,
  summary: snapshot.summary,
  coverage: snapshot.coverage.status,
  series_points: Object.fromEntries(Object.entries(snapshot.timeseries).map(([key, series]) => [key, series.points.length])),
  feeds: sources.map(({ id, http_status, status }) => ({ id, http_status, status })),
}));
