import { PoolUnavailable, readPool } from '@nest/adapters/amm/pools';
import { claim, complete, enqueue, fail, failExhausted, type Lease, Superseded } from '@nest/jobs/jobs';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';

import { decodeExecutionConfig } from '../config.ts';
import type { ArbitrageConfig } from './config.ts';
import { evaluateArbitrage } from './evaluate.ts';
import type { AutomationDeps, RuleRow } from './rules.ts';

const JOB_KIND = 'automation.evaluate';
/** Long enough for two pool reads with timeouts; an expired lease lets another tick retry the check. */
const LEASE_MS = 45_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;
/** Bounds one scheduled invocation so it stays inside the Worker's time and subrequest budgets. */
const MAX_RULES_PER_TICK = 25;
const MAX_EVALUATIONS_PER_TICK = 25;
const TICK_BUDGET_MS = 25_000;

const JobPayloadSchema = z.strictObject({
  ruleId: z.uuid(),
  revision: z.number().int().positive(),
  scheduledForMs: z.number().int().nonnegative(),
});

export function automationDeps(env: Env): AutomationDeps {
  const config = decodeExecutionConfig(env);
  const rpcUrl = config.rpcUrl;
  return {
    db: env.DB,
    network: config.network,
    now: Date.now,
    pools: {
      read: (venue) =>
        rpcUrl || venue === 'stellar_amm'
          ? readPool(venue, { network: config.network, rpcUrl: rpcUrl ?? '' })
          : Promise.reject(new PoolUnavailable('No Stellar RPC is configured on this server.')),
    },
  };
}

/**
 * One scheduler tick: queue a check for every active rule that is due, then run queued checks
 * under leases until the batch or time budget runs out. Overlapping ticks are safe: each due slot
 * becomes one job, and a job runs under exactly one lease at a time.
 */
export async function runAutomations(deps: AutomationDeps) {
  const db = drizzle(deps.db);
  const startedAtMs = deps.now();
  await failExhausted(db, startedAtMs);

  const { results: due } = await deps.db
    .prepare(
      `SELECT id, revision, interval_ms, next_due_at_ms FROM automation_rules
       WHERE network = ? AND status = 'active' AND next_due_at_ms <= ?
       ORDER BY next_due_at_ms LIMIT ?`,
    )
    .bind(deps.network, startedAtMs, MAX_RULES_PER_TICK)
    .all<Pick<RuleRow, 'id' | 'revision' | 'interval_ms'> & { next_due_at_ms: number }>();
  for (const rule of due) {
    await enqueue(
      db,
      {
        kind: JOB_KIND,
        payload: { ruleId: rule.id, revision: rule.revision, scheduledForMs: rule.next_due_at_ms },
        dedupeKey: `automation:${rule.id}:${rule.revision}:${rule.next_due_at_ms}`,
        maxAttempts: MAX_ATTEMPTS,
      },
      startedAtMs,
    );
    // Missed slots are skipped rather than replayed: the next check is one interval from now.
    await deps.db
      .prepare(
        `UPDATE automation_rules SET next_due_at_ms = ?
         WHERE id = ? AND revision = ? AND status = 'active' AND next_due_at_ms = ?`,
      )
      .bind(startedAtMs + rule.interval_ms, rule.id, rule.revision, rule.next_due_at_ms)
      .run();
  }

  const owner = `scheduler:${crypto.randomUUID()}`;
  let evaluated = 0;
  let alerts = 0;
  while (evaluated < MAX_EVALUATIONS_PER_TICK && deps.now() - startedAtMs < TICK_BUDGET_MS) {
    const lease = await claim(db, { owner, leaseMs: LEASE_MS, nowMs: deps.now(), kinds: [JOB_KIND] });
    if (!lease) break;
    evaluated += 1;
    try {
      if (await runCheck(deps, lease)) alerts += 1;
    } catch (error) {
      if (error instanceof Superseded) continue;
      console.error(JSON.stringify({ automation: 'check_failed', job: lease.id, error: messageOf(error) }));
      await fail(db, lease, messageOf(error), deps.now(), RETRY_DELAY_MS).catch(() => {});
    }
  }
  return { scheduled: due.length, evaluated, alerts };
}

/**
 * Evaluates one due slot of one rule revision and records the result. Every write is fenced on the
 * job's lease, and the alert also on the rule still being active, armed and unchanged, so a retry
 * or an overlapping tick can never fire twice. Returns whether this slot fired an alert.
 */
async function runCheck(deps: AutomationDeps, lease: Lease): Promise<boolean> {
  const db = drizzle(deps.db);
  const payload = JobPayloadSchema.parse(lease.payload);
  const rule = await deps.db
    .prepare('SELECT * FROM automation_rules WHERE id = ? AND network = ?')
    .bind(payload.ruleId, deps.network)
    .first<RuleRow>();
  if (rule?.status !== 'active' || rule.revision !== payload.revision) {
    // Paused, deleted or revised since the slot was queued: the old revision is never evaluated.
    await complete(db, lease, deps.now());
    return false;
  }

  const evaluation = await evaluateArbitrage(JSON.parse(rule.config) as ArbitrageConfig, deps.pools);
  const now = deps.now();
  const cooled = rule.last_triggered_at_ms === null || now - rule.last_triggered_at_ms >= rule.cooldown_ms;
  const fire = evaluation.result === 'true' && rule.armed === 1 && cooled;
  const triggerKey = `${rule.id}:${rule.revision}:${payload.scheduledForMs}`;
  const owned = `EXISTS (SELECT 1 FROM jobs WHERE id = ? AND status = 'running' AND attempts = ? AND lease_owner = ?)`;
  const ownedArgs = [lease.id, lease.attempt, lease.owner];

  const statements: D1PreparedStatement[] = fire
    ? [
        deps.db
          .prepare(
            `UPDATE automation_rules SET armed = 0, last_triggered_at_ms = ?, last_evaluated_at_ms = ?,
               last_result = 'true', updated_at_ms = ?,
               status = CASE WHEN mode = 'once' THEN 'completed' ELSE status END,
               next_due_at_ms = CASE WHEN mode = 'once' THEN NULL ELSE next_due_at_ms END
             WHERE id = ? AND revision = ? AND status = 'active' AND armed = 1 AND ${owned}`,
          )
          .bind(now, now, now, rule.id, rule.revision, ...ownedArgs),
        deps.db
          .prepare(
            `INSERT OR IGNORE INTO automation_triggers
               (id, rule_id, revision, trigger_key, evaluation_id, summary, created_at_ms)
             SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
          )
          .bind(crypto.randomUUID(), rule.id, rule.revision, triggerKey, lease.id, evaluation.reason, now),
      ]
    : [
        // A false result re-arms the rule; unknown leaves it as it was.
        deps.db
          .prepare(
            `UPDATE automation_rules SET armed = CASE WHEN ? = 'false' THEN 1 ELSE armed END,
               last_evaluated_at_ms = ?, last_result = ?, updated_at_ms = ?
             WHERE id = ? AND revision = ? AND ${owned}`,
          )
          .bind(evaluation.result, now, evaluation.result, now, rule.id, rule.revision, ...ownedArgs),
      ];
  statements.push(
    deps.db
      .prepare(
        `INSERT OR IGNORE INTO automation_evaluations
           (id, rule_id, revision, scheduled_for_ms, evaluated_at_ms, result, reason, evidence, triggered)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, EXISTS (SELECT 1 FROM automation_triggers WHERE trigger_key = ?)
         WHERE ${owned}`,
      )
      .bind(
        lease.id,
        rule.id,
        rule.revision,
        payload.scheduledForMs,
        now,
        evaluation.result,
        evaluation.reason,
        JSON.stringify(evaluation.evidence),
        triggerKey,
        ...ownedArgs,
      ),
  );
  await deps.db.batch(statements);

  // A retry of a slot that already fired re-sends the same alert message; the dedupe key absorbs it.
  const trigger = await deps.db
    .prepare('SELECT id, summary FROM automation_triggers WHERE trigger_key = ?')
    .bind(triggerKey)
    .first<{ id: string; summary: string }>();
  await complete(
    db,
    lease,
    deps.now(),
    trigger
      ? {
          topic: 'automation.alert',
          dedupeKey: `alert:${triggerKey}`,
          payload: { ruleId: rule.id, triggerId: trigger.id, network: rule.network, summary: trigger.summary },
        }
      : undefined,
  );
  return trigger !== null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'unknown error';
}
