# Stellar research data

This directory contains observed provider snapshots and a derived Research UI payload. They are research inputs for Nest; they do not supply executable quotes or verified token identities.

| File | Purpose |
| --- | --- |
| `defillama-stellar.json` | Normalized Stellar data, history, coverage and per-feed provenance. |
| `collect-defillama-stellar.mjs` | Dependency-free Node collector using public HTTP APIs. |
| `rwa-stellar.json` | RWA.xyz Stellar page observations, asset rows and league views. |
| `build-ui-data.mjs` | Offline, deterministic projection of both snapshots into the initial UI payload. |
| `stellar-research-ui.json` | Research overview, complete RWA table, league views and compact DefiLlama tables without chart history. |

The checked-in snapshot was captured at **2026-10-25T14:35:20.829Z**. Its nine requested feeds succeeded, yielding 44 protocol rows, 12 yield pools and 13 stablecoin asset rows. This describes coverage of those feeds, not every asset or venue on Stellar.

## Refresh

Run from the repository root with Node 22 or later:

```sh
node research/data/collect-defillama-stellar.mjs
```

No API key, environment file or extra package is required. The collector fetches nine feeds in batches of three with a 30-second timeout per request. It overwrites the JSON beside the script, regardless of the working directory. Inspect `coverage` and `provenance` after a refresh: unavailable feeds remain explicit rather than receiving fabricated values. A refresh can replace a previously complete snapshot with partial results, so review the diff before committing it.

The collector is a manual data preparation tool. It does not install a scheduled job, update D1 or make a deployed page live. A later application adapter should cache responses and handle partial refreshes without replacing healthy cached data with missing results.

## Schema and interface mapping

`schema_version` is `nest.defillama.stellar.snapshot.v1`. Monetary fields ending in `_usd` use USD; APY fields ending in `_pct` use numeric percentages, so `5.2` means 5.2%. Historical `timestamp_unix` values use seconds. Missing numeric values remain `null` and must render as unavailable, not zero.

| Field | Intended UI use | Interpretation |
| --- | --- | --- |
| `summary.chain_defi_tvl_usd` | Stellar DeFi headline card | Reported chain TVL from the chain listing. |
| `summary.stablecoin_value_usd_by_peg` | Stablecoin cards/breakdown | Provider-converted USD values, grouped by peg. |
| `summary.dex_volume_24h_usd`, `fees_24h_usd` | Activity headline cards | Aggregated volume and fees reported by their feeds. |
| `chain_metadata` | Chain identity and metadata | Selected raw Stellar chain row. |
| `protocols` | Searchable protocol table | Identity, category, links, explicit Stellar TVL, optional TVL components and protocol-wide changes. |
| `yield_pools` | Yield comparison table | Pool identity, TVL, total/base/reward APY, asset identifiers and optional lending fields. |
| `stablecoin_assets` | Asset composition table | Stellar circulation by peg, reference prices and public metadata. |
| `dex_volume`, `fees` | Venue activity tables | Scoped overview totals and provider protocol rows. |
| `timeseries.defi_tvl.points` | TVL chart | `{ timestamp_unix, tvl_usd }` daily observations. |
| `timeseries.dex_volume.points` | DEX volume chart | `{ timestamp_unix, volume_usd }` daily observations. |
| `timeseries.stablecoin_value.points` | Stablecoin history chart | Provider rows retaining peg and circulation breakdowns; normalize deliberately before rendering. |
| `coverage` | Source status and missing-data UI | Collection outcome, omitted datasets and semantic constraints. |
| `provenance` | Freshness/source tooltip | Source URL, observation time, HTTP result and available cache headers. |
| `host_resolution` | Adapter implementation notes | Working category hosts where the documentation's unified base did not resolve. |

Important field details:

- `protocols[].stellar_tvl_usd` is the explicit Stellar value. `protocol_tvl_all_chains_usd` is separate. `protocol_change_pct.scope` is `protocol_all_chains`; do not present those changes as Stellar-specific.
- `stellar_tvl_components_usd` retains Stellar-prefixed subcomponents such as borrowed or staked capital. These are not automatically additive to the main TVL value.
- `yield_pools[].reported_apy_change` preserves the provider's original `apyPct1D`, `apyPct7D` and `apyPct30D` names. Do not relabel them as percentage-point changes without verifying the provider's definition.
- `stablecoin_assets[].stellar_circulating_by_peg` retains current and previous-period circulation objects. Preserve each peg key; these raw quantities differ from the converted USD summary.
- `source_id` joins a row or series to `provenance[].id`. `observed_at` records collection time. `upstream_as_of` stays `null` when the source does not state a market timestamp.

## Loading into the application

Keep the collector outside the client bundle. Import or read the snapshot in a build/server ingestion step, then expose the fields each screen needs. For a future Vite application, this is a mapping contract rather than an implemented frontend integration.

The full DefiLlama JSON is **1,235,068 bytes** and is reasonable to commit as a research/provenance artifact. It contains public provider data; the collector does not read credentials, user balances or private account state. Avoid eagerly importing it into the initial browser JavaScript. A minimal projection containing only its summary, basic protocol table columns and yield comparison columns is approximately **15.6 KB** before compression. The generated combined payload below includes more table fields and all 109 RWA assets. Load chart history and detailed metadata on demand.

Suggested ingestion boundaries:

1. Validate `schema_version`, `chain`, source status and required fields.
2. Store provider observations separately from canonical venue/token records.
3. Serve a small overview projection to Research; fetch chart series or details when opened.
4. Display the observed time and data state. Treat a saved snapshot as dated until a successful refresh replaces it.
5. Obtain fresh native venue state and an executable quote before constructing any financial plan.

## Initial Research UI payload

Regenerate from the two local snapshots with Node 22 or later:

```sh
node research/data/build-ui-data.mjs
```

This command reads only `rwa-stellar.json` and `defillama-stellar.json`; it makes no network requests, reads no environment variables and leaves the input snapshots untouched. Rebuilding identical inputs produces identical output. `inputs[].sha256` records the exact source files used, and provider capture times remain separate from one another.

`stellar-research-ui.json` uses schema `nest.stellar.research.ui.v1` and contains:

| Path | Initial UI content |
| --- | --- |
| `sources.rwa_xyz_stellar` | RWA.xyz attribution, source URL, capture time, displayed as-of date and collection method. |
| `sources.defillama_stellar` | DefiLlama attribution, capture time, documentation and all nine original feed provenance records. |
| `rwa.networkMetrics` | Eight network cards with source display strings, available exact values and reported 30-day changes. |
| `rwa.assets` | All 109 identities and source display fields, including nulls, contract explorer links and pagination provenance. |
| `rwa.leagueTables` | Nine filter views, eight with data; 62 nonempty rows total. Represented managers has `rows: []` and `hasData: false`. |
| `defillama.summary` | Chain DeFi, stablecoin and activity headline values. |
| `defillama.protocols` | 44 protocol rows with Stellar TVL, parent identity, links and explicitly scoped changes. |
| `defillama.yield_pools` | 12 pool rows with base/reward APY, reported changes and available supply/borrow fields. |
| `defillama.stablecoin_assets` | 13 assets with Stellar circulation and peg metadata. |
| `defillama.dex_volume`, `defillama.fees` | Overview totals and compact venue activity rows. |

RWA asset keys retain the source snapshot's camelCase display fields; DefiLlama rows retain its snake_case fields. League rows expose `rankDisplay`, `entityDisplay`, `entityLinks`, `rwaCountDisplay`, `totalValueDisplay`, `change30dDisplay` and `marketShareDisplay`. Missing columns are `null`. `coverageNote`, headers and filter identity remain on each league view. Ignore empty placeholder rows rather than rendering them as a ranked entity.

The bundle removes redundant RWA `cells`, `renderedNetworkText`, chart history and provider predictions. It preserves the original asset `identity`, raw display strings and null values. Do not derive exact numbers from rounded strings such as `$3.75B`; a display value is not an execution input. All financial rows and the payload itself carry `executable: false`.

The generated file is **257,802 bytes** formatted, approximately **185.7 KB** minified or **29.5 KB** gzipped. In the Vite preset, copy it to `public/data/stellar-research-ui.json` during the build and load it on entry to Research:

```ts
const response = await fetch('/data/stellar-research-ui.json');
if (!response.ok) throw new Error('Research data unavailable');
const research = await response.json();
if (research.schema_version !== 'nest.stellar.research.ui.v1') {
  throw new Error('Unsupported research data version');
}
```

The public-file copy and frontend import are integration instructions for the incoming preset, not already installed build steps. Render each provider's freshness/attribution beside its data, preserve null states, and show the represented-manager league as empty. Keep the raw snapshots and collector out of the application JavaScript bundle.

## Source separation

DefiLlama chain TVL, stablecoin circulation, RWA.xyz asset values, protocol TVL and vault TVL describe different or overlapping capital. Display their source and definition separately; do not sum them into a single ecosystem total. Parent and child protocol rows can also overlap, so use the chain feed for chain TVL instead of summing the protocol table.

RWA.xyz observations belong to their own dataset and provenance. Direct venue state belongs to the execution/reconciliation adapters. A research row is not proof that a venue is approved, supported for execution or sufficiently liquid for a particular amount.

`executable` is deliberately `false` on protocol and pool rows. Pool/asset identifiers and `underlying_tokens` are provider identifiers, not verified Stellar issuer addresses or SAC contract IDs; `asset_identity_verified` stays `false`. Resolve canonical identity through the venue registry before joining these records to wallet actions.

## Freshness and coverage gaps

- Current chain totals and the latest daily history points may differ because their reporting times and feed semantics differ. Preserve both rather than forcing them to agree.
- There are 972 TVL points, 1,668 DEX volume points and 1,627 stablecoin history points in this snapshot. These are not OHLCV candles and cannot support a price backtest by themselves.
- The observed yield projects are `ondo-yield-assets`, `blend-pools-v2`, `gami-labs` and `xoxno-lending`. Missing venues or pools are not evidence that those venues are inactive.
- `allbridge-core` is associated with Stellar but lacks an explicit `chainTvls.Stellar` value; its Stellar TVL remains `null`.
- Borrow APY, supply, available liquidity and LTV fields may be absent. Do not infer them from TVL or lending APY. Native venue adapters should supply live lending comparisons.
- Provider APY predictions are provider interpretations, not guaranteed returns or Nest safety ratings. Show base yield and incentive yield separately.
- Public feeds here require no credentials. Pro-only borrow histories and other paid datasets are not included; they are optional additions rather than prerequisites for this snapshot.

## Sources

The exact requested URLs and HTTP observations are stored in `provenance`. Working feed families are `api.llama.fi` for chains/protocols/activity, `yields.llama.fi` for pools and `stablecoins.llama.fi` for stablecoin data.

- [DefiLlama free API documentation](https://api-docs.defillama.com/llms-free.txt)
- [DefiLlama Pro API documentation](https://api-docs.defillama.com/llms-pro.txt)
- [DefiLlama yield server](https://github.com/DefiLlama/yield-server)
