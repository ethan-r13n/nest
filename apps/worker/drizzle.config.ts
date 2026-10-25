import { defineConfig } from 'drizzle-kit';

// Each package owns its tables; the worker generates and applies every migration.
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/schema.ts', '../../packages/jobs/src/schema.ts'],
  out: './migrations',
});
