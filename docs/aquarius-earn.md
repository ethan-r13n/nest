# Earn and Aquarius

Earn has one opportunity list: All opportunities, Direct supply, Vaults, Campaigns and Liquidity. All opportunities includes the top 15 eligible Aquarius LPs by reported TVL and uses the same rows and detail sections for every source. `/earn/liquidity` opens the Liquidity filter; `/earn/liquidity/:poolId` remains the pool detail route. `/vaults` remains compatible.

## Connected reads

`GET /api/markets?kind=liquidity_pool&venue=aquarius` ranks the network-specific indexed statistics, reads v2 identities for up to 30 leading candidates, then retains up to 15 matched pools by pool contract, pool index, exact ordered tokens, type and fee. Each request has bounded pagination, concurrency, response size and duration. Cache entries are separate per network and last one minute. Unavailable ranking statistics fail the refresh; partial catalog lookups are rejected. No wallet or API key is needed for public reads.

The official v2 catalog does not include yield fields. Aquarius's own pool UI reads its public `/pools/` endpoint for statistics. That endpoint is a required, less stable read dependency for ranking. TVL and 24h USD volume use a 1e7 scale; its `apy`, `rewards_apy`, `incentive_apy` and `total_apy` fields are displayed as annualized APR, matching the Aquarius UI, without manufacturing compounded APY or applying an account-specific ICE boost. The API supplies no observation timestamp or rate measurement window; these stay null. Retrieval time is separate.

The full read checked 368 indexed pools, of which 320 had two assets and a stable or constant-product interface. Only the top 15 with a positive reported TVL are retained and exposed; ranking happens before user filters. Missing ranking statistics never promote an arbitrary unpriced pool. Concentrated, unknown and multi-asset types are excluded. These are unverified research candidates, not an enabled registry. The static design preview uses the dated capture; React starts with the dated Mainnet capture and refreshes public reads through the application API. A failed refresh retains the capture with its original timestamp and an explicit refresh error; a Testnet request never uses the Mainnet capture.

Refresh with Node 24:

```sh
node scripts/collect-aquarius.mjs
# Separate Testnet capture:
node scripts/collect-aquarius.mjs --testnet
```

`--curl` is available for environments where native Node fetch cannot use the configured transport. It makes the same bounded read-only requests.

## Before LP transactions can be enabled

Aquarius add/remove builders and verification are not connected to the current execution service. Add/remove tickets remain disabled. Completion requires the approved network-specific router/pool/share registry and fresh chain verification; exact token/share decimals, balances and transfer eligibility; unsigned router builders and final bounded simulations; the shared immutable owner review, Freighter signing, submission/idempotency and receipt reconciliation; and confirmed LP position monitoring.

Run the spec's isolated Testnet add → share read → partial remove → remaining share read → full remove lifecycle for each standard pool class before enabling writes. No Mainnet action, deployment, remote migration, automatic claim, zap or rebalance is activated here.

## Strategy descriptions

`research/data/vault-strategies.json` contains concise product or protocol summaries, facts and source references. `vault-scout-context.json` records the identity-matched Raven Scout public records used for discovery; no authenticated Raven MCP session was available. Provider docs and product pages supply the product-specific facts. Unknown fees, contracts, allocations, counterparties and position metrics are omitted. Published addresses are references, not proof of executable registration. The design preview uses the same material in `vault-strategies.js`.

Sources: [Aquarius API](https://docs.aqua.network/developers/reference/backend-api), [deployments](https://docs.aqua.network/developers/reference/addresses-and-networks), [router interface](https://docs.aqua.network/developers/reference/router-and-pool-contracts). Product-level sources and checked times accompany each strategy record.
