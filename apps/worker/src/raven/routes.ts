import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import { TEAM_CONNECTION } from './connection.ts';

// Until operator sign-in exists, only a local session may connect the team's Raven account.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CallbackSchema = z.object({
  code: z.string().min(1).max(2_048),
  state: z.string().min(1).max(512),
  iss: z.url().optional(),
});

export function createRavenRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get('/status', async (c) => c.json(await raven(c.env).status()));

  routes.get('/connect', async (c) => {
    requireLocal(c.req.url);
    const result = await raven(c.env).beginAuthorization(new URL('/api/raven/callback', c.req.url).href);
    if (result.status !== 'redirect')
      throw new AppError('UNAVAILABLE', 'Raven did not start authorization. Try again.');
    return c.redirect(result.authorizationUrl, 302);
  });

  routes.get('/callback', async (c) => {
    requireLocal(c.req.url);
    if (c.req.query('error')) throw new AppError('INVALID_REQUEST', 'Raven authorization was declined or failed.');
    const parsed = CallbackSchema.safeParse(c.req.query());
    if (!parsed.success) throw new AppError('INVALID_REQUEST', 'Raven did not return an authorization code.');
    const result = await raven(c.env).completeAuthorization(parsed.data);
    if (result.status === 'failed')
      throw new AppError('UNAVAILABLE', 'Raven did not accept the authorization. Try again.');
    if (result.status !== 'connected') {
      throw new AppError('INVALID_REQUEST', 'This authorization does not match the one Nest started. Connect again.');
    }
    return c.html(
      '<!doctype html><title>Raven connected</title><p>Raven is connected for this Nest server. You can close this tab.</p>',
    );
  });

  // Operator check of what the connected Raven server exposes; the agent's tools stay fixed in code.
  routes.get('/tools', async (c) => {
    requireLocal(c.req.url);
    const tools = await raven(c.env).listTools();
    if (!tools) throw new AppError('UNAVAILABLE', 'Raven is not connected.');
    return c.json({ tools });
  });

  return routes;
}

function raven(env: Env) {
  return env.RAVEN.getByName(TEAM_CONNECTION);
}

function requireLocal(url: string): void {
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new AppError('FORBIDDEN', 'Connect Raven from a local Nest session.');
  }
}
