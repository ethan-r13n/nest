import { defineConfig } from 'vitest/config';

// Each package keeps its own module cache so parallel turbo runs don't race on a shared directory.
export default defineConfig({
  test: { fsModuleCachePath: 'node_modules/.vitest-cache' },
});
