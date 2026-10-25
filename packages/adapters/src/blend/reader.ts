import { type Pool, type PoolOracle, PoolV2, Positions, PositionsEstimate } from '@blend-capital/blend-sdk';
import type { StellarNetwork } from '@nest/domain/network';

import { NETWORK_PASSPHRASES } from '../stellar/networks.ts';
import { BLEND_POOLS, type LendingSymbol, lendingAsset, poolAllows, poolStatusLabel } from './markets.ts';

export interface ReserveView {
  symbol: LendingSymbol;
  contractId: string;
  supplyApyPct: number;
  borrowApyPct: number;
  utilizationPct: number;
  suppliedRaw: bigint;
  borrowedRaw: bigint;
  /** What can be borrowed or withdrawn right now: supplied minus borrowed. */
  availableRaw: bigint;
  collateralFactor: number;
  /** As Blend's SDK reports it: 1 / l_factor, so effective liabilities are value × this (≥ 1). */
  liabilityFactor: number;
  enabled: boolean;
  priceUsd: number | null;
}

export interface MarketView {
  poolId: string;
  name: string;
  status: number;
  statusLabel: string;
  canSupply: boolean;
  canBorrow: boolean;
  reserves: ReserveView[];
  observedAtMs: number;
}

export interface HealthEstimate {
  /** Blend's health factor: effective collateral over effective liabilities; below 1 is liquidatable. */
  before: number | null;
  after: number | null;
  collateralUsdAfter: number;
  liabilitiesUsdAfter: number;
}

/** Live state of every registered Blend pool, read through Blend's SDK. Values leave as plain data. */
export async function loadBlendMarkets(network: StellarNetwork, rpcUrl: string, now = Date.now): Promise<MarketView[]> {
  const results = await Promise.allSettled(
    BLEND_POOLS[network].map((pool) => loadMarket(network, rpcUrl, pool.id, pool.name, now)),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/**
 * The account's health in a pool before and after changing its collateral and debt, using the
 * pool's own reserves, oracle and token conversions. Positive amounts add; negative amounts remove,
 * rounded so the estimate never flatters the result.
 */
export async function estimateBlendHealth(input: {
  network: StellarNetwork;
  rpcUrl: string;
  poolId: string;
  account: string;
  collateral?: { contractId: string; amountRaw: bigint };
  borrow?: { contractId: string; amountRaw: bigint };
}): Promise<HealthEstimate> {
  const pool = await PoolV2.load(blendNetwork(input.network, input.rpcUrl), input.poolId);
  const oracle = await pool.loadOracle();
  const user = await pool.loadUser(input.account);
  const current = user.positions;
  const next = new Positions(new Map(current.liabilities), new Map(current.collateral), new Map(current.supply));
  if (input.collateral) {
    const reserve = reserveOf(pool, input.collateral.contractId);
    const amount = input.collateral.amountRaw;
    add(
      next.collateral,
      reserve.config.index,
      amount >= 0n ? reserve.toBTokensFromAssetFloor(amount) : -reserve.toBTokensFromAssetCeil(-amount),
    );
  }
  if (input.borrow) {
    const reserve = reserveOf(pool, input.borrow.contractId);
    const amount = input.borrow.amountRaw;
    add(
      next.liabilities,
      reserve.config.index,
      amount >= 0n ? reserve.toDTokensFromAssetCeil(amount) : -reserve.toDTokensFromAssetFloor(-amount),
    );
  }
  const before = PositionsEstimate.build(pool, oracle, current);
  const after = PositionsEstimate.build(pool, oracle, next);
  return {
    before: healthOf(before),
    after: healthOf(after),
    collateralUsdAfter: after.totalEffectiveCollateral,
    liabilitiesUsdAfter: after.totalEffectiveLiabilities,
  };
}

export interface PositionView {
  symbol: LendingSymbol;
  contractId: string;
  /** Lent to the pool, earning the supply rate; not collateral. */
  suppliedRaw: bigint;
  collateralRaw: bigint;
  /** Owed, including interest accrued so far. */
  debtRaw: bigint;
  supplyApyPct: number;
  borrowApyPct: number;
}

export interface PoolPositions {
  poolId: string;
  name: string;
  statusLabel: string;
  positions: PositionView[];
  /** Blend's health factor, or null without debt. */
  health: number | null;
  observedAtMs: number;
}

/** The account's positions in every registered Blend pool where it holds any, in asset amounts. */
export async function loadBlendPositions(
  network: StellarNetwork,
  rpcUrl: string,
  account: string,
  now = Date.now,
): Promise<PoolPositions[]> {
  const results = await Promise.all(
    BLEND_POOLS[network].map(async (entry): Promise<PoolPositions | null> => {
      const pool = await PoolV2.load(blendNetwork(network, rpcUrl), entry.id);
      const user = await pool.loadUser(account);
      const { supply, collateral, liabilities } = user.positions;
      const positions = (['XLM', 'USDC'] as const).flatMap((symbol): PositionView[] => {
        const asset = lendingAsset(network, symbol);
        const reserve = pool.reserves.get(asset.contractId);
        if (!reserve) return [];
        const index = reserve.config.index;
        const view = {
          symbol,
          contractId: asset.contractId,
          suppliedRaw: reserve.toAssetFromBToken(supply.get(index) ?? 0n),
          collateralRaw: reserve.toAssetFromBToken(collateral.get(index) ?? 0n),
          debtRaw: reserve.toAssetFromDToken(liabilities.get(index) ?? 0n),
          supplyApyPct: reserve.estSupplyApy * 100,
          borrowApyPct: reserve.estBorrowApy * 100,
        };
        return view.suppliedRaw || view.collateralRaw || view.debtRaw ? [view] : [];
      });
      if (!positions.length) return null;
      const oracle = await pool.loadOracle();
      return {
        poolId: entry.id,
        name: entry.name,
        statusLabel: poolStatusLabel(pool.metadata.status),
        positions,
        health: healthOf(PositionsEstimate.build(pool, oracle, user.positions)),
        observedAtMs: now(),
      };
    }),
  );
  return results.filter((result) => result !== null);
}

async function loadMarket(
  network: StellarNetwork,
  rpcUrl: string,
  poolId: string,
  name: string,
  now: () => number,
): Promise<MarketView> {
  const pool = await PoolV2.load(blendNetwork(network, rpcUrl), poolId);
  const oracle = await pool.loadOracle().catch(() => null);
  const status = pool.metadata.status;
  const reserves = (['XLM', 'USDC'] as const).flatMap((symbol): ReserveView[] => {
    const asset = lendingAsset(network, symbol);
    const reserve = pool.reserves.get(asset.contractId);
    if (!reserve) return [];
    const suppliedRaw = reserve.totalSupply();
    const borrowedRaw = reserve.totalLiabilities();
    return [
      {
        symbol,
        contractId: asset.contractId,
        supplyApyPct: reserve.estSupplyApy * 100,
        borrowApyPct: reserve.estBorrowApy * 100,
        utilizationPct: reserve.getUtilizationFloat() * 100,
        suppliedRaw,
        borrowedRaw,
        availableRaw: suppliedRaw > borrowedRaw ? suppliedRaw - borrowedRaw : 0n,
        collateralFactor: reserve.getCollateralFactor(),
        liabilityFactor: reserve.getLiabilityFactor(),
        // v2 reserves carry an enabled flag; v1 configs have none and are always enabled.
        enabled: 'enabled' in reserve.config ? Boolean(reserve.config.enabled) : true,
        priceUsd: priceOf(oracle, asset.contractId),
      },
    ];
  });
  return {
    poolId,
    name,
    status,
    statusLabel: poolStatusLabel(status),
    canSupply: poolAllows(status, 'supply'),
    canBorrow: poolAllows(status, 'borrow'),
    reserves,
    observedAtMs: now(),
  };
}

function blendNetwork(network: StellarNetwork, rpcUrl: string) {
  return { rpc: rpcUrl, passphrase: NETWORK_PASSPHRASES[network] };
}

function reserveOf(pool: Pool, contractId: string) {
  const reserve = pool.reserves.get(contractId);
  if (!reserve) throw new Error(`The pool has no reserve for ${contractId}.`);
  return reserve;
}

function add(map: Map<number, bigint>, index: number, amount: bigint): void {
  const total = (map.get(index) ?? 0n) + amount;
  if (total > 0n) map.set(index, total);
  else map.delete(index);
}

function healthOf(estimate: PositionsEstimate): number | null {
  if (estimate.totalEffectiveLiabilities === 0) return null;
  return estimate.totalEffectiveCollateral / estimate.totalEffectiveLiabilities;
}

function priceOf(oracle: PoolOracle | null, contractId: string): number | null {
  return oracle?.getPriceFloat(contractId) ?? null;
}
