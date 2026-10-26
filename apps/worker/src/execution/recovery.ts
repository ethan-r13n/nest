import { readPlan } from './lifecycle.ts';
import type { ExecutionDeps } from './store.ts';

const MAX_PLANS_PER_TICK = 25;
const TICK_BUDGET_MS = 20_000;
const POLL_TIMEOUT_MS = 5_000;

/** Receipt-only recovery: the original hash is polled, never built, signed or submitted again. */
export async function recoverPendingPlans(deps: ExecutionDeps) {
  const summary = { checked: 0, confirmed: 0, failed: 0, pending: 0, timedOut: 0 };
  if (!deps.rpc) return summary;
  const deadlineMs = Date.now() + TICK_BUDGET_MS;
  const { results } = await deps.db
    .prepare(
      `SELECT id FROM plans WHERE network = ? AND status IN ('submitted', 'confirming')
       AND tx_hash IS NOT NULL ORDER BY updated_at_ms, id LIMIT ?`,
    )
    .bind(deps.config.network, MAX_PLANS_PER_TICK)
    .all<{ id: string }>();
  for (const row of results) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    summary.checked += 1;
    try {
      const plan = await Promise.race([
        readPlan(deps, row.id, { rebroadcast: false }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), Math.min(POLL_TIMEOUT_MS, remainingMs));
        }),
      ]);
      if (plan === null) {
        summary.timedOut += 1;
        summary.pending += 1;
        break;
      }
      if (plan.status === 'confirmed') summary.confirmed += 1;
      else if (plan.status === 'failed') summary.failed += 1;
      else summary.pending += 1;
    } catch (error) {
      summary.pending += 1;
      console.error(
        JSON.stringify({ recovery: 'poll_failed', error: error instanceof Error ? error.name : 'unknown' }),
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  return summary;
}
