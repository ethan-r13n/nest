import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const FOUNDATION_TABLES = [
  'asset_registry',
  'auth_challenges',
  'auth_sessions',
  'jobs',
  'outbox',
  'protocol_registry',
  'users',
  'wallet_accounts',
];

describe('migrations', () => {
  it('create every foundation table in D1', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((row) => row.name)).toEqual(expect.arrayContaining(FOUNDATION_TABLES));
  });

  it('enforce one wallet account per network and address', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, created_at_ms) VALUES (?, ?)').bind('u1', now),
      env.DB.prepare(
        'INSERT INTO wallet_accounts (id, user_id, network, account_id, created_at_ms) VALUES (?, ?, ?, ?, ?)',
      ).bind('w1', 'u1', 'testnet', 'GDEMO', now),
    ]);
    await expect(
      env.DB.prepare(
        'INSERT INTO wallet_accounts (id, user_id, network, account_id, created_at_ms) VALUES (?, ?, ?, ?, ?)',
      )
        .bind('w2', 'u1', 'testnet', 'GDEMO', now)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
  });
});
