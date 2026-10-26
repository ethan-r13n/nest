import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { call } from './execution.ts';

export const PRICE_INTERVALS = ['15m', '1h', '4h', '1d'] as const;
export type PriceInterval = (typeof PRICE_INTERVALS)[number];

/** One bucket of XLM/USDC trades, priced in USDC per XLM. */
interface PriceCandle {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVolume: number;
  counterVolume: number;
  trades: number;
}

export interface PriceHistory {
  network: 'mainnet' | 'testnet';
  interval: PriceInterval;
  /** Oldest first; a bucket without trades is absent. */
  candles: PriceCandle[];
  day: { open: number; close: number; changePct: number; counterVolume: number; trades: number } | null;
  source: string;
  observedAtMs: number;
}

/** Stellar DEX trade history for the chart. It is context for a swap, never its quote. */
export function usePriceHistory(interval: PriceInterval) {
  return useQuery({
    queryKey: ['price-history', interval],
    queryFn: () => call<PriceHistory>(`/api/markets/price-history?interval=${interval}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
