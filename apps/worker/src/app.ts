import { AppError, type ErrorCode } from '@nest/domain/errors';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { createAgentRoutes } from './agent/routes.ts';
import { ConfigError, decodeConfig } from './config.ts';
import { createExecutionRoutes } from './execution/routes.ts';
import { createRavenRoutes } from './raven/routes.ts';

const MAX_BODY_BYTES = 64 * 1024;
const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  EXECUTION_DISABLED: 409,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface AppEnv {
  Bindings: Env;
  Variables: { requestId: string };
}

type AppContext = Context<AppEnv>;

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use(requestId());
  app.use(logRequest);
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, new AppError('PAYLOAD_TOO_LARGE', 'The request body is too large.')),
    }),
  );

  app.get('/health', async (c) => {
    const config = decodeConfig(c.env);
    const database = await checkDatabase(c.env.DB);
    return c.json(
      {
        ok: database === 'ok',
        service: 'nest',
        network: config.network,
        executionEnabled: config.executionEnabled,
        database,
        requestId: c.get('requestId'),
      },
      database === 'ok' ? 200 : 503,
    );
  });

  app.route('/agent', createAgentRoutes());
  app.route('/raven', createRavenRoutes());
  app.route('/', createExecutionRoutes());

  app.notFound((c) => errorResponse(c, new AppError('NOT_FOUND', 'No such endpoint.')));
  app.onError((error, c) => errorResponse(c, error));
  return app;
}

const logRequest = createMiddleware<AppEnv>(async (c, next) => {
  const startedAt = Date.now();
  await next();
  console.log(
    JSON.stringify({
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    }),
  );
});

async function checkDatabase(db: D1Database): Promise<'ok' | 'error'> {
  try {
    const row = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return row?.ok === 1 ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

function errorResponse(c: AppContext, error: unknown) {
  const publicError = toPublicError(error);
  if (publicError.code === 'INTERNAL' || publicError.code === 'UNAVAILABLE') {
    console.error(
      JSON.stringify({
        requestId: c.get('requestId'),
        error: error instanceof Error ? error.name : 'unknown',
        detail: error instanceof ConfigError ? error.variables : undefined,
      }),
    );
  }
  const retryAfterSeconds = error instanceof AppError ? error.retryAfterSeconds : undefined;
  if (retryAfterSeconds !== undefined) c.header('retry-after', String(retryAfterSeconds));
  return c.json(
    {
      ok: false,
      error: {
        code: publicError.code,
        message: publicError.message,
        requestId: c.get('requestId'),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      },
    },
    STATUS_BY_CODE[publicError.code],
  );
}

function toPublicError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof ConfigError) return { code: 'UNAVAILABLE', message: 'The service is not configured.' };
  return { code: 'INTERNAL', message: 'Something went wrong.' };
}
