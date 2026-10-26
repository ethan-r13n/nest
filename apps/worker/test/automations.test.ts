import { env, exports } from 'cloudflare:workers';
import { type ArbVenue, type PoolReading, PoolUnavailable } from '@nest/adapters/amm/pools';
import { describe, expect, it } from 'vitest';

import type { ArbitrageConfig } from '../src/automations/config.ts';
import { runAutomations } from '../src/automations/dispatch.ts';
import {
  type AutomationDeps,
  acknowledgeTrigger,
  activateRule,
  createRule,
  deleteRule,
  pauseRule,
  readRule,
  reviseRule,
} from '../src/automations/rules.ts';

const ORIGIN = 'https://nest.test';
const UNIT = 10_000_000n;
const MINUTE = 60_000;
const CONFIG: ArbitrageConfig = {
  venues: ['soroswap', 'stellar_amm'],
  sizeUsdc: '100',
  thresholdBps: 50,
  cooldownMinutes: 5,
  mode: 'repeat',
};

function pool(venue: ArbVenue, usdcPerMillionXlm: bigint, observedAtMs: number): PoolReading {
  return {
    venue,
    poolId: `${venue}-pool`,
    baseReserveRaw: 1_000_000n * UNIT,
    quoteReserveRaw: usdcPerMillionXlm * UNIT,
    feeBps: 30,
    observedAtMs,
    ledger: null,
  };
}

function createFixture(startMs: number) {
  const clock = { now: startMs };
  // USDC per 1,000,000 XLM in each pool; null makes the venue unreadable.
  const prices: Record<ArbVenue, bigint | null> = { aquarius: 170_000n, soroswap: 170_000n, stellar_amm: 170_000n };
  const reads: ArbVenue[] = [];
  const deps: AutomationDeps = {
    db: env.DB,
    network: 'mainnet',
    now: () => clock.now,
    pools: {
      read: async (venue) => {
        reads.push(venue);
        const price = prices[venue];
        if (price === null) throw new PoolUnavailable(`${venue} is unreachable.`);
        return pool(venue, price, clock.now);
      },
    },
  };
  return { deps, clock, prices, reads };
}

async function activeRule(h: ReturnType<typeof createFixture>, config: ArbitrageConfig = CONFIG) {
  const draft = await createRule(h.deps, { config });
  return activateRule(h.deps, draft.id, { revision: draft.revision, configHash: draft.configHash });
}

async function tick(h: ReturnType<typeof createFixture>) {
  const summary = await runAutomations(h.deps);
  h.clock.now += MINUTE;
  return summary;
}

describe('arbitrage monitor rules', () => {
  it('saves a draft that only the reviewed revision and hash can activate', async () => {
    const h = createFixture(1_900_000_000_000);
    const draft = await createRule(h.deps, { config: CONFIG });
    expect(draft).toMatchObject({ status: 'draft', revision: 1, name: 'XLM/USDC · Soroswap vs Stellar AMM' });
    await expect(activateRule(h.deps, draft.id, { revision: 1, configHash: '0'.repeat(64) })).rejects.toThrow(
      'changed since you reviewed it',
    );
    const revised = await reviseRule(h.deps, draft.id, {
      expectedRevision: 1,
      config: { ...CONFIG, thresholdBps: 80 },
    });
    expect(revised).toMatchObject({ status: 'draft', revision: 2 });
    await expect(activateRule(h.deps, draft.id, { revision: 1, configHash: draft.configHash })).rejects.toThrow(
      'changed since you reviewed it',
    );
    const active = await activateRule(h.deps, draft.id, { revision: 2, configHash: revised.configHash });
    expect(active).toMatchObject({ status: 'active', config: { thresholdBps: 80 } });
    await deleteRule(h.deps, draft.id);
  });

  it('rejects two identical pools and an empty size', async () => {
    const h = createFixture(1_900_000_000_000);
    await expect(createRule(h.deps, { config: { ...CONFIG, venues: ['soroswap', 'soroswap'] } })).rejects.toThrow(
      'two different pools',
    );
    await expect(createRule(h.deps, { config: { ...CONFIG, sizeUsdc: '0' } })).rejects.toThrow('above zero');
  });
});

describe('scheduled checks', () => {
  it('alerts once when the gap opens, re-arms when it closes, and respects the cooldown', async () => {
    const h = createFixture(1_910_000_000_000);
    const rule = await activeRule(h);

    await tick(h); // equal prices: false
    h.prices.stellar_amm = 180_000n; // a ~5.9% gap
    await tick(h); // true: alert
    await tick(h); // still true: disarmed, no second alert
    let state = await readRule(h.deps, rule.id);
    expect(state.evaluations.map((evaluation) => [evaluation.result, evaluation.triggered])).toEqual([
      ['true', false],
      ['true', true],
      ['false', false],
    ]);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]?.summary).toMatch(
      /^Buy XLM on Soroswap at 0\.1700 and sell on Stellar AMM at 0\.1800: \+5\.12%/,
    );
    expect(state).toMatchObject({ armed: false, lastResult: 'true' });

    h.prices.stellar_amm = 170_000n;
    await tick(h); // false: re-armed
    h.prices.stellar_amm = 180_000n;
    await tick(h); // true but within the 5-minute cooldown of the first alert
    state = await readRule(h.deps, rule.id);
    expect(state.alerts).toHaveLength(1);
    h.clock.now += 5 * MINUTE;
    await tick(h); // cooldown over: second alert
    state = await readRule(h.deps, rule.id);
    expect(state.alerts).toHaveLength(2);

    const outbox = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM outbox WHERE topic = 'automation.alert' AND payload LIKE ?",
    )
      .bind(`%${rule.id}%`)
      .first<{ count: number }>();
    expect(outbox?.count).toBe(2);
    await deleteRule(h.deps, rule.id);
  });

  it('records unknown, without alerting or re-arming, when a pool cannot be read', async () => {
    const h = createFixture(1_920_000_000_000);
    const rule = await activeRule(h);
    h.prices.soroswap = null;
    h.prices.stellar_amm = 180_000n;
    await tick(h);
    const state = await readRule(h.deps, rule.id);
    expect(state.evaluations[0]).toMatchObject({ result: 'unknown', triggered: false });
    expect(state.evaluations[0]?.reason).toContain('soroswap is unreachable');
    expect(state.alerts).toHaveLength(0);
    await deleteRule(h.deps, rule.id);
  });

  it('completes a one-shot rule after its first alert', async () => {
    const h = createFixture(1_930_000_000_000);
    h.prices.stellar_amm = 180_000n;
    const rule = await activeRule(h, { ...CONFIG, mode: 'once' });
    await tick(h);
    await tick(h);
    const state = await readRule(h.deps, rule.id);
    expect(state).toMatchObject({ status: 'completed', nextCheckAt: null });
    expect(state.evaluations).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
    await deleteRule(h.deps, rule.id);
  });

  it('never evaluates a paused rule or a revision replaced after its check was queued', async () => {
    const h = createFixture(1_940_000_000_000);
    h.prices.stellar_amm = 180_000n;
    const rule = await activeRule(h);
    await pauseRule(h.deps, rule.id);
    await tick(h);
    expect((await readRule(h.deps, rule.id)).evaluations).toHaveLength(0);

    const draft = await reviseRule(h.deps, rule.id, { expectedRevision: 1, config: CONFIG });
    await activateRule(h.deps, rule.id, { revision: 2, configHash: draft.configHash });
    // Queue revision 2's check, then replace the revision before it runs.
    await env.DB.prepare(
      `INSERT INTO jobs (id, kind, status, payload, dedupe_key, attempts, max_attempts, run_after_ms, created_at_ms, updated_at_ms)
       VALUES (?, 'automation.evaluate', 'queued', ?, ?, 0, 3, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        JSON.stringify({ ruleId: rule.id, revision: 2, scheduledForMs: h.clock.now }),
        `stale:${rule.id}`,
        h.clock.now,
        h.clock.now,
        h.clock.now,
      )
      .run();
    await reviseRule(h.deps, rule.id, { expectedRevision: 2, config: CONFIG });
    await tick(h);
    expect((await readRule(h.deps, rule.id)).evaluations).toHaveLength(0);
    await deleteRule(h.deps, rule.id);
  });

  it('fires one alert when two scheduler invocations overlap', async () => {
    const h = createFixture(1_950_000_000_000);
    h.prices.stellar_amm = 180_000n;
    const rule = await activeRule(h);
    await Promise.all([runAutomations(h.deps), runAutomations(h.deps)]);
    const state = await readRule(h.deps, rule.id);
    expect(state.evaluations).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
    await acknowledgeTrigger(h.deps, state.alerts[0]?.id ?? '');
    expect((await readRule(h.deps, rule.id)).alerts[0]?.acknowledgedAt).not.toBeNull();
    await deleteRule(h.deps, rule.id);
  });
});

describe('automation routes', () => {
  it('creates a draft and validates settings over HTTP', async () => {
    const post = (body: unknown) =>
      exports.default.fetch(`${ORIGIN}/api/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const created = await post({ kind: 'arbitrage', config: CONFIG });
    expect(created.status).toBe(201);
    const rule = (await created.json()) as { id: string; status: string };
    expect(rule.status).toBe('draft');
    const listed = (await (await exports.default.fetch(`${ORIGIN}/api/automations`)).json()) as {
      automations: { id: string }[];
    };
    expect(listed.automations.map((entry) => entry.id)).toContain(rule.id);
    expect((await post({ kind: 'arbitrage', config: { ...CONFIG, thresholdBps: 0 } })).status).toBe(400);
  });
});
