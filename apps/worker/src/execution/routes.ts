import { SWAP_SYMBOLS } from '@nest/adapters/stellar/assets';
import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import {
  approvePlan,
  compareSwap,
  createSwapIntent,
  createSwapPlan,
  executionDeps,
  preparePlan,
  readIntent,
  readPlan,
  submitPlan,
} from './swap.ts';

const SwapIntentSchema = z.strictObject({
  kind: z.literal('swap'),
  sellAsset: z.enum(SWAP_SYMBOLS),
  buyAsset: z.enum(SWAP_SYMBOLS),
  sellAmount: z.string().min(1).max(40),
});
const PlanSchema = z.strictObject({ intentId: z.uuid(), quoteId: z.uuid(), accountId: z.string().min(1).max(64) });
const ApproveSchema = z.strictObject({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  preparedHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const SubmitSchema = z.strictObject({ signedXdr: z.string().min(1).max(60_000) });
const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

/** Intent → quote → plan → prepare → approve → submit. The agent can only create intents and quotes. */
export function createExecutionRoutes() {
  const routes = new Hono<AppEnv>();

  routes.post('/intents', async (c) => {
    const body = parse(
      SwapIntentSchema,
      await c.req.json().catch(() => null),
      'Send kind "swap", sellAsset, buyAsset and sellAmount.',
    );
    const intent = await createSwapIntent(executionDeps(c.env), {
      sell: body.sellAsset,
      buy: body.buyAsset,
      amount: body.sellAmount,
      source: 'form',
    });
    return c.json(intent, 201);
  });

  routes.get('/intents/:id', async (c) => c.json(await readIntent(executionDeps(c.env), uuid(c.req.param('id')))));

  routes.post('/intents/:id/compare', async (c) => {
    const quote = await compareSwap(executionDeps(c.env), uuid(c.req.param('id')));
    return c.json({ quotes: [quote], selectedQuoteId: quote.id });
  });

  routes.post('/plans', async (c) => {
    const key = IdempotencyKeySchema.safeParse(c.req.header('idempotency-key'));
    if (!key.success) throw new AppError('INVALID_REQUEST', 'Send an Idempotency-Key header (8 to 128 characters).');
    const body = parse(PlanSchema, await c.req.json().catch(() => null), 'Send intentId, quoteId and accountId.');
    const plan = await createSwapPlan(executionDeps(c.env), { ...body, idempotencyKey: key.data });
    return c.json(plan, 201);
  });

  routes.get('/plans/:id', async (c) => c.json(await readPlan(executionDeps(c.env), uuid(c.req.param('id')))));

  routes.post('/plans/:id/prepare', async (c) =>
    c.json(await preparePlan(executionDeps(c.env), uuid(c.req.param('id')))),
  );

  routes.post('/plans/:id/approve', async (c) => {
    const body = parse(
      ApproveSchema,
      await c.req.json().catch(() => null),
      'Send the reviewed digest and preparedHash.',
    );
    return c.json(await approvePlan(executionDeps(c.env), uuid(c.req.param('id')), body));
  });

  routes.post('/plans/:id/submit', async (c) => {
    const body = parse(
      SubmitSchema,
      await c.req.json().catch(() => null),
      'Send the wallet-signed transaction as signedXdr.',
    );
    return c.json(await submitPlan(executionDeps(c.env), uuid(c.req.param('id')), body.signedXdr));
  });

  return routes;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('INVALID_REQUEST', message);
  return parsed.data;
}

function uuid(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'Not found.');
  return id;
}
