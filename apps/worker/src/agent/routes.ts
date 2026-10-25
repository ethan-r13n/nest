import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import { decodeAdmissionLimits } from '../config.ts';

const MAX_MESSAGE_CHARS = 4_000;
// A Stellar secret seed: "S" and 55 more base32 characters.
const STELLAR_SECRET_SEED = /\bS[A-Z2-7]{55}\b/;
const encoder = new TextEncoder();

const MessageSchema = z.strictObject({
  messageId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});
const AfterSchema = z.coerce.number().int().min(0).default(0);

export function createAgentRoutes() {
  const routes = new Hono<AppEnv>();

  routes.post('/conversations', (c) => c.json({ conversationId: crypto.randomUUID() }, 201));

  routes.post('/conversations/:id/messages', async (c) => {
    const parsed = MessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 'Send a messageId (UUID) and 1 to 4000 characters of text.');
    }
    // Refused before it is stored or reaches a model.
    if (STELLAR_SECRET_SEED.test(parsed.data.text)) {
      throw new AppError(
        'INVALID_REQUEST',
        'That message looks like it contains a secret key. Nest never needs one; it was not sent.',
      );
    }
    const result = await conversation(c.env, c.req.param('id')).admit({
      ...parsed.data,
      subject: await subjectOf(c.req.header('cf-connecting-ip')),
      limits: decodeAdmissionLimits(c.env),
    });
    switch (result.status) {
      case 'busy':
        throw new AppError('CONFLICT', 'This conversation is already answering a message.');
      case 'rate_limited':
        throw new AppError('RATE_LIMITED', 'You have reached the guest message limit for now.', {
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        });
      case 'at_capacity':
        throw new AppError('UNAVAILABLE', 'Nest is answering other questions. Try again in a few seconds.', {
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        });
      default:
        return c.json(result, result.status === 'started' ? 202 : 200);
    }
  });

  routes.get('/conversations/:id/runs/:runId/events', async (c) => {
    // A reconnecting EventSource resends its original URL, so its Last-Event-ID wins over `after`.
    const after = AfterSchema.safeParse(c.req.header('last-event-id') ?? c.req.query('after'));
    if (!after.success) throw new AppError('INVALID_REQUEST', 'after must be a non-negative event id.');
    const stream = await conversation(c.env, c.req.param('id')).events(runIdOf(c.req.param('runId')), after.data);
    return c.body(stream, 200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    });
  });

  routes.post('/conversations/:id/runs/:runId/abort', async (c) => {
    const result = await conversation(c.env, c.req.param('id')).stop(runIdOf(c.req.param('runId')));
    return c.json(result, result.status === 'stopping' ? 202 : 200);
  });

  routes.get('/conversations/:id', async (c) => c.json(await conversation(c.env, c.req.param('id')).transcript()));

  return routes;
}

function conversation(env: Env, id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'No such conversation.');
  return env.CONVERSATIONS.getByName(id);
}

function runIdOf(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'No such run.');
  return id;
}

/** Guests are counted by a hash of their IP address; the address itself is never stored. */
async function subjectOf(ip: string | undefined): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`nest-guest:${ip ?? 'local'}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
