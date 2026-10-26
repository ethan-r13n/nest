import type { StellarNetwork } from '@nest/domain/network';
import { z } from 'zod';

import { HORIZON_URLS } from './accounts.ts';
import { swapAsset } from './assets.ts';

export const PRICE_INTERVALS = ['15m', '1h', '4h', '1d'] as const;
export type PriceInterval = (typeof PRICE_INTERVALS)[number];

/** One bucket of XLM/USDC trades, priced in USDC per XLM. */
export interface PriceCandle {
  /** Bucket start. */
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** XLM traded. */
  baseVolume: number;
  /** USDC traded. */
  counterVolume: number;
  trades: number;
}

export interface PriceHistory {
  network: StellarNetwork;
  interval: PriceInterval;
  /** Oldest first. A bucket without trades is absent rather than zero. */
  candles: PriceCandle[];
  /** The last 24 hours to the hour, or null when nothing traded in them. */
  day: { open: number; close: number; changePct: number; counterVolume: number; trades: number } | null;
  source: string;
  observedAtMs: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// Horizon aggregates only 1m, 5m, 15m, 1h, 1d and 1w buckets, so 4h folds four 1h buckets.
// https://developers.stellar.org/docs/data/apis/horizon/api-reference/list-trade-aggregations
const WINDOWS: Record<PriceInterval, { resolutionMs: number; bucketMs: number; spanMs: number }> = {
  '15m': { resolutionMs: 15 * MINUTE_MS, bucketMs: 15 * MINUTE_MS, spanMs: DAY_MS },
  '1h': { resolutionMs: HOUR_MS, bucketMs: HOUR_MS, spanMs: 7 * DAY_MS },
  '4h': { resolutionMs: HOUR_MS, bucketMs: 4 * HOUR_MS, spanMs: 30 * DAY_MS },
  '1d': { resolutionMs: DAY_MS, bucketMs: DAY_MS, spanMs: 180 * DAY_MS },
};
const PAGE_LIMIT = 200;
const TIMEOUT_MS = 15_000;

const DecimalSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number);
const IntegerSchema = z.union([z.string().regex(/^\d+$/), z.number().int()]).transform(Number);
const PageSchema = z.looseObject({
  _embedded: z.looseObject({
    records: z.array(
      z.looseObject({
        timestamp: IntegerSchema,
        trade_count: IntegerSchema,
        base_volume: DecimalSchema,
        counter_volume: DecimalSchema,
        open: DecimalSchema,
        high: DecimalSchema,
        low: DecimalSchema,
        close: DecimalSchema,
      }),
    ),
  }),
});

/**
 * XLM/USDC trade history from Horizon: every Stellar DEX order-book and classic AMM trade,
 * against Circle's USDC on this network. Context for a chart, never a quote.
 */
export async function readPriceHistory(
  network: StellarNetwork,
  interval: PriceInterval,
  options: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<PriceHistory> {
  const send = options.fetch ?? fetch;
  const nowMs = (options.now ?? Date.now)();
  const window = WINDOWS[interval];
  const [buckets, hours] = await Promise.all([
    readBuckets(network, window.resolutionMs, nowMs - window.spanMs, nowMs, send),
    readBuckets(network, HOUR_MS, nowMs - DAY_MS + HOUR_MS, nowMs, send),
  ]);
  return {
    network,
    interval,
    candles: fold(buckets, window.bucketMs),
    day: summarize(hours),
    source: 'Stellar DEX and AMM trades via Horizon',
    observedAtMs: nowMs,
  };
}

/** Folds buckets into wider ones aligned to UTC: the first open, the last close, the extremes, the sums. */
function fold(candles: readonly PriceCandle[], bucketMs: number): PriceCandle[] {
  const folded: PriceCandle[] = [];
  for (const candle of candles) {
    const timeMs = Math.floor(candle.timeMs / bucketMs) * bucketMs;
    const last = folded.at(-1);
    if (last?.timeMs !== timeMs) {
      folded.push({ ...candle, timeMs });
      continue;
    }
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
    last.baseVolume += candle.baseVolume;
    last.counterVolume += candle.counterVolume;
    last.trades += candle.trades;
  }
  return folded;
}

function summarize(hours: readonly PriceCandle[]): PriceHistory['day'] {
  const first = hours[0];
  const last = hours.at(-1);
  if (!first || !last) return null;
  return {
    open: first.open,
    close: last.close,
    changePct: (last.close / first.open - 1) * 100,
    counterVolume: hours.reduce((sum, hour) => sum + hour.counterVolume, 0),
    trades: hours.reduce((sum, hour) => sum + hour.trades, 0),
  };
}

/** Reads every bucket in the window, one Horizon page per 200 buckets, in parallel. */
async function readBuckets(
  network: StellarNetwork,
  resolutionMs: number,
  fromMs: number,
  toMs: number,
  send: typeof fetch,
): Promise<PriceCandle[]> {
  const startMs = Math.floor(fromMs / resolutionMs) * resolutionMs;
  const pageMs = PAGE_LIMIT * resolutionMs;
  const starts: number[] = [];
  for (let at = startMs; at < toMs; at += pageMs) starts.push(at);
  const pages = await Promise.all(
    starts.map((at) => readPage(network, resolutionMs, at, Math.min(at + pageMs, toMs), send)),
  );
  return pages.flat().sort((a, b) => a.timeMs - b.timeMs);
}

async function readPage(
  network: StellarNetwork,
  resolutionMs: number,
  startMs: number,
  endMs: number,
  send: typeof fetch,
): Promise<PriceCandle[]> {
  const { code, issuer } = swapAsset(network, 'USDC').ref;
  const query = new URLSearchParams({
    base_asset_type: 'native',
    counter_asset_type: 'credit_alphanum4',
    counter_asset_code: code ?? 'USDC',
    counter_asset_issuer: issuer ?? '',
    resolution: String(resolutionMs),
    start_time: String(startMs),
    end_time: String(endMs),
    order: 'asc',
    limit: String(PAGE_LIMIT),
  });
  const response = await send(`${HORIZON_URLS[network]}/trade_aggregations?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = PageSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) throw new Error(`Horizon trade history answered ${response.status}.`);
  return parsed.data._embedded.records.map((record) => ({
    timeMs: record.timestamp,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    baseVolume: record.base_volume,
    counterVolume: record.counter_volume,
    trades: record.trade_count,
  }));
}
