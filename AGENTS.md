# AGENTS.md

Guidance for coding agents (and humans) working in this repo. Product behaviour, data and execution
boundaries are defined in [docs/technical-spec.md](docs/technical-spec.md); read the relevant section first.

## Layout

| Path                                               | What                                                                                       | Runtime            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| `apps/web`                                         | Vite + React workspace (TanStack Router/Query, shadcn/ui on `packages/ui`)                 | Browser            |
| `apps/worker`                                      | Application Worker: `/api/*` (Hono), D1 schema and migrations, later SSE and `scheduled()` | Cloudflare Workers |
| `packages/domain`                                  | Networks, asset identity, decimal amounts, public error codes                              | Anywhere           |
| `packages/policy`                                  | Pure, ordered, fail-closed rule engine and the Guardrails schema                           | Anywhere           |
| `packages/jobs`                                    | D1 job claims: leases fenced on the attempt, guarded outbox writes                         | Workers            |
| `packages/adapters`                                | Stellar network constants (venue adapters land here)                                       | Workers            |
| `packages/data`                                    | Validated loaders for research data, with provenance                                       | Anywhere           |
| `packages/agent-runtime`                           | Pi compatibility tests; the agent runtime lands here once hosting is decided               | Workers            |
| `packages/ui`                                      | shadcn/ui components themed with the Nest tokens in `design/nest`                          | Browser            |
| `design/nest`, `research/data`, `infra/cloudflare` | Design handoff, research snapshots, provisioned resources                                  | —                  |

`execution`, `automations`, `memory` and `evaluation` packages are added when their build stage starts.

## Commands

Needs Node 24 and pnpm 12 (`corepack enable`). First time: `pnpm setup`.

```sh
pnpm dev          # one Vite dev server: the SPA plus the Worker and a local D1
pnpm check        # what CI runs: biome ci, typecheck, tests, build, knip
pnpm test         # every package's tests; Worker packages run inside workerd
pnpm format       # biome check --write
```

Per package: `pnpm --filter @nest/worker test`, `pnpm --filter @nest/web build`, and so on.

- **Database:** change `apps/worker/src/db/schema.ts` (or a package's `src/schema.ts` listed in
  `apps/worker/drizzle.config.ts`), then `pnpm --filter @nest/worker db:generate`. Commit the schema and the
  generated migration together. Never edit a committed migration, and keep migrations additive: add tables and
  nullable or defaulted columns; stop using a column in one release and drop it in a later one.
- **Worker types:** after changing `apps/worker/wrangler.jsonc`, run `pnpm --filter @nest/worker types` and commit
  `worker-configuration.d.ts`. CI fails when it is stale.
- **Live checks** are opt-in: `NEST_LIVE_TESTNET=1` (Stellar RPC) and `NEST_LIVE_RAVEN=1` (Raven MCP).

## Safety boundaries

- The user signs every transaction in their wallet. Never request, accept, log or store a seed phrase or private key.
- The model proposes typed intents only. It never gets prepare, approve, sign or submit capabilities, policy or
  registry writes, arbitrary HTTP, or code execution. Financial state comes from application records, never from
  model output.
- Mainnet and Testnet use separate D1 databases and registries. `EXECUTION_ENABLED` stays `false`, and each
  adapter's write flag stays off until its full lifecycle is validated.
- Don't deploy, apply remote migrations or touch the Cloudflare account unless asked.

## Code style (TypeScript)

- **File layout:** imports (`node:` built-ins, then packages, then relative; `import type` for types), then
  module-level constants, then types (exported first), then functions (exported API first, helpers after their
  first use).
- **Imports:** relative imports keep their `.ts` extension. Packages expose explicit subpaths in `exports`; no
  barrel files or `export *`.
- **Functions:** module functions are `function` declarations, not `const name = () => …`.
- **Comments:** default to none. Write one only for a non-obvious reason, constraint, unit or invariant. Never
  restate the code, and never mention where an idea came from.
- **Boundaries:** values from outside (`fetch`, `JSON.parse`, env, D1 JSON columns, model and tool output) are
  `unknown` until decoded. `as`, `!` and double casts don't validate anything; don't use them to make checks pass.
- **Money:** raw amounts are `bigint` in code and canonical decimal `TEXT` in D1 (D1 cannot bind BigInt). Never
  use JavaScript numbers for financial bounds. Display-only research figures may be numbers.
- **Names:** units in quantities (`timeoutMs`, `feeBps`, `amountRaw`), honest verbs (`find` may return nothing,
  `parse` can fail, `execute` has effects).
- **Async:** every promise has an owner; pass abort signals through; bounded retries only for transient failures.
- **D1 writes:** claims and state changes use conditional statements fenced on a version or attempt. A zero-row
  UPDATE is not an error, so check affected rows before any external effect, and guard dependent writes in the
  same batch.
- **Public surface:** UI text, prompts, tool descriptions, tool results and API errors never name internal
  infrastructure: accounts, hosts, ports, service names, secret paths or environment variable names.

## Gotchas

- pnpm 12 refuses packages published in the last day and runs no install scripts unless `allowBuilds` in
  `pnpm-workspace.yaml` lists them. Pick an older release rather than adding an exclusion.
- `pi-coding-agent` 1.4.0 cannot load in workerd; `pi-agent-core` can. See
  [docs/architecture-decisions.md](docs/architecture-decisions.md) before wiring the agent.
- `pnpm dev` binds Vite's default port (5173); pass `--port` through the web package if it is taken.
