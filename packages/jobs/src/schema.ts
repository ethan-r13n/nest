import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;

/** Durable background work. Times are Unix milliseconds; `attempts` is the fencing token. */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    dedupeKey: text('dedupe_key').unique(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAfterMs: integer('run_after_ms').notNull(),
    leaseOwner: text('lease_owner'),
    leaseUntilMs: integer('lease_until_ms'),
    lastError: text('last_error'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    finishedAtMs: integer('finished_at_ms'),
  },
  (table) => [
    index('jobs_due_idx').on(table.status, table.runAfterMs),
    index('jobs_kind_idx').on(table.kind),
    check('jobs_status_ck', sql`${table.status} IN ('queued', 'running', 'done', 'failed', 'cancelled')`),
    check('jobs_attempts_ck', sql`${table.attempts} >= 0 AND ${table.maxAttempts} >= 1`),
  ],
);

/** Messages a finished job hands on (alerts, proposals, reconciliation results), written with the job's completion. */
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(),
    topic: text('topic').notNull(),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    jobId: text('job_id').references(() => jobs.id),
    createdAtMs: integer('created_at_ms').notNull(),
    deliveredAtMs: integer('delivered_at_ms'),
  },
  (table) => [index('outbox_undelivered_idx').on(table.deliveredAtMs, table.createdAtMs)],
);
