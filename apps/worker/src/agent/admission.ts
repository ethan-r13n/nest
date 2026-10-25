import { DurableObject } from 'cloudflare:workers';

import type { AdmissionLimits } from '../config.ts';

/** The single admission object; every conversation asks it before starting a model run. */
export const ADMISSION_SCOPE = 'global';

export type AdmissionResult =
  | { status: 'admitted' }
  | { status: 'rate_limited'; retryAfterMs: number }
  | { status: 'at_capacity'; retryAfterMs: number };

// Longer than a turn's deadline, so a run whose release was lost stops counting on its own.
const RUN_LEASE_MS = 120_000;
const AT_CAPACITY_RETRY_MS = 15_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS turns (subject TEXT NOT NULL, at_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS turns_by_subject ON turns (subject, at_ms);
CREATE TABLE IF NOT EXISTS active_runs (run_id TEXT PRIMARY KEY, lease_until_ms INTEGER NOT NULL);`;

/**
 * Host-side AI admission: per-subject turn windows and a global cap on concurrent model runs.
 * It stores hashed subjects and timestamps only, never chat content.
 */
export class AgentAdmission extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
  }

  acquire(input: { runId: string; subject: string; limits: AdmissionLimits }): AdmissionResult {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const { guestTurns, guestWindowMs, activeRuns } = input.limits;
    sql.exec('DELETE FROM active_runs WHERE lease_until_ms <= ?', now);
    sql.exec('DELETE FROM turns WHERE at_ms <= ?', now - guestWindowMs);

    const recent = sql
      .exec<{ at_ms: number }>('SELECT at_ms FROM turns WHERE subject = ? ORDER BY at_ms', input.subject)
      .toArray();
    const oldest = recent[0];
    if (oldest && recent.length >= guestTurns) {
      return { status: 'rate_limited', retryAfterMs: oldest.at_ms + guestWindowMs - now };
    }
    const running = sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM active_runs').one().count;
    if (running >= activeRuns) return { status: 'at_capacity', retryAfterMs: AT_CAPACITY_RETRY_MS };

    sql.exec('INSERT INTO turns (subject, at_ms) VALUES (?, ?)', input.subject, now);
    sql.exec('INSERT INTO active_runs (run_id, lease_until_ms) VALUES (?, ?)', input.runId, now + RUN_LEASE_MS);
    return { status: 'admitted' };
  }

  release(runId: string): void {
    this.ctx.storage.sql.exec('DELETE FROM active_runs WHERE run_id = ?', runId);
  }
}
