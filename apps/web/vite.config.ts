import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// One dev server for the SPA and the application Worker (apps/worker), which serves /api/*
// and the built assets from the same origin. Local state lives with the Worker, so
// `pnpm --filter @nest/worker db:migrate:local` migrates the database this server uses.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ configPath: '../worker/wrangler.jsonc', persistState: { path: '../worker/.wrangler/state' } }),
  ],
});
