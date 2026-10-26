import { LENDING_SYMBOLS, lendingAsset } from '@nest/adapters/blend/markets';
import { SWAP_SYMBOLS } from '@nest/adapters/stellar/assets';
import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import { createLendingIntent } from './lending.ts';
import { approvePlan, compareIntent, createPlan, preparePlan, readIntent, readPlan, submitPlan } from './lifecycle.ts';
import { executionDeps } from './store.ts';
import { createSwapIntent } from './swap.ts';
import { prepareTrustline, submitTrustline } from './trustline.ts';
import { createVaultIntent } from './vaults.ts';

const SwapIntentSchema = z.strictObject({
  kind: z.literal('swap'),
  sellAsset: z.enum(SWAP_SYMBOLS),
  buyAsset: z.enum(SWAP_SYMBOLS),
  sellAmount: z.string().min(1).max(40),
});
const LendingIntentSchema = z.strictObject({
  kind: z.enum(['supply', 'borrow', 'repay', 'withdraw', 'withdraw_collateral']),
  asset: z.enum(LENDING_SYMBOLS),
  // "all" repays or withdraws the whole position.
  amount: z.string().min(1).max(40),
  collateralAsset: z.enum(LENDING_SYMBOLS).optional(),
  collateralAmount: z.string().min(1).max(40).optional(),
  poolId: z.string().length(56).optional(),
});
const CompareSchema = z.strictObject({ accountId: z.string().min(1).max(64).optional() });
const VaultIntentSchema = z.strictObject({
  kind: z.literal('vault_deposit'),
  vaultId: z.string().regex(/^C[A-Z2-7]{55}$/),
  amount: z.string().min(1).max(40),
});
const IntentSchema = z.discriminatedUnion('kind', [SwapIntentSchema, LendingIntentSchema, VaultIntentSchema]);
const PlanSchema = z.strictObject({ intentId: z.uuid(), quoteId: z.uuid(), accountId: z.string().min(1).max(64) });
const ApproveSchema = z.strictObject({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  preparedHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const TrustlineSchema = z.strictObject({
  accountId: z.string().min(1).max(64),
  use: z.enum(['swap', 'lending']),
});
const TrustlineSubmitSchema = TrustlineSchema.extend({ signedXdr: z.string().min(1).max(10_000) });
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
      IntentSchema,
      await c.req.json().catch(() => null),
      'Send kind "swap" with sellAsset, buyAsset and sellAmount, kind "supply" or "borrow" with asset and amount, or kind "vault_deposit" with vaultId and amount.',
    );
    const deps = executionDeps(c.env);
    let intent: unknown;
    if (body.kind === 'swap') {
      intent = await createSwapIntent(deps, {
        sell: body.sellAsset,
        buy: body.buyAsset,
        amount: body.sellAmount,
        source: 'form',
      });
    } else if (body.kind === 'vault_deposit') {
      intent = await createVaultIntent(deps, { vaultId: body.vaultId, amount: body.amount, source: 'form' });
    } else {
      intent = await createLendingIntent(deps, { ...body, source: 'form' });
    }
    return c.json(intent, 201);
  });

  /** DeFindex vaults on this network with their live APY, funds and fees. Read-only. */
  routes.get('/vaults', async (c) => {
    const deps = executionDeps(c.env);
    if (!deps.vaults) throw new AppError('UNAVAILABLE', 'Vault deposits need a DeFindex API key on this server.');
    const vaults = await deps.vaults.vaults();
    return c.json({
      network: deps.config.network,
      vaults: vaults.map((vault) => ({
        ...vault,
        totalRaw: vault.totalRaw.toString(),
        idleRaw: vault.idleRaw.toString(),
        investedRaw: vault.investedRaw.toString(),
        // The Classic asset, so a wallet can show its balance before depositing.
        asset: vault.symbol
          ? {
              code: vault.symbol,
              issuer:
                vault.symbol === 'XLM' ? null : lendingAsset(deps.config.network, vault.symbol).classic.getIssuer(),
            }
          : null,
      })),
    });
  });

  /** Live Blend pool rates for the Research page. Read-only. */
  routes.get('/markets/lending', async (c) => {
    const deps = executionDeps(c.env);
    if (!deps.lending) throw new AppError('UNAVAILABLE', 'Lending needs a Stellar RPC on this server.');
    const markets = await deps.lending.markets();
    return c.json(
      JSON.parse(
        JSON.stringify({ network: deps.config.network, markets }, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ),
    );
  });

  routes.get('/intents/:id', async (c) => c.json(await readIntent(executionDeps(c.env), uuid(c.req.param('id')))));

  routes.post('/intents/:id/compare', async (c) => {
    const body = CompareSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw new AppError('INVALID_REQUEST', 'Send accountId as a Stellar account, or no body.');
    return c.json(await compareIntent(executionDeps(c.env), uuid(c.req.param('id')), body.data.accountId));
  });

  routes.post('/plans', async (c) => {
    const key = IdempotencyKeySchema.safeParse(c.req.header('idempotency-key'));
    if (!key.success) throw new AppError('INVALID_REQUEST', 'Send an Idempotency-Key header (8 to 128 characters).');
    const body = parse(PlanSchema, await c.req.json().catch(() => null), 'Send intentId, quoteId and accountId.');
    const plan = await createPlan(executionDeps(c.env), { ...body, idempotencyKey: key.data });
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

  /** Builds the one trustline a swap or lending plan may need first; the user signs it in their wallet. */
  routes.post('/trustlines', async (c) => {
    const body = parse(TrustlineSchema, await c.req.json().catch(() => null), 'Send accountId and use.');
    return c.json(await prepareTrustline(executionDeps(c.env), body));
  });

  routes.post('/trustlines/submit', async (c) => {
    const body = parse(
      TrustlineSubmitSchema,
      await c.req.json().catch(() => null),
      'Send accountId, use and the signed trustline as signedXdr.',
    );
    return c.json(await submitTrustline(executionDeps(c.env), body));
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
