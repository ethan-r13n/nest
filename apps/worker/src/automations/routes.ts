import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import { automationDeps } from './dispatch.ts';
import { evaluateArbitrage } from './evaluate.ts';
import {
  acknowledgeTrigger,
  activateRule,
  createRule,
  deleteRule,
  listRules,
  loadRule,
  parseConfig,
  pauseRule,
  readRule,
  reviseRule,
} from './rules.ts';

const CreateSchema = z.strictObject({
  kind: z.literal('arbitrage'),
  name: z.string().max(80).optional(),
  account: z.string().max(64).optional(),
  config: z.unknown(),
});
const ReviseSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  name: z.string().max(80).optional(),
  config: z.unknown(),
});
const ActivateSchema = z.strictObject({
  revision: z.number().int().positive(),
  configHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const PreviewSchema = z.strictObject({ config: z.unknown() });

/**
 * Monitoring rules: draft → activate the exact revision → scheduled checks → alerts. Checks only
 * read public pool state; nothing here can sign, submit or move funds.
 */
export function createAutomationRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => c.json({ automations: await listRules(automationDeps(c.env)) }));

  routes.post('/', async (c) => {
    const body = parse(CreateSchema, await c.req.json().catch(() => null), 'Send kind "arbitrage" and config.');
    return c.json(await createRule(automationDeps(c.env), body), 201);
  });

  /** Evaluates settings now without saving anything or firing an alert. */
  routes.post('/preview', async (c) => {
    const body = parse(PreviewSchema, await c.req.json().catch(() => null), 'Send the monitor config.');
    const deps = automationDeps(c.env);
    return c.json({
      evaluatedAt: new Date(deps.now()).toISOString(),
      ...(await evaluateArbitrage(parseConfig(body.config), deps.pools)),
    });
  });

  routes.post('/alerts/:id/acknowledge', async (c) => {
    await acknowledgeTrigger(automationDeps(c.env), uuid(c.req.param('id')));
    return c.json({ ok: true });
  });

  routes.get('/:id', async (c) => c.json(await readRule(automationDeps(c.env), uuid(c.req.param('id')))));

  routes.post('/:id/revisions', async (c) => {
    const body = parse(ReviseSchema, await c.req.json().catch(() => null), 'Send expectedRevision and config.');
    return c.json(await reviseRule(automationDeps(c.env), uuid(c.req.param('id')), body));
  });

  routes.post('/:id/activate', async (c) => {
    const body = parse(
      ActivateSchema,
      await c.req.json().catch(() => null),
      'Send the reviewed revision and configHash.',
    );
    return c.json(await activateRule(automationDeps(c.env), uuid(c.req.param('id')), body));
  });

  routes.post('/:id/pause', async (c) => c.json(await pauseRule(automationDeps(c.env), uuid(c.req.param('id')))));

  /** A bounded check of the saved rule, with no record and no alert. */
  routes.post('/:id/test', async (c) => {
    const deps = automationDeps(c.env);
    const rule = await loadRule(deps, uuid(c.req.param('id')));
    return c.json({
      evaluatedAt: new Date(deps.now()).toISOString(),
      ...(await evaluateArbitrage(parseConfig(JSON.parse(rule.config)), deps.pools)),
    });
  });

  routes.delete('/:id', async (c) => {
    await deleteRule(automationDeps(c.env), uuid(c.req.param('id')));
    return c.json({ ok: true });
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
