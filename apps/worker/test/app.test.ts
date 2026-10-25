import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';

const ORIGIN = 'https://nest.test';

describe('GET /api/health', () => {
  it('reports the network, the execution flag and a working database', async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'nest',
      network: 'mainnet',
      executionEnabled: false,
      database: 'ok',
    });
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('reports the Testnet binding when configured for it', async () => {
    const response = await createApp().request('/api/health', {}, { ...env, STELLAR_NETWORK: 'testnet' });
    expect(await response.json()).toMatchObject({ network: 'testnet' });
  });

  it('answers 503 without naming the variable when configuration is invalid', async () => {
    const response = await createApp().request('/api/health', {}, { ...env, EXECUTION_ENABLED: 'yes' });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('UNAVAILABLE');
    expect(body).not.toContain('EXECUTION_ENABLED');
    expect(body).not.toContain('yes');
  });
});

describe('error boundary', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rejects oversized bodies before a handler reads them', async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(64 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
