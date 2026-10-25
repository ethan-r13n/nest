import { readAquariusPools } from '@nest/adapters/aquarius/client';
import type { AquariusNetwork, AquariusSnapshot } from '@nest/data/aquarius';
import { AppError } from '@nest/domain/errors';
import { Hono } from 'hono';

import type { AppEnv } from '../app.ts';
import { decodeConfig } from '../config.ts';

const CACHE_MS = 60_000;
const cache = new Map<AquariusNetwork, { at: number; value: Promise<AquariusSnapshot> }>();

export function createMarketRoutes() {
  return new Hono<AppEnv>().get('/', async (c) => {
    if (c.req.query('kind') !== 'liquidity_pool' || c.req.query('venue') !== 'aquarius') {
      throw new AppError('INVALID_REQUEST', 'Choose a supported market type and venue.');
    }
    const network = decodeConfig(c.env).network;
    const requestedNetwork = c.req.query('network');
    if (requestedNetwork && requestedNetwork !== network) {
      throw new AppError('INVALID_REQUEST', 'These pools belong to a different network.');
    }
    try {
      const current = cache.get(network);
      if (current && Date.now() - current.at < CACHE_MS) return c.json(await current.value);
      const value = readAquariusPools(network, AbortSignal.timeout(25_000)).then((snapshot) => {
        if (snapshot.eligiblePoolCount > 0 && (!snapshot.statisticsAvailable || snapshot.pools.length === 0)) {
          throw new Error('Pool ranking statistics are unavailable.');
        }
        return snapshot;
      });
      const entry = { at: Date.now(), value };
      cache.set(network, entry);
      try {
        const snapshot = await value;
        c.header('cache-control', 'public, max-age=30');
        return c.json(snapshot);
      } catch (error) {
        if (cache.get(network) === entry) cache.delete(network);
        throw error;
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'liquidity_refresh_failed',
          network,
          reason: error instanceof Error ? error.message.slice(0, 256) : 'Unknown source error',
        }),
      );
      throw new AppError('UNAVAILABLE', 'Liquidity pool data could not be refreshed. Try again shortly.');
    }
  });
}
