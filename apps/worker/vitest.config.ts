import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
// Agent tests run against a scripted model: one tool call, then an answer, for every turn.
const FAUX_SCRIPT = [
  { toolCall: { name: 'list_markets', args: { kind: 'protocols', category: 'Lending', limit: 3 } } },
  { text: 'Blend is the largest Stellar lending protocol in the snapshot.' },
];

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Pinned so a developer's .dev.vars (network, real provider key) never leaks into tests.
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          STELLAR_NETWORK: 'mainnet',
          EXECUTION_ENABLED: 'false',
          PI_PROVIDER: 'faux',
          PI_FAUX_SCRIPT: JSON.stringify(FAUX_SCRIPT),
          OPENROUTER_API_KEY: 'test-placeholder',
          APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
          // Tests share one guest subject, so the per-guest window is opened wide; admission has its own tests.
          AGENT_GUEST_TURNS_PER_15_MIN: '10000',
          AGENT_MAX_ACTIVE_RUNS: '100',
        },
      },
    }),
  ],
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
