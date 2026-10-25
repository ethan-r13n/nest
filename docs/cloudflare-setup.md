# Cloudflare configuration

The default Worker is `nest`. Database bindings are `nest-mainnet` and `nest-testnet`, both named `DB` inside their environment. The committed UUIDs are local-development placeholders and do not identify provisioned resources.

Create dedicated databases when preparing a deployment:

```sh
pnpm --filter @nest/worker exec wrangler d1 create nest-mainnet
pnpm --filter @nest/worker exec wrangler d1 create nest-testnet
```

Copy each returned ID into its corresponding binding in `apps/worker/wrangler.jsonc`. Configure your own Cloudflare account through Wrangler authentication or deployment configuration. Regenerate declarations with `pnpm --filter @nest/worker types`.

For local development, run `pnpm --filter @nest/worker db:migrate:local`. For the separate local Testnet binding, append `--env testnet` and start Vite with `CLOUDFLARE_ENV=testnet`. Local persistence is under the ignored Worker `.wrangler` directory. Keep `remote: false` for local bindings.

Apply migrations locally and inspect their result before any explicitly authorized remote migration. Deployment and remote schema changes are separate operator actions. Do not reuse another application's database or enable automatic preview resources against production state.

Set provider credentials through Worker secrets for a hosted environment. For local development, use an ignored `.dev.vars` or `.dev.vars.testnet`; the template contains no credentials. Never expose secrets through `VITE_*` variables.

Both environments commit `EXECUTION_ENABLED=false` and an empty `ENABLED_WRITE_ADAPTERS`. Enable a venue only after the complete lifecycle is validated on that network. Guest chat and a connected public address are not production wallet-authentication or tenant-isolation guarantees; complete the production access requirements in the technical specification before exposing financial APIs publicly.
