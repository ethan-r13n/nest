import type { LendingKind, LendingPositions } from './execution.ts';

export interface LendingExit {
  key: string;
  network: 'mainnet' | 'testnet';
  owner: string;
  poolId: string;
  poolName: string;
  lendingAccountId?: string;
  kind: Extract<LendingKind, 'repay' | 'withdraw' | 'withdraw_collateral'>;
  symbol: 'XLM' | 'USDC';
  held: string;
  health: number | null;
}

export function lendingExits(positions: LendingPositions, owner: string): LendingExit[] {
  const rows: LendingExit[] = [];
  if (positions.blend.available) {
    for (const pool of positions.blend.pools) {
      for (const entry of pool.positions) {
        for (const [kind, amount] of [
          ['repay', entry.debt],
          ['withdraw', entry.supplied],
          ['withdraw_collateral', entry.collateral],
        ] as const) {
          const heldRaw = rawDecimal(amount.amount, 7);
          if (!supportedSymbol(amount.symbol) || heldRaw === null || heldRaw <= 0n) continue;
          rows.push({
            key: `blend-${pool.poolId}-${entry.symbol}-${kind}`,
            network: positions.network,
            owner,
            poolId: pool.poolId,
            poolName: pool.name,
            kind,
            symbol: amount.symbol,
            held: amount.amount,
            health: pool.health,
          });
        }
      }
    }
  }
  if (positions.xoxno.available && positions.xoxno.poolId) {
    for (const account of positions.xoxno.accounts) {
      for (const [kind, amounts] of [
        ['repay', account.debt],
        ['withdraw_collateral', account.collateral],
      ] as const) {
        for (const amount of amounts) {
          const heldRaw = rawDecimal(amount.amount, 7);
          if (!supportedSymbol(amount.symbol) || heldRaw === null || heldRaw <= 0n) continue;
          rows.push({
            key: `xoxno-${account.accountId}-${amount.symbol}-${kind}`,
            network: positions.network,
            owner,
            poolId: positions.xoxno.poolId,
            poolName: `${positions.xoxno.name} · account ${account.accountId}`,
            lendingAccountId: account.accountId,
            kind,
            symbol: amount.symbol,
            held: amount.amount,
            health: account.healthFactor,
          });
        }
      }
    }
  }
  return rows;
}

export function positionAmountIssue(amount: string, held: string, decimals: number): string | null {
  const available = rawDecimal(held, decimals);
  if (available === null || available <= 0n) return 'The position balance could not be verified.';
  if (amount.trim().toLowerCase() === 'all') return null;
  const raw = rawDecimal(amount, decimals);
  if (raw === null || raw <= 0n) return `Enter a positive amount with at most ${decimals} decimal places, or use all.`;
  if (raw > available) return 'The amount is greater than this position holds.';
  return null;
}

export function assertPositionScope(
  position: { network: 'mainnet' | 'testnet'; owner: string },
  active: { network: 'mainnet' | 'testnet' | undefined; owner: string | null },
): void {
  if (!active.network || position.network !== active.network)
    throw new Error('The position belongs to another network.');
  if (!active.owner || position.owner !== active.owner)
    throw new Error('Reconnect the wallet that owns this position.');
}

function rawDecimal(value: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38 || value.length > 200) return null;
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

function supportedSymbol(value: string): value is 'XLM' | 'USDC' {
  return value === 'XLM' || value === 'USDC';
}
