import type { LendingSymbol } from '@nest/adapters/blend/markets';
import type { VaultDeposit } from '@nest/adapters/defindex/deposit';
import { inspectVaultDeposit } from '@nest/adapters/defindex/deposit';
import type { VaultView } from '@nest/adapters/defindex/vaults';
import { InspectionError } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import { AmountError, MAX_CLASSIC_RAW, parseDecimalAmount, rawFromText, rawToText } from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';
import { type Decision, evaluate, type Rule } from '@nest/policy/engine';

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

const VENUE = 'defindex';
/** Vault figures move slowly, but the review still shows what was true a minute ago at most. */
const OFFER_MAX_AGE_MS = 60_000;
/** The least of the deposit a single-asset vault may take, as DeFindex's own API sets it. */
const SLIPPAGE_BPS = 50;

/** DeFindex vaults have no lockup; exits come back through the vault's strategies. */
const WITHDRAWAL_TIMING = {
  lockup: 'none',
  cooldown: 'none',
  summary:
    'Withdraw any time: no lockup, minimum holding period or notice. Invested funds come back through the vault’s strategies, so a Blend pool near full utilization can delay part of a withdrawal.',
} as const;

interface VaultOffer {
  vaultId: string;
  name: string;
  symbol: LendingSymbol;
  assetContract: string;
  apyPct: number | null;
  totalRaw: string;
  idleRaw: string;
  investedRaw: string;
  vaultFeeBps: number;
  defindexFeeBps: number;
  strategies: { name: string; paused: boolean }[];
  /** The vault runs DeFindex's published code, checked on chain when the offer was made. */
  verified: boolean;
  /** Deposits follow the vault's current allocation; a vault that has invested nothing keeps them idle. */
  invest: boolean;
}

export async function createVaultIntent(
  deps: ExecutionDeps,
  input: { vaultId: string; amount: string; source: 'chat' | 'form' },
) {
  const vaults = requireVaults(deps);
  const vault = await readVault(vaults, input.vaultId);
  if (!vault.symbol) throw new AppError('INVALID_REQUEST', 'Nest supports USDC and XLM vaults for now.');
  let raw: bigint;
  try {
    raw = parseDecimalAmount(input.amount, XLM_DECIMALS, MAX_CLASSIC_RAW);
  } catch (error) {
    throw new AppError('INVALID_REQUEST', error instanceof AmountError ? error.message : 'Enter a valid amount.');
  }
  if (raw === 0n) throw new AppError('INVALID_REQUEST', 'Enter an amount above zero.');
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network: deps.config.network,
    kind: 'vault_deposit',
    sell_asset: vault.symbol,
    buy_asset: vault.symbol,
    sell_amount_raw: rawToText(raw),
    source: input.source,
    market_id: vault.address,
    collateral_asset: null,
    collateral_amount_raw: null,
    whole_position: 0,
    limit_price: null,
    tick_lower: null,
    tick_upper: null,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return vaultIntentView(row, vault.name);
}

/** Reads the vault again and checks its code on chain; a vault that fails the check is excluded. */
export async function compareVault(deps: ExecutionDeps, intent: IntentRow) {
  const vaults = requireVaults(deps);
  const vault = await readVault(vaults, intent.market_id ?? '');
  const excluded: { poolId: string; name: string; reason: string }[] = [];
  let verified = false;
  try {
    verified = await vaults.verify(vault.address);
  } catch (error) {
    logFailure('vault_verify', error);
    throw new AppError('UNAVAILABLE', 'The vault’s code could not be checked right now. Try again shortly.');
  }
  if (!verified)
    excluded.push({
      poolId: vault.address,
      name: vault.name,
      reason: 'It does not run DeFindex’s published vault code.',
    });
  if (vault.symbol !== intent.sell_asset) {
    excluded.push({ poolId: vault.address, name: vault.name, reason: `It no longer holds ${intent.sell_asset}.` });
  }
  if (excluded.length) return { quotes: [], selectedQuoteId: null, excluded };

  const amount = rawFromText(intent.sell_amount_raw);
  const offer: VaultOffer = {
    vaultId: vault.address,
    name: vault.name,
    symbol: intent.sell_asset as LendingSymbol,
    assetContract: vault.assetContract,
    apyPct: vault.apyPct,
    totalRaw: rawToText(vault.totalRaw),
    idleRaw: rawToText(vault.idleRaw),
    investedRaw: rawToText(vault.investedRaw),
    vaultFeeBps: vault.vaultFeeBps,
    defindexFeeBps: vault.defindexFeeBps,
    strategies: vault.strategies,
    verified,
    invest: vault.investedRaw > 0n,
  };
  const observed = deps.now();
  const row: QuoteRow = {
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: VENUE,
    slippage_bps: SLIPPAGE_BPS,
    amount_in_raw: rawToText(amount),
    amount_out_raw: rawToText(amount),
    min_out_raw: rawToText((amount * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n),
    price_impact_bps: null,
    protocols: JSON.stringify([vault.address]),
    provider_quote: JSON.stringify(offer),
    observed_at_ms: observed,
    expires_at_ms: observed + OFFER_MAX_AGE_MS,
  };
  await insertQuote(deps, row);
  const view = vaultOfferView(row, intent);
  return { quotes: [view], selectedQuoteId: view.id, excluded };
}

interface VaultPlanFacts {
  nowMs: number;
  quoteExpiresAtMs: number;
  offer: VaultOffer;
  nestFeeBps: number;
}

const VAULT_RULES: readonly Rule<VaultPlanFacts>[] = [
  {
    id: 'quote_fresh',
    severity: 'block',
    check: (facts) => ({
      pass: facts.nowMs < facts.quoteExpiresAtMs,
      code: 'QUOTE_EXPIRED',
      detail: 'The vault figures must still be current. Compare again.',
    }),
  },
  {
    id: 'vault_verified',
    severity: 'block',
    check: (facts) => ({
      pass: facts.offer.verified,
      code: 'VAULT_UNVERIFIED',
      detail: 'The vault must run DeFindex’s published vault code.',
    }),
  },
  {
    id: 'vault_invested',
    severity: 'warn',
    check: (facts) => ({
      pass: facts.offer.invest,
      code: 'VAULT_IDLE',
      detail:
        'This vault has not invested anything yet, so your deposit waits idle and earns nothing until its manager rebalances.',
    }),
  },
  {
    id: 'strategies_open',
    severity: 'warn',
    check: (facts) => ({
      pass: facts.offer.strategies.length === 0 || facts.offer.strategies.some((strategy) => !strategy.paused),
      code: 'STRATEGIES_PAUSED',
      detail: 'Every strategy in this vault is paused, so new deposits are not invested.',
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

export async function vaultPlanPolicy(
  intent: IntentRow,
  quote: QuoteRow,
  accountId: string,
  now: number,
): Promise<{ decision: Decision; digest: string }> {
  const offer = JSON.parse(quote.provider_quote) as VaultOffer;
  const decision = evaluate(VAULT_RULES, { nowMs: now, quoteExpiresAtMs: quote.expires_at_ms, offer, nestFeeBps: 0 });
  const deposit = depositOf(quote, accountId);
  const digest = await sha256Hex(
    canonicalJson({
      intentId: intent.id,
      quoteId: quote.id,
      network: intent.network,
      account: accountId,
      vault: deposit.vault,
      asset: deposit.assetContract,
      amountRaw: deposit.amount.toString(),
      minAmountRaw: deposit.minAmount.toString(),
      invest: String(deposit.invest),
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  return { decision, digest };
}

/** Re-checks the vault's code, builds its deposit, and inspects it against the plan. */
export async function prepareVault(
  deps: ExecutionDeps,
  plan: PlanRow,
  _intent: IntentRow,
  quote: QuoteRow,
): Promise<PlanRow> {
  const vaults = requireVaults(deps);
  const deposit = depositOf(quote, plan.account_id);
  // An upgradable vault could change its code between the offer and the signature.
  let verified: boolean;
  try {
    verified = await vaults.verify(deposit.vault);
  } catch (error) {
    logFailure('vault_verify', error);
    throw new AppError('UNAVAILABLE', 'The vault’s code could not be checked right now. Try again shortly.');
  }
  if (!verified) {
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'VAULT_UNVERIFIED' },
      'system',
      'Vault code changed',
    );
  }
  let xdrText: string;
  try {
    xdrText = await vaults.build(deposit);
  } catch (error) {
    if (error instanceof VenueRefusal) {
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    }
    logFailure('vault_build', error);
    throw new AppError('UNAVAILABLE', 'The vault could not be reached right now. Try again shortly.');
  }
  let inspected: ReturnType<typeof inspectVaultDeposit>;
  try {
    inspected = inspectVaultDeposit(xdrText, {
      ...deposit,
      network: plan.network,
      maxFeeStroops: rawFromText(plan.max_fee_stroops),
      nowSeconds: Math.floor(deps.now() / 1000),
    });
  } catch (error) {
    if (!(error instanceof InspectionError)) throw error;
    return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
  }
  const facts = {
    feeStroops: rawToText(inspected.feeStroops),
    amountRaw: rawToText(deposit.amount),
    minAmountRaw: rawToText(deposit.minAmount),
    invest: deposit.invest,
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

function depositOf(quote: QuoteRow, account: string): VaultDeposit {
  const offer = JSON.parse(quote.provider_quote) as VaultOffer;
  return {
    vault: offer.vaultId,
    account,
    assetContract: offer.assetContract,
    amount: rawFromText(quote.amount_in_raw),
    minAmount: rawFromText(quote.min_out_raw),
    invest: offer.invest,
  };
}

function requireVaults(deps: ExecutionDeps) {
  if (!deps.vaults)
    throw new AppError('UNAVAILABLE', 'Vault deposits need a DeFindex API key and a Stellar RPC on this server.');
  return deps.vaults;
}

async function readVault(vaults: NonNullable<ExecutionDeps['vaults']>, address: string): Promise<VaultView> {
  try {
    return await vaults.vault(address);
  } catch (error) {
    logFailure('vault_read', error);
    throw new AppError('UNAVAILABLE', 'DeFindex could not describe that vault right now. Try again shortly.');
  }
}

// ---- Views -----------------------------------------------------------------------------------

export function vaultIntentView(row: IntentRow, name?: string) {
  return {
    id: row.id,
    network: row.network,
    kind: 'vault_deposit' as const,
    asset: rawAmount(row.sell_asset, row.sell_amount_raw),
    vault: { id: row.market_id ?? '', ...(name ? { name } : {}) },
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function vaultOfferView(row: QuoteRow, intent: IntentRow) {
  const offer = JSON.parse(row.provider_quote) as VaultOffer;
  return {
    id: row.id,
    intentId: row.intent_id,
    venue: row.venue,
    kind: 'vault_deposit' as const,
    vault: { id: offer.vaultId, name: offer.name },
    asset: rawAmount(intent.sell_asset, row.amount_in_raw),
    minimum: rawAmount(intent.sell_asset, row.min_out_raw),
    apyPct: offer.apyPct,
    total: rawAmount(offer.symbol, offer.totalRaw),
    invested: rawAmount(offer.symbol, offer.investedRaw),
    fees: { vaultFeeBps: offer.vaultFeeBps, defindexFeeBps: offer.defindexFeeBps },
    strategies: offer.strategies,
    verified: offer.verified,
    invest: offer.invest,
    withdrawalTiming: WITHDRAWAL_TIMING,
    nestFeeBps: 0,
    observedAt: new Date(row.observed_at_ms).toISOString(),
    expiresAt: new Date(row.expires_at_ms).toISOString(),
  };
}

export function vaultPlanView(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const facts = row.prepared_facts
    ? (JSON.parse(row.prepared_facts) as {
        feeStroops: string;
        amountRaw: string;
        minAmountRaw: string;
        invest: boolean;
      })
    : null;
  return {
    ...basePlanView(row),
    kind: 'vault_deposit' as const,
    offer: vaultOfferView(quote, intent),
    prepared:
      row.prepared_xdr && row.prepared_hash && facts
        ? {
            xdr: row.prepared_xdr,
            hash: row.prepared_hash,
            networkPassphrase: NETWORK_PASSPHRASES[row.network],
            fee: feeView(facts.feeStroops),
            deposit: rawAmount(intent.sell_asset, facts.amountRaw),
            minimum: rawAmount(intent.sell_asset, facts.minAmountRaw),
            invest: facts.invest,
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
  };
}
