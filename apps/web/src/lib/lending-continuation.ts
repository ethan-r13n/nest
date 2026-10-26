import type { LendingComparison } from './execution.ts';

/** The fresh offer from the venue a step started on, or why the flow must stop. Never another venue. */
export function continuationQuote(compared: LendingComparison, poolId: string): { quoteId: string } | { stop: string } {
  const quote = compared.quotes.find((offer) => offer.pool.id === poolId);
  if (quote) return { quoteId: quote.id };
  const excluded = compared.excluded.find((entry) => entry.poolId === poolId);
  return {
    stop: `${excluded?.name ?? 'That venue'} can't take this right now${excluded ? `: ${excluded.reason}` : '.'}`,
  };
}
