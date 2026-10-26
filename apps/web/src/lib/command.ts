import type { LendingKind } from './execution.ts';

type AssetSymbol = 'USDC' | 'XLM';

/** What the selected text sits on, read from the nearest `data-nest-*` attributes. */
export interface SelectionContext {
  poolId: string;
  poolName: string;
  asset: AssetSymbol;
  /** Set when the selection is on one rate, so a bare amount means that action. */
  rate: 'supply' | 'borrow' | null;
  apyPct: number | null;
  canSupply: boolean;
  canBorrow: boolean;
}

export interface LendingCommand {
  kind: LendingKind;
  asset: AssetSymbol;
  amount: string;
  poolId?: string;
}

const VERBS: Record<string, LendingKind> = {
  lend: 'supply',
  supply: 'supply',
  deposit: 'supply',
  borrow: 'borrow',
  repay: 'repay',
  withdraw: 'withdraw',
};
const COMMAND = /^(?:(lend|supply|deposit|borrow|repay|withdraw)\s+)?\$?(\d[\d,]*(?:\.\d+)?)(k)?\s*(usdc|xlm)?$/i;

/**
 * Reads short lending commands such as "lend 100 usdc", "borrow 1k" or, on a rate, just "100".
 * The highlighted pool fills in what the text leaves out. Anything else returns null and goes to the agent.
 */
export function parseLendingCommand(text: string, context: SelectionContext | null): LendingCommand | null {
  const match = COMMAND.exec(text.trim().replace(/\s+/g, ' '));
  if (!match) return null;
  const [, verb, digits = '', thousands, symbol] = match;
  const kind = verb ? VERBS[verb.toLowerCase()] : context?.rate;
  const asset = (symbol?.toUpperCase() as AssetSymbol | undefined) ?? context?.asset;
  if (!kind || !asset) return null;
  const amount = toAmount(digits.replaceAll(',', ''), Boolean(thousands));
  if (!amount) return null;
  const command: LendingCommand = { kind, asset, amount };
  // Keep the highlighted pool unless it cannot take this action; then Nest compares every pool.
  if (context && context.asset === asset && poolAllows(context, kind)) command.poolId = context.poolId;
  return command;
}

function poolAllows(context: SelectionContext, kind: LendingKind): boolean {
  if (kind === 'supply') return context.canSupply;
  if (kind === 'borrow') return context.canBorrow;
  return true;
}

/** Decimal text with at most 7 places, as Stellar amounts allow; `k` multiplies by 1,000. */
function toAmount(digits: string, thousands: boolean): string | null {
  const [whole = '', fraction = ''] = digits.split('.');
  const scaled = thousands ? `${whole}${fraction.padEnd(3, '0').slice(0, 3)}.${fraction.slice(3)}` : digits;
  const [scaledWhole = '0', scaledFraction = ''] = scaled.split('.');
  const trimmedWhole = scaledWhole.replace(/^0+(?=\d)/, '');
  const trimmedFraction = scaledFraction.replace(/0+$/, '');
  if (trimmedFraction.length > 7) return null;
  if (/^0*$/.test(trimmedWhole) && !trimmedFraction) return null;
  return trimmedFraction ? `${trimmedWhole}.${trimmedFraction}` : trimmedWhole;
}
