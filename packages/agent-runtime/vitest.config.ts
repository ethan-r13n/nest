import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Pi compatibility gate (docs/spikes/pi-workers.md): these tests run Pi inside workerd with the
// production compatibility date. Live Raven checks run only with NEST_LIVE_RAVEN=1.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './test/wrangler.jsonc' },
      miniflare: { bindings: { NEST_LIVE_RAVEN: process.env.NEST_LIVE_RAVEN ?? '' } },
    }),
  ],
  test: { fsModuleCachePath: 'node_modules/.vitest-cache' },
});
