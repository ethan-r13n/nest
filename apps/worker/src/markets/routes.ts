import { readAquariusPools } from '@nest/adapters/aquarius/client';
import { PRICE_INTERVALS, type PriceHistory, readPriceHistory } from '@nest/adapters/stellar/trades';
import type { AquariusSnapshot } from '@nest/data/aquarius';
import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app.ts';
import { decodeConfig } from '../config.ts';

const CACHE_MS = 60_000;
const IntervalSchema = z.enum(PRICE_INTERVALS);
const pools = cached<AquariusSnapshot>();
const prices = cached<PriceHistory>();

export function createMarketRoutes() {
  return new Hono<AppEnv>()
    .get('/', async (c) => {
      if (c.req.query('kind') !== 'liquidity_pool' || c.req.query('venue') !== 'aquarius') {
        throw new AppError('INVALID_REQUEST', 'Choose a supported market type and venue.');
      }
      const network = decodeConfig(c.env).network;
      const requestedNetwork = c.req.query('network');
      if (requestedNetwork && requestedNetwork !== network) {
        throw new AppError('INVALID_REQUEST', 'These pools belong to a different network.');
      }
      try {
        const snapshot = await pools(network, () =>
          readAquariusPools(network, AbortSignal.timeout(25_000)).then((snapshot) => {
            if (snapshot.eligiblePoolCount > 0 && (!snapshot.statisticsAvailable || snapshot.pools.length === 0)) {
              throw new Error('Pool ranking statistics are unavailable.');
            }
            return snapshot;
          }),
        );
        c.header('cache-control', 'public, max-age=30');
        return c.json(snapshot);
      } catch (error) {
        logRefreshFailure('liquidity_refresh_failed', network, error);
        throw new AppError('UNAVAILABLE', 'Liquidity pool data could not be refreshed. Try again shortly.');
      }
    })
    .get('/price-history', async (c) => {
      const interval = IntervalSchema.safeParse(c.req.query('interval') ?? '1h');
      if (!interval.success) throw new AppError('INVALID_REQUEST', 'Choose an interval of 15m, 1h, 4h or 1d.');
      const network = decodeConfig(c.env).network;
      try {
        const history = await prices(`${network}:${interval.data}`, () => readPriceHistory(network, interval.data));
        c.header('cache-control', 'public, max-age=30');
        return c.json(history);
      } catch (error) {
        logRefreshFailure('price_history_failed', network, error);
        throw new AppError('UNAVAILABLE', 'Price history could not be loaded. Try again shortly.');
      }
    });
}

/** Shares one in-flight or recent read per key for a minute; a failed read is not kept. */
function cached<T>() {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const current = entries.get(key);
    if (current && Date.now() - current.at < CACHE_MS) return current.value;
    const entry = { at: Date.now(), value: load() };
    entries.set(key, entry);
    entry.value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.value;
  };
}

function logRefreshFailure(event: string, network: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      network,
      reason: error instanceof Error ? error.message.slice(0, 256) : 'Unknown source error',
    }),
  );
}
