import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { readPriceHistory } from '../src/stellar/trades.ts';

const HOUR_MS = 3_600_000;
// 2026-10-28 03:30 UTC.
const NOW_MS = 1_793_158_200_000;

function bucket(timeMs: number, open: string, close: string, counterVolume = '100.0000000') {
  return {
    timestamp: String(timeMs),
    trade_count: '10',
    base_volume: '600.0000000',
    counter_volume: counterVolume,
    avg: close,
    high: '0.5000000',
    low: '0.1000000',
    open,
    close,
  };
}

/** Answers each Horizon page with the buckets inside its window, as Horizon does. */
function horizon(buckets: ReturnType<typeof bucket>[], seen: URL[] = []): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    seen.push(url);
    const start = Number(url.searchParams.get('start_time'));
    const end = Number(url.searchParams.get('end_time'));
    const resolution = Number(url.searchParams.get('resolution'));
    const records = buckets.filter(
      (record) => Number(record.timestamp) >= start && Number(record.timestamp) < end && resolution === HOUR_MS,
    );
    return Response.json({ _embedded: { records } });
  };
}

describe('XLM/USDC price history', () => {
  it('folds hourly buckets into 4h candles aligned to UTC, reading Circle USDC in parallel pages', async () => {
    const midnight = Math.floor(NOW_MS / (24 * HOUR_MS)) * 24 * HOUR_MS;
    const seen: URL[] = [];
    const history = await readPriceHistory('mainnet', '4h', {
      now: () => NOW_MS,
      fetch: horizon(
        [
          bucket(midnight - 2 * HOUR_MS, '0.1600000', '0.1610000'),
          bucket(midnight - HOUR_MS, '0.1610000', '0.1620000'),
          bucket(midnight, '0.1620000', '0.1650000'),
          bucket(midnight + 2 * HOUR_MS, '0.1650000', '0.1680000'),
        ],
        seen,
      ),
    });
    expect(history.candles).toEqual([
      {
        timeMs: midnight - 4 * HOUR_MS,
        open: 0.16,
        high: 0.5,
        low: 0.1,
        close: 0.162,
        baseVolume: 1200,
        counterVolume: 200,
        trades: 20,
      },
      {
        timeMs: midnight,
        open: 0.162,
        high: 0.5,
        low: 0.1,
        close: 0.168,
        baseVolume: 1200,
        counterVolume: 200,
        trades: 20,
      },
    ]);
    // 30 days of hours is four pages of 200, plus one page for the last 24 hours.
    expect(seen).toHaveLength(5);
    expect(seen[0]?.searchParams.get('counter_asset_issuer')).toBe(
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    );
  });

  it('summarizes the last 24 hours to the hour, or reports none', async () => {
    const hour = Math.floor(NOW_MS / HOUR_MS) * HOUR_MS;
    const history = await readPriceHistory('mainnet', '1h', {
      now: () => NOW_MS,
      fetch: horizon([
        bucket(hour - 30 * HOUR_MS, '0.1000000', '0.1000000', '999.0000000'),
        bucket(hour - 23 * HOUR_MS, '0.1600000', '0.1610000'),
        bucket(hour, '0.1640000', '0.1680000', '50.0000000'),
      ]),
    });
    expect(history.day).toEqual({
      open: 0.16,
      close: 0.168,
      changePct: expect.closeTo(5, 6),
      counterVolume: 150,
      trades: 20,
    });
    expect(history.candles).toHaveLength(3);

    const quiet = await readPriceHistory('testnet', '1h', { now: () => NOW_MS, fetch: horizon([]) });
    expect(quiet).toMatchObject({ candles: [], day: null });
  });

  it('refuses an answer it cannot read', async () => {
    await expect(
      readPriceHistory('mainnet', '1d', { now: () => NOW_MS, fetch: async () => Response.json({}, { status: 503 }) }),
    ).rejects.toThrow('Horizon trade history answered 503.');
  });

  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'reads live mainnet XLM/USDC trades',
    async () => {
      const history = await readPriceHistory('mainnet', '1h');
      expect(history.candles.length).toBeGreaterThan(100);
      expect(history.day?.close).toBeGreaterThan(0.01);
    },
    30_000,
  );
});
