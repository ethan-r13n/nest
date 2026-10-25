import { compareSwap, createSwapIntent, executionDeps } from '../execution/swap.ts';
import type { ProposalService } from './tools.ts';

/** The agent's only path into execution: create a swap intent and get a quote for the user to review. */
export function createProposalService(env: Env): ProposalService {
  return {
    async proposeSwap(input) {
      const deps = executionDeps(env);
      const intent = await createSwapIntent(deps, { ...input, source: 'chat' });
      try {
        const quote = await compareSwap(deps, intent.id);
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
  };
}
