import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { amountOut, type PoolReserves, roundTrip } from '../src/amm/arbitrage.ts';
import { PoolUnavailable, readPool } from '../src/amm/pools.ts';

const UNIT = 10_000_000n;
// 1,000,000 XLM / 170,000 USDC: 0.17 USDC per XLM.
const LOW: PoolReserves = { baseReserveRaw: 1_000_000n * UNIT, quoteReserveRaw: 170_000n * UNIT, feeBps: 30 };
// 1,000,000 XLM / 180,000 USDC: 0.18 USDC per XLM.
const HIGH: PoolReserves = { baseReserveRaw: 1_000_000n * UNIT, quoteReserveRaw: 180_000n * UNIT, feeBps: 30 };

describe('constant-product round trips', () => {
  it('matches x · y = k with the fee taken from the input', () => {
    // 1,000 in against 100,000 / 100,000 at 0.3%: 997,000 · 100,000 / (100,000,000 + 997,000).
    expect(amountOut(1_000n, 100_000n, 100_000n, 30)).toBe(987n);
    expect(amountOut(0n, 100_000n, 100_000n, 30)).toBe(0n);
  });

  it('buys in the cheaper pool and sells in the dearer one, in either order', () => {
    const forward = roundTrip(LOW, HIGH, 100n * UNIT);
    const backward = roundTrip(HIGH, LOW, 100n * UNIT);
    expect(forward.direction).toBe('buy_a_sell_b');
    expect(backward.direction).toBe('buy_b_sell_a');
    expect(forward.profitRaw).toBe(backward.profitRaw);
    expect(forward.spreadBps).toBeCloseTo(588.24, 1);
    // 100 USDC buys 586.12 XLM after the fee and impact, which sell for 105.12 USDC.
    expect(forward.profitBps).toBeCloseTo(512.48, 1);
  });

  it('shows a loss when the gap is smaller than the fees', () => {
    const near: PoolReserves = { ...LOW, quoteReserveRaw: 170_200n * UNIT };
    const result = roundTrip(LOW, near, 100n * UNIT);
    expect(result.spreadBps).toBeCloseTo(11.76, 1);
    expect(result.profitRaw).toBeLessThan(0n);
  });

  it('loses the edge to price impact at a large size', () => {
    expect(roundTrip(LOW, HIGH, 20_000n * UNIT).profitBps).toBeLessThan(roundTrip(LOW, HIGH, 100n * UNIT).profitBps);
  });
});

describe('Stellar AMM reader', () => {
  const horizon =
    (records: unknown[]): typeof fetch =>
    async () =>
      Response.json({ _embedded: { records } });

  it('reads reserves from the classic liquidity pool', async () => {
    const reading = await readPool('stellar_amm', {
      network: 'mainnet',
      rpcUrl: 'https://rpc.test',
      now: () => 1_800_000_000_000,
      fetch: horizon([
        {
          id: 'a'.repeat(64),
          fee_bp: 30,
          last_modified_ledger: 61_000_000,
          reserves: [
            { asset: 'native', amount: '13847274.8942489' },
            { asset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', amount: '2331617.6267606' },
          ],
        },
      ]),
    });
    expect(reading).toMatchObject({
      venue: 'stellar_amm',
      baseReserveRaw: 138_472_748_942_489n,
      quoteReserveRaw: 23_316_176_267_606n,
      feeBps: 30,
      ledger: 61_000_000,
    });
  });

  it('reports a missing pool as unavailable', async () => {
    await expect(
      readPool('stellar_amm', { network: 'mainnet', rpcUrl: 'https://rpc.test', fetch: horizon([]) }),
    ).rejects.toBeInstanceOf(PoolUnavailable);
  });
});

describe('pool readers (live)', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'reads XLM/USDC reserves from every venue on mainnet',
    async () => {
      const options = { network: 'mainnet' as const, rpcUrl: 'https://mainnet.sorobanrpc.com' };
      const [aquarius, soroswap, amm] = await Promise.all([
        readPool('aquarius', options),
        readPool('soroswap', options),
        readPool('stellar_amm', options),
      ]);
      const prices = [aquarius, soroswap, amm].map(
        (pool) => Number(pool.quoteReserveRaw) / Number(pool.baseReserveRaw),
      );
      console.log(JSON.stringify({ prices, fees: [aquarius.feeBps, soroswap.feeBps, amm.feeBps] }));
      // Liquid pools for the same pair stay within a few percent of each other.
      expect(Math.max(...prices) / Math.min(...prices)).toBeLessThan(1.05);
    },
    60_000,
  );
});
