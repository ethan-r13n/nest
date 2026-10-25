import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

import { jobs, outbox } from './schema.ts';

export type Db = DrizzleD1Database<Record<string, unknown>>;

export interface EnqueueInput {
  kind: string;
  payload: unknown;
  /** Callers scope it themselves (tenant, rule revision, trigger window); a repeat enqueue returns the first job. */
  dedupeKey?: string;
  runAfterMs?: number;
  maxAttempts?: number;
}

/** Proof that this attempt owns the job. Every write after the claim is fenced on it. */
export interface Lease {
  id: string;
  kind: string;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  owner: string;
}

export interface OutboxMessage {
  topic: string;
  payload: unknown;
  dedupeKey: string;
}

/** A write from an attempt that no longer owns its job: its lease lapsed and another claim took over, or it was cancelled. */
export class Superseded extends Error {
  override name = 'Superseded';
}

export async function enqueue(db: Db, input: EnqueueInput, nowMs: number): Promise<{ id: string; created: boolean }> {
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(jobs)
    .values({
      id,
      kind: input.kind,
      payload: input.payload,
      dedupeKey: input.dedupeKey ?? null,
      maxAttempts: input.maxAttempts ?? 5,
      runAfterMs: input.runAfterMs ?? nowMs,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  if (inserted.length === 1) return { id, created: true };
  if (input.dedupeKey === undefined) throw new Error('Job insert returned no row.');
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, input.dedupeKey));
  if (!existing) throw new Error('Deduplicated job disappeared.');
  return { id: existing.id, created: false };
}

/**
 * Claims the next due job in one statement: SQLite serializes writes, so concurrent claimers
 * cannot both win it. A running job whose lease lapsed is due again while attempts remain.
 */
export async function claim(
  db: Db,
  options: { owner: string; leaseMs: number; nowMs: number; kinds?: readonly string[] },
): Promise<Lease | null> {
  const due = or(
    and(eq(jobs.status, 'queued'), lte(jobs.runAfterMs, options.nowMs)),
    and(eq(jobs.status, 'running'), lt(jobs.leaseUntilMs, options.nowMs), lt(jobs.attempts, jobs.maxAttempts)),
  );
  const scope = options.kinds ? and(due, inArray(jobs.kind, [...options.kinds])) : due;
  const next = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(scope)
    .orderBy(asc(jobs.runAfterMs), asc(jobs.createdAtMs))
    .limit(1);
  const [row] = await db
    .update(jobs)
    .set({
      status: 'running',
      attempts: sql`${jobs.attempts} + 1`,
      leaseOwner: options.owner,
      leaseUntilMs: options.nowMs + options.leaseMs,
      updatedAtMs: options.nowMs,
    })
    .where(and(inArray(jobs.id, next), scope))
    .returning({
      id: jobs.id,
      kind: jobs.kind,
      payload: jobs.payload,
      attempt: jobs.attempts,
      maxAttempts: jobs.maxAttempts,
    });
  return row ? { ...row, owner: options.owner } : null;
}

export async function renew(db: Db, lease: Lease, leaseMs: number, nowMs: number): Promise<void> {
  const result = await db
    .update(jobs)
    .set({ leaseUntilMs: nowMs + leaseMs, updatedAtMs: nowMs })
    .where(owned(lease));
  expectOneChange(result.meta.changes, lease);
}

/**
 * Finishes the job and writes its outbox message together. The message insert is guarded on
 * the completion, so a superseded attempt writes neither.
 */
export async function complete(db: Db, lease: Lease, nowMs: number, message?: OutboxMessage): Promise<void> {
  const finish = db
    .update(jobs)
    .set({ status: 'done', leaseOwner: null, leaseUntilMs: null, updatedAtMs: nowMs, finishedAtMs: nowMs })
    .where(owned(lease));
  if (!message) {
    const result = await finish;
    expectOneChange(result.meta.changes, lease);
    return;
  }
  // Columns in table order: id, topic, payload, dedupe_key, job_id, created_at_ms, delivered_at_ms.
  const deliver = db
    .insert(outbox)
    .select(
      sql`SELECT ${crypto.randomUUID()}, ${message.topic}, ${JSON.stringify(message.payload)}, ${message.dedupeKey},
        ${lease.id}, ${nowMs}, NULL
      WHERE EXISTS (
        SELECT 1 FROM ${jobs}
        WHERE ${jobs.id} = ${lease.id} AND ${jobs.status} = 'done' AND ${jobs.attempts} = ${lease.attempt}
          AND ${jobs.finishedAtMs} = ${nowMs}
      )`,
    )
    .onConflictDoNothing({ target: outbox.dedupeKey });
  const [finished] = await db.batch([finish, deliver]);
  expectOneChange(finished.meta.changes, lease);
}

/** Requeues with a delay while attempts remain; otherwise the job fails for good. */
export async function fail(db: Db, lease: Lease, error: string, nowMs: number, retryDelayMs: number): Promise<void> {
  const final = lease.attempt >= lease.maxAttempts;
  const result = await db
    .update(jobs)
    .set(
      final
        ? {
            status: 'failed',
            lastError: error,
            leaseOwner: null,
            leaseUntilMs: null,
            updatedAtMs: nowMs,
            finishedAtMs: nowMs,
          }
        : {
            status: 'queued',
            lastError: error,
            runAfterMs: nowMs + retryDelayMs,
            leaseOwner: null,
            leaseUntilMs: null,
            updatedAtMs: nowMs,
          },
    )
    .where(owned(lease));
  expectOneChange(result.meta.changes, lease);
}

/** A graceful stop hands the job back at once without spending the attempt it used. */
export async function release(db: Db, lease: Lease, nowMs: number): Promise<void> {
  const result = await db
    .update(jobs)
    .set({
      status: 'queued',
      attempts: sql`${jobs.attempts} - 1`,
      runAfterMs: nowMs,
      leaseOwner: null,
      leaseUntilMs: null,
      updatedAtMs: nowMs,
    })
    .where(owned(lease));
  expectOneChange(result.meta.changes, lease);
}

/** Marks running jobs whose final attempt's lease lapsed as failed, so they stop looking alive. */
export async function failExhausted(db: Db, nowMs: number): Promise<number> {
  const result = await db
    .update(jobs)
    .set({ status: 'failed', lastError: 'Lease lapsed on the final attempt.', updatedAtMs: nowMs, finishedAtMs: nowMs })
    .where(and(eq(jobs.status, 'running'), lt(jobs.leaseUntilMs, nowMs), sql`${jobs.attempts} >= ${jobs.maxAttempts}`));
  return result.meta.changes;
}

function owned(lease: Lease) {
  return and(
    eq(jobs.id, lease.id),
    eq(jobs.status, 'running'),
    eq(jobs.attempts, lease.attempt),
    eq(jobs.leaseOwner, lease.owner),
  );
}

function expectOneChange(changes: number, lease: Lease) {
  if (changes !== 1) throw new Superseded(`Job ${lease.id} attempt ${lease.attempt} no longer owns its lease.`);
}
