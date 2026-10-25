import { describe, expect, it } from 'vitest';

import { makeAquariusSnapshot } from '../src/aquarius.ts';

const POOL = 'CA6PUJLBYKZKUEKLZJMKBZLEKP2OTHANDEOWSFF44FTSYLKQPIICCJBE';
const TOKENS = [
  'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
  'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
];
const CATALOG = {
  address: POOL,
  index: 'a'.repeat(64),
  tokens_addresses: TOKENS,
  tokens_str: ['native', 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'],
  pool_type: 'constant_product',
  fee: '0.0010',
};
const STATS = {
  ...CATALOG,
  liquidity_usd: '32870364104998.7977055',
  volume_usd: '1043077901336.9941482',
  apy: '0.0112118',
  rewards_apy: '0.0011988',
  incentive_apy: '0.0000000',
  total_apy: '0.0124106',
  deposit_killed: false,
};
const NOW = '2026-10-25T20:00:00.000Z';

describe('Aquarius pool projection', () => {
  it('selects the 15 largest priced standard pools before any UI filters', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const catalog = Array.from({ length: 20 }, (_, index) => ({
      ...CATALOG,
      address: POOL.slice(0, -1) + alphabet[index],
    }));
    const statistics = catalog.map((pool, index) => ({
      ...STATS,
      ...pool,
      liquidity_usd: String((index + 1) * 10_000_000),
    }));
    const snapshot = makeAquariusSnapshot(catalog, statistics, 'mainnet', NOW);
    expect(snapshot.pools).toHaveLength(15);
    expect(snapshot.eligiblePoolCount).toBe(20);
    expect(snapshot.omittedPoolCount).toBe(5);
    expect(snapshot.pools[0]?.tvlUsd).toBe(20);
    expect(snapshot.pools.at(-1)?.tvlUsd).toBe(6);
    expect(snapshot.selection).toBe('top_tvl');
  });
  it('matches official USD scaling and APR, preserving component meaning', () => {
    const pool = makeAquariusSnapshot([CATALOG], [STATS], 'mainnet', NOW).pools[0];
    expect(pool?.tvlUsd).toBeCloseTo(3_287_036.41);
    expect(pool?.volume24hUsd).toBeCloseTo(104_307.79);
    expect(pool?.totalAprPct).toBeCloseTo(1.24106);
    expect(pool?.feeAprPct).toBeCloseTo(1.12118);
    expect(pool?.aquaAprPct).toBeCloseTo(0.11988);
    expect(pool?.incentiveAprPct).toBe(0);
    expect(pool?.tokens[0].symbol).toBe('XLM');
    expect(pool?.tokens[1].identity).toContain(':GA5Z');
    expect(pool).toMatchObject({ executable: false, upstreamAsOf: null, measurementWindow: null });
  });
  it('does not turn missing statistics into zero or upgrade an indexed pool to executable', () => {
    const pool = makeAquariusSnapshot([CATALOG], [{ ...CATALOG, liquidity_usd: '10000000' }], 'testnet', NOW).pools[0];
    expect(pool).toMatchObject({
      totalAprPct: null,
      tvlUsd: 1,
      depositPaused: null,
      verification: 'unverified',
      executable: false,
      network: 'testnet',
    });
    expect(pool?.routerContractId).toBe('CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD');
  });
  it('does not invent a top-pool ranking when TVL is unavailable', () => {
    const snapshot = makeAquariusSnapshot([CATALOG], null, 'mainnet', NOW);
    expect(snapshot.pools).toEqual([]);
    expect(snapshot.statisticsAvailable).toBe(false);
    expect(snapshot.eligiblePoolCount).toBe(1);
  });
  it('rejects concentrated, unknown and multi-asset pools from the standard LP flow', () => {
    const snapshot = makeAquariusSnapshot([{ ...CATALOG, pool_type: 'concentrated' }], [], 'mainnet', NOW);
    expect(snapshot.pools).toEqual([]);
    expect(snapshot.excludedPoolCount).toBe(1);
    expect(
      makeAquariusSnapshot(
        [{ ...CATALOG, tokens_addresses: [...TOKENS, POOL], tokens_str: ['native', 'USDC', 'Third'] }],
        [],
        'mainnet',
        NOW,
      ).pools,
    ).toEqual([]);
  });
  it('never joins statistics by ticker, hash alone or a different token order', () => {
    const pool = makeAquariusSnapshot(
      [CATALOG],
      [{ ...STATS, tokens_addresses: [...TOKENS].reverse() }],
      'mainnet',
      NOW,
    ).pools[0];
    expect(pool).toBeUndefined();
  });
  it('rejects duplicate pool identities and malformed financial observations', () => {
    expect(() => makeAquariusSnapshot([CATALOG, CATALOG], [], 'mainnet', NOW)).toThrow();
    expect(() => makeAquariusSnapshot([CATALOG], [{ ...STATS, total_apy: '-1' }], 'mainnet', NOW)).toThrow();
  });
});
