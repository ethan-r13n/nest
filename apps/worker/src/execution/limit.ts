import {
  bandForLimit,
  filledAmount,
  inspectRangeCall,
  type LimitSide,
  RANGE_POOLS,
  type RangeCall,
  type RangePoolState,
  rangePool,
  usdcPerXlmAt,
} from '@nest/adapters/aquarius/range';
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

const VENUE = 'aquarius_range';
/** Pool prices move; a review older than this is compared again before it can be signed. */
const OFFER_MAX_AGE_MS = 60_000;
/** A deposit must still mint nearly the reviewed liquidity, or it fails rather than land differently. */
const MIN_LIQUIDITY_BPS = 9_950n;
/** A withdrawal must return at least this share of the amounts reviewed. */
const MIN_RETURN_BPS = 9_900n;
const UNAVAILABLE_HERE =
  'No Aquarius concentrated XLM/USDC pool is registered for this network, so limit orders are not available here.';

interface OrderOffer {
  kind: 'limit_order';
  poolId: string;
  poolName: string;
  tokens: [string, string];
  usdcIndex: 0 | 1;
  feeBps: number;
  tick: number;
  usdcPerXlm: number;
  tickLower: number;
  tickUpper: number;
  depositIndex: 0 | 1;
  liquidity: string;
  fillStartsAt: number;
  fillCompletesAt: number;
  depositsEnabled: boolean;
}

interface CloseOffer {
  kind: 'limit_close';
  poolId: string;
  poolName: string;
  tokens: [string, string];
  usdcIndex: 0 | 1;
  feeBps: number;
  tick: number;
  usdcPerXlm: number;
  tickLower: number;
  tickUpper: number;
  account: string;
  liquidity: string;
  /** What a full withdrawal returns, per pool token, fees included, and the fees within it. */
  amounts: [string, string];
  fees: [string, string];
}

type Offer = OrderOffer | CloseOffer;

/** A limit order: deposit one token into the band that fills at or better than the limit price. */
export async function createLimitOrderIntent(
  deps: ExecutionDeps,
  input: {
    side: LimitSide;
    amountXlm: string;
    priceUsdc: string;
    poolId?: string | undefined;
    source: 'chat' | 'form';
  },
) {
  const network = deps.config.network;
  const pool = input.poolId ? rangePool(network, input.poolId) : RANGE_POOLS[network][0];
  if (!pool)
    throw new AppError('UNAVAILABLE', input.poolId ? 'That is not a registered Aquarius pool.' : UNAVAILABLE_HERE);
  const amountXlm = decimal(input.amountXlm, 'Enter how much XLM to buy or sell.');
  const price = decimal(input.priceUsdc, 'Enter a limit price in USDC per XLM.');
  // A buy deposits the USDC the XLM costs at the limit; a sell deposits the XLM itself.
  const scale = 10n ** BigInt(XLM_DECIMALS);
  const depositRaw = input.side === 'buy' ? (amountXlm * price + scale - 1n) / scale : amountXlm;
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network,
    kind: 'limit_order',
    sell_asset: input.side === 'buy' ? 'USDC' : 'XLM',
    buy_asset: input.side === 'buy' ? 'XLM' : 'USDC',
    sell_amount_raw: rawToText(depositRaw),
    source: input.source,
    market_id: pool.id,
    collateral_asset: null,
    collateral_amount_raw: null,
    whole_position: 0,
    limit_price: rawToText(price),
    tick_lower: null,
    tick_upper: null,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return limitIntentView(row);
}

/** Withdraws a limit order's whole position, which includes the swap fees it has earned. */
export async function createLimitCloseIntent(
  deps: ExecutionDeps,
  input: { poolId: string; tickLower: number; tickUpper: number; source: 'chat' | 'form' },
) {
  if (!rangePool(deps.config.network, input.poolId))
    throw new AppError('INVALID_REQUEST', 'That is not a registered Aquarius pool.');
  if (!(input.tickLower < input.tickUpper)) throw new AppError('INVALID_REQUEST', 'That is not a valid band.');
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network: deps.config.network,
    kind: 'limit_close',
    sell_asset: 'LP',
    buy_asset: 'LP',
    sell_amount_raw: '0',
    source: input.source,
    market_id: input.poolId,
    collateral_asset: null,
    collateral_amount_raw: null,
    whole_position: 1,
    limit_price: null,
    tick_lower: input.tickLower,
    tick_upper: input.tickUpper,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return limitIntentView(row);
}

/**
 * Reads the pool now and offers the band for an order, with what a full fill returns; or, for a
 * close, reads the wallet's position in the band and what withdrawing it returns.
 */
export async function compareLimit(deps: ExecutionDeps, intent: IntentRow, accountId?: string) {
  if (!deps.ranges) throw new AppError('UNAVAILABLE', 'Limit orders need a Stellar RPC on this server.');
  const poolId = intent.market_id ?? '';
  const state = await readPool(deps, poolId);
  const observed = deps.now();
  let offer: Offer;
  let amountIn: bigint;
  let amountOut: bigint;
  if (intent.kind === 'limit_order') {
    const side: LimitSide = intent.sell_asset === 'USDC' ? 'buy' : 'sell';
    let band: ReturnType<typeof bandForLimit>;
    try {
      band = bandForLimit(side, limitPriceOf(intent), state);
    } catch (error) {
      if (error instanceof VenueRefusal) throw new AppError('INVALID_REQUEST', error.message);
      throw error;
    }
    amountIn = rawFromText(intent.sell_amount_raw);
    const amounts = depositAmounts(band.depositIndex, amountIn);
    const estimate = await deps.ranges.estimate(poolId, band, amounts).catch((error: unknown) => {
      logFailure('range_estimate', error);
      throw new AppError('UNAVAILABLE', 'Aquarius could not price this band right now. Try again shortly.');
    });
    if (estimate.liquidity <= 0n || estimate.used[band.depositIndex] !== amountIn) {
      throw new AppError('INVALID_REQUEST', 'This amount is too small for the pool to place.');
    }
    amountOut = filledAmount(band, estimate.liquidity);
    offer = {
      kind: 'limit_order',
      ...poolFacts(state),
      tickLower: band.tickLower,
      tickUpper: band.tickUpper,
      depositIndex: band.depositIndex,
      liquidity: rawToText(estimate.liquidity),
      fillStartsAt: band.fillStartsAt,
      fillCompletesAt: band.fillCompletesAt,
      depositsEnabled: state.depositsEnabled,
    };
  } else {
    if (!accountId || !StrKey.isValidEd25519PublicKey(accountId)) {
      throw new AppError('INVALID_REQUEST', 'Connect your wallet so Nest can read your limit order.');
    }
    const band = { tickLower: intent.tick_lower ?? 0, tickUpper: intent.tick_upper ?? 0 };
    const position = await deps.ranges.position(poolId, accountId, band).catch((error: unknown) => {
      logFailure('range_position', error);
      throw new AppError('UNAVAILABLE', 'Your limit order could not be read right now. Try again shortly.');
    });
    if (!position) throw new AppError('NOT_FOUND', 'This wallet has no limit order in that band.');
    amountIn = position.liquidity;
    amountOut = 0n;
    offer = {
      kind: 'limit_close',
      ...poolFacts(state),
      ...band,
      account: accountId,
      liquidity: rawToText(position.liquidity),
      amounts: [rawToText(position.amounts[0]), rawToText(position.amounts[1])],
      fees: [rawToText(position.fees[0]), rawToText(position.fees[1])],
    };
  }
  const row: QuoteRow = {
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: VENUE,
    slippage_bps: 0,
    amount_in_raw: rawToText(amountIn),
    amount_out_raw: rawToText(amountOut),
    min_out_raw: '0',
    price_impact_bps: null,
    protocols: JSON.stringify([poolId]),
    provider_quote: JSON.stringify(offer),
    observed_at_ms: observed,
    expires_at_ms: observed + OFFER_MAX_AGE_MS,
  };
  await insertQuote(deps, row);
  const view = limitQuoteView(row, intent);
  return {
    quotes: [view],
    selectedQuoteId: view.id,
  };
}

interface LimitPlanFacts {
  nowMs: number;
  quoteExpiresAtMs: number;
  offer: Offer;
  account: string;
  nestFeeBps: number;
}

const LIMIT_RULES: readonly Rule<LimitPlanFacts>[] = [
  {
    id: 'quote_fresh',
    severity: 'block',
    check: (facts) => ({
      pass: facts.nowMs < facts.quoteExpiresAtMs,
      code: 'QUOTE_EXPIRED',
      detail: 'The pool price must still be current. Compare again.',
    }),
  },
  {
    id: 'deposits_open',
    severity: 'block',
    check: (facts) => ({
      pass: facts.offer.kind !== 'limit_order' || facts.offer.depositsEnabled,
      code: 'POOL_STATUS',
      detail: 'The pool must be accepting deposits.',
    }),
  },
  {
    id: 'position_owner',
    severity: 'block',
    check: (facts) => ({
      pass: facts.offer.kind !== 'limit_close' || facts.offer.account === facts.account,
      code: 'ACCOUNT_MISMATCH',
      detail: 'This order was read for another wallet. Compare again with the connected one.',
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

export async function limitPlanPolicy(
  intent: IntentRow,
  quote: QuoteRow,
  accountId: string,
  now: number,
): Promise<{ decision: Decision; digest: string }> {
  const offer = JSON.parse(quote.provider_quote) as Offer;
  const decision = evaluate(LIMIT_RULES, {
    nowMs: now,
    quoteExpiresAtMs: quote.expires_at_ms,
    offer,
    account: accountId,
    nestFeeBps: 0,
  });
  const call = callOf(intent, quote);
  const digest = await sha256Hex(
    canonicalJson({
      intentId: intent.id,
      quoteId: quote.id,
      network: intent.network,
      account: accountId,
      poolId: offer.poolId,
      call: JSON.stringify(call, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  return { decision, digest };
}

/**
 * Builds the pool call and inspects it against the plan. An order is rechecked against the live
 * price first: if the price has moved into the band, the deposit would no longer be one-sided.
 */
export async function prepareLimit(
  deps: ExecutionDeps,
  plan: PlanRow,
  intent: IntentRow,
  quote: QuoteRow,
): Promise<PlanRow> {
  if (!deps.ranges) throw new AppError('UNAVAILABLE', 'Limit orders need a Stellar RPC on this server.');
  const offer = JSON.parse(quote.provider_quote) as Offer;
  const state = await readPool(deps, offer.poolId);
  if (offer.kind === 'limit_order') {
    const unfilled = offer.depositIndex === 0 ? state.tick < offer.tickLower : state.tick > offer.tickUpper;
    if (!unfilled) {
      return transitionOrReload(
        deps,
        plan,
        'blocked',
        { error_code: 'PRICE_MOVED' },
        'system',
        'The price moved into the band',
      );
    }
  }
  const call = callOf(intent, quote);
  let xdrText: string;
  try {
    xdrText = await deps.ranges.build({ poolId: offer.poolId, account: plan.account_id, call });
  } catch (error) {
    if (error instanceof VenueRefusal) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('range_build', error);
    throw new AppError('UNAVAILABLE', 'The Aquarius pool could not be reached right now. Try again shortly.');
  }
  let inspected: ReturnType<typeof inspectRangeCall>;
  try {
    inspected = inspectRangeCall(xdrText, {
      network: plan.network,
      account: plan.account_id,
      poolId: offer.poolId,
      tokens: state.tokens,
      call,
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(deps.now() / 1000),
    });
  } catch (error) {
    if (!(error instanceof InspectionError)) throw error;
    return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
  }
  return transitionOrReload(
    deps,
    plan,
    'awaiting_review',
    {
      prepared_xdr: xdrText,
      prepared_hash: inspected.hash,
      prepared_facts: JSON.stringify({ feeStroops: rawToText(inspected.feeStroops), method: call.method }),
      valid_until_ms: inspected.validUntilSeconds * 1000,
      approved_at_ms: null,
      error_code: null,
    },
    'system',
    'Built, inspected and simulated',
  );
}

function callOf(intent: IntentRow, quote: QuoteRow): RangeCall {
  const offer = JSON.parse(quote.provider_quote) as Offer;
  if (offer.kind === 'limit_order') {
    return {
      method: 'deposit_position',
      tickLower: offer.tickLower,
      tickUpper: offer.tickUpper,
      amounts: depositAmounts(offer.depositIndex, rawFromText(intent.sell_amount_raw)),
      minLiquidity: (rawFromText(offer.liquidity) * MIN_LIQUIDITY_BPS) / 10_000n,
    };
  }
  return {
    method: 'withdraw_position',
    tickLower: offer.tickLower,
    tickUpper: offer.tickUpper,
    liquidity: rawFromText(offer.liquidity),
    minAmounts: [
      (rawFromText(offer.amounts[0]) * MIN_RETURN_BPS) / 10_000n,
      (rawFromText(offer.amounts[1]) * MIN_RETURN_BPS) / 10_000n,
    ],
  };
}

/** The stored limit price, USDC per XLM, kept as raw seven-decimal units. */
function limitPriceOf(intent: Pick<IntentRow, 'limit_price'>): number {
  return Number(intent.limit_price ?? '0') / 10 ** XLM_DECIMALS;
}

function depositAmounts(depositIndex: 0 | 1, amount: bigint): [bigint, bigint] {
  return depositIndex === 0 ? [amount, 0n] : [0n, amount];
}

async function readPool(deps: ExecutionDeps, poolId: string): Promise<RangePoolState> {
  if (!deps.ranges) throw new AppError('UNAVAILABLE', 'Limit orders need a Stellar RPC on this server.');
  try {
    return await deps.ranges.pool(poolId);
  } catch (error) {
    if (error instanceof VenueRefusal) throw new AppError('CONFLICT', error.message);
    logFailure('range_pool', error);
    throw new AppError('UNAVAILABLE', 'The Aquarius pool could not be read right now. Try again shortly.');
  }
}

function poolFacts(state: RangePoolState) {
  return {
    poolId: state.poolId,
    poolName: state.name,
    tokens: state.tokens,
    usdcIndex: state.usdcIndex,
    feeBps: state.feeBps,
    tick: state.tick,
    usdcPerXlm: state.usdcPerXlm,
  };
}

function decimal(text: string, message: string): bigint {
  let raw: bigint;
  try {
    raw = parseDecimalAmount(text.trim(), XLM_DECIMALS, MAX_CLASSIC_RAW);
  } catch (error) {
    throw new AppError('INVALID_REQUEST', error instanceof AmountError ? error.message : message);
  }
  if (raw === 0n) throw new AppError('INVALID_REQUEST', message);
  return raw;
}

/** Human-readable price band, low to high, for a pair of ticks. */
function bandPrices(tickLower: number, tickUpper: number, usdcIndex: 0 | 1): [number, number] {
  const a = usdcPerXlmAt(tickLower, usdcIndex);
  const b = usdcPerXlmAt(tickUpper, usdcIndex);
  return a < b ? [a, b] : [b, a];
}

// ---- Views -----------------------------------------------------------------------------------

export function limitIntentView(row: IntentRow) {
  return {
    id: row.id,
    network: row.network,
    kind: row.kind as 'limit_order' | 'limit_close',
    side: row.kind === 'limit_order' ? (row.sell_asset === 'USDC' ? ('buy' as const) : ('sell' as const)) : null,
    deposit: row.kind === 'limit_order' ? rawAmount(row.sell_asset, row.sell_amount_raw) : null,
    limitPrice: row.limit_price ? limitPriceOf(row) : null,
    poolId: row.market_id,
    band:
      row.tick_lower === null || row.tick_upper === null
        ? null
        : { tickLower: row.tick_lower, tickUpper: row.tick_upper },
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function limitQuoteView(row: QuoteRow, intent: IntentRow) {
  const offer = JSON.parse(row.provider_quote) as Offer;
  const symbolOf = (index: 0 | 1) => (index === offer.usdcIndex ? 'USDC' : 'XLM');
  const base = {
    id: row.id,
    intentId: row.intent_id,
    venue: row.venue,
    kind: offer.kind,
    pool: { id: offer.poolId, name: offer.poolName, feeBps: offer.feeBps },
    currentPrice: offer.usdcPerXlm,
    band: {
      tickLower: offer.tickLower,
      tickUpper: offer.tickUpper,
      prices: bandPrices(offer.tickLower, offer.tickUpper, offer.usdcIndex),
    },
    nestFeeBps: 0,
    observedAt: new Date(row.observed_at_ms).toISOString(),
    expiresAt: new Date(row.expires_at_ms).toISOString(),
  };
  if (offer.kind === 'limit_order') {
    return {
      ...base,
      order: {
        side: intent.sell_asset === 'USDC' ? ('buy' as const) : ('sell' as const),
        limitPrice: limitPriceOf(intent),
        deposit: rawAmount(symbolOf(offer.depositIndex), row.amount_in_raw),
        // Received once the price has crossed the whole band; swap fees earned come on top.
        onFill: rawAmount(symbolOf(offer.depositIndex === 0 ? 1 : 0), row.amount_out_raw),
        fillStartsAt: offer.fillStartsAt,
        fillCompletesAt: offer.fillCompletesAt,
      },
      position: null,
    };
  }
  return {
    ...base,
    order: null,
    position: {
      returns: [rawAmount(symbolOf(0), offer.amounts[0]), rawAmount(symbolOf(1), offer.amounts[1])],
      fees: [rawAmount(symbolOf(0), offer.fees[0]), rawAmount(symbolOf(1), offer.fees[1])],
    },
  };
}

export function limitPlanView(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const facts = row.prepared_facts ? (JSON.parse(row.prepared_facts) as { feeStroops: string; method: string }) : null;
  return {
    ...basePlanView(row),
    kind: intent.kind as 'limit_order' | 'limit_close',
    offer: limitQuoteView(quote, intent),
    prepared:
      row.prepared_xdr && row.prepared_hash && facts
        ? {
            xdr: row.prepared_xdr,
            hash: row.prepared_hash,
            networkPassphrase: NETWORK_PASSPHRASES[row.network],
            fee: feeView(facts.feeStroops),
            method: facts.method,
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
  };
}

/** The registered pool's live state for the order form, or why limit orders are unavailable here. */
export async function limitPool(deps: ExecutionDeps) {
  const pool = RANGE_POOLS[deps.config.network][0];
  if (!pool) return { available: false as const, reason: UNAVAILABLE_HERE };
  const state = await readPool(deps, pool.id);
  return {
    available: true as const,
    poolId: state.poolId,
    name: state.name,
    usdcPerXlm: state.usdcPerXlm,
    feeBps: state.feeBps,
    tick: state.tick,
    tickSpacing: state.tickSpacing,
    depositsEnabled: state.depositsEnabled,
    usdcIssuer: pool.usdcIssuer,
    observedAt: new Date(state.observedAtMs).toISOString(),
  };
}

/**
 * The wallet's positions in the registered pool, each with what withdrawing it returns now. Orders
 * placed through Nest carry their side, so their fill state can be named.
 */
export async function listLimitOrders(deps: ExecutionDeps, account: string) {
  if (!StrKey.isValidEd25519PublicKey(account)) throw new AppError('INVALID_REQUEST', 'Send a Stellar account (G…).');
  const pool = RANGE_POOLS[deps.config.network][0];
  if (!pool || !deps.ranges) return { available: false as const, reason: UNAVAILABLE_HERE, orders: [] };
  const ranges = deps.ranges;
  const state = await readPool(deps, pool.id);
  const bands = await ranges.positions(pool.id, account).catch((error: unknown) => {
    logFailure('range_positions', error);
    throw new AppError('UNAVAILABLE', 'Your limit orders could not be read right now. Try again shortly.');
  });
  const { results } = await deps.db
    .prepare(
      `SELECT intents.sell_asset AS sell_asset, intents.limit_price AS limit_price, quotes.provider_quote AS provider_quote
       FROM plans JOIN quotes ON quotes.id = plans.quote_id JOIN intents ON intents.id = plans.intent_id
       WHERE plans.account_id = ? AND plans.network = ? AND plans.status = 'confirmed' AND intents.kind = 'limit_order'`,
    )
    .bind(account, deps.config.network)
    .all<{ sell_asset: string; limit_price: string | null; provider_quote: string }>();
  const placed = new Map(
    results.map((row) => {
      const offer = JSON.parse(row.provider_quote) as OrderOffer;
      return [
        `${offer.tickLower}:${offer.tickUpper}`,
        { side: row.sell_asset === 'USDC' ? ('buy' as const) : ('sell' as const), limitPrice: row.limit_price },
      ];
    }),
  );
  const symbolOf = (index: 0 | 1) => (index === state.usdcIndex ? 'USDC' : 'XLM');
  const orders = await Promise.all(
    bands.map(async (band) => {
      const position = await ranges.position(pool.id, account, band);
      if (!position) return null;
      const known = placed.get(`${band.tickLower}:${band.tickUpper}`) ?? null;
      const inside = state.tick >= band.tickLower && state.tick < band.tickUpper;
      let status: 'waiting' | 'filling' | 'filled' | 'in_range' | 'out_of_range' = inside ? 'in_range' : 'out_of_range';
      if (known) {
        const depositIndex = known.side === 'buy' ? state.usdcIndex : state.usdcIndex === 0 ? 1 : 0;
        const waiting = depositIndex === 0 ? state.tick < band.tickLower : state.tick > band.tickUpper;
        status = inside ? 'filling' : waiting ? 'waiting' : 'filled';
      }
      return {
        poolId: pool.id,
        tickLower: band.tickLower,
        tickUpper: band.tickUpper,
        prices: bandPrices(band.tickLower, band.tickUpper, state.usdcIndex),
        side: known?.side ?? null,
        limitPrice: known?.limitPrice ? Number(known.limitPrice) / 10 ** XLM_DECIMALS : null,
        status,
        returns: [
          rawAmount(symbolOf(0), rawToText(position.amounts[0])),
          rawAmount(symbolOf(1), rawToText(position.amounts[1])),
        ],
        fees: [
          rawAmount(symbolOf(0), rawToText(position.fees[0])),
          rawAmount(symbolOf(1), rawToText(position.fees[1])),
        ],
      };
    }),
  );
  return {
    available: true as const,
    currentPrice: state.usdcPerXlm,
    orders: orders.filter((order) => order !== null),
  };
}
