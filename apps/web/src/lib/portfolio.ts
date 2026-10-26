import { useQuery } from '@tanstack/react-query';

import {
  type ActivityItem,
  call,
  execution,
  type LendingPositions,
  type LimitOrders,
  type SwapBalances,
  type VaultPosition,
  type VaultPositions,
} from './execution.ts';
import { useHealth } from './health.ts';
import { type LendingExit, lendingExits } from './position-management.ts';

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
  lendingAction?: LendingExit | undefined;
  vault?: VaultPosition;
}

export interface Valuation {
  wallet: number | null;
  supplied: number | null;
  gross: number | null;
  debt: number | null;
  net: number | null;
  vaults: number | null;
}

/**
 * Everything Portfolio reads for the connected wallet: spendable balances, Blend and XOXNO
 * positions, Aquarius limit orders and recent activity, valued at the Stellar DEX XLM reference
 * price with USDC at $1. A source that fails is reported, never shown as zero.
 */
export function usePortfolio(address: string | null) {
  const account = address ?? '';
  const health = useHealth();
  const network = health.data?.network;
  const enabled = Boolean(address && network);
  const balances = useQuery({
    queryKey: ['balances', network, address],
    queryFn: () => execution.balances(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const positions = useQuery({
    queryKey: ['positions', network, address],
    queryFn: () => execution.positions(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const limits = useQuery({
    queryKey: ['limit-orders', network, address],
    queryFn: () => execution.limitOrders(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const activity = useQuery({
    queryKey: ['activity', network, address],
    queryFn: () => execution.activity(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const vaults = useQuery({
    queryKey: ['vault-positions', network, address],
    queryFn: () => execution.vaultPositions(account),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const xlmUsd = useXlmUsd(network);
  const sameNetwork = [balances.data, positions.data, vaults.data].every((data) => !data || data.network === network);
  const rows = sameNetwork
    ? positionRows(balances.data, positions.data, limits.data, xlmUsd, vaults.data, address ?? undefined)
    : [];
  const loading = enabled && (balances.isPending || positions.isPending || limits.isPending || vaults.isPending);
  const failed = !sameNetwork || [balances, positions, limits, vaults].some((query) => query.isError);
  return {
    rows,
    valuation:
      !enabled || loading || failed
        ? null
        : valuationOf(rows, {
            lending: positions.data?.blend.available === false || positions.data?.xoxno.available === false,
            limits: limits.data?.available === false,
            vaults: vaults.data?.available === false,
          }),
    activity: activity.data?.items ?? ([] as ActivityItem[]),
    activityLoading: enabled && activity.isPending,
    activityFailed: activity.isError,
    loading,
    failed,
    xlmUsd,
    network,
    notices: [
      ...noticesOf(balances.data, positions.data, limits.data, vaults.data),
      ...(!sameNetwork ? ['Position data does not match the active network. Actions are unavailable.'] : []),
    ],
  };
}

/** The Stellar DEX XLM reference price in USDC, which Portfolio and Trade value XLM at. */
export function useXlmUsd(network: string | undefined) {
  const price = useQuery({
    queryKey: ['xlm-reference-price', network],
    queryFn: async () => {
      const history = await call<{ day: { close: number } | null; candles: { close: number }[] }>(
        '/api/markets/price-history?interval=1h',
      );
      return history.day?.close ?? history.candles.at(-1)?.close ?? null;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  return price.data ?? null;
}

export function positionRows(
  balances: SwapBalances | undefined,
  positions: LendingPositions | undefined,
  limits: LimitOrders | undefined,
  xlmUsd: number | null,
  vaults?: VaultPositions,
  owner?: string,
): PositionRow[] {
  const usd = (amounts: { symbol: string; amount: string }[]) =>
    amounts.reduce<number | null>((total, { symbol, amount }) => {
      if (total === null) return null;
      const unit = symbol === 'USDC' ? 1 : symbol === 'XLM' ? xlmUsd : null;
      return unit === null ? null : total + Number(amount) * unit;
    }, 0);
  const rows: PositionRow[] = [];
  const actions = positions && owner ? lendingExits(positions, owner) : [];
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
            lendingAction: actions.find(
              (action) =>
                action.poolId === pool.poolId &&
                action.symbol === part.amount.symbol &&
                action.kind ===
                  (part.what === 'Debt' ? 'repay' : part.what === 'Supplied' ? 'withdraw' : 'withdraw_collateral'),
            ),
          });
        }
      }
    }
  }
  if (positions?.xoxno.available) {
    for (const account of positions.xoxno.accounts) {
      const health = account.healthFactor === null ? 'no debt' : `health ${account.healthFactor.toFixed(2)}`;
      for (const amount of account.collateral) {
        rows.push({
          key: `xoxno-${account.accountId}-collateral-${amount.symbol}`,
          label: `Collateral ${amount.symbol}`,
          venue: `${positions.xoxno.name} · account ${account.accountId}`,
          side: 'asset',
          amounts: [amount],
          usd: usd([amount]),
          accounting: health,
          manage: { to: '/credit/positions', label: 'Manage on XOXNO' },
          lendingAction: actions.find(
            (action) =>
              action.lendingAccountId === account.accountId &&
              action.kind === 'withdraw_collateral' &&
              action.symbol === amount.symbol,
          ),
        });
      }
      for (const amount of account.debt) {
        rows.push({
          key: `xoxno-${account.accountId}-debt-${amount.symbol}`,
          label: `Debt ${amount.symbol}`,
          venue: `${positions.xoxno.name} · account ${account.accountId}`,
          side: 'debt',
          amounts: [amount],
          usd: usd([amount]),
          accounting: health,
          manage: { to: '/credit/positions', label: 'Manage on XOXNO' },
          lendingAction: actions.find(
            (action) =>
              action.lendingAccountId === account.accountId &&
              action.kind === 'repay' &&
              action.symbol === amount.symbol,
          ),
        });
      }
    }
  }
  if (vaults?.available) {
    for (const position of vaults.positions) {
      rows.push({
        key: `vault-${position.vault.id}`,
        label: position.vault.name,
        venue: 'DeFindex',
        side: 'asset',
        amounts: [position.underlying],
        usd: usd([position.underlying]),
        accounting: `${position.shares.amount} shares · underlying estimate`,
        manage: { to: '/credit/positions', label: 'Withdraw' },
        vault: position,
      });
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

export function valuationOf(
  rows: PositionRow[],
  unknown: { lending: boolean; limits: boolean; vaults?: boolean },
): Valuation {
  const sum = (filter: (row: PositionRow) => boolean) =>
    rows
      .filter(filter)
      .reduce<number | null>((total, row) => (total === null || row.usd === null ? null : total + row.usd), 0);
  const assetsUnknown = unknown.lending || unknown.limits || unknown.vaults;
  const wallet = sum((row) => row.venue === 'Wallet');
  const gross = assetsUnknown ? null : sum((row) => row.side === 'asset');
  const debt = unknown.lending ? null : sum((row) => row.side === 'debt');
  return {
    wallet,
    supplied:
      unknown.lending || unknown.limits
        ? null
        : sum((row) => row.side === 'asset' && row.venue !== 'Wallet' && !row.vault),
    gross,
    debt,
    net: gross === null || debt === null ? null : gross - debt,
    vaults: unknown.vaults ? null : sum((row) => Boolean(row.vault)),
  };
}

function noticesOf(
  balances: SwapBalances | undefined,
  positions: LendingPositions | undefined,
  limits: LimitOrders | undefined,
  vaults?: VaultPositions,
): string[] {
  const notices: string[] = [];
  if (balances && !balances.funded) notices.push('This account is not funded on this network yet.');
  if (positions && !positions.blend.available) notices.push(positions.blend.reason);
  if (positions && !positions.xoxno.available) notices.push(positions.xoxno.reason);
  if (limits && !limits.available) notices.push(limits.reason);
  if (vaults && !vaults.available) notices.push(vaults.reason);
  return notices;
}
