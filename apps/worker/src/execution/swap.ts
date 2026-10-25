import { type SwapSymbol, swapAsset } from '@nest/adapters/stellar/assets';
import { InspectionError, inspectSwapTransaction } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { type VenueQuote, VenueRefusal } from '@nest/adapters/venue';
import {
  AmountError,
  formatRawAmount,
  MAX_CLASSIC_RAW,
  parseDecimalAmount,
  rawFromText,
  rawToText,
} from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';
import type { StellarNetwork } from '@nest/domain/network';
import { type Decision, evaluate, type Rule } from '@nest/policy/engine';
import { type Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

import type { SwapRpc } from './rpc.ts';
import {
  basePlanView,
  bpsOf,
  canonicalJson,
  type ExecutionDeps,
  feeView,
  type IntentRow,
  insertIntent,
  insertQuote,
  logFailure,
  MAX_FEE_STROOPS,
  outputOf,
  type PlanRow,
  type QuoteRow,
  sha256Hex,
  transitionOrReload,
} from './store.ts';

/** Applied to every quote until Guardrails can be saved per wallet; shown in the review the user approves. */
const SLIPPAGE_BPS = 50;
const QUOTE_MAX_AGE_MS = 30_000;
const PRICE_IMPACT_WARNING_BPS = 100;

export async function createSwapIntent(
  deps: ExecutionDeps,
  input: { sell: SwapSymbol; buy: SwapSymbol; amount: string; source: 'chat' | 'form' },
) {
  if (input.sell === input.buy) throw new AppError('INVALID_REQUEST', 'Choose two different assets to swap.');
  const network = deps.config.network;
  const sell = swapAsset(network, input.sell);
  let raw: bigint;
  try {
    raw = parseDecimalAmount(input.amount, sell.ref.decimals, MAX_CLASSIC_RAW);
  } catch (error) {
    throw new AppError('INVALID_REQUEST', error instanceof AmountError ? error.message : 'Enter a valid amount.');
  }
  if (raw === 0n) throw new AppError('INVALID_REQUEST', 'Enter an amount above zero.');
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network,
    kind: 'swap',
    sell_asset: input.sell,
    buy_asset: input.buy,
    sell_amount_raw: rawToText(raw),
    source: input.source,
    market_id: null,
    collateral_asset: null,
    collateral_amount_raw: null,
    whole_position: 0,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return swapIntentView(row);
}

/** Gets a fresh quote for an intent from this network's swap venue. */
export async function compareSwap(deps: ExecutionDeps, intent: IntentRow) {
  if (!deps.venue) throw new AppError('UNAVAILABLE', 'Swaps need a Soroswap API key on this server.');
  const sell = swapAsset(intent.network, intent.sell_asset as SwapSymbol);
  const buy = swapAsset(intent.network, intent.buy_asset as SwapSymbol);
  let quote: VenueQuote;
  try {
    quote = await deps.venue.quote({
      network: intent.network,
      sell,
      buy,
      amountIn: rawFromText(intent.sell_amount_raw),
      slippageBps: SLIPPAGE_BPS,
    });
  } catch (error) {
    if (error instanceof VenueRefusal) throw new AppError('UNAVAILABLE', error.message);
    logFailure('quote', error);
    throw new AppError('UNAVAILABLE', 'The swap venue could not quote this right now. Try again shortly.');
  }
  const observed = deps.now();
  const row: QuoteRow = {
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: deps.venue.id,
    slippage_bps: SLIPPAGE_BPS,
    amount_in_raw: rawToText(quote.amountIn),
    amount_out_raw: rawToText(quote.amountOut),
    min_out_raw: rawToText(quote.minAmountOut),
    price_impact_bps: quote.priceImpactBps,
    protocols: JSON.stringify(quote.protocols),
    provider_quote: JSON.stringify(quote.raw, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    observed_at_ms: observed,
    expires_at_ms: observed + QUOTE_MAX_AGE_MS,
  };
  await insertQuote(deps, row);
  const view = swapQuoteView(row, intent);
  return { quotes: [view], selectedQuoteId: view.id };
}

interface SwapPlanFacts {
  nowMs: number;
  quoteExpiresAtMs: number;
  amountOut: bigint;
  minOut: bigint;
  priceImpactBps: number | null;
  nestFeeBps: number;
}

const SWAP_RULES: readonly Rule<SwapPlanFacts>[] = [
  {
    id: 'quote_fresh',
    severity: 'block',
    check: (facts) => ({
      pass: facts.nowMs < facts.quoteExpiresAtMs,
      code: 'QUOTE_EXPIRED',
      detail: 'The quote must still be valid. Get a new quote.',
    }),
  },
  {
    id: 'minimum_output',
    severity: 'block',
    check: (facts) => ({
      pass: facts.minOut > 0n && facts.minOut <= facts.amountOut,
      code: 'MIN_OUTPUT_INVALID',
      detail: 'The minimum you receive must be above zero and no more than the quoted output.',
    }),
  },
  {
    id: 'price_impact',
    severity: 'warn',
    check: (facts) =>
      facts.priceImpactBps === null
        ? { pass: false, code: 'PRICE_IMPACT_UNKNOWN', detail: 'Soroswap did not report price impact for this route.' }
        : {
            pass: facts.priceImpactBps < PRICE_IMPACT_WARNING_BPS,
            code: 'PRICE_IMPACT_HIGH',
            detail: `Price impact is ${(facts.priceImpactBps / 100).toFixed(2)}%, at or above the 1% warning level.`,
            facts: { priceImpactBps: String(facts.priceImpactBps) },
          },
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

/** The policy decision and the digest the user's approval binds, for a swap plan. */
export async function swapPlanPolicy(
  intent: IntentRow,
  quote: QuoteRow,
  accountId: string,
  now: number,
): Promise<{ decision: Decision; digest: string }> {
  const decision = evaluate(SWAP_RULES, {
    nowMs: now,
    quoteExpiresAtMs: quote.expires_at_ms,
    amountOut: rawFromText(quote.amount_out_raw),
    minOut: rawFromText(quote.min_out_raw),
    priceImpactBps: quote.price_impact_bps,
    nestFeeBps: 0,
  });
  const digest = await sha256Hex(
    canonicalJson({
      intentId: intent.id,
      quoteId: quote.id,
      network: intent.network,
      account: accountId,
      sell: swapAsset(intent.network, intent.sell_asset as SwapSymbol).ref.canonicalId,
      buy: swapAsset(intent.network, intent.buy_asset as SwapSymbol).ref.canonicalId,
      amountInRaw: quote.amount_in_raw,
      minOutRaw: quote.min_out_raw,
      slippageBps: quote.slippage_bps,
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  return { decision, digest };
}

/** Builds the transaction through the venue, inspects it against the plan and simulates it. */
export async function prepareSwap(
  deps: ExecutionDeps,
  plan: PlanRow,
  intent: IntentRow,
  quote: QuoteRow,
): Promise<PlanRow> {
  if (!deps.venue || deps.venue.id !== quote.venue || !deps.rpc) {
    throw new AppError('UNAVAILABLE', 'This swap venue or a Stellar RPC is not configured on this server.');
  }
  const now = deps.now();
  let xdrText: string;
  try {
    xdrText = await deps.venue.build({
      network: plan.network,
      quote: JSON.parse(quote.provider_quote),
      from: plan.account_id,
    });
  } catch (error) {
    // Refusals the user can fix (trustline, balance, unfunded account) stop the plan with a reason.
    if (error instanceof VenueRefusal) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('build', error);
    throw new AppError('UNAVAILABLE', 'The swap venue could not build this right now. Try again shortly.');
  }

  const sell = swapAsset(plan.network, intent.sell_asset as SwapSymbol);
  const buy = swapAsset(plan.network, intent.buy_asset as SwapSymbol);
  let inspected: ReturnType<typeof inspectSwapTransaction>;
  try {
    inspected = inspectSwapTransaction(xdrText, {
      network: plan.network,
      account: plan.account_id,
      sell,
      buy,
      amountIn: rawFromText(quote.amount_in_raw),
      minAmountOut: rawFromText(quote.min_out_raw),
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(now / 1000),
    });
  } catch (error) {
    if (!(error instanceof InspectionError)) throw error;
    return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
  }

  let simulatedOut: bigint | null = null;
  if (inspected.route === 'soroban') {
    const tx = TransactionBuilder.fromXDR(xdrText, NETWORK_PASSPHRASES[plan.network]) as Transaction;
    let simulation: Awaited<ReturnType<SwapRpc['simulate']>>;
    try {
      simulation = await deps.rpc.simulate(tx);
    } catch (error) {
      logFailure('simulate', error);
      throw new AppError('UNAVAILABLE', 'The Stellar RPC could not simulate this swap right now.');
    }
    if (!simulation.ok) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: 'SIMULATION_FAILED' }, 'system', simulation.error);
    }
    if (simulation.minResourceFee > inspected.feeStroops) {
      return transitionOrReload(
        deps,
        plan,
        'blocked',
        { error_code: 'RESOURCES_INSUFFICIENT' },
        'system',
        'The fee does not cover the simulated resources',
      );
    }
    simulatedOut = outputOf(simulation.returnValue);
    if (simulatedOut !== null && simulatedOut < inspected.minAmountOut) {
      return transitionOrReload(
        deps,
        plan,
        'blocked',
        { error_code: 'SIMULATED_OUTPUT_TOO_LOW' },
        'system',
        'Simulation returned less than the minimum',
      );
    }
  }

  const facts = {
    route: inspected.route,
    contractId: inspected.contractId,
    amountInRaw: rawToText(inspected.amountIn),
    minAmountOutRaw: rawToText(inspected.minAmountOut),
    feeStroops: rawToText(inspected.feeStroops),
    providerFeeRaw: rawToText(inspected.providerFee),
    simulatedOutRaw: simulatedOut === null ? null : rawToText(simulatedOut),
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

/** What a confirmed swap delivered: Soroban swaps return it; Classic path payments are read back. */
export async function swapReceived(deps: ExecutionDeps, txHash: string, returnValue: unknown) {
  const amountOut = outputOf(returnValue) ?? (await receivedByVenue(deps, txHash));
  return amountOut === null ? null : rawToText(amountOut);
}

async function receivedByVenue(deps: ExecutionDeps, txHash: string): Promise<bigint | null> {
  try {
    return (await deps.venue?.receivedAmount?.(txHash)) ?? null;
  } catch (error) {
    logFailure('received_amount', error);
    return null;
  }
}

// ---- Views -----------------------------------------------------------------------------------

function amountView(network: StellarNetwork, symbol: string, raw: string) {
  const asset = swapAsset(network, symbol as SwapSymbol);
  return {
    symbol,
    canonicalId: asset.ref.canonicalId,
    amount: formatRawAmount(rawFromText(raw), asset.ref.decimals),
    raw,
  };
}

export function swapIntentView(row: IntentRow) {
  return {
    id: row.id,
    network: row.network,
    kind: 'swap' as const,
    sell: amountView(row.network, row.sell_asset, row.sell_amount_raw),
    buy: { symbol: row.buy_asset, canonicalId: swapAsset(row.network, row.buy_asset as SwapSymbol).ref.canonicalId },
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function swapQuoteView(row: QuoteRow, intent: IntentRow) {
  return {
    id: row.id,
    intentId: row.intent_id,
    venue: row.venue,
    sell: amountView(intent.network, intent.sell_asset, row.amount_in_raw),
    expectedOut: amountView(intent.network, intent.buy_asset, row.amount_out_raw),
    minimumOut: amountView(intent.network, intent.buy_asset, row.min_out_raw),
    slippageBps: row.slippage_bps,
    priceImpactBps: row.price_impact_bps,
    protocols: JSON.parse(row.protocols) as string[],
    nestFeeBps: 0,
    observedAt: new Date(row.observed_at_ms).toISOString(),
    expiresAt: new Date(row.expires_at_ms).toISOString(),
  };
}

export function swapPlanView(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const facts = row.prepared_facts ? (JSON.parse(row.prepared_facts) as Record<string, string | null>) : null;
  const result = row.result ? (JSON.parse(row.result) as { amountOutRaw?: string | null }) : null;
  return {
    ...basePlanView(row),
    kind: 'swap' as const,
    quote: swapQuoteView(quote, intent),
    prepared:
      row.prepared_xdr && row.prepared_hash && facts
        ? {
            xdr: row.prepared_xdr,
            hash: row.prepared_hash,
            networkPassphrase: NETWORK_PASSPHRASES[row.network],
            route: facts.route,
            enforcedMinimumOut: amountView(row.network, intent.buy_asset, facts.minAmountOutRaw ?? '0'),
            simulatedOut: facts.simulatedOutRaw
              ? amountView(row.network, intent.buy_asset, facts.simulatedOutRaw)
              : null,
            fee: feeView(facts.feeStroops ?? '0'),
            // Soroswap's own fee, taken from the input; Nest's fee stays 0.
            providerFee: {
              ...amountView(row.network, intent.sell_asset, facts.providerFeeRaw ?? '0'),
              bps: bpsOf(rawFromText(facts.providerFeeRaw ?? '0'), rawFromText(quote.amount_in_raw)),
            },
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
    received: result?.amountOutRaw ? amountView(row.network, intent.buy_asset, result.amountOutRaw) : null,
  };
}
