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
  xoxnoWithdrawalHealth,
} from '@nest/adapters/xoxno/lending';
import { MAX_CLASSIC_RAW, rawFromText, rawToText } from '@nest/domain/amount';
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

export type XoxnoStep = 'collateral' | 'borrow' | 'repay' | 'withdraw';

export interface XoxnoExitOffer extends Omit<XoxnoBorrowOffer, 'estimatedHealth'> {
  estimatedHealth: number | null;
  loanAccountId: string;
  position: { account: string; heldRaw: string; health: number | null; lendingAccountId: string };
}

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
  if (
    borrow.priceWad == null ||
    backing.priceWad == null ||
    backing.liquidationThresholdBps === undefined ||
    backing.loanToValueBps === undefined ||
    market.minBorrowCollateralWad === undefined ||
    backing.liquidationThresholdBps <= 0n ||
    backing.priceWad <= 0n
  ) {
    return { reason: "XOXNO's oracle has no current exact price or risk terms for one of the assets." };
  }
  const borrowValue = amount * borrow.priceWad;
  const numerator = borrowValue * BigInt(Math.round(targetHealth * 10_000));
  const denominator = backing.priceWad * backing.liquidationThresholdBps;
  const collateralRaw = intent.collateral_amount_raw
    ? rawFromText(intent.collateral_amount_raw)
    : (numerator + denominator - 1n) / denominator;
  if (collateralRaw > MAX_CLASSIC_RAW) return { reason: 'The required collateral exceeds the supported amount.' };
  const weightedCollateral = collateralRaw * backing.priceWad * backing.loanToValueBps;
  if (
    weightedCollateral < borrowValue * 10_000n ||
    weightedCollateral < market.minBorrowCollateralWad * 10_000_000n * 10_000n
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
  const account =
    accounts.find(
      (candidate) =>
        candidate.spokeId === offer.spokeId &&
        (!intent.lending_account_id || candidate.accountId.toString() === intent.lending_account_id),
    ) ?? null;
  if (intent.lending_account_id && !account)
    throw new AppError('CONFLICT', 'That XOXNO lending account is not owned by this wallet.');
  const exact = account
    ? xoxnoWithdrawalHealth(
        market,
        {
          ...account,
          debtRaw: { ...account.debtRaw, [borrow.symbol]: account.debtRaw[borrow.symbol] + borrow.amount },
          healthFactor: 0,
        },
        { symbol: collateral.symbol, amount: 0n },
      )
    : null;
  const healthIfBorrowed = exact?.health ?? null;
  const step: XoxnoStep = healthIfBorrowed !== null && healthIfBorrowed >= warningHealth ? 'borrow' : 'collateral';

  if (step === 'borrow' && (healthIfBorrowed === null || !exact?.solvent || !(healthIfBorrowed > MIN_HEALTH))) {
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

/** Quotes an exit only from accounts enumerated and verified as owned by this wallet. */
export async function compareXoxnoExit(deps: ExecutionDeps, intent: IntentRow, owner: string) {
  const excluded: { poolId: string; name: string; reason: string }[] = [];
  const offers: { offer: XoxnoExitOffer; sendRaw: bigint; expectedRaw: bigint }[] = [];
  const poolId = XOXNO[intent.network].controller;
  const exclude = (reason: string) => excluded.push({ poolId, name: 'XOXNO', reason });
  if (!deps.xoxno) {
    exclude('XOXNO positions cannot be read right now.');
    return { offers, excluded };
  }
  let market: XoxnoMarket;
  let accounts: XoxnoAccount[];
  try {
    [market, accounts] = await Promise.all([deps.xoxno.market(), deps.xoxno.accounts(owner)]);
  } catch (error) {
    logFailure('xoxno_exit_read', error);
    exclude('XOXNO positions could not be read right now.');
    return { offers, excluded };
  }
  const symbol = intent.sell_asset === 'XLM' ? 'XLM' : 'USDC';
  const reserve = market.reserves[symbol];
  const wanted = rawFromText(intent.sell_amount_raw);
  const candidates = accounts.filter(
    (account) =>
      account.spokeId === market.spokeId &&
      (!intent.lending_account_id || account.accountId.toString() === intent.lending_account_id),
  );
  for (const account of candidates) {
    const held = intent.kind === 'repay' ? account.debtRaw[symbol] : account.collateralRaw[symbol];
    if (held === 0n) continue;
    const whole = intent.whole_position === 1 || wanted >= held;
    const expectedRaw = whole ? held : wanted;
    const sendRaw = whole ? held + held / 1000n + 1n : wanted;
    if (intent.kind !== 'repay' && reserve.availableRaw < expectedRaw) {
      exclude('XOXNO does not have enough unborrowed liquidity for this withdrawal.');
      continue;
    }
    offers.push({
      offer: {
        venue: XOXNO_VENUE,
        poolId,
        poolName: `${market.name} · account ${account.accountId}`,
        status: 1,
        statusLabel: 'Exit subject to current health and liquidity',
        canSupply: false,
        canBorrow: false,
        enabled: true,
        supplyApyPct: reserve.supplyApyPct,
        borrowApyPct: reserve.borrowApyPct,
        utilizationPct: reserve.utilizationPct,
        availableRaw: rawToText(reserve.availableRaw),
        collateralFactor: reserve.loanToValue,
        liabilityFactor: 1,
        estimatedHealth: null,
        spokeId: market.spokeId,
        loanAccountId: account.accountId.toString(),
        position: {
          account: owner,
          heldRaw: rawToText(held),
          health: account.healthFactor,
          lendingAccountId: account.accountId.toString(),
        },
      },
      sendRaw,
      expectedRaw,
    });
  }
  offers.sort((left, right) =>
    rawFromText(left.offer.position.heldRaw) > rawFromText(right.offer.position.heldRaw) ? -1 : 1,
  );
  if (offers.length === 0 && excluded.length === 0) exclude('No matching owned XOXNO position was found.');
  // With no explicit NFT selected, use the largest matching position and identify it in the review.
  return { offers: offers.slice(0, 1), excluded };
}

export async function prepareXoxnoExit(
  deps: ExecutionDeps,
  plan: PlanRow,
  intent: IntentRow,
  quote: QuoteRow,
  offer: XoxnoExitOffer,
): Promise<PlanRow> {
  if (!deps.xoxno) throw new AppError('UNAVAILABLE', 'XOXNO cannot be read right now.');
  const [market, accounts] = await Promise.all([deps.xoxno.market(), deps.xoxno.accounts(plan.account_id)]);
  const account = accounts.find(
    (entry) => entry.accountId.toString() === offer.loanAccountId && entry.spokeId === market.spokeId,
  );
  if (
    !account ||
    offer.position.account !== plan.account_id ||
    (intent.lending_account_id && intent.lending_account_id !== account.accountId.toString())
  ) {
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'ACCOUNT_MISMATCH' },
      'system',
      'The lending account is not owned by this wallet.',
    );
  }
  const symbol = intent.sell_asset === 'XLM' ? 'XLM' : 'USDC';
  const amount = rawFromText(quote.amount_in_raw);
  const held = intent.kind === 'repay' ? account.debtRaw[symbol] : account.collateralRaw[symbol];
  if (held === 0n || (intent.whole_position === 1 && held > amount)) {
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'POSITION_CHANGED' },
      'system',
      'The position changed. Compare again for current amounts.',
    );
  }
  let actual = amount;
  if (held < actual) actual = held;
  let after = account.healthFactor;
  if (intent.kind !== 'repay') {
    const health = xoxnoWithdrawalHealth(market, account, { symbol, amount: actual });
    if (!health.solvent || market.reserves[symbol].availableRaw < actual) {
      return transitionOrReload(
        deps,
        plan,
        'blocked',
        { error_code: !health.solvent ? 'HEALTH_TOO_LOW' : 'LIQUIDITY_INSUFFICIENT' },
        'system',
        'This withdrawal does not leave safe collateral or available liquidity.',
      );
    }
    after = health.health;
  } else {
    const remaining = { ...account, debtRaw: { ...account.debtRaw, [symbol]: held - actual } };
    after = healthAfter(market, remaining, {});
  }
  const method = intent.kind === 'repay' ? 'repay' : 'withdraw';
  const call: XoxnoCall = { method, accountId: account.accountId, assets: [{ symbol, amount }] };
  let xdrText: string;
  let inspected: ReturnType<typeof inspectXoxnoCall>;
  try {
    xdrText = await deps.xoxno.build({ account: plan.account_id, call });
    inspected = inspectXoxnoCall(xdrText, {
      network: plan.network,
      account: plan.account_id,
      call,
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(deps.now() / 1000),
    });
  } catch (error) {
    if (error instanceof VenueRefusal || error instanceof InspectionError) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('xoxno_exit_build', error);
    throw new AppError('UNAVAILABLE', 'XOXNO could not prepare this exit right now.');
  }
  return transitionOrReload(
    deps,
    plan,
    'awaiting_review',
    {
      prepared_xdr: xdrText,
      prepared_hash: inspected.hash,
      prepared_facts: JSON.stringify({
        venue: XOXNO_VENUE,
        step: method,
        poolId: offer.poolId,
        accountId: account.accountId.toString(),
        feeStroops: rawToText(inspected.feeStroops),
        requests: [{ type: method === 'repay' ? 'repay' : 'withdrawCollateral', symbol, amountRaw: rawToText(amount) }],
        healthBefore: account.healthFactor,
        healthAfter: Number.isFinite(after) ? after : null,
      }),
      valid_until_ms: inspected.validUntilSeconds * 1000,
      approved_at_ms: null,
      error_code: null,
    },
    'system',
    'Exit built, inspected and simulated',
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
      poolId: XOXNO[deps.config.network].controller,
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
