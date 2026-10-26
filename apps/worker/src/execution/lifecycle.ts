import { InspectionError, verifySignedTransaction } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { AppError } from '@nest/domain/errors';
import { StrKey, type Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

import { compareLending, lendingIntentView, lendingPlanPolicy, lendingPlanView, prepareLending } from './lending.ts';
import { compareLimit, limitIntentView, limitPlanPolicy, limitPlanView, prepareLimit } from './limit.ts';
import type { SwapRpc } from './rpc.ts';
import {
  basePlanView,
  type ExecutionDeps,
  existingPlan,
  firstBlock,
  type IntentRow,
  insertPlan,
  loadIntent,
  loadPlan,
  loadQuote,
  logFailure,
  newPlanRow,
  type PlanRow,
  type QuoteRow,
  transition,
  transitionOrReload,
} from './store.ts';
import { compareSwap, prepareSwap, swapIntentView, swapPlanPolicy, swapPlanView, swapReceived } from './swap.ts';
import { compareVault, prepareVault, vaultIntentView, vaultPlanPolicy, vaultPlanView } from './vaults.ts';

const CONFIRM_POLL_MS = 1_000;
const CONFIRM_WAIT_MS = 20_000;
const SEND_ATTEMPTS = 3;
/** After a transaction's validity window plus this much, an unseen transaction can never land. */
const EXPIRY_GRACE_MS = 60_000;
const ACTIVITY_LIMIT = 30;
const LENDING_TITLES: Record<string, string> = {
  supply: 'Supply',
  borrow: 'Borrow',
  repay: 'Repay',
  withdraw: 'Withdraw',
  withdraw_collateral: 'Withdraw collateral',
};
// Blend requests that move tokens from the wallet into the pool; the rest pay out to it.
const OUTGOING_REQUESTS = new Set(['supply', 'supplyCollateral', 'repay']);

export async function readIntent(deps: ExecutionDeps, intentId: string) {
  const intent = await loadIntent(deps, intentId);
  if (intent.kind === 'vault_deposit') return vaultIntentView(intent);
  if (intent.kind === 'swap') return swapIntentView(intent);
  return isLimit(intent.kind) ? limitIntentView(intent) : lendingIntentView(intent);
}

/**
 * Fresh quotes for a swap, vault deposit, or lending. Repay and withdraw read
 * the position of `accountId`, so they need it.
 */
export async function compareIntent(deps: ExecutionDeps, intentId: string, accountId?: string) {
  const intent = await loadIntent(deps, intentId);
  if (intent.kind === 'vault_deposit') return compareVault(deps, intent);
  if (intent.kind === 'swap') return compareSwap(deps, intent);
  return isLimit(intent.kind) ? compareLimit(deps, intent, accountId) : compareLending(deps, intent, accountId);
}

export async function createPlan(
  deps: ExecutionDeps,
  input: { intentId: string; quoteId: string; accountId: string; idempotencyKey: string },
) {
  if (!StrKey.isValidEd25519PublicKey(input.accountId)) {
    throw new AppError('INVALID_REQUEST', 'Connect a Stellar account (G…) to review this.');
  }
  const existing = await existingPlan(deps, input);
  if (existing) return planView(deps, existing);

  const intent = await loadIntent(deps, input.intentId);
  const quote = await loadQuote(deps, input.quoteId);
  if (quote.intent_id !== intent.id) throw new AppError('INVALID_REQUEST', 'That quote belongs to another request.');
  if (intent.kind === 'borrow' && quote.venue !== 'xoxno') {
    const collateral = await deps.db
      .prepare(
        `SELECT plans.id FROM plans JOIN quotes ON quotes.id = plans.quote_id
         WHERE plans.intent_id = ? AND plans.account_id = ? AND plans.network = ?
           AND plans.status = 'confirmed' AND quotes.venue = 'xoxno'
           AND json_extract(plans.prepared_facts, '$.step') = 'collateral' LIMIT 1`,
      )
      .bind(intent.id, input.accountId, intent.network)
      .first<{ id: string }>();
    if (collateral) {
      throw new AppError('CONFLICT', 'Continue this loan on XOXNO, where its collateral is.');
    }
  }
  const now = deps.now();
  const policyOf = {
    swap: swapPlanPolicy,
    supply: lendingPlanPolicy,
    borrow: lendingPlanPolicy,
    repay: lendingPlanPolicy,
    withdraw: lendingPlanPolicy,
    withdraw_collateral: lendingPlanPolicy,
    vault_deposit: vaultPlanPolicy,
    limit_order: limitPlanPolicy,
    limit_close: limitPlanPolicy,
  }[intent.kind];
  const { decision, digest } = await policyOf(intent, quote, input.accountId, now);
  const row = newPlanRow({
    intent,
    quoteId: quote.id,
    accountId: input.accountId,
    idempotencyKey: input.idempotencyKey,
    status: decision.verdict === 'block' ? 'blocked' : 'policy_checked',
    digest,
    policy: JSON.stringify(decision),
    errorCode: firstBlock(decision),
    now,
  });
  await insertPlan(deps, row);
  return planView(deps, row);
}

/**
 * The wallet's plans that reached the network, newest first, settling submitted ones on the way.
 * Read-only, like the limit order list: each of these transactions is public on chain.
 */
export async function listActivity(deps: ExecutionDeps, account: string) {
  if (!StrKey.isValidEd25519PublicKey(account)) throw new AppError('INVALID_REQUEST', 'Send a Stellar account (G…).');
  const { results } = await deps.db
    .prepare(
      `SELECT * FROM plans WHERE network = ? AND account_id = ? AND tx_hash IS NOT NULL
       ORDER BY created_at_ms DESC LIMIT ?`,
    )
    .bind(deps.config.network, account, ACTIVITY_LIMIT)
    .all<PlanRow>();
  const plans = await Promise.all(
    results.map((row) => (row.status === 'submitted' || row.status === 'confirming' ? reconcile(deps, row) : row)),
  );
  const intents = await rowsById<IntentRow>(
    deps,
    'intents',
    plans.map((plan) => plan.intent_id),
  );
  const quotes = await rowsById<QuoteRow>(
    deps,
    'quotes',
    plans.map((plan) => plan.quote_id),
  );
  return {
    network: deps.config.network,
    items: plans.flatMap((plan) => {
      const intent = intents.get(plan.intent_id);
      const quote = quotes.get(plan.quote_id);
      return intent && quote ? [activityItem(plan, intent, quote)] : [];
    }),
  };
}

export async function readPlan(deps: ExecutionDeps, planId: string) {
  let plan = await loadPlan(deps, planId);
  if ((plan.status === 'submitted' || plan.status === 'confirming') && deps.rpc) plan = await reconcile(deps, plan);
  return planView(deps, plan);
}

/** Builds the transaction through its venue, inspects it against the plan and simulates it. */
export async function preparePlan(deps: ExecutionDeps, planId: string) {
  const plan = await loadPlan(deps, planId);
  if (plan.status !== 'policy_checked' && plan.status !== 'awaiting_review') {
    throw new AppError('CONFLICT', 'This plan can no longer be prepared.');
  }
  const intent = await loadIntent(deps, plan.intent_id);
  const quote = await loadQuote(deps, plan.quote_id);
  if (deps.now() >= quote.expires_at_ms) {
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
  const prepare = {
    swap: prepareSwap,
    supply: prepareLending,
    borrow: prepareLending,
    repay: prepareLending,
    withdraw: prepareLending,
    withdraw_collateral: prepareLending,
    vault_deposit: prepareVault,
    limit_order: prepareLimit,
    limit_close: prepareLimit,
  }[intent.kind];
  return viewOf(await prepare(deps, plan, intent, quote), intent, quote);
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
  if (!deps.rpc) throw new AppError('UNAVAILABLE', 'Execution needs a Stellar RPC on this server.');
  let plan = await loadPlan(deps, planId);
  const venue = (await loadQuote(deps, plan.quote_id)).venue;
  if (!deps.config.executionEnabled || !deps.config.writeAdapters.has(venue)) {
    throw new AppError('EXECUTION_DISABLED', 'Execution for this venue is turned off on this server.');
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
    const intent = await loadIntent(deps, plan.intent_id);
    const result =
      intent.kind === 'swap'
        ? { ledger: outcome.ledger, amountOutRaw: await swapReceived(deps, plan.tx_hash, outcome.returnValue) }
        : { ledger: outcome.ledger };
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

async function planView(deps: ExecutionDeps, row: PlanRow) {
  return viewOf(row, await loadIntent(deps, row.intent_id), await loadQuote(deps, row.quote_id));
}

function viewOf(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  if (intent.kind === 'vault_deposit') return vaultPlanView(row, intent, quote);
  if (intent.kind === 'swap') return swapPlanView(row, intent, quote);
  return isLimit(intent.kind) ? limitPlanView(row, intent, quote) : lendingPlanView(row, intent, quote);
}

/** One line of wallet activity: what left the wallet and what came back, where, and how it ended. */
function activityItem(plan: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const base = {
    id: plan.id,
    kind: intent.kind,
    status: plan.status,
    createdAt: new Date(plan.created_at_ms).toISOString(),
    txHash: plan.tx_hash,
    explorerUrl: basePlanView(plan).explorerUrl,
    errorCode: plan.error_code,
  };
  if (intent.kind === 'swap') {
    const view = swapPlanView(plan, intent, quote);
    return {
      ...base,
      title: `Swap ${view.quote.sell.symbol} → ${view.quote.expectedOut.symbol}`,
      venue: view.quote.venue === 'sdex' ? 'Stellar DEX' : 'Soroswap',
      sent: [amountOf(view.quote.sell)],
      received: view.received ? [amountOf(view.received)] : [],
    };
  }
  if (intent.kind === 'vault_deposit') {
    const { offer } = vaultPlanView(plan, intent, quote);
    return {
      ...base,
      title: `Deposit ${offer.asset.symbol}`,
      venue: `DeFindex · ${offer.vault.name}`,
      sent: [amountOf(offer.asset)],
      received: [],
    };
  }
  if (isLimit(intent.kind)) {
    const { offer } = limitPlanView(plan, intent, quote);
    return {
      ...base,
      title: offer.order ? `Limit ${offer.order.side} XLM at ${offer.order.limitPrice}` : 'Withdraw limit order',
      venue: 'Aquarius',
      sent: offer.order ? [amountOf(offer.order.deposit)] : [],
      received: offer.position?.returns.filter((amount) => amount.raw !== '0').map(amountOf) ?? [],
    };
  }
  const view = lendingPlanView(plan, intent, quote);
  const requests = view.prepared?.requests ?? [];
  return {
    ...base,
    title: `${LENDING_TITLES[intent.kind] ?? 'Lend'} ${view.offer.asset.symbol}`,
    venue: view.offer.venue === 'blend' ? `Blend · ${view.offer.pool.name}` : view.offer.pool.name,
    sent: requests.filter((request) => OUTGOING_REQUESTS.has(request.type)).map(amountOf),
    received: requests.filter((request) => !OUTGOING_REQUESTS.has(request.type)).map(amountOf),
  };
}

function amountOf({ symbol, amount }: { symbol: string; amount: string }) {
  return { symbol, amount };
}

async function rowsById<T extends { id: string }>(
  deps: ExecutionDeps,
  table: 'intents' | 'quotes',
  ids: readonly string[],
): Promise<Map<string, T>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { results } = await deps.db
    .prepare(`SELECT * FROM ${table} WHERE id IN (${unique.map(() => '?').join(', ')})`)
    .bind(...unique)
    .all<T>();
  return new Map(results.map((row) => [row.id, row]));
}

function isLimit(kind: string): boolean {
  return kind === 'limit_order' || kind === 'limit_close';
}
