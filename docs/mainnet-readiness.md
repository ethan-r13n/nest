# Network readiness and testing

Nest separates implementation tests, live reads/simulations and wallet-signed verification. A successful simulation does not establish a completed entry/exit round trip. The agent never signs or submits a transaction.

## Network profiles

| Network | Swap adapter | Other implemented write adapters | Local preview |
| --- | --- | --- | --- |
| Testnet | `sdex` (Soroswap does not provide Testnet routes) | `blend`, `xoxno`, `defindex`, `aquarius_range` | `http://127.0.0.1:5185` |
| Mainnet | `soroswap` | `blend`, `xoxno`, `defindex`, `aquarius_range` | `http://127.0.0.1:5193` |

These local profiles use separate ignored `.dev.vars.testnet` / `.dev.vars.mainnet` files and distinct D1 and Durable Object state. Execution is explicitly enabled in those files. Committed Wrangler defaults remain disabled. Keys, RPC URLs, encrypted connector state and local database copies never belong in Git.

Do not change existing local D1 binding IDs to deploy: that can point a local development server at a different database identity. Apply additive migrations to the intended state path, then restart the actual Worker. Never copy Testnet positions into the Mainnet database.

## Build and deploy

Use Node 24 and the pinned pnpm 12 version. Complete `pnpm install --frozen-lockfile && pnpm check` and the required CI before deploying.

```sh
pnpm build
node scripts/prepare-deployment.mjs mainnet MAINNET_DATABASE_ID --enable-execution
node scripts/prepare-deployment.mjs testnet TESTNET_DATABASE_ID --enable-execution
```

The script writes `.wrangler/deploy/{network}/wrangler.json` with built asset paths, the selected real D1 binding, network-specific adapter IDs, separate Worker names (`nest` and `nest-testnet`), and disabled automatic previews. Omitting `--enable-execution` keeps writes off. Provide the Cloudflare account through the operator's authenticated CLI or `CLOUDFLARE_ACCOUNT_ID`.

Upload server secrets with Wrangler's `secret bulk --config GENERATED_CONFIG`, passing a private JSON file or stdin. Never put secret values in CLI arguments, PR bodies or build logs. Each network requires OpenRouter, application encryption, Soroswap, DeFindex and the Raven operator credential; Mainnet also requires its selected RPC URL. Keep encryption keys and Raven OAuth state network-specific.

Apply migrations with `wrangler d1 migrations apply DB --remote --config GENERATED_CONFIG`, then deploy with `wrangler deploy --config GENERATED_CONFIG`. These commands affect remote resources and require explicit operator authorization. They are separate from local migration commands. The deployment must serve same-origin `/api/*` and assets, and configure the one-minute scheduled handler for that network.

The public demo uses bounded guest/model admission and a free model. Saved authenticated history and tenant-isolated monitors remain outside this demo. Monitor records are shared within a network. No public browser receives provider credentials.

## Raven operator connection

Public `/api/raven/status` reports connection state only. Hosted `/api/raven/connect` and `/api/raven/tools` require an HTTPS request with `Authorization: Bearer RAVEN_OPERATOR_KEY`; use a random server-only value of at least 32 characters. Local connections retain the local operator flow. Do not put the credential in a query string.

The operator starts the connect request and follows its returned authorization URL in their browser. Raven's callback must be on the deployed origin. The callback does not require a bearer header: it verifies the single-use encrypted OAuth state and PKCE through the stored pending grant. Tokens remain encrypted in that network's Durable Object. A local authorization does not prove hosted callback connectivity; connect and verify each deployment explicitly.

## Entry and exit walkthrough

Connect the intended public wallet in Freighter and select the matching network. Confirm the app's network before every review. Add each required trustline through Nest's separate reviewed transaction; Testnet Blend, Circle and Aquarius USDC issuers differ. A ticker match does not imply spendable funds for every venue.

| Action | User test |
| --- | --- |
| Swap | Trade → Market swap → enter a small XLM amount → review minimum USDC and fee → sign → confirm receipt and wallet change. Fund the correct USDC issuer, then repeat the reverse direction. |
| Blend supply | Credit → Supply → compare a small supported amount → review exit timing and variable APY → sign. Open Credit positions; withdraw a partial amount, then Use all and confirm the remaining balance clears. |
| Borrow | Credit or Chat → compare collateral/debt. XOXNO may require two independently reviewed signatures: collateral, then loan. A missing continuation quote stops on that venue and keeps the deposit receipt. |
| Repay | Credit positions → the exact pool/account → Repay → partial amount or Use all. Full repayment includes a bounded accrual buffer; unused payment is refunded by the venue. Confirm debt on chain before withdrawing collateral. |
| Collateral withdrawal | Select the exact owned lending account → Withdraw collateral → partial or all. A withdrawal that violates the venue's health/minimum collateral rules must block before signing. |
| DeFindex | Earn → supported vault → Deposit. Portfolio shows actual shares separately from underlying exposure. Withdraw → exact shares or Use all → inspect share burn, each expected/minimum receipt and fees → sign → confirm wallet receipt and reduced shares. |
| Aquarius limit | Trade → Limit order → buy/sell XLM, amount and limit price → review the one-sided range position → sign. Track owned positions, then withdraw/close and inspect the current token composition, including any partial fill. |

Every deposit review shows withdrawal duration and liquidity restrictions. DeFindex has no fixed lockup but its invested strategies can lack immediate withdrawal liquidity. Current pool liquidity, paused/frozen status, stale oracles, authorization and trustline rules can make a supported action temporarily unavailable.

## Recovery

D1 persists plans, exact prepared hashes, signed submissions and receipt transitions independently of chat. Reopening Portfolio or checking a pending plan reconciles the original hash. The scheduled handler also performs bounded receipt-only recovery with rebroadcast disabled, so it does not create, sign or submit a financial action. Existing explicit submission recovery can rebroadcast only the identical previously signed bytes while valid; no replacement transaction is invented.

Test browser closure/reopen and a Worker restart while a user-signed transaction is pending. Verify confirmation against the original hash, one submission claim, and no duplicate financial effect. Also test a rejected signature, wrong wallet network, insufficient funds, expired quote and provider timeout. Replay/refresh of chat events must preserve answer/proposal content without re-running tools or approval/submission.

## Verification limits

Automated tests and unsigned simulations do not replace the user's Mainnet round-trip test. Use small amounts first. Do not claim completed Mainnet supply/withdraw, borrow/repay or deposit/redeem until transaction hashes, refreshed debt/shares and wallet receipts are verified.

The readiness wallet may need additional XLM and the correct USDC balances/trustlines. Empty owned positions are valid read results, but do not establish an exit round trip. Ordinary two-asset Aquarius LP-share management remains unsupported; the implemented position lifecycle here is the concentrated limit-order position.

Raven sign-in and the separate user-signed Testnet proof remain required when not connected or evidenced. Keep any missing provider access, paused venue, insufficient liquidity or untested signed round trip explicit in the deployment handoff.
