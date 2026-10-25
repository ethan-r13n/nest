import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { beforeEach, describe, expect, it } from 'vitest';

import { claim, complete, enqueue, fail, failExhausted, release, renew, Superseded } from '../src/jobs.ts';
import { jobs, outbox } from '../src/schema.ts';

const LEASE_MS = 30_000;
const db = drizzle(env.DB);

beforeEach(async () => {
  await db.delete(outbox);
  await db.delete(jobs);
});

describe('enqueue', () => {
  it('returns the first job for a repeated dedupe key', async () => {
    const first = await enqueue(db, { kind: 'reconcile', payload: { hash: 'a' }, dedupeKey: 'tx:a' }, 1_000);
    const second = await enqueue(db, { kind: 'reconcile', payload: { hash: 'a' }, dedupeKey: 'tx:a' }, 2_000);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await db.select().from(jobs)).toHaveLength(1);
  });
});

describe('claim', () => {
  it('takes a due job, starts an attempt and leaves future jobs alone', async () => {
    await enqueue(db, { kind: 'ingest', payload: { source: 'defillama' } }, 1_000);
    await enqueue(db, { kind: 'ingest', payload: { source: 'later' }, runAfterMs: 9_000 }, 1_000);
    const lease = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000 });
    expect(lease).toMatchObject({ kind: 'ingest', payload: { source: 'defillama' }, attempt: 1, owner: 'a' });
    expect(await claim(db, { owner: 'b', leaseMs: LEASE_MS, nowMs: 2_000 })).toBeNull();
  });

  it('gives one job to exactly one of several concurrent claimers', async () => {
    await enqueue(db, { kind: 'reconcile', payload: {} }, 1_000);
    const leases = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((owner) => claim(db, { owner, leaseMs: LEASE_MS, nowMs: 2_000 })),
    );
    expect(leases.filter((lease) => lease !== null)).toHaveLength(1);
  });

  it('only claims the requested kinds', async () => {
    await enqueue(db, { kind: 'evaluate', payload: {} }, 1_000);
    expect(await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000, kinds: ['reconcile'] })).toBeNull();
    expect(await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000, kinds: ['evaluate'] })).not.toBeNull();
  });
});

describe('fencing', () => {
  it('lets a new attempt take over a lapsed lease and refuses the stale attempt', async () => {
    const { id } = await enqueue(db, { kind: 'reconcile', payload: {} }, 1_000);
    const stale = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000 });
    const fresh = await claim(db, { owner: 'b', leaseMs: LEASE_MS, nowMs: 2_000 + LEASE_MS + 1 });
    if (!stale || !fresh) throw new Error('expected both claims to succeed');
    expect(fresh.attempt).toBe(2);

    await expect(renew(db, stale, LEASE_MS, 40_000)).rejects.toBeInstanceOf(Superseded);
    await expect(
      complete(db, stale, 40_000, { topic: 'alert', payload: { from: 'stale' }, dedupeKey: 'alert:1' }),
    ).rejects.toBeInstanceOf(Superseded);
    expect(await db.select().from(outbox)).toHaveLength(0);

    await complete(db, fresh, 41_000, { topic: 'alert', payload: { from: 'fresh' }, dedupeKey: 'alert:1' });
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row?.status).toBe('done');
    expect(await db.select().from(outbox)).toMatchObject([{ topic: 'alert', payload: { from: 'fresh' }, jobId: id }]);
  });

  it('does not deliver an outbox message twice for the same dedupe key', async () => {
    await enqueue(db, { kind: 'evaluate', payload: {}, dedupeKey: 'one' }, 1_000);
    await enqueue(db, { kind: 'evaluate', payload: {}, dedupeKey: 'two' }, 1_000);
    for (const nowMs of [2_000, 3_000]) {
      const lease = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs });
      if (!lease) throw new Error('expected a lease');
      await complete(db, lease, nowMs, { topic: 'alert', payload: {}, dedupeKey: 'rule:1:window:7' });
    }
    expect(await db.select().from(outbox)).toHaveLength(1);
  });
});

describe('fail and release', () => {
  it('retries with a delay until the attempts run out', async () => {
    const { id } = await enqueue(db, { kind: 'ingest', payload: {}, maxAttempts: 2 }, 1_000);
    const first = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000 });
    if (!first) throw new Error('expected a lease');
    await fail(db, first, 'provider timeout', 2_000, 5_000);
    expect(await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 6_000 })).toBeNull();

    const second = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 7_000 });
    if (!second) throw new Error('expected a lease');
    await fail(db, second, 'provider timeout', 7_000, 5_000);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row).toMatchObject({ status: 'failed', attempts: 2, lastError: 'provider timeout' });
  });

  it('hands a job back on a graceful stop without spending an attempt', async () => {
    const { id } = await enqueue(db, { kind: 'ingest', payload: {} }, 1_000);
    const lease = await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000 });
    if (!lease) throw new Error('expected a lease');
    await release(db, lease, 3_000);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row).toMatchObject({ status: 'queued', attempts: 0, leaseOwner: null });
    expect((await claim(db, { owner: 'b', leaseMs: LEASE_MS, nowMs: 3_000 }))?.attempt).toBe(1);
  });

  it('fails a job whose final attempt lapsed', async () => {
    const { id } = await enqueue(db, { kind: 'ingest', payload: {}, maxAttempts: 1 }, 1_000);
    await claim(db, { owner: 'a', leaseMs: LEASE_MS, nowMs: 2_000 });
    expect(await claim(db, { owner: 'b', leaseMs: LEASE_MS, nowMs: 2_000 + LEASE_MS + 1 })).toBeNull();
    expect(await failExhausted(db, 2_000 + LEASE_MS + 1)).toBe(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row?.status).toBe('failed');
  });
});
