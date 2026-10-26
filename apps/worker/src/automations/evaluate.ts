import { roundTrip } from '@nest/adapters/amm/arbitrage';
import { type ArbVenue, type PoolReading, VENUE_LABELS } from '@nest/adapters/amm/pools';
import { formatRawAmount, rawToText } from '@nest/domain/amount';

import type { ArbitrageConfig } from './config.ts';

type EvaluationResult = 'true' | 'false' | 'unknown';

/** Reads a venue's XLM/USDC pool. Injected so tests and previews run without the network. */
export interface PoolSource {
  read(venue: ArbVenue): Promise<PoolReading>;
}

export interface Evaluation {
  result: EvaluationResult;
  reason: string;
  evidence: {
    readings: {
      venue: ArbVenue;
      poolId: string;
      priceUsdcPerXlm: number;
      feeBps: number;
      xlmReserve: string;
      usdcReserve: string;
      observedAt: string;
      ledger: number | null;
    }[];
    errors: { venue: ArbVenue; message: string }[];
    sizeUsdc: string;
    thresholdBps: number;
    spreadBps: number | null;
    profitBps: number | null;
    profitUsdc: string | null;
    /** Where to buy XLM and where to sell it for the better round trip. */
    buyOn: ArbVenue | null;
    sellOn: ArbVenue | null;
  };
}

/** Readings further apart than this describe different moments, so they cannot be compared. */
const MAX_SKEW_MS = 30_000;
const DECIMALS = 7;

/**
 * Reads both pools now and asks whether buying XLM in one and selling it in the other, at the
 * rule's size and after both pools' fees, clears the threshold. Unreadable or mismatched inputs
 * give `unknown` with the reason, never `false`.
 */
export async function evaluateArbitrage(config: ArbitrageConfig, pools: PoolSource): Promise<Evaluation> {
  const settled = await Promise.allSettled(config.venues.map((venue) => pools.read(venue)));
  const readings: PoolReading[] = [];
  const errors: Evaluation['evidence']['errors'] = [];
  settled.forEach((outcome, index) => {
    const venue = config.venues[index] as ArbVenue;
    if (outcome.status === 'fulfilled') readings.push(outcome.value);
    else errors.push({ venue, message: messageOf(outcome.reason) });
  });
  const evidence: Evaluation['evidence'] = {
    readings: readings.map((reading) => ({
      venue: reading.venue,
      poolId: reading.poolId,
      priceUsdcPerXlm: Number(reading.quoteReserveRaw) / Number(reading.baseReserveRaw),
      feeBps: reading.feeBps,
      xlmReserve: rawToText(reading.baseReserveRaw),
      usdcReserve: rawToText(reading.quoteReserveRaw),
      observedAt: new Date(reading.observedAtMs).toISOString(),
      ledger: reading.ledger,
    })),
    errors,
    sizeUsdc: config.sizeUsdc,
    thresholdBps: config.thresholdBps,
    spreadBps: null,
    profitBps: null,
    profitUsdc: null,
    buyOn: null,
    sellOn: null,
  };
  const [a, b] = readings;
  if (errors.length || !a || !b) {
    const failed = errors.map((error) => `${VENUE_LABELS[error.venue]}: ${error.message}`).join(' ');
    return { result: 'unknown', reason: `A pool could not be read. ${failed}`.trim(), evidence };
  }
  if (Math.abs(a.observedAtMs - b.observedAtMs) > MAX_SKEW_MS) {
    return { result: 'unknown', reason: 'The two readings are too far apart in time to compare.', evidence };
  }

  const trip = roundTrip(a, b, sizeRawOf(config.sizeUsdc));
  const [buy, sell] = trip.direction === 'buy_a_sell_b' ? [a, b] : [b, a];
  evidence.spreadBps = round2(trip.spreadBps);
  evidence.profitBps = trip.profitBps;
  evidence.profitUsdc = signed(trip.profitRaw);
  evidence.buyOn = buy.venue;
  evidence.sellOn = sell.venue;
  const met = trip.profitBps >= config.thresholdBps;
  const price = (reading: PoolReading) => (Number(reading.quoteReserveRaw) / Number(reading.baseReserveRaw)).toFixed(4);
  const reason =
    `Buy XLM on ${VENUE_LABELS[buy.venue]} at ${price(buy)} and sell on ${VENUE_LABELS[sell.venue]} at ${price(sell)}: ` +
    `${pct(trip.profitBps)} on ${config.sizeUsdc} USDC after pool fees, ${met ? 'at or above' : 'below'} the ` +
    `${pct(config.thresholdBps)} threshold.`;
  return { result: met ? 'true' : 'false', reason, evidence };
}

function sizeRawOf(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** BigInt(DECIMALS) + BigInt(fraction.padEnd(DECIMALS, '0'));
}

function signed(raw: bigint): string {
  return raw < 0n ? `-${formatRawAmount(-raw, DECIMALS)}` : formatRawAmount(raw, DECIMALS);
}

function pct(bps: number): string {
  return `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}
