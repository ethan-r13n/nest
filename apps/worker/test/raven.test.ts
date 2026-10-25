import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { decodeEncryptionKey } from '../src/config.ts';
import { checkRavenTools, type RavenConnection, TEAM_CONNECTION } from '../src/raven/connection.ts';
import { importEncryptionKey, seal, unseal } from '../src/raven/crypto.ts';

const LOCAL = 'http://localhost:5287';
const REMOTE = 'https://nest.test';

function connection(name = TEAM_CONNECTION) {
  return env.RAVEN.getByName(name);
}

describe('sealed values', () => {
  it('round-trips and refuses tampering or another purpose', async () => {
    const key = await importEncryptionKey(decodeEncryptionKey(env));
    const sealed = await seal(key, 'raven-oauth-state', '{"tokens":"secret"}');

    expect(sealed).not.toContain('secret');
    expect(await unseal(key, 'raven-oauth-state', sealed)).toBe('{"tokens":"secret"}');
    await expect(unseal(key, 'another-purpose', sealed)).rejects.toThrow();
    const [version, iv, body = ''] = sealed.split('.');
    const flipped = `${version}.${iv}.${body.startsWith('A') ? `B${body.slice(1)}` : `A${body.slice(1)}`}`;
    await expect(unseal(key, 'raven-oauth-state', flipped)).rejects.toThrow();
  });

  it('refuses an encryption key that is not 32 bytes', () => {
    expect(() => decodeEncryptionKey({ APP_ENCRYPTION_KEY: btoa('short') })).toThrow(/APP_ENCRYPTION_KEY/);
    expect(() => decodeEncryptionKey({})).toThrow(/APP_ENCRYPTION_KEY/);
  });
});

describe('Raven routes', () => {
  it('reports a disconnected team account', async () => {
    const response = await exports.default.fetch(`${REMOTE}/api/raven/status`);
    expect(await response.json()).toEqual({ connected: false });
  });

  it('only lets a local session connect or complete authorization', async () => {
    for (const path of ['/api/raven/connect', '/api/raven/callback?code=c&state=s', '/api/raven/tools']) {
      const response = await exports.default.fetch(`${REMOTE}${path}`);
      expect(response.status).toBe(403);
    }
  });

  it('rejects a callback when no authorization was started', async () => {
    const response = await exports.default.fetch(`${LOCAL}/api/raven/callback?code=c&state=s`);
    expect(response.status).toBe(400);
  });

  it('rejects a callback whose state does not match, before calling Raven', async () => {
    const stub = connection();
    await runInDurableObject(stub, async (_instance: RavenConnection, state) => {
      const key = await importEncryptionKey(decodeEncryptionKey(env));
      const pending = JSON.stringify({
        serverUrl: 'https://raven.stellar.org/mcp',
        codeVerifier: 'v',
        oauthState: 'expected',
      });
      state.storage.sql.exec(
        'INSERT INTO oauth (id, redirect_url, sealed_state, updated_at_ms) VALUES (1, ?, ?, 0)',
        `${LOCAL}/api/raven/callback`,
        await seal(key, 'raven-oauth-state', pending),
      );
    });

    expect(await stub.completeAuthorization({ code: 'c', state: 'forged' })).toEqual({ status: 'invalid_state' });
    const response = await exports.default.fetch(`${LOCAL}/api/raven/callback?code=c&state=forged`);
    expect(response.status).toBe(400);
    expect(await stub.status()).toEqual({ connected: false });
  });

  it('reports a declined authorization', async () => {
    const response = await exports.default.fetch(`${LOCAL}/api/raven/callback?error=access_denied`);
    expect(response.status).toBe(400);
  });
});

describe('Raven tool calls', () => {
  it('answers not_connected without a grant', async () => {
    const stub = connection('tool-calls-without-grant');
    expect(await stub.callTool('search', { query: 'blend' })).toEqual({ status: 'not_connected' });
    expect(await stub.listTools()).toBeNull();
  });
});

describe('Raven schema check', () => {
  const search = {
    name: 'search',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  };
  const execute = {
    name: 'execute',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
  };

  it('accepts the two tools with the inputs Nest sends, plus unrelated extras', () => {
    expect(checkRavenTools([search, execute, { name: 'new_tool', inputSchema: {} }])).toBe(true);
  });

  it('refuses a missing tool or a changed input', () => {
    expect(checkRavenTools([search])).toBe(false);
    expect(
      checkRavenTools([
        search,
        {
          name: 'execute',
          inputSchema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
        },
      ]),
    ).toBe(false);
    expect(
      checkRavenTools([
        search,
        {
          name: 'execute',
          inputSchema: { type: 'object', properties: { code: { type: 'object' } }, required: ['code'] },
        },
      ]),
    ).toBe(false);
  });

  it('refuses to call a Raven tool outside the two Nest uses', async () => {
    // @ts-expect-error: the RPC type allows only search and execute; this checks the runtime guard too.
    expect(await env.RAVEN.getByName('guard').callTool('delete_everything', {})).toEqual({ status: 'unavailable' });
  });
});
