import type { ActivityItem, SwapBalances, SwapSymbol } from './execution.ts';

/** One spot holding on the Trade page, valued in USDC. */
interface SpotRow {
  symbol: SwapSymbol;
  quantity: string;
  /** USDC per unit; USDC itself is 1. */
  mark: number | null;
  usd: number | null;
  /** Average USDC paid per XLM across confirmed Nest buys. */
  entry: number | null;
  /** XLM bought through Nest, net of XLM sold through Nest. */
  nestHeld: number;
  /** P&L on the part of the holding Nest bought: `min(quantity, nestHeld)`. */
  pnl: number | null;
  pnlQuantity: number;
}

/**
 * Spendable XLM and USDC from the wallet, valued at the XLM reference price. Entry and P&L come
 * only from confirmed swaps Nest executed, so XLM acquired elsewhere never gets an invented basis.
 */
export function spotRows(balances: SwapBalances | undefined, activity: ActivityItem[], xlmUsd: number | null) {
  const rows: SpotRow[] = [];
  let bought = 0;
  let cost = 0;
  let sold = 0;
  for (const item of activity) {
    if (item.kind !== 'swap' || item.status !== 'confirmed') continue;
    const sent = item.sent[0];
    const received = item.received[0];
    if (!sent || !received) continue;
    if (sent.symbol === 'USDC' && received.symbol === 'XLM') {
      bought += Number(received.amount);
      cost += Number(sent.amount);
    } else if (sent.symbol === 'XLM' && received.symbol === 'USDC') {
      sold += Number(sent.amount);
    }
  }
  const entry = bought > 0 ? cost / bought : null;
  const nestHeld = Math.max(0, bought - sold);
  for (const balance of balances?.balances ?? []) {
    if (balance.spendable === null || Number(balance.spendable) === 0) continue;
    const quantity = Number(balance.spendable);
    const mark = balance.symbol === 'USDC' ? 1 : xlmUsd;
    const isXlm = balance.symbol === 'XLM';
    const pnlQuantity = isXlm ? Math.min(quantity, nestHeld) : 0;
    rows.push({
      symbol: balance.symbol,
      quantity: balance.spendable,
      mark,
      usd: mark === null ? null : quantity * mark,
      entry: isXlm ? entry : null,
      nestHeld: isXlm ? nestHeld : 0,
      pnl: isXlm && entry !== null && mark !== null && pnlQuantity > 0 ? (mark - entry) * pnlQuantity : null,
      pnlQuantity,
    });
  }
  return rows;
}
