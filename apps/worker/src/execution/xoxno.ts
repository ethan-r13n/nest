import { InspectionError } from '@nest/adapters/stellar/inspect';
import { VenueRefusal } from '@nest/adapters/venue';
import {
  healthAfter,
  inspectXoxnoCall,
  XOXNO,
  type XoxnoAccount,
  type XoxnoCall,
  type XoxnoMarket,
  type XoxnoSymbol,
} from '@nest/adapters/xoxno/lending';
import { rawFromText, rawToText } from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';

import {
  type ExecutionDeps,
  type IntentRow,
  logFailure,
  type PlanRow,
  type QuoteRow,
  rawAmount,
  transitionOrReload,
} from './store.ts';

/**
 * XOXNO is a borrow venue only: Nest lends through Blend. A loan takes two transactions for an
 * account without enough collateral there, because XOXNO's controller takes collateral (`supply`)
 * and the loan (`borrow`) in separate calls and a Soroban transaction holds one call. The plan
 * reads the wallet's XOXNO account when it is prepared and builds whichever comes next.
 */
export const XOXNO_VENUE = 'xoxno';
const UNIT = 10_000_000;
const MIN_HEALTH = 1;

export interface XoxnoBorrowOffer {
  venue: typeof XOXNO_VENUE;
  poolId: string;
  poolName: string;
  status: number;
  statusLabel: string;
  canSupply: boolean;
  canBorrow: boolean;
  supplyApyPct: number;
  borrowApyPct: number;
  utilizationPct: number;
  availableRaw: string;
  enabled: boolean;
  collateralFactor: number;
  liabilityFactor: number;
  estimatedHealth: number;
  spokeId: number;
}

export type XoxnoStep = 'collateral' | 'borrow';

/**
 * One offer to borrow on XOXNO at the requested size, with collateral sized so the new position
 * alone sits at `targetHealth`; or the reason XOXNO cannot take it.
 */
export async function compareXoxnoBorrow(
  deps: ExecutionDeps,
  intent: IntentRow,
  targetHealth: number,
): Promise<{ offer: XoxnoBorrowOffer; collateralRaw: bigint } | { reason: string }> {
  if (!deps.xoxno) return { reason: 'XOXNO needs a Stellar RPC on this server.' };
  let market: XoxnoMarket;
  try {
    market = await deps.xoxno.market();
  } catch (error) {
    logFailure('xoxno_market', error);
    return { reason: 'XOXNO could not be read right now.' };
  }
  const borrow = market.reserves[intent.sell_asset as XoxnoSymbol];
  const backing = intent.collateral_asset ? market.reserves[intent.collateral_asset as XoxnoSymbol] : undefined;
  const amount = rawFromText(intent.sell_amount_raw);
  if (!borrow?.canBorrow)
    return { reason: `XOXNO does not lend ${intent.sell_asset} in its ${market.name} spoke now.` };
  if (!backing?.canCollateral) {
    return { reason: `XOXNO does not accept ${intent.collateral_asset ?? 'that asset'} as collateral now.` };
  }
  if (borrow.availableRaw < amount) {
    return { reason: `XOXNO has ${format(borrow.availableRaw)} ${borrow.symbol} available to borrow.` };
  }
  if (borrow.priceUsd === null || backing.priceUsd === null) {
    return { reason: "XOXNO's oracle has no current price for one of the assets." };
  }
  const borrowUsd = units(amount) * borrow.priceUsd;
  const collateralRaw = intent.collateral_amount_raw
    ? rawFromText(intent.collateral_amount_raw)
    : BigInt(Math.ceil(((borrowUsd * targetHealth) / (backing.priceUsd * backing.liquidationThreshold)) * UNIT));
  if (
    units(collateralRaw) * backing.priceUsd * backing.loanToValue <
    Math.max(borrowUsd, market.minBorrowCollateralUsd)
  ) {
    return {
      reason: `That collateral is below XOXNO's ${Math.round(backing.loanToValue * 100)}% loan-to-value limit.`,
    };
  }
  const estimatedHealth =
    healthAfter(market, null, {
      collateral: { symbol: backing.symbol, amount: collateralRaw },
      debt: { symbol: borrow.symbol, amount },
    }) ?? 0;
  return {
    offer: {
      venue: XOXNO_VENUE,
      poolId: market.controller,
      poolName: market.name,
      status: 1,
      statusLabel: 'Active',
      canSupply: false,
      canBorrow: true,
      supplyApyPct: borrow.supplyApyPct,
      borrowApyPct: borrow.borrowApyPct,
      utilizationPct: borrow.utilizationPct,
      availableRaw: rawToText(borrow.availableRaw),
      enabled: true,
      collateralFactor: backing.loanToValue,
      liabilityFactor: 1,
      estimatedHealth,
      spokeId: market.spokeId,
    },
    collateralRaw,
  };
}

/**
 * Reads the wallet's XOXNO account and builds the next transaction of the loan: the reviewed
 * collateral when the account cannot carry the loan at `warningHealth` yet, otherwise the loan.
 * Either is inspected against the plan before the user sees it.
 */
export async function prepareXoxnoBorrow(
  deps: ExecutionDeps,
  plan: PlanRow,
  intent: IntentRow,
  quote: QuoteRow,
  offer: XoxnoBorrowOffer,
  warningHealth: number,
): Promise<PlanRow> {
  if (!deps.xoxno) throw new AppError('UNAVAILABLE', 'XOXNO needs a Stellar RPC on this server.');
  const xoxno = deps.xoxno;
  let market: XoxnoMarket;
  let accounts: XoxnoAccount[];
  try {
    [market, accounts] = await Promise.all([xoxno.market(), xoxno.accounts(plan.account_id)]);
  } catch (error) {
    logFailure('xoxno_read', error);
    throw new AppError('UNAVAILABLE', 'XOXNO could not be read right now. Try again shortly.');
  }
  const borrow = { symbol: intent.sell_asset as XoxnoSymbol, amount: rawFromText(intent.sell_amount_raw) };
  const collateral = { symbol: intent.collateral_asset as XoxnoSymbol, amount: rawFromText(quote.amount_in_raw) };
  const account = accounts.find((candidate) => candidate.spokeId === offer.spokeId) ?? null;
  const healthIfBorrowed = account ? healthAfter(market, account, { debt: borrow }) : null;
  const step: XoxnoStep = healthIfBorrowed !== null && healthIfBorrowed >= warningHealth ? 'borrow' : 'collateral';

  if (step === 'borrow' && (healthIfBorrowed === null || !(healthIfBorrowed > MIN_HEALTH))) {
    return transitionOrReload(deps, plan, 'blocked', { error_code: 'HEALTH_TOO_LOW' }, 'system', 'Loan unsafe');
  }
  const call: XoxnoCall =
    step === 'borrow' && account
      ? { method: 'borrow', accountId: account.accountId, assets: [borrow] }
      : { method: 'supply', accountId: account?.accountId ?? 0n, spokeId: offer.spokeId, assets: [collateral] };

  let xdrText: string;
  try {
    xdrText = await xoxno.build({ account: plan.account_id, call });
  } catch (error) {
    if (error instanceof VenueRefusal) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('xoxno_build', error);
    throw new AppError('UNAVAILABLE', 'XOXNO could not be reached right now. Try again shortly.');
  }
  let inspected: ReturnType<typeof inspectXoxnoCall>;
  try {
    inspected = inspectXoxnoCall(xdrText, {
      network: plan.network,
      account: plan.account_id,
      call,
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(deps.now() / 1000),
    });
  } catch (error) {
    if (!(error instanceof InspectionError)) throw error;
    return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
  }

  const moved = call.assets[0] ?? (step === 'borrow' ? borrow : collateral);
  const facts = {
    venue: XOXNO_VENUE,
    step,
    poolId: offer.poolId,
    accountId: call.accountId === 0n ? null : call.accountId.toString(),
    feeStroops: rawToText(inspected.feeStroops),
    requests: [
      {
        type: step === 'borrow' ? 'borrow' : 'supplyCollateral',
        symbol: moved.symbol,
        amountRaw: rawToText(moved.amount),
      },
    ],
    healthBefore: account?.healthFactor ?? null,
    healthAfter: step === 'borrow' ? healthIfBorrowed : healthAfter(market, account, { collateral }),
  };
  return transitionOrReload(
    deps,
    plan,
    'awaiting_review',
    {
      prepared_xdr: xdrText,
      prepared_hash: inspected.hash,
      prepared_facts: JSON.stringify(facts),
      valid_until_ms: inspected.validUntilSeconds * 1000,
      approved_at_ms: null,
      error_code: null,
    },
    'system',
    step === 'borrow' ? 'Built, inspected and simulated' : 'Collateral first: built, inspected and simulated',
  );
}

/** The wallet's XOXNO accounts for Portfolio and Credit, with amounts as text. */
export async function listXoxnoAccounts(deps: ExecutionDeps, account: string) {
  if (!deps.xoxno)
    return { available: false as const, reason: 'XOXNO needs a Stellar RPC on this server.', accounts: [] };
  try {
    const accounts = await deps.xoxno.accounts(account);
    return {
      available: true as const,
      name: `XOXNO ${XOXNO[deps.config.network].spokeName}`,
      accounts: accounts.map((entry) => ({
        accountId: entry.accountId.toString(),
        spokeId: entry.spokeId,
        collateral: amounts(entry.collateralRaw),
        debt: amounts(entry.debtRaw),
        healthFactor: entry.healthFactor,
      })),
    };
  } catch (error) {
    logFailure('xoxno_accounts', error);
    return { available: false as const, reason: 'XOXNO positions could not be read right now.', accounts: [] };
  }
}

function amounts(raw: Record<XoxnoSymbol, bigint>) {
  return Object.entries(raw)
    .filter(([, value]) => value > 0n)
    .map(([symbol, value]) => rawAmount(symbol, rawToText(value)));
}

function units(raw: bigint): number {
  return Number(raw) / UNIT;
}

function format(raw: bigint): string {
  return units(raw).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
