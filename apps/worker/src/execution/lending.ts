import { BLEND_POOLS, blendPool, type LendingSymbol, lendingAsset } from '@nest/adapters/blend/markets';
import type { MarketView, PoolPositions, ReserveView } from '@nest/adapters/blend/reader';
import { inspectBlendSubmit, type LendingRequest } from '@nest/adapters/blend/submit';
import { InspectionError } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import { AmountError, MAX_CLASSIC_RAW, parseDecimalAmount, rawFromText, rawToText } from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';
import { type Decision, evaluate, type Rule } from '@nest/policy/engine';
import { StrKey } from '@stellar/stellar-sdk';

import {
  basePlanView,
  canonicalJson,
  type ExecutionDeps,
  feeView,
  type IntentRow,
  insertIntent,
  insertQuote,
  logFailure,
  MAX_FEE_STROOPS,
  type PlanRow,
  type QuoteRow,
  rawAmount,
  sha256Hex,
  transitionOrReload,
  XLM_DECIMALS,
} from './store.ts';

export type LendingKind = 'supply' | 'borrow' | 'repay' | 'withdraw' | 'withdraw_collateral';
/** Actions that close or shrink a position the account already holds in one pool. */
type ExitKind = 'repay' | 'withdraw' | 'withdraw_collateral';
const EXIT_KINDS: readonly string[] = ['repay', 'withdraw', 'withdraw_collateral'];
const isExit = (kind: string): kind is ExitKind => EXIT_KINDS.includes(kind);
const EXIT_REQUEST = { repay: 'repay', withdraw: 'withdraw', withdraw_collateral: 'withdrawCollateral' } as const;
const HELD = { repay: 'debt', withdraw: 'supplied', withdraw_collateral: 'collateral' } as const;

const VENUE = 'blend';
/** Pool rates move slowly, but a borrow's collateral is sized from oracle prices, so offers stay short. */
const OFFER_MAX_AGE_MS = 60_000;
/**
 * Collateral is sized so the new position alone sits at this health factor. Suggested default, not
 * yet confirmed by the team; Blend itself liquidates below 1.
 */
const TARGET_HEALTH = 1.6;
const MIN_HEALTH = 1;
const HEALTH_WARNING = 1.5;
const UNIT = 10 ** XLM_DECIMALS;
/**
 * A whole-position repay or withdrawal asks for this much over the position so interest accrued
 * before inclusion is covered. Blend refunds the excess of a repay and caps a withdrawal at the
 * position (pool/src/pool/actions.rs, apply_repay and apply_withdraw), so nothing extra moves.
 */
const WHOLE_BUFFER_DIVISOR = 1000n;

/** Blend supply has no lockup or cooldown; exits depend on the pool's unborrowed liquidity. */
const WITHDRAWAL_TIMING = {
  supply: {
    lockup: 'none',
    cooldown: 'none',
    summary:
      'Withdraw any time the pool has unborrowed liquidity. No lockup or cooldown. When utilization is high, a withdrawal may have to wait until borrowers repay.',
  },
  collateral: {
    lockup: 'none',
    cooldown: 'none',
    summary:
      'Collateral can be withdrawn any time the pool has liquidity and your position stays healthy afterwards. While the loan is open, part of it stays locked to back the debt.',
  },
} as const;

interface Offer {
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
  collateralFactor: number | null;
  liabilityFactor: number;
  /** Health of the new position on its own, from oracle prices at quote time. Borrows only. */
  estimatedHealth: number | null;
  /** Repay and withdraw: the account whose position this is, what it holds now and its health. */
  position?: { account: string; heldRaw: string; health: number | null };
}

export async function createLendingIntent(
  deps: ExecutionDeps,
  input: {
    kind: LendingKind;
    asset: LendingSymbol;
    amount: string;
    collateralAsset?: LendingSymbol | undefined;
    collateralAmount?: string | undefined;
    poolId?: string | undefined;
    source: 'chat' | 'form';
  },
) {
  const network = deps.config.network;
  if (input.poolId && !blendPool(network, input.poolId)) {
    throw new AppError('INVALID_REQUEST', 'That pool is not a registered Blend pool on this network.');
  }
  const whole = input.amount.trim().toLowerCase() === 'all';
  if (whole && !isExit(input.kind)) {
    throw new AppError('INVALID_REQUEST', 'Only a repay or a withdrawal can be for the whole position.');
  }
  const raw = whole ? 0n : amountOf(input.amount);
  let collateralAsset: LendingSymbol | null = null;
  let collateralRaw: bigint | null = null;
  if (input.kind === 'borrow') {
    collateralAsset = input.collateralAsset ?? (input.asset === 'USDC' ? 'XLM' : 'USDC');
    if (collateralAsset === input.asset) {
      throw new AppError('INVALID_REQUEST', 'Borrow against a different asset than the one you borrow.');
    }
    collateralRaw = input.collateralAmount ? amountOf(input.collateralAmount) : null;
  } else if (input.collateralAsset || input.collateralAmount) {
    throw new AppError('INVALID_REQUEST', 'Collateral applies to borrowing only.');
  }
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network,
    kind: input.kind,
    sell_asset: input.asset,
    buy_asset: input.asset,
    sell_amount_raw: rawToText(raw),
    source: input.source,
    market_id: input.poolId ?? null,
    collateral_asset: collateralAsset,
    collateral_amount_raw: collateralRaw === null ? null : rawToText(collateralRaw),
    whole_position: whole ? 1 : 0,
    limit_price: null,
    tick_lower: null,
    tick_upper: null,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return lendingIntentView(row);
}

/**
 * Reads every registered Blend pool and returns one offer per pool that can take this action,
 * best first: highest supply APY to lend, lowest borrow APY to borrow. Pools that cannot are
 * listed with the reason, never dropped silently.
 */
export async function compareLending(deps: ExecutionDeps, intent: IntentRow, accountId?: string) {
  if (!deps.lending) throw new AppError('UNAVAILABLE', 'Lending needs a Stellar RPC on this server.');
  if (isExit(intent.kind)) return compareExit(deps, intent, accountId);
  const markets = await readMarkets(deps);
  const kind = intent.kind as LendingKind;
  const asset = lendingAsset(intent.network, intent.sell_asset as LendingSymbol);
  const collateral = intent.collateral_asset
    ? lendingAsset(intent.network, intent.collateral_asset as LendingSymbol)
    : null;
  const amount = rawFromText(intent.sell_amount_raw);
  const observed = deps.now();

  const excluded: { poolId: string; name: string; reason: string }[] = [];
  const candidates: { offer: Offer; collateralRaw: bigint | null }[] = [];
  for (const pool of BLEND_POOLS[intent.network]) {
    const market = markets.find((candidate) => candidate.poolId === pool.id);
    const exclude = (reason: string) => excluded.push({ poolId: pool.id, name: pool.name, reason });
    if (!market) {
      exclude('The pool could not be read right now.');
      continue;
    }
    if (intent.market_id && intent.market_id !== pool.id) {
      exclude('Not the pool you asked for.');
      continue;
    }
    const reserve = market.reserves.find((candidate) => candidate.contractId === asset.contractId);
    if (!reserve?.enabled) {
      exclude(`The pool does not list ${asset.symbol}.`);
      continue;
    }
    const offer = offerOf(market, reserve, null);
    if (kind === 'supply') {
      if (!market.canSupply) exclude(`The pool is ${market.statusLabel.toLowerCase()}, so deposits are disabled.`);
      else candidates.push({ offer, collateralRaw: null });
      continue;
    }

    if (!market.canBorrow) {
      exclude(`The pool is ${market.statusLabel.toLowerCase()}, so borrowing is disabled.`);
      continue;
    }
    const backing = collateral && market.reserves.find((candidate) => candidate.contractId === collateral.contractId);
    if (!collateral || !backing?.enabled || backing.collateralFactor <= 0) {
      exclude(`The pool does not accept ${collateral?.symbol ?? 'that asset'} as collateral.`);
      continue;
    }
    if (reserve.availableRaw < amount) {
      exclude(`The pool has ${formatUnits(reserve.availableRaw)} ${asset.symbol} available to borrow.`);
      continue;
    }
    if (reserve.priceUsd === null || backing.priceUsd === null) {
      exclude('The pool oracle has no price for one of the assets.');
      continue;
    }
    // Blend's liability factor is already the inverse of the configured l_factor, so it multiplies.
    const borrowEffectiveUsd = toUnits(amount) * reserve.priceUsd * reserve.liabilityFactor;
    const collateralRaw = intent.collateral_amount_raw
      ? rawFromText(intent.collateral_amount_raw)
      : BigInt(
          Math.ceil(((borrowEffectiveUsd * TARGET_HEALTH) / (backing.collateralFactor * backing.priceUsd)) * UNIT),
        );
    const estimatedHealth = (toUnits(collateralRaw) * backing.priceUsd * backing.collateralFactor) / borrowEffectiveUsd;
    candidates.push({
      offer: { ...offerOf(market, reserve, estimatedHealth), collateralFactor: backing.collateralFactor },
      collateralRaw,
    });
  }

  candidates.sort((left, right) =>
    kind === 'supply'
      ? right.offer.supplyApyPct - left.offer.supplyApyPct
      : left.offer.borrowApyPct - right.offer.borrowApyPct,
  );
  const rows: QuoteRow[] = candidates.map(({ offer, collateralRaw }) => ({
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: VENUE,
    slippage_bps: 0,
    // Supply: what goes in and stays the user's. Borrow: the collateral in, the loan out.
    amount_in_raw: rawToText(collateralRaw ?? amount),
    amount_out_raw: rawToText(amount),
    min_out_raw: rawToText(amount),
    price_impact_bps: null,
    protocols: JSON.stringify([offer.poolId]),
    provider_quote: JSON.stringify(offer),
    observed_at_ms: observed,
    expires_at_ms: observed + OFFER_MAX_AGE_MS,
  }));
  for (const row of rows) await insertQuote(deps, row);
  const quotes = rows.map((row) => lendingQuoteView(row, intent));
  return { quotes, selectedQuoteId: quotes[0]?.id ?? null, excluded };
}

/**
 * Finds the account's position in each registered pool and offers to repay or withdraw it there,
 * largest position first. Pools where it holds nothing are listed with that reason.
 */
async function compareExit(deps: ExecutionDeps, intent: IntentRow, accountId: string | undefined) {
  if (!deps.lending) throw new AppError('UNAVAILABLE', 'Lending needs a Stellar RPC on this server.');
  if (!accountId || !StrKey.isValidEd25519PublicKey(accountId)) {
    throw new AppError('INVALID_REQUEST', 'Connect your wallet so Nest can read your Blend position.');
  }
  const kind = intent.kind as ExitKind;
  const [markets, held] = await Promise.all([readMarkets(deps), readPositions(deps, accountId)]);
  const asset = lendingAsset(intent.network, intent.sell_asset as LendingSymbol);
  const requested = rawFromText(intent.sell_amount_raw);
  const observed = deps.now();
  const excluded: { poolId: string; name: string; reason: string }[] = [];
  const candidates: { offer: Offer; sendRaw: bigint; expectedRaw: bigint }[] = [];
  for (const pool of BLEND_POOLS[intent.network]) {
    const exclude = (reason: string) => excluded.push({ poolId: pool.id, name: pool.name, reason });
    if (intent.market_id && intent.market_id !== pool.id) {
      exclude('Not the pool you asked for.');
      continue;
    }
    const market = markets.find((candidate) => candidate.poolId === pool.id);
    const reserve = market?.reserves.find((candidate) => candidate.contractId === asset.contractId);
    if (!market || !reserve) {
      exclude('The pool could not be read right now.');
      continue;
    }
    const pools = held.find((candidate) => candidate.poolId === pool.id);
    const position = pools?.positions.find((candidate) => candidate.contractId === asset.contractId);
    const heldRaw =
      kind === 'repay' ? position?.debtRaw : kind === 'withdraw' ? position?.suppliedRaw : position?.collateralRaw;
    if (!heldRaw) {
      exclude(`You have no ${asset.symbol} ${HELD[kind]} here.`);
      continue;
    }
    const whole = intent.whole_position === 1 || requested >= heldRaw;
    const expectedRaw = whole ? heldRaw : requested;
    if (kind !== 'repay' && reserve.availableRaw < expectedRaw) {
      exclude(`The pool has ${formatUnits(reserve.availableRaw)} ${asset.symbol} available to withdraw right now.`);
      continue;
    }
    candidates.push({
      offer: {
        ...offerOf(market, reserve, null),
        position: { account: accountId, heldRaw: rawToText(heldRaw), health: pools?.health ?? null },
      },
      sendRaw: whole ? heldRaw + heldRaw / WHOLE_BUFFER_DIVISOR + 1n : requested,
      expectedRaw,
    });
  }
  candidates.sort((left, right) =>
    rawFromText(right.offer.position?.heldRaw ?? '0') > rawFromText(left.offer.position?.heldRaw ?? '0') ? 1 : -1,
  );
  const rows: QuoteRow[] = candidates.map(({ offer, sendRaw, expectedRaw }) => ({
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: VENUE,
    slippage_bps: 0,
    // What the request asks for, and what it repays or returns once Blend applies it.
    amount_in_raw: rawToText(sendRaw),
    amount_out_raw: rawToText(expectedRaw),
    min_out_raw: rawToText(expectedRaw),
    price_impact_bps: null,
    protocols: JSON.stringify([offer.poolId]),
    provider_quote: JSON.stringify(offer),
    observed_at_ms: observed,
    expires_at_ms: observed + OFFER_MAX_AGE_MS,
  }));
  for (const row of rows) await insertQuote(deps, row);
  const quotes = rows.map((row) => lendingQuoteView(row, intent));
  return { quotes, selectedQuoteId: quotes[0]?.id ?? null, excluded };
}

async function readMarkets(deps: ExecutionDeps): Promise<MarketView[]> {
  try {
    return (await deps.lending?.markets()) ?? [];
  } catch (error) {
    logFailure('lending_markets', error);
    throw new AppError('UNAVAILABLE', 'Blend pools could not be read right now. Try again shortly.');
  }
}

async function readPositions(deps: ExecutionDeps, account: string): Promise<PoolPositions[]> {
  try {
    return (await deps.lending?.positions(account)) ?? [];
  } catch (error) {
    logFailure('lending_positions', error);
    throw new AppError('UNAVAILABLE', 'Your Blend positions could not be read right now. Try again shortly.');
  }
}

interface LendingPlanFacts {
  kind: LendingKind;
  nowMs: number;
  quoteExpiresAtMs: number;
  offer: Offer;
  amount: bigint;
  account: string;
  nestFeeBps: number;
}

const LENDING_RULES: readonly Rule<LendingPlanFacts>[] = [
  {
    id: 'quote_fresh',
    severity: 'block',
    check: (facts) => ({
      pass: facts.nowMs < facts.quoteExpiresAtMs,
      code: 'QUOTE_EXPIRED',
      detail: 'The rates must still be current. Compare again.',
    }),
  },
  {
    id: 'pool_allows',
    severity: 'block',
    check: (facts) => ({
      // Blend lets an account repay and withdraw in every pool status (pool.rs, require_action_allowed).
      pass:
        isExit(facts.kind) ||
        (facts.offer.enabled && (facts.kind === 'supply' ? facts.offer.canSupply : facts.offer.canBorrow)),
      code: 'POOL_STATUS',
      detail: `The pool is ${facts.offer.statusLabel.toLowerCase()} and must allow this action.`,
      facts: { status: facts.offer.statusLabel },
    }),
  },
  {
    id: 'liquidity',
    severity: 'block',
    check: (facts) => ({
      pass: facts.kind === 'supply' || facts.kind === 'repay' || rawFromText(facts.offer.availableRaw) >= facts.amount,
      code: 'LIQUIDITY_INSUFFICIENT',
      detail: 'The pool must have enough unborrowed liquidity to pay this out.',
    }),
  },
  {
    id: 'health',
    severity: 'block',
    check: (facts) => ({
      pass: facts.kind !== 'borrow' || (facts.offer.estimatedHealth ?? 0) > MIN_HEALTH,
      code: 'HEALTH_TOO_LOW',
      detail: 'The collateral must keep the loan above a health factor of 1, where Blend liquidates.',
    }),
  },
  {
    id: 'health_margin',
    severity: 'warn',
    check: (facts) => ({
      pass: facts.kind !== 'borrow' || (facts.offer.estimatedHealth ?? 0) >= HEALTH_WARNING,
      code: 'HEALTH_LOW',
      detail: `A health factor below ${HEALTH_WARNING} leaves little room before liquidation if prices move.`,
    }),
  },
  {
    id: 'position_owner',
    severity: 'block',
    check: (facts) => ({
      pass: !facts.offer.position || facts.offer.position.account === facts.account,
      code: 'ACCOUNT_MISMATCH',
      detail: 'This position was read for another wallet. Compare again with the connected one.',
    }),
  },
  {
    id: 'nest_fee',
    severity: 'block',
    check: (facts) => ({
      pass: facts.nestFeeBps === 0,
      code: 'NEST_FEE_NOT_ZERO',
      detail: 'Nest charges no execution fee.',
    }),
  },
];

export async function lendingPlanPolicy(
  intent: IntentRow,
  quote: QuoteRow,
  accountId: string,
  now: number,
): Promise<{ decision: Decision; digest: string }> {
  const offer = JSON.parse(quote.provider_quote) as Offer;
  const kind = intent.kind as LendingKind;
  const decision = evaluate(LENDING_RULES, {
    kind,
    nowMs: now,
    quoteExpiresAtMs: quote.expires_at_ms,
    offer,
    amount: isExit(kind) ? rawFromText(quote.amount_out_raw) : rawFromText(intent.sell_amount_raw),
    account: accountId,
    nestFeeBps: 0,
  });
  const requests = requestsOf(intent, quote);
  const digest = await sha256Hex(
    canonicalJson({
      intentId: intent.id,
      quoteId: quote.id,
      network: intent.network,
      account: accountId,
      poolId: offer.poolId,
      requests: requests.map((request) => `${request.type}:${request.contractId}:${request.amount}`).join(','),
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  return { decision, digest };
}

/** Checks the account's health after the action, then builds the pool submit and inspects it against the plan. */
export async function prepareLending(
  deps: ExecutionDeps,
  plan: PlanRow,
  intent: IntentRow,
  quote: QuoteRow,
): Promise<PlanRow> {
  if (!deps.lending) throw new AppError('UNAVAILABLE', 'Lending needs a Stellar RPC on this server.');
  const offer = JSON.parse(quote.provider_quote) as Offer;
  const requests = requestsOf(intent, quote);
  let health: { before: number | null; after: number | null } = { before: null, after: null };
  const change = healthChange(intent, requests);
  if (change) {
    try {
      health = await deps.lending.health({ poolId: offer.poolId, account: plan.account_id, ...change });
    } catch (error) {
      logFailure('lending_health', error);
      throw new AppError('UNAVAILABLE', 'The position health could not be checked right now. Try again shortly.');
    }
    // Checked before building, so an unsafe withdrawal stops with this reason rather than Blend's
    // simulation error. No debt left means nothing can be liquidated; with debt, Blend itself refuses at 1.
    const unsafe =
      intent.kind === 'borrow'
        ? health.after === null || health.after <= MIN_HEALTH
        : health.after !== null && health.after <= MIN_HEALTH;
    if (unsafe) {
      return transitionOrReload(
        deps,
        plan,
        'blocked',
        { error_code: 'HEALTH_TOO_LOW' },
        'system',
        `Health factor after this would be ${health.after?.toFixed(2) ?? 'unknown'}`,
      );
    }
  }

  let xdrText: string;
  try {
    xdrText = await deps.lending.build({ poolId: offer.poolId, account: plan.account_id, requests });
  } catch (error) {
    if (error instanceof VenueRefusal) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('lending_build', error);
    throw new AppError('UNAVAILABLE', 'The Blend pool could not be reached right now. Try again shortly.');
  }

  let inspected: ReturnType<typeof inspectBlendSubmit>;
  try {
    inspected = inspectBlendSubmit(xdrText, {
      network: plan.network,
      account: plan.account_id,
      poolId: offer.poolId,
      requests,
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(deps.now() / 1000),
    });
  } catch (error) {
    if (!(error instanceof InspectionError)) throw error;
    return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
  }

  const facts = {
    poolId: offer.poolId,
    feeStroops: rawToText(inspected.feeStroops),
    requests: requests.map((request) => ({
      type: request.type,
      symbol: symbolOf(intent, request.contractId),
      amountRaw: rawToText(request.amount),
    })),
    healthBefore: health.before,
    healthAfter: health.after,
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
    'Built, inspected and simulated',
  );
}

/** How the pool submit changes collateral and debt, for the health check; null when it cannot matter. */
function healthChange(intent: IntentRow, requests: readonly LendingRequest[]) {
  const [first, second] = requests;
  if (!first) return null;
  if (intent.kind === 'borrow' && second) {
    return {
      collateral: { contractId: first.contractId, amountRaw: first.amount },
      borrow: { contractId: second.contractId, amountRaw: second.amount },
    };
  }
  if (intent.kind === 'withdraw_collateral')
    return { collateral: { contractId: first.contractId, amountRaw: -first.amount } };
  if (intent.kind === 'repay') return { borrow: { contractId: first.contractId, amountRaw: -first.amount } };
  return null;
}

/**
 * Supply: one supply request. Borrow: collateral in, then the loan out, in one submit. Repay and
 * withdraw: one request for the amount compared against the account's position.
 */
function requestsOf(intent: IntentRow, quote: QuoteRow): LendingRequest[] {
  const asset = lendingAsset(intent.network, intent.sell_asset as LendingSymbol);
  if (isExit(intent.kind)) {
    return [
      { type: EXIT_REQUEST[intent.kind], contractId: asset.contractId, amount: rawFromText(quote.amount_in_raw) },
    ];
  }
  const amount = rawFromText(intent.sell_amount_raw);
  if (intent.kind === 'supply') return [{ type: 'supply', contractId: asset.contractId, amount }];
  const collateral = lendingAsset(intent.network, intent.collateral_asset as LendingSymbol);
  return [
    { type: 'supplyCollateral', contractId: collateral.contractId, amount: rawFromText(quote.amount_in_raw) },
    { type: 'borrow', contractId: asset.contractId, amount },
  ];
}

function offerOf(market: MarketView, reserve: ReserveView, estimatedHealth: number | null): Offer {
  return {
    poolId: market.poolId,
    poolName: market.name,
    status: market.status,
    statusLabel: market.statusLabel,
    canSupply: market.canSupply,
    canBorrow: market.canBorrow,
    supplyApyPct: reserve.supplyApyPct,
    borrowApyPct: reserve.borrowApyPct,
    utilizationPct: reserve.utilizationPct,
    availableRaw: rawToText(reserve.availableRaw),
    enabled: reserve.enabled,
    collateralFactor: null,
    liabilityFactor: reserve.liabilityFactor,
    estimatedHealth,
  };
}

function amountOf(text: string): bigint {
  let raw: bigint;
  try {
    raw = parseDecimalAmount(text, XLM_DECIMALS, MAX_CLASSIC_RAW);
  } catch (error) {
    throw new AppError('INVALID_REQUEST', error instanceof AmountError ? error.message : 'Enter a valid amount.');
  }
  if (raw === 0n) throw new AppError('INVALID_REQUEST', 'Enter an amount above zero.');
  return raw;
}

function symbolOf(intent: IntentRow, contractId: string): string {
  return lendingAsset(intent.network, intent.sell_asset as LendingSymbol).contractId === contractId
    ? intent.sell_asset
    : (intent.collateral_asset ?? '?');
}

function toUnits(raw: bigint): number {
  return Number(raw) / UNIT;
}

function formatUnits(raw: bigint): string {
  return toUnits(raw).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ---- Views -----------------------------------------------------------------------------------

export function lendingIntentView(row: IntentRow) {
  return {
    id: row.id,
    network: row.network,
    kind: row.kind as LendingKind,
    asset: row.whole_position
      ? { symbol: row.sell_asset, amount: 'all', raw: null }
      : rawAmount(row.sell_asset, row.sell_amount_raw),
    wholePosition: row.whole_position === 1,
    collateral: row.collateral_asset
      ? {
          symbol: row.collateral_asset,
          ...(row.collateral_amount_raw ? rawAmount(row.collateral_asset, row.collateral_amount_raw) : {}),
        }
      : null,
    poolId: row.market_id,
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function lendingQuoteView(row: QuoteRow, intent: IntentRow) {
  const offer = JSON.parse(row.provider_quote) as Offer;
  const kind = intent.kind as LendingKind;
  return {
    id: row.id,
    intentId: row.intent_id,
    venue: row.venue,
    kind,
    pool: { id: offer.poolId, name: offer.poolName, status: offer.statusLabel },
    asset: rawAmount(intent.sell_asset, row.amount_out_raw),
    collateral: kind === 'borrow' ? rawAmount(intent.collateral_asset ?? '?', row.amount_in_raw) : null,
    supplyApyPct: offer.supplyApyPct,
    borrowApyPct: offer.borrowApyPct,
    utilizationPct: offer.utilizationPct,
    available: rawAmount(intent.sell_asset, offer.availableRaw),
    estimatedHealth: offer.estimatedHealth,
    // Repay and withdraw: what the account holds there now, and the amount the request asks for.
    position: offer.position
      ? {
          held: rawAmount(intent.sell_asset, offer.position.heldRaw),
          kind: isExit(kind) ? HELD[kind] : null,
          health: offer.position.health,
          requested: rawAmount(intent.sell_asset, row.amount_in_raw),
        }
      : null,
    targetHealth: kind === 'borrow' && !intent.collateral_amount_raw ? TARGET_HEALTH : null,
    withdrawalTiming:
      kind === 'supply' || kind === 'withdraw' ? WITHDRAWAL_TIMING.supply : WITHDRAWAL_TIMING.collateral,
    nestFeeBps: 0,
    observedAt: new Date(row.observed_at_ms).toISOString(),
    expiresAt: new Date(row.expires_at_ms).toISOString(),
  };
}

export function lendingPlanView(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const facts = row.prepared_facts
    ? (JSON.parse(row.prepared_facts) as {
        feeStroops: string;
        requests: { type: string; symbol: string; amountRaw: string }[];
        healthBefore: number | null;
        healthAfter: number | null;
      })
    : null;
  return {
    ...basePlanView(row),
    kind: intent.kind as LendingKind,
    offer: lendingQuoteView(quote, intent),
    prepared:
      row.prepared_xdr && row.prepared_hash && facts
        ? {
            xdr: row.prepared_xdr,
            hash: row.prepared_hash,
            networkPassphrase: NETWORK_PASSPHRASES[row.network],
            fee: feeView(facts.feeStroops),
            requests: facts.requests.map((request) => ({
              type: request.type,
              ...rawAmount(request.symbol, request.amountRaw),
            })),
            health: {
              before: facts.healthBefore,
              after: facts.healthAfter,
              warning: facts.healthAfter !== null && facts.healthAfter < HEALTH_WARNING,
            },
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
  };
}
