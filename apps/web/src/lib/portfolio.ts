import { useQuery } from '@tanstack/react-query';

import {
  type ActivityItem,
  call,
  execution,
  type LendingPositions,
  type LimitOrders,
  type SwapBalances,
} from './execution.ts';

const REFRESH_MS = 30_000;

/** One line of the Positions table: what is held or owed, where, and how it is accounted for. */
export interface PositionRow {
  key: string;
  label: string;
  venue: string;
  /** Debt counts against net value. */
  side: 'asset' | 'debt';
  amounts: { symbol: string; amount: string }[];
  usd: number | null;
  accounting: string;
  manage: { to: '/trade' | '/credit/positions' | '/portfolio/send'; label: string };
}

export interface Valuation {
  wallet: number | null;
  supplied: number | null;
  gross: number | null;
  debt: number | null;
  net: number | null;
}

/**
 * Everything Portfolio reads for the connected wallet: spendable balances, Blend and XOXNO
 * positions, Aquarius limit orders and recent activity, valued at the Stellar DEX XLM reference
 * price with USDC at $1. A source that fails is reported, never shown as zero.
 */
export function usePortfolio(address: string | null) {
  const account = address ?? '';
  const enabled = Boolean(address);
  const balances = useQuery({
    queryKey: ['balances', address],
    queryFn: () => execution.balances(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const positions = useQuery({
    queryKey: ['positions', address],
    queryFn: () => execution.positions(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const limits = useQuery({
    queryKey: ['limit-orders', address],
    queryFn: () => execution.limitOrders(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const activity = useQuery({
    queryKey: ['activity', address],
    queryFn: () => execution.activity(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const price = useQuery({
    queryKey: ['xlm-reference-price'],
    queryFn: async () => {
      const history = await call<{ day: { close: number } | null; candles: { close: number }[] }>(
        '/api/markets/price-history?interval=1h',
      );
      return history.day?.close ?? history.candles.at(-1)?.close ?? null;
    },
    staleTime: 60_000,
  });
  const xlmUsd = price.data ?? null;
  const rows = positionRows(balances.data, positions.data, limits.data, xlmUsd);
  const loading = enabled && (balances.isPending || positions.isPending || limits.isPending);
  const failed = [balances, positions, limits].some((query) => query.isError);
  return {
    rows,
    valuation:
      !enabled || loading || failed
        ? null
        : valuationOf(rows, {
            lending: positions.data?.blend.available === false || positions.data?.xoxno.available === false,
            limits: limits.data?.available === false,
          }),
    activity: activity.data?.items ?? ([] as ActivityItem[]),
    activityLoading: enabled && activity.isPending,
    loading,
    failed,
    xlmUsd,
    notices: noticesOf(balances.data, positions.data, limits.data),
  };
}

export function positionRows(
  balances: SwapBalances | undefined,
  positions: LendingPositions | undefined,
  limits: LimitOrders | undefined,
  xlmUsd: number | null,
): PositionRow[] {
  const usd = (amounts: { symbol: string; amount: string }[]) =>
    amounts.reduce<number | null>((total, { symbol, amount }) => {
      if (total === null) return null;
      const unit = symbol === 'USDC' ? 1 : symbol === 'XLM' ? xlmUsd : null;
      return unit === null ? null : total + Number(amount) * unit;
    }, 0);
  const rows: PositionRow[] = [];
  for (const balance of balances?.balances ?? []) {
    if (balance.spendable === null || Number(balance.spendable) === 0) continue;
    const amounts = [{ symbol: balance.symbol, amount: balance.spendable }];
    rows.push({
      key: `wallet-${balance.symbol}`,
      label: `${balance.symbol} in wallet`,
      venue: 'Wallet',
      side: 'asset',
      amounts,
      usd: usd(amounts),
      accounting: balance.symbol === 'XLM' ? 'Spendable, after the account reserve' : 'Spendable',
      manage: { to: '/portfolio/send', label: 'Send' },
    });
  }
  if (positions?.blend.available) {
    for (const pool of positions.blend.pools) {
      for (const position of pool.positions) {
        const parts = [
          { amount: position.supplied, what: 'Supplied', detail: `earning ${position.supplyApyPct.toFixed(2)}%` },
          {
            amount: position.collateral,
            what: 'Collateral',
            detail: pool.health === null ? 'no debt' : `health ${pool.health.toFixed(2)}`,
          },
          { amount: position.debt, what: 'Debt', detail: `at ${position.borrowApyPct.toFixed(2)}%` },
        ];
        for (const part of parts) {
          if (Number(part.amount.amount) === 0) continue;
          const amounts = [{ symbol: part.amount.symbol, amount: part.amount.amount }];
          rows.push({
            key: `blend-${pool.poolId}-${position.symbol}-${part.what}`,
            label: `${part.what} ${part.amount.symbol}`,
            venue: pool.name,
            side: part.what === 'Debt' ? 'debt' : 'asset',
            amounts,
            usd: usd(amounts),
            accounting: part.detail,
            manage: { to: '/credit/positions', label: part.what === 'Debt' ? 'Repay' : 'Withdraw' },
          });
        }
      }
    }
  }
  if (positions?.xoxno.available) {
    for (const account of positions.xoxno.accounts) {
      const health = account.healthFactor === null ? 'no debt' : `health ${account.healthFactor.toFixed(2)}`;
      if (account.collateral.length) {
        rows.push({
          key: `xoxno-${account.accountId}-collateral`,
          label: `Collateral ${account.collateral.map((amount) => amount.symbol).join(' + ')}`,
          venue: `${positions.xoxno.name} · account ${account.accountId}`,
          side: 'asset',
          amounts: account.collateral,
          usd: usd(account.collateral),
          accounting: health,
          manage: { to: '/credit/positions', label: 'Manage on XOXNO' },
        });
      }
      if (account.debt.length) {
        rows.push({
          key: `xoxno-${account.accountId}-debt`,
          label: `Debt ${account.debt.map((amount) => amount.symbol).join(' + ')}`,
          venue: `${positions.xoxno.name} · account ${account.accountId}`,
          side: 'debt',
          amounts: account.debt,
          usd: usd(account.debt),
          accounting: health,
          manage: { to: '/credit/positions', label: 'Manage on XOXNO' },
        });
      }
    }
  }
  for (const order of limits?.orders ?? []) {
    const amounts = order.returns.filter((amount) => Number(amount.amount) > 0);
    rows.push({
      key: `limit-${order.poolId}-${order.tickLower}`,
      label: order.side
        ? `Limit ${order.side} XLM${order.limitPrice ? ` at ${order.limitPrice}` : ''}`
        : 'Range position',
      venue: 'Aquarius concentrated',
      side: 'asset',
      amounts,
      usd: usd(amounts),
      accounting: `${order.status.replaceAll('_', ' ')} · band ${order.prices.map((price) => price.toFixed(4)).join('–')}`,
      manage: { to: '/trade', label: 'Withdraw' },
    });
  }
  return rows;
}

export function valuationOf(rows: PositionRow[], unknown: { lending: boolean; limits: boolean }): Valuation {
  const sum = (filter: (row: PositionRow) => boolean) =>
    rows
      .filter(filter)
      .reduce<number | null>((total, row) => (total === null || row.usd === null ? null : total + row.usd), 0);
  const assetsUnknown = unknown.lending || unknown.limits;
  const wallet = sum((row) => row.venue === 'Wallet');
  const gross = assetsUnknown ? null : sum((row) => row.side === 'asset');
  const debt = unknown.lending ? null : sum((row) => row.side === 'debt');
  return {
    wallet,
    supplied: assetsUnknown ? null : sum((row) => row.side === 'asset' && row.venue !== 'Wallet'),
    gross,
    debt,
    net: gross === null || debt === null ? null : gross - debt,
  };
}

function noticesOf(
  balances: SwapBalances | undefined,
  positions: LendingPositions | undefined,
  limits: LimitOrders | undefined,
): string[] {
  const notices: string[] = [];
  if (balances && !balances.funded) notices.push('This account is not funded on this network yet.');
  if (positions && !positions.blend.available) notices.push(positions.blend.reason);
  if (positions && !positions.xoxno.available) notices.push(positions.xoxno.reason);
  if (limits && !limits.available) notices.push(limits.reason);
  return notices;
}
