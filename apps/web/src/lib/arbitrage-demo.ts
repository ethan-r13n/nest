import { roundTrip } from '@nest/adapters/amm/arbitrage';

import type { Evidence, Preview } from './automations.ts';

export type DemoPhase = 'balanced' | 'gap';
export interface DemoState {
  phase: DemoPhase;
  armed: boolean;
  checks: number;
  alerts: number;
  preview: Preview | null;
}

export function emptyArbitrageDemo(): DemoState {
  return { phase: 'balanced', armed: true, checks: 0, alerts: 0, preview: null };
}

export function checkArbitrageDemo(previous: DemoState, phase: DemoPhase, now: string): DemoState {
  const unit = 10_000_000n;
  const baseReserveRaw = 1_000_000n * unit;
  const a = { baseReserveRaw, quoteReserveRaw: 170_000n * unit, feeBps: 30 };
  const b = { baseReserveRaw, quoteReserveRaw: (phase === 'gap' ? 180_000n : 170_000n) * unit, feeBps: 30 };
  const trip = roundTrip(a, b, 100n * unit);
  const met = trip.profitBps >= 50;
  const checks = previous.checks + 1;
  const trigger = met && previous.armed;
  const evidence: Evidence = {
    readings: [a, b].map((pool, index) => ({
      venue: index === 0 ? 'soroswap' : 'stellar_amm',
      poolId: `simulated-${index === 0 ? 'soroswap' : 'stellar-amm'}`,
      priceUsdcPerXlm: Number(pool.quoteReserveRaw) / Number(pool.baseReserveRaw),
      feeBps: pool.feeBps,
      xlmReserve: baseReserveRaw.toString(),
      usdcReserve: pool.quoteReserveRaw.toString(),
      observedAt: now,
      ledger: null,
    })),
    errors: [],
    sizeUsdc: '100',
    thresholdBps: 50,
    spreadBps: trip.spreadBps,
    profitBps: trip.profitBps,
    profitUsdc: rawText(trip.profitRaw),
    buyOn: trip.direction === 'buy_a_sell_b' ? 'soroswap' : 'stellar_amm',
    sellOn: trip.direction === 'buy_a_sell_b' ? 'stellar_amm' : 'soroswap',
  };
  return {
    phase,
    checks,
    armed: !met,
    alerts: previous.alerts + (trigger ? 1 : 0),
    preview: {
      evaluatedAt: now,
      result: met ? 'true' : 'false',
      evidence,
      reason: met
        ? trigger
          ? 'Simulated gap crossed the 0.50% threshold. One demo alert was raised.'
          : 'The simulated gap is still open. No duplicate alert is raised.'
        : 'Simulated prices converged. The demo is armed for the next gap.',
    },
  };
}

function rawText(raw: bigint): string {
  const value = raw < 0n ? -raw : raw;
  const fraction = (value % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${raw < 0n ? '-' : ''}${value / 10_000_000n}${fraction ? `.${fraction}` : ''}`;
}
