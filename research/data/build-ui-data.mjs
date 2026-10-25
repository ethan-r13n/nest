import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const load = async file => {
  const contents = await readFile(new URL(file, import.meta.url), 'utf8');
  return {
    data: JSON.parse(contents),
    input: { file, sha256: createHash('sha256').update(contents).digest('hex') },
  };
};

const [{ data: rwa, input: rwaInput }, { data: llama, input: llamaInput }] = await Promise.all([
  load('rwa-stellar.json'),
  load('defillama-stellar.json'),
]);

assert.equal(rwa.source.network.toLowerCase(), 'stellar');
assert.equal(llama.chain, 'Stellar');
assert.equal(llama.schema_version, 'nest.defillama.stellar.snapshot.v1');
assert.equal(rwa.assets.length, rwa.coverage.capturedAssetRows);
assert.equal(rwa.assets.length, rwa.coverage.reportedAssetRows);
assert.ok(rwa.assets.every(asset => typeof asset.identity === 'string' && asset.identity.length > 0));
assert.equal(new Set(rwa.assets.map(asset => asset.identity)).size, rwa.assets.length);

const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field] ?? null]));
const array = value => Array.isArray(value) ? value : [];
const rwaSourceId = 'rwa_xyz_stellar';
const llamaSourceId = 'defillama_stellar';

const assets = rwa.assets.map(({ cells, ...asset }) => ({
  ...asset,
  source_id: rwaSourceId,
  observed_at: rwa.source.capturedAt,
  asset_identity_verified: false,
  executable: false,
}));

const isDataRow = row => {
  if (!Array.isArray(row)) return false;
  const text = row.map(cell => String(cell?.text ?? '').trim()).filter(Boolean).join(' ');
  return (text.length > 0 || row.some(cell => array(cell?.links).length > 0))
    && !/^(no (results|data)( found)?[.!]?|loading[.\u2026]*)$/i.test(text);
};

const leagueTables = rwa.leagueTables.map(table => {
  const rows = array(table.rows).filter(isDataRow).map(row => {
    const cell = header => row[table.headers.indexOf(header)];
    const display = header => cell(header)?.text ?? null;
    return {
      rankDisplay: display('#'),
      entityDisplay: row[1]?.text ?? null,
      entityLinks: array(row[1]?.links),
      rwaCountDisplay: display('RWA Count'),
      totalValueDisplay: display('Total Value'),
      change30dDisplay: display('30D%'),
      marketShareDisplay: display('Market Share'),
      source_id: rwaSourceId,
      executable: false,
    };
  });
  return {
    assetType: table.assetType,
    groupBy: table.groupBy,
    headers: table.headers,
    rows,
    rowCount: rows.length,
    hasData: rows.length > 0,
    coverageNote: table.coverageNote ?? null,
    source_id: rwaSourceId,
  };
});

const protocolFields = [
  'id', 'slug', 'name', 'symbol', 'category', 'url', 'logo', 'parent_protocol',
  'protocol_chains', 'stellar_tvl_usd', 'stellar_tvl_components_usd',
  'protocol_tvl_all_chains_usd', 'protocol_change_pct', 'source_id', 'observed_at',
];
const yieldFields = [
  'pool_id', 'chain', 'project', 'symbol', 'pool_meta', 'tvl_usd', 'total_apy_pct',
  'base_apy_pct', 'reward_apy_pct', 'reported_apy_change', 'apy_mean_30d_pct',
  'reward_tokens', 'underlying_tokens', 'stablecoin', 'impermanent_loss_risk',
  'exposure', 'base_borrow_apy_pct', 'reward_borrow_apy_pct', 'total_supply_usd',
  'total_borrow_usd', 'available_borrow_usd', 'ltv', 'source_id', 'observed_at',
];
const stablecoinFields = [
  'id', 'name', 'symbol', 'gecko_id', 'peg_type', 'peg_mechanism',
  'reference_price_usd', 'price_source', 'stellar_circulating_by_peg',
  'source_id', 'observed_at',
];
const overview = value => value == null ? null : ({
  ...pick(value, [
    'chain', 'total_24h_usd', 'total_7d_usd', 'total_30d_usd',
    'total_all_time_usd', 'change_pct', 'source_id', 'observed_at',
  ]),
  protocols: array(value.protocols).map(protocol => ({
    ...pick(protocol, [
      'id', 'defillamaId', 'slug', 'name', 'displayName', 'category', 'logo',
      'parentProtocol', 'total24h', 'total48hto24h', 'methodologyURL',
    ]),
    executable: false,
  })),
});

const output = {
  schema_version: 'nest.stellar.research.ui.v1',
  dataset_kind: 'derived_observed_provider_snapshot',
  chain: 'Stellar',
  live: false,
  executable: false,
  inputs: [rwaInput, llamaInput],
  sources: {
    [rwaSourceId]: {
      ...rwa.source,
      id: rwaSourceId,
      attribution: 'RWA.xyz',
    },
    [llamaSourceId]: {
      id: llamaSourceId,
      name: llama.provider,
      attribution: 'DefiLlama',
      url: 'https://defillama.com/chain/Stellar',
      captured_at: llama.captured_at,
      live: false,
      documentation: llama.documentation,
      provenance: llama.provenance,
    },
  },
  rwa: {
    source_id: rwaSourceId,
    coverage: {
      ...rwa.coverage,
      collectedLeagueRows: leagueTables.reduce((sum, table) => sum + table.rowCount, 0),
    },
    networkMetrics: rwa.networkMetrics,
    assets,
    leagueTables,
    caveats: rwa.caveats,
  },
  defillama: {
    source_id: llamaSourceId,
    summary: llama.summary,
    protocols: llama.protocols.map(protocol => ({
      ...pick(protocol, protocolFields),
      executable: false,
    })),
    yield_pools: llama.yield_pools.map(pool => ({
      ...pick(pool, yieldFields),
      asset_identity_verified: false,
      executable: false,
    })),
    stablecoin_assets: llama.stablecoin_assets.map(asset => ({
      ...pick(asset, stablecoinFields),
      asset_identity_verified: false,
      executable: false,
    })),
    dex_volume: overview(llama.dex_volume),
    fees: overview(llama.fees),
    coverage: llama.coverage,
  },
  constraints: [
    'RWA.xyz metrics and DefiLlama metrics remain separate; capital can overlap and must not be added into one ecosystem total.',
    'Source observation times are retained per provider; this generated file is not a live market feed.',
    'RWA display values, direction markers, rounding and nulls are preserved without inferring exact numeric values.',
    'Protocol percentage changes may cover all chains; preserve the explicit scope.',
    'All rows are for research. Verified canonical asset identities and fresh native venue state are required for financial actions.',
    'Chart history, raw rendered page text, asset table cells and provider prediction fields are excluded from this initial payload.',
  ],
};

assert.equal(output.rwa.assets.length, rwa.assets.length);
assert.equal(output.defillama.protocols.length, llama.protocols.length);
assert.equal(output.defillama.yield_pools.length, llama.yield_pools.length);
assert.equal(output.defillama.stablecoin_assets.length, llama.stablecoin_assets.length);
assert.ok(!('timeseries' in output.defillama));
assert.ok(!('renderedNetworkText' in output.rwa));
assert.ok(output.rwa.assets.every(asset => !('cells' in asset) && asset.executable === false));

const json = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(new URL('stellar-research-ui.json', import.meta.url), json);
console.log(JSON.stringify({
  output: 'research/data/stellar-research-ui.json',
  bytes: Buffer.byteLength(json),
  rwa_assets: assets.length,
  rwa_league_views: leagueTables.length,
  rwa_league_views_with_data: leagueTables.filter(table => table.hasData).length,
  rwa_league_rows: output.rwa.coverage.collectedLeagueRows,
  protocols: output.defillama.protocols.length,
  yield_pools: output.defillama.yield_pools.length,
  stablecoins: output.defillama.stablecoin_assets.length,
}, null, 2));
