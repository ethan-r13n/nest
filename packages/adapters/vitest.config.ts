import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './test/wrangler.jsonc' },
      // Live Testnet reads run only when asked for: NEST_LIVE_TESTNET=1 pnpm test
      miniflare: { bindings: { NEST_LIVE_TESTNET: process.env.NEST_LIVE_TESTNET ?? '' } },
    }),
  ],
  test: { fsModuleCachePath: 'node_modules/.vitest-cache' },
});
