import { BLEND_POOLS } from '@nest/adapters/blend/markets';

import type { LendingCommand, SelectionContext } from './command.ts';
import type { LendingMarkets } from './execution.ts';

export function blendYieldContext(
  protocol: string,
  pool: { symbol: string; meta: string | null; observedAt: string },
  executionNetwork?: 'mainnet' | 'testnet',
): SelectionContext | null {
  if (protocol !== 'blend-pools-v2' || pool.symbol !== 'USDC') return null;
  const poolKind = pool.meta === 'Fixed Pool' ? 'fixed' : pool.meta === 'YieldBlox Pool' ? 'yieldblox' : null;
  if (!poolKind) return null;
  const registered = BLEND_POOLS.mainnet.find(
    (item) => item.name === (poolKind === 'fixed' ? 'Blend Fixed' : 'Blend YieldBlox'),
  );
  if (!registered) return null;
  return {
    poolId: registered.id,
    poolName: pool.meta ?? registered.name,
    asset: 'USDC',
    rate: 'supply',
    apyPct: null,
    canSupply: false,
    canBorrow: false,
    source: {
      poolKind,
      network: 'mainnet',
      observedAt: pool.observedAt,
      ...(executionNetwork ? { executionNetwork } : {}),
    },
  };
}

export function resolveBlendResearchCommand(
  command: LendingCommand,
  context: SelectionContext | null,
  markets: LendingMarkets,
): LendingCommand {
  if (!context?.source) throw new Error('Reopen a Blend USDC opportunity before creating this request.');
  if (context.source.executionNetwork && context.source.executionNetwork !== markets.network) {
    throw new Error('The execution network changed. Reopen this opportunity to review the current network.');
  }
  const available = markets.markets.filter(
    (market) =>
      market.reserves.some((reserve) => reserve.symbol === command.asset) &&
      (command.kind === 'supply' ? market.canSupply : command.kind === 'borrow' ? market.canBorrow : true),
  );
  if (!available.length)
    throw new Error(`No available ${command.asset} Blend market was returned for ${markets.network}.`);
  const result: LendingCommand = { kind: command.kind, asset: command.asset, amount: command.amount };
  if (markets.network === 'mainnet' && command.asset === context.asset) {
    const registered = BLEND_POOLS.mainnet.find(
      (item) => item.name === (context.source?.poolKind === 'fixed' ? 'Blend Fixed' : 'Blend YieldBlox'),
    );
    const selected = registered && available.find((market) => market.poolId === registered.id);
    if (!selected)
      throw new Error('The selected Blend pool is unavailable for this action. Its captured yield is not a quote.');
    result.poolId = selected.poolId;
  }
  return result;
}
