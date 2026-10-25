import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The jobs tables are migrated by the worker, so the tests run against the same SQL it ships.
const migrations = await readD1Migrations(path.join(import.meta.dirname, '../../apps/worker/migrations'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './test/wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
