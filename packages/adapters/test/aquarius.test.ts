import { describe, expect, it } from 'vitest';

import { readAquariusPools } from '../src/aquarius/client.ts';

const POOL = {
  address: 'CA6PUJLBYKZKUEKLZJMKBZLEKP2OTHANDEOWSFF44FTSYLKQPIICCJBE',
  index: 'a'.repeat(64),
  tokens_addresses: [
    'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  ],
  tokens_str: ['native', 'USDC'],
  pool_type: 'stable',
  fee: '0.0010',
};
const STATISTICS = { ...POOL, liquidity_usd: '10000000' };
const STATS_PAGE = { total: 1, pages: 1, items: [STATISTICS] };

describe('bounded Aquarius reads', () => {
  it('ranks on the network-specific source, then checks v2 identities only for leading candidates', async () => {
    const urls: string[] = [];
    const snapshot = await readAquariusPools('testnet', new AbortController().signal, async (input) => {
      urls.push(String(input));
      return Response.json(urls.length === 1 ? STATS_PAGE : { count: 1, next: null, results: [POOL] });
    });
    expect(urls[0]).toBe('https://amm-api-testnet.aqua.network/pools/?sort=-liquidity&size=100');
    expect(urls[1]).toBe(`https://amm-api-testnet.aqua.network/api/external/v2/pools/?address__in=${POOL.address}`);
    expect(snapshot.pools[0]?.totalAprPct).toBeNull();
    expect(snapshot.pools[0]?.executable).toBe(false);
  });
  it('does not fall back to arbitrary pools when ranking statistics are unavailable', async () => {
    await expect(
      readAquariusPools('mainnet', new AbortController().signal, async () => new Response('', { status: 503 })),
    ).rejects.toThrow('unavailable');
  });
  it('refuses an external catalog pagination host before following it', async () => {
    let calls = 0;
    await expect(
      readAquariusPools('mainnet', new AbortController().signal, async () => {
        calls++;
        return Response.json(
          calls === 1 ? STATS_PAGE : { count: 2, next: 'https://example.com/pools/?page=2', results: [POOL] },
        );
      }),
    ).rejects.toThrow('pagination source');
    expect(calls).toBe(2);
  });
  it('rejects missing catalog rows and pagination loops', async () => {
    for (const next of [null, 'https://amm-api.aqua.network/api/external/v2/pools/']) {
      let calls = 0;
      await expect(
        readAquariusPools('mainnet', new AbortController().signal, async () => {
          calls++;
          return Response.json(calls === 1 ? STATS_PAGE : { count: 2, next, results: [POOL] });
        }),
      ).rejects.toThrow('incomplete');
    }
  });
  it('rejects redirects without following an unapproved source', async () => {
    let calls = 0;
    await expect(
      readAquariusPools('mainnet', new AbortController().signal, async (_input, init) => {
        calls++;
        expect(init?.redirect).toBe('manual');
        return new Response(null, { status: 302, headers: { location: 'https://example.com/' } });
      }),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(1);
  });
  it('passes cancellation to every upstream call', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readAquariusPools('mainnet', controller.signal, async () => Response.json({}))).rejects.toThrow();
  });
});
