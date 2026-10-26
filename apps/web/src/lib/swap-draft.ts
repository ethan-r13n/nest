import { amountDraftIssue } from './draft-validation.ts';
import type { SwapSymbol } from './execution.ts';

export function swapDraftRequest(
  sell: string,
  buy: string,
  amount: string,
): {
  sellAsset: SwapSymbol;
  buyAsset: SwapSymbol;
  sellAmount: string;
} | null {
  if (
    (sell !== 'XLM' && sell !== 'USDC') ||
    (buy !== 'XLM' && buy !== 'USDC') ||
    sell === buy ||
    amountDraftIssue(amount, true) !== null
  )
    return null;
  return { sellAsset: sell, buyAsset: buy, sellAmount: amount.trim() };
}
