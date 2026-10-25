import { createSoroswapVenue, SoroswapError } from '@nest/adapters/soroswap/client';
import { type SwapSymbol, swapAsset } from '@nest/adapters/stellar/assets';
import { InspectionError, inspectSwapTransaction, verifySignedTransaction } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { createSdexVenue } from '@nest/adapters/stellar/sdex';
import { type SwapVenue, type VenueQuote, VenueRefusal } from '@nest/adapters/venue';
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
import { StrKey, type Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

import { decodeExecutionConfig, type ExecutionConfig } from '../config.ts';
import type { PLAN_STATUSES } from '../db/schema.ts';
import { createSwapRpc, type SwapRpc } from './rpc.ts';

/** Applied to every quote until Guardrails can be saved per wallet; shown in the review the user approves. */
const SLIPPAGE_BPS = 50;
/** Highest network fee a swap may carry: 1 XLM. The review shows it before signing. */
const MAX_FEE_STROOPS = 10_000_000n;
const QUOTE_MAX_AGE_MS = 30_000;
const PRICE_IMPACT_WARNING_BPS = 100;
const CONFIRM_POLL_MS = 1_000;
const CONFIRM_WAIT_MS = 20_000;
const SEND_ATTEMPTS = 3;
/** After a transaction's validity window plus this much, an unseen transaction can never land. */
const EXPIRY_GRACE_MS = 60_000;
const XLM_DECIMALS = 7;

type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface ExecutionDeps {
  db: D1Database;
  config: ExecutionConfig;
  /** Where swaps are quoted and built on this network, or null when it is not configured. */
  venue: SwapVenue | null;
  rpc: SwapRpc | null;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export function executionDeps(env: Env): ExecutionDeps {
  const config = decodeExecutionConfig(env);
  return {
    db: env.DB,
    config,
    venue: venueFor(config),
    rpc: config.rpcUrl ? createSwapRpc(config.rpcUrl) : null,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

interface IntentRow {
  id: string;
  network: StellarNetwork;
  kind: 'swap';
  sell_asset: string;
  buy_asset: string;
  sell_amount_raw: string;
  source: 'chat' | 'form';
  created_at_ms: number;
}

interface QuoteRow {
  id: string;
  intent_id: string;
  venue: string;
  slippage_bps: number;
  amount_in_raw: string;
  amount_out_raw: string;
  min_out_raw: string;
  price_impact_bps: number | null;
  protocols: string;
  provider_quote: string;
  observed_at_ms: number;
  expires_at_ms: number;
}

interface PlanRow {
  id: string;
  intent_id: string;
  quote_id: string;
  network: StellarNetwork;
  account_id: string;
  idempotency_key: string;
  status: PlanStatus;
  digest: string;
  policy: string;
  max_fee_stroops: string;
  prepared_xdr: string | null;
  prepared_hash: string | null;
  prepared_facts: string | null;
  valid_until_ms: number | null;
  approved_at_ms: number | null;
  signed_xdr: string | null;
  tx_hash: string | null;
  result: string | null;
  error_code: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

/** Columns a transition may set besides status. */
const PATCHABLE = [
  'prepared_xdr',
  'prepared_hash',
  'prepared_facts',
  'valid_until_ms',
  'approved_at_ms',
  'signed_xdr',
  'tx_hash',
  'result',
  'error_code',
] as const;
type Patch = Partial<Record<(typeof PATCHABLE)[number], string | number | null>>;

// ---- Intents and quotes ----------------------------------------------------------------------

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
    created_at_ms: deps.now(),
  };
  await deps.db
    .prepare(
      'INSERT INTO intents (id, network, kind, sell_asset, buy_asset, sell_amount_raw, source, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      row.id,
      row.network,
      row.kind,
      row.sell_asset,
      row.buy_asset,
      row.sell_amount_raw,
      row.source,
      row.created_at_ms,
    )
    .run();
  return intentView(row);
}

export async function readIntent(deps: ExecutionDeps, intentId: string) {
  return intentView(await loadIntent(deps, intentId));
}

/**
 * Mainnet swaps route through Soroswap's aggregator. Its API has no Testnet routes, so Testnet uses
 * Stellar's built-in DEX, which has Testnet liquidity for the same assets.
 */
function venueFor(config: ExecutionConfig): SwapVenue | null {
  if (config.network === 'testnet') return createSdexVenue({ network: 'testnet' });
  return config.soroswapApiKey ? createSoroswapVenue({ apiKey: config.soroswapApiKey }) : null;
}

/** Gets a fresh quote for an intent from this network's swap venue. */
export async function compareSwap(deps: ExecutionDeps, intentId: string) {
  const intent = await loadIntent(deps, intentId);
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
  await deps.db
    .prepare(
      `INSERT INTO quotes (id, intent_id, venue, slippage_bps, amount_in_raw, amount_out_raw, min_out_raw,
         price_impact_bps, protocols, provider_quote, observed_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.intent_id,
      row.venue,
      row.slippage_bps,
      row.amount_in_raw,
      row.amount_out_raw,
      row.min_out_raw,
      row.price_impact_bps,
      row.protocols,
      row.provider_quote,
      row.observed_at_ms,
      row.expires_at_ms,
    )
    .run();
  return quoteView(row, intent);
}

// ---- Plans -----------------------------------------------------------------------------------

interface PlanFacts {
  nowMs: number;
  quoteExpiresAtMs: number;
  amountOut: bigint;
  minOut: bigint;
  priceImpactBps: number | null;
  nestFeeBps: number;
}

const PLAN_RULES: readonly Rule<PlanFacts>[] = [
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

export async function createSwapPlan(
  deps: ExecutionDeps,
  input: { intentId: string; quoteId: string; accountId: string; idempotencyKey: string },
) {
  if (!StrKey.isValidEd25519PublicKey(input.accountId)) {
    throw new AppError('INVALID_REQUEST', 'Connect a Stellar account (G…) to review this swap.');
  }
  const existing = await deps.db
    .prepare('SELECT * FROM plans WHERE idempotency_key = ?')
    .bind(input.idempotencyKey)
    .first<PlanRow>();
  if (existing) {
    if (
      existing.intent_id !== input.intentId ||
      existing.quote_id !== input.quoteId ||
      existing.account_id !== input.accountId
    ) {
      throw new AppError('CONFLICT', 'This idempotency key was already used for a different plan.');
    }
    return planView(deps, existing);
  }

  const intent = await loadIntent(deps, input.intentId);
  const quote = await loadQuote(deps, input.quoteId);
  if (quote.intent_id !== intent.id) throw new AppError('INVALID_REQUEST', 'That quote belongs to another request.');
  const now = deps.now();
  const decision = evaluate(PLAN_RULES, {
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
      account: input.accountId,
      sell: swapAsset(intent.network, intent.sell_asset as SwapSymbol).ref.canonicalId,
      buy: swapAsset(intent.network, intent.buy_asset as SwapSymbol).ref.canonicalId,
      amountInRaw: quote.amount_in_raw,
      minOutRaw: quote.min_out_raw,
      slippageBps: quote.slippage_bps,
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  const status: PlanStatus = decision.verdict === 'block' ? 'blocked' : 'policy_checked';
  const row: PlanRow = {
    id: crypto.randomUUID(),
    intent_id: intent.id,
    quote_id: quote.id,
    network: intent.network,
    account_id: input.accountId,
    idempotency_key: input.idempotencyKey,
    status,
    digest,
    policy: JSON.stringify(decision),
    max_fee_stroops: MAX_FEE_STROOPS.toString(),
    prepared_xdr: null,
    prepared_hash: null,
    prepared_facts: null,
    valid_until_ms: null,
    approved_at_ms: null,
    signed_xdr: null,
    tx_hash: null,
    result: null,
    error_code: decision.verdict === 'block' ? (decision.reasons.find((reason) => !reason.pass)?.code ?? null) : null,
    created_at_ms: now,
    updated_at_ms: now,
  };
  await deps.db.batch([
    deps.db
      .prepare(
        `INSERT INTO plans (id, intent_id, quote_id, network, account_id, idempotency_key, status, digest, policy,
           max_fee_stroops, error_code, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.intent_id,
        row.quote_id,
        row.network,
        row.account_id,
        row.idempotency_key,
        row.status,
        row.digest,
        row.policy,
        row.max_fee_stroops,
        row.error_code,
        row.created_at_ms,
        row.updated_at_ms,
      ),
    deps.db
      .prepare(
        'INSERT INTO plan_events (plan_id, from_status, to_status, actor, reason, created_at_ms) VALUES (?, NULL, ?, ?, ?, ?)',
      )
      .bind(row.id, status, 'user', 'Plan created from a quote', now),
  ]);
  return planView(deps, row);
}

export async function readPlan(deps: ExecutionDeps, planId: string) {
  let plan = await loadPlan(deps, planId);
  if ((plan.status === 'submitted' || plan.status === 'confirming') && deps.rpc) plan = await reconcile(deps, plan);
  return planView(deps, plan);
}

/** Builds the transaction through Soroswap, inspects it against the plan and simulates it. */
export async function preparePlan(deps: ExecutionDeps, planId: string) {
  const plan = await loadPlan(deps, planId);
  if (plan.status !== 'policy_checked' && plan.status !== 'awaiting_review') {
    throw new AppError('CONFLICT', 'This plan can no longer be prepared.');
  }
  const intent = await loadIntent(deps, plan.intent_id);
  const quote = await loadQuote(deps, plan.quote_id);
  const now = deps.now();
  if (now >= quote.expires_at_ms) {
    return planView(
      deps,
      await transitionOrReload(
        deps,
        plan,
        'expired',
        { error_code: 'QUOTE_EXPIRED' },
        'system',
        'Quote expired before preparation',
      ),
    );
  }
  if (!deps.venue || deps.venue.id !== quote.venue || !deps.rpc) {
    throw new AppError('UNAVAILABLE', 'This swap venue or a Stellar RPC is not configured on this server.');
  }

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
      return planView(
        deps,
        await transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message),
      );
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
    return planView(
      deps,
      await transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message),
    );
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
      return planView(
        deps,
        await transitionOrReload(
          deps,
          plan,
          'blocked',
          { error_code: 'SIMULATION_FAILED' },
          'system',
          simulation.error,
        ),
      );
    }
    if (simulation.minResourceFee > inspected.feeStroops) {
      return planView(
        deps,
        await transitionOrReload(
          deps,
          plan,
          'blocked',
          { error_code: 'RESOURCES_INSUFFICIENT' },
          'system',
          'The fee does not cover the simulated resources',
        ),
      );
    }
    simulatedOut = outputOf(simulation.returnValue);
    if (simulatedOut !== null && simulatedOut < inspected.minAmountOut) {
      return planView(
        deps,
        await transitionOrReload(
          deps,
          plan,
          'blocked',
          { error_code: 'SIMULATED_OUTPUT_TOO_LOW' },
          'system',
          'Simulation returned less than the minimum',
        ),
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
  const prepared = await transitionOrReload(
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
  return planView(deps, prepared);
}

/** Records the user's review of exactly this plan revision and prepared transaction. */
export async function approvePlan(
  deps: ExecutionDeps,
  planId: string,
  input: { digest: string; preparedHash: string },
) {
  const plan = await loadPlan(deps, planId);
  if (plan.status !== 'awaiting_review') throw new AppError('CONFLICT', 'This plan is not waiting for review.');
  if (input.digest !== plan.digest || input.preparedHash !== plan.prepared_hash) {
    throw new AppError('CONFLICT', 'The plan changed since you reviewed it. Review it again.');
  }
  if (!plan.valid_until_ms || deps.now() >= plan.valid_until_ms) {
    return planView(
      deps,
      await transitionOrReload(
        deps,
        plan,
        'expired',
        { error_code: 'TRANSACTION_EXPIRED' },
        'system',
        'Expired before approval',
      ),
    );
  }
  const approved = await transitionOrReload(
    deps,
    plan,
    'awaiting_signature',
    { approved_at_ms: deps.now() },
    'user',
    'Reviewed and approved',
  );
  return planView(deps, approved);
}

/** Verifies the wallet's signed transaction is the approved one, claims the plan and submits it. */
export async function submitPlan(deps: ExecutionDeps, planId: string, signedXdr: string) {
  if (!deps.rpc) throw new AppError('UNAVAILABLE', 'Swaps need a Stellar RPC on this server.');
  let plan = await loadPlan(deps, planId);
  const venue = (await loadQuote(deps, plan.quote_id)).venue;
  if (!deps.config.executionEnabled || !deps.config.writeAdapters.has(venue)) {
    throw new AppError('EXECUTION_DISABLED', 'Swaps are turned off on this server.');
  }
  // A repeated submit of the same signed bytes reports the plan instead of failing.
  if (plan.signed_xdr === signedXdr) return readPlan(deps, planId);
  if (plan.status !== 'awaiting_signature' || !plan.prepared_hash) {
    throw new AppError('CONFLICT', 'This plan is not waiting for a signature.');
  }
  if (!plan.valid_until_ms || deps.now() >= plan.valid_until_ms) {
    return planView(
      deps,
      await transitionOrReload(
        deps,
        plan,
        'expired',
        { error_code: 'TRANSACTION_EXPIRED' },
        'system',
        'Expired before submission',
      ),
    );
  }
  let tx: Transaction;
  try {
    tx = verifySignedTransaction(signedXdr, {
      network: plan.network,
      account: plan.account_id,
      preparedHash: plan.prepared_hash,
    });
  } catch (error) {
    if (error instanceof InspectionError) throw new AppError('INVALID_REQUEST', error.message);
    throw error;
  }

  // The claim: exactly one submit moves the plan out of awaiting_signature.
  const claimed = await transition(
    deps,
    plan,
    'submitted',
    { signed_xdr: signedXdr, tx_hash: plan.prepared_hash },
    'user',
    'Signed and submitted',
  );
  if (!claimed) return readPlan(deps, planId);
  plan = await loadPlan(deps, planId);

  let sent: Awaited<ReturnType<SwapRpc['send']>> | null = null;
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
    try {
      sent = await deps.rpc.send(tx);
    } catch (error) {
      // Unknown whether it reached the network: stay submitted and reconcile by hash.
      logFailure('send', error);
      return planView(deps, plan);
    }
    if (sent.status !== 'TRY_AGAIN_LATER') break;
    await deps.sleep(CONFIRM_POLL_MS);
  }
  if (!sent || sent.status === 'TRY_AGAIN_LATER') return planView(deps, plan);
  if (sent.status === 'ERROR') {
    return planView(
      deps,
      await transitionOrReload(
        deps,
        plan,
        'failed',
        { error_code: 'REJECTED', result: JSON.stringify({ error: sent.error }) },
        'system',
        'Rejected by the network',
      ),
    );
  }
  plan = await transitionOrReload(deps, plan, 'confirming', {}, 'system', `Accepted by RPC (${sent.status})`);

  const deadline = deps.now() + CONFIRM_WAIT_MS;
  while (plan.status === 'confirming' && deps.now() < deadline) {
    await deps.sleep(CONFIRM_POLL_MS);
    plan = await reconcile(deps, plan);
  }
  return planView(deps, plan);
}

/** Settles a submitted plan from the network's record of its hash. Never builds or signs anything new. */
async function reconcile(deps: ExecutionDeps, plan: PlanRow): Promise<PlanRow> {
  if (!deps.rpc || !plan.tx_hash) return plan;
  let outcome: Awaited<ReturnType<SwapRpc['get']>>;
  try {
    outcome = await deps.rpc.get(plan.tx_hash);
  } catch (error) {
    logFailure('get_transaction', error);
    return plan;
  }
  if (outcome.status === 'SUCCESS') {
    // Soroban swaps return the amount; Classic path payments are read back from the network.
    const amountOut = outputOf(outcome.returnValue) ?? (await receivedByVenue(deps, plan.tx_hash));
    const result = { ledger: outcome.ledger, amountOutRaw: amountOut === null ? null : rawToText(amountOut) };
    return transitionOrReload(
      deps,
      plan,
      'confirmed',
      { result: JSON.stringify(result) },
      'system',
      `Confirmed in ledger ${outcome.ledger}`,
    );
  }
  if (outcome.status === 'FAILED') {
    return transitionOrReload(
      deps,
      plan,
      'failed',
      { error_code: 'FAILED_ON_CHAIN', result: JSON.stringify({ ledger: outcome.ledger }) },
      'system',
      `Failed in ledger ${outcome.ledger}`,
    );
  }
  if (plan.valid_until_ms && deps.now() > plan.valid_until_ms + EXPIRY_GRACE_MS) {
    return transitionOrReload(
      deps,
      plan,
      'failed',
      { error_code: 'NOT_INCLUDED' },
      'system',
      'Expired without being included',
    );
  }
  // Still unseen and still valid: rebroadcasting the identical signed bytes is safe (same hash).
  if (plan.status === 'submitted' && plan.signed_xdr) {
    try {
      const tx = TransactionBuilder.fromXDR(plan.signed_xdr, NETWORK_PASSPHRASES[plan.network]) as Transaction;
      const sent = await deps.rpc.send(tx);
      if (sent.status === 'PENDING' || sent.status === 'DUPLICATE') {
        return transitionOrReload(deps, plan, 'confirming', {}, 'system', `Rebroadcast accepted (${sent.status})`);
      }
    } catch (error) {
      logFailure('rebroadcast', error);
    }
  }
  return plan;
}

// ---- Storage helpers -------------------------------------------------------------------------

/**
 * Moves a plan from its current status to `to`, recording the event in the same batch. Returns
 * false when another request changed the plan first; nothing is written then.
 */
async function transition(
  deps: ExecutionDeps,
  plan: PlanRow,
  to: PlanStatus,
  patch: Patch,
  actor: 'user' | 'system',
  reason: string,
) {
  const columns = Object.keys(patch).filter((key): key is (typeof PATCHABLE)[number] =>
    (PATCHABLE as readonly string[]).includes(key),
  );
  const now = deps.now();
  const update = deps.db
    .prepare(
      `UPDATE plans SET status = ?, updated_at_ms = ?${columns.map((column) => `, ${column} = ?`).join('')}
       WHERE id = ? AND status = ?`,
    )
    .bind(to, now, ...columns.map((column) => patch[column] ?? null), plan.id, plan.status);
  const event = deps.db
    .prepare(
      `INSERT INTO plan_events (plan_id, from_status, to_status, actor, reason, created_at_ms)
       SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    )
    .bind(plan.id, plan.status, to, actor, reason.slice(0, 500), now);
  const [result] = await deps.db.batch([update, event]);
  return result?.meta.changes === 1;
}

async function transitionOrReload(
  deps: ExecutionDeps,
  plan: PlanRow,
  to: PlanStatus,
  patch: Patch,
  actor: 'user' | 'system',
  reason: string,
) {
  await transition(deps, plan, to, patch, actor, reason);
  return loadPlan(deps, plan.id);
}

async function loadIntent(deps: ExecutionDeps, id: string): Promise<IntentRow> {
  const row = await deps.db
    .prepare('SELECT * FROM intents WHERE id = ? AND network = ?')
    .bind(id, deps.config.network)
    .first<IntentRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such request.');
  return row;
}

async function loadQuote(deps: ExecutionDeps, id: string): Promise<QuoteRow> {
  const row = await deps.db.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first<QuoteRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such quote.');
  return row;
}

async function loadPlan(deps: ExecutionDeps, id: string): Promise<PlanRow> {
  const row = await deps.db
    .prepare('SELECT * FROM plans WHERE id = ? AND network = ?')
    .bind(id, deps.config.network)
    .first<PlanRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such plan.');
  return row;
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

function intentView(row: IntentRow) {
  return {
    id: row.id,
    network: row.network,
    kind: row.kind,
    sell: amountView(row.network, row.sell_asset, row.sell_amount_raw),
    buy: { symbol: row.buy_asset, canonicalId: swapAsset(row.network, row.buy_asset as SwapSymbol).ref.canonicalId },
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function quoteView(row: QuoteRow, intent: IntentRow) {
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

async function planView(deps: ExecutionDeps, row: PlanRow) {
  const intent = await loadIntent(deps, row.intent_id);
  const quote = await loadQuote(deps, row.quote_id);
  const facts = row.prepared_facts ? (JSON.parse(row.prepared_facts) as Record<string, string | null>) : null;
  const result = row.result ? (JSON.parse(row.result) as { amountOutRaw?: string | null; ledger?: number }) : null;
  return {
    id: row.id,
    status: row.status,
    network: row.network,
    account: row.account_id,
    digest: row.digest,
    quote: quoteView(quote, intent),
    policy: JSON.parse(row.policy) as Decision,
    maxFee: { symbol: 'XLM', amount: formatRawAmount(rawFromText(row.max_fee_stroops), XLM_DECIMALS) },
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
            fee: { symbol: 'XLM', amount: formatRawAmount(rawFromText(facts.feeStroops ?? '0'), XLM_DECIMALS) },
            // Soroswap's own fee, taken from the input; Nest's fee stays 0.
            providerFee: {
              ...amountView(row.network, intent.sell_asset, facts.providerFeeRaw ?? '0'),
              bps: bpsOf(rawFromText(facts.providerFeeRaw ?? '0'), rawFromText(quote.amount_in_raw)),
            },
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
    txHash: row.tx_hash,
    received: result?.amountOutRaw ? amountView(row.network, intent.buy_asset, result.amountOutRaw) : null,
    ledger: result?.ledger ?? null,
    errorCode: row.error_code,
    explorerUrl: row.tx_hash
      ? `https://stellar.expert/explorer/${row.network === 'mainnet' ? 'public' : 'testnet'}/tx/${row.tx_hash}`
      : null,
  };
}

// ---- Small helpers ---------------------------------------------------------------------------

/** Soroswap swap calls return the amounts along the route; the last one is what the account received. */
function outputOf(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (Array.isArray(value) && typeof value.at(-1) === 'bigint') return value.at(-1) as bigint;
  return null;
}

async function receivedByVenue(deps: ExecutionDeps, txHash: string): Promise<bigint | null> {
  try {
    return (await deps.venue?.receivedAmount?.(txHash)) ?? null;
  } catch (error) {
    logFailure('received_amount', error);
    return null;
  }
}

function bpsOf(part: bigint, whole: bigint): number {
  return whole === 0n ? 0 : Number((part * 10_000n) / whole);
}

function canonicalJson(value: Record<string, string | number>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function logFailure(step: string, error: unknown): void {
  console.error(
    JSON.stringify({
      execution: step,
      error: error instanceof Error ? error.name : 'unknown',
      status: error instanceof SoroswapError ? error.status : undefined,
      detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
    }),
  );
}
