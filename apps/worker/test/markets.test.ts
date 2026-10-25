import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.ts';

describe('Aquarius market discovery', () => {
  it('returns read-only two-asset candidates with separate source times', async () => {
    const pool = {
      address: 'CA6PUJLBYKZKUEKLZJMKBZLEKP2OTHANDEOWSFF44FTSYLKQPIICCJBE',
      index: 'a'.repeat(64),
      tokens_addresses: [
        'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
        'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
      ],
      tokens_str: ['native', 'USDC'],
      pool_type: 'constant_product',
      fee: '0.0010',
    };
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).includes('/api/external/')
          ? Response.json({ count: 1, next: null, results: [pool] })
          : Response.json({ total: 1, pages: 1, items: [{ ...pool, liquidity_usd: '10000000' }] }),
      );
    try {
      const response = await createApp().request('/api/markets?kind=liquidity_pool&venue=aquarius', {}, env);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        network: 'mainnet',
        upstreamAsOf: null,
        pools: [{ executable: false, verification: 'unverified', totalAprPct: null }],
      });
    } finally {
      upstream.mockRestore();
    }
  });
  it('rejects a cross-network request before any upstream call', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await createApp().request(
        '/api/markets?kind=liquidity_pool&venue=aquarius&network=testnet',
        {},
        env,
      );
      expect(response.status).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      upstream.mockRestore();
    }
  });
  it('never exposes an action endpoint or accepts an unsupported venue', async () => {
    expect((await createApp().request('/api/markets?kind=liquidity_pool&venue=sushi', {}, env)).status).toBe(400);
    expect((await createApp().request('/api/markets', { method: 'POST' }, env)).status).toBe(404);
  });
});
