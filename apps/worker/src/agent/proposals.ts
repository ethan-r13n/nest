import { compareLending, createLendingIntent } from '../execution/lending.ts';
import { compareIntent } from '../execution/lifecycle.ts';
import { executionDeps, loadIntent } from '../execution/store.ts';
import { createSwapIntent } from '../execution/swap.ts';
import type { LendingOffer, ProposalService } from './tools.ts';

/** The agent's only path into execution: create an intent and get quotes for the user to review. */
export function createProposalService(env: Env): ProposalService {
  return {
    async proposeSwap(input) {
      const deps = executionDeps(env);
      const intent = await createSwapIntent(deps, { ...input, source: 'chat' });
      try {
        const { quotes } = await compareIntent(deps, intent.id);
        const quote = quotes[0];
        if (!quote || !('expectedOut' in quote)) throw new Error('No quote was returned.');
        return {
          intentId: intent.id,
          sell: { symbol: intent.sell.symbol, amount: intent.sell.amount },
          buy: { symbol: intent.buy.symbol },
          quote: {
            expectedOut: quote.expectedOut.amount,
            minimumOut: quote.minimumOut.amount,
            slippageBps: quote.slippageBps,
            priceImpactBps: quote.priceImpactBps,
            protocols: quote.protocols,
          },
        };
      } catch (error) {
        return {
          intentId: intent.id,
          sell: { symbol: intent.sell.symbol, amount: intent.sell.amount },
          buy: { symbol: intent.buy.symbol },
          quote: { unavailable: error instanceof Error ? error.message : 'quote failed' },
        };
      }
    },

    async proposeLending(input) {
      const deps = executionDeps(env);
      const intent = await createLendingIntent(deps, { ...input, source: 'chat' });
      const base = { intentId: intent.id, kind: intent.kind, asset: intent.asset };
      // Repay and withdraw are compared against the user's own position, which only the card can read.
      if (intent.kind !== 'supply' && intent.kind !== 'borrow') return { ...base, offers: [], excluded: [] };
      try {
        const compared = await compareLending(deps, await loadIntent(deps, intent.id));
        return {
          ...base,
          offers: compared.quotes.map(
            (quote): LendingOffer => ({
              pool: quote.pool.name,
              poolStatus: quote.pool.status,
              supplyApyPct: quote.supplyApyPct,
              borrowApyPct: quote.borrowApyPct,
              utilizationPct: quote.utilizationPct,
              collateral: quote.collateral
                ? { symbol: quote.collateral.symbol, amount: quote.collateral.amount }
                : null,
              estimatedHealth: quote.estimatedHealth,
              withdrawalTiming: quote.withdrawalTiming.summary,
            }),
          ),
          excluded: compared.excluded.map(({ name, reason }) => ({ name, reason })),
        };
      } catch (error) {
        return {
          ...base,
          offers: [],
          excluded: [],
          unavailable: error instanceof Error ? error.message : 'comparison failed',
        };
      }
    },

    async lendingRates() {
      const deps = executionDeps(env);
      if (!deps.lending) throw new Error('Lending needs a Stellar RPC on this server.');
      const markets = await deps.lending.markets();
      return {
        network: deps.config.network,
        pools: markets.map((market) => ({
          name: market.name,
          status: market.statusLabel,
          canSupply: market.canSupply,
          canBorrow: market.canBorrow,
          reserves: market.reserves.map((reserve) => ({
            symbol: reserve.symbol,
            supplyApyPct: Number(reserve.supplyApyPct.toFixed(2)),
            borrowApyPct: Number(reserve.borrowApyPct.toFixed(2)),
            utilizationPct: Number(reserve.utilizationPct.toFixed(1)),
          })),
        })),
      };
    },
  };
}
