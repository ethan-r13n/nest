import { inspectVaultWithdrawal, type VaultWithdrawal } from '@nest/adapters/defindex/withdraw';
import { InspectionError } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import {
  AmountError,
  formatRawAmount,
  MAX_SOROBAN_RAW,
  parseDecimalAmount,
  rawFromText,
  rawToText,
} from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';
import { evaluate, type Rule } from '@nest/policy/engine';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

import {
  basePlanView,
  canonicalJson,
  type ExecutionDeps,
  feeView,
  type IntentRow,
  insertIntent,
  insertQuote,
  MAX_FEE_STROOPS,
  type PlanRow,
  type QuoteRow,
  rawAmount,
  sha256Hex,
  transitionOrReload,
} from './store.ts';

const RAW = z.string().regex(/^(0|[1-9]\d*)$/);
const OfferSchema = z.object({
  vaultId: z.string(),
  name: z.string(),
  symbol: z.enum(['XLM', 'USDC']),
  assetContract: z.string(),
  account: z.string(),
  balanceRaw: RAW,
  decimals: z.number().int().min(0).max(38),
  verified: z.literal(true),
});
const TIMING = {
  lockup: 'none',
  cooldown: 'none',
  summary:
    'No fixed lockup or cooldown. Withdrawal simulates the vault’s current strategy unwind; insufficient strategy liquidity can block redemption. Your shares remain owned until the signed withdrawal confirms.',
};

export async function createVaultWithdrawalIntent(
  deps: ExecutionDeps,
  input: { vaultId: string; amount: string; source: 'chat' | 'form' },
) {
  const vaults = requireWithdrawals(deps);
  const vault = await vaults.vault(input.vaultId);
  if (!vault.symbol) throw new AppError('INVALID_REQUEST', 'Only supported single-asset vaults can be withdrawn here.');
  if (!(await vaults.verify(vault.address))) throw new AppError('UNAVAILABLE', 'The vault’s code is not verified.');
  const decimals = await vaults.shareDecimals(vault.address);
  const whole = input.amount.trim().toLowerCase() === 'all';
  let shares = 0n;
  try {
    if (!whole) shares = parseDecimalAmount(input.amount, decimals, MAX_SOROBAN_RAW);
  } catch (error) {
    throw new AppError('INVALID_REQUEST', error instanceof AmountError ? error.message : 'Enter a share amount.');
  }
  if (!whole && shares === 0n) throw new AppError('INVALID_REQUEST', 'Enter shares above zero, or all.');
  const row: IntentRow = {
    id: crypto.randomUUID(),
    network: deps.config.network,
    kind: 'vault_withdraw',
    sell_asset: vault.symbol,
    buy_asset: vault.symbol,
    sell_amount_raw: rawToText(shares),
    source: input.source,
    market_id: vault.address,
    collateral_asset: null,
    collateral_amount_raw: null,
    whole_position: whole ? 1 : 0,
    limit_price: null,
    tick_lower: null,
    tick_upper: null,
    vault_share_decimals: decimals,
    created_at_ms: deps.now(),
  };
  await insertIntent(deps, row);
  return vaultWithdrawalIntentView(row);
}

export async function compareVaultWithdrawal(deps: ExecutionDeps, intent: IntentRow, account?: string) {
  if (!account || !StrKey.isValidEd25519PublicKey(account))
    throw new AppError('INVALID_REQUEST', 'Connect a Stellar account to read its owned vault shares.');
  const vaults = requireWithdrawals(deps);
  const address = intent.market_id ?? '';
  const [vault, verified, position] = await Promise.all([
    vaults.vault(address),
    vaults.verify(address),
    vaults.position(address, account),
  ]);
  if (
    !verified ||
    !vault.symbol ||
    vault.symbol !== intent.sell_asset ||
    position.decimals !== intent.vault_share_decimals ||
    position.assetContract !== vault.assetContract
  ) {
    throw new AppError('CONFLICT', 'The vault’s code, asset or share decimals changed; start a new review.');
  }
  const reserved = await reservedShares(deps, address, account);
  const available = position.balanceRaw > reserved ? position.balanceRaw - reserved : 0n;
  const shares = intent.whole_position === 1 ? available : rawFromText(intent.sell_amount_raw);
  const excluded = (reason: string) => ({
    quotes: [],
    selectedQuoteId: null,
    excluded: [{ poolId: address, name: vault.name, reason }],
  });
  if (shares === 0n) return excluded('No unreserved owned shares are available to withdraw.');
  if (shares > available) return excluded('The requested shares exceed the available owned balance.');
  const amount = await vaults.shareAmount(address, shares);
  if (amount === 0n) return excluded('These shares currently redeem to less than one unit of the underlying asset.');
  const minimum = (amount * 9950n) / 10000n || 1n;
  const offer = {
    vaultId: address,
    name: vault.name,
    symbol: vault.symbol,
    assetContract: vault.assetContract,
    account,
    balanceRaw: rawToText(position.balanceRaw),
    decimals: position.decimals,
    verified: true,
  };
  const row: QuoteRow = {
    id: crypto.randomUUID(),
    intent_id: intent.id,
    venue: 'defindex',
    slippage_bps: 50,
    amount_in_raw: rawToText(shares),
    amount_out_raw: rawToText(amount),
    min_out_raw: rawToText(minimum),
    price_impact_bps: null,
    protocols: JSON.stringify([address]),
    provider_quote: JSON.stringify(offer),
    observed_at_ms: deps.now(),
    expires_at_ms: deps.now() + 30_000,
  };
  await insertQuote(deps, row);
  return { quotes: [withdrawalOfferView(row, intent)], selectedQuoteId: row.id, excluded: [] };
}

interface Facts {
  fresh: boolean;
  owned: boolean;
  verified: boolean;
}
const RULES: readonly Rule<Facts>[] = [
  {
    id: 'quote_fresh',
    severity: 'block',
    check: (facts) => ({
      pass: facts.fresh,
      code: 'QUOTE_EXPIRED',
      detail: 'Refresh the share redemption before reviewing.',
    }),
  },
  {
    id: 'position_owner',
    severity: 'block',
    check: (facts) => ({
      pass: facts.owned,
      code: 'ACCOUNT_MISMATCH',
      detail: 'The shares must have been read for this wallet.',
    }),
  },
  {
    id: 'vault_verified',
    severity: 'block',
    check: (facts) => ({
      pass: facts.verified,
      code: 'VAULT_UNVERIFIED',
      detail: 'The vault must run the verified code.',
    }),
  },
];

export async function vaultWithdrawalPolicy(intent: IntentRow, quote: QuoteRow, account: string, now: number) {
  const offer = parseOffer(quote);
  const decision = evaluate(RULES, {
    fresh: now < quote.expires_at_ms,
    owned: offer.account === account,
    verified: offer.verified,
  });
  const call = withdrawalOf(quote, account);
  const digest = await sha256Hex(
    canonicalJson({
      intentId: intent.id,
      quoteId: quote.id,
      network: intent.network,
      account,
      vault: call.vault,
      asset: call.assetContract,
      shares: call.shares.toString(),
      minimum: call.minAmount.toString(),
      maxFeeStroops: MAX_FEE_STROOPS.toString(),
    }),
  );
  return { decision, digest };
}

export async function prepareVaultWithdrawal(
  deps: ExecutionDeps,
  plan: PlanRow,
  _intent: IntentRow,
  quote: QuoteRow,
): Promise<PlanRow> {
  const vaults = requireWithdrawals(deps);
  const call = withdrawalOf(quote, plan.account_id);
  const offer = parseOffer(quote);
  if (offer.account !== plan.account_id)
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'ACCOUNT_MISMATCH' },
      'system',
      'Owned shares changed',
    );
  if (!(await vaults.verify(call.vault)))
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'VAULT_UNVERIFIED' },
      'system',
      'Vault code changed',
    );
  const position = await vaults.position(call.vault, plan.account_id);
  const reserved = await reservedShares(deps, call.vault, plan.account_id, plan.id);
  if (
    position.account !== plan.account_id ||
    position.assetContract !== call.assetContract ||
    position.decimals !== offer.decimals ||
    position.balanceRaw < call.shares + reserved
  ) {
    return transitionOrReload(
      deps,
      plan,
      'blocked',
      { error_code: 'INSUFFICIENT_SHARES' },
      'system',
      'Shares are unavailable or reserved by another withdrawal',
    );
  }
  let xdrText: string;
  try {
    xdrText = await vaults.withdraw(call);
  } catch (error) {
    if (error instanceof VenueRefusal)
      return transitionOrReload(deps, plan, 'blocked', { error_code: error.code }, 'system', error.message);
    throw new AppError('UNAVAILABLE', 'The vault could not prepare this withdrawal right now.');
  }
  let inspected: ReturnType<typeof inspectVaultWithdrawal>;
  try {
    inspected = inspectVaultWithdrawal(xdrText, {
      ...call,
      network: plan.network,
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
      prepared_facts: JSON.stringify({
        sharesRaw: call.shares.toString(),
        minimumRaw: call.minAmount.toString(),
        amountRaw: quote.amount_out_raw,
        decimals: offer.decimals,
        feeStroops: inspected.feeStroops.toString(),
      }),
      valid_until_ms: inspected.validUntilSeconds * 1000,
      approved_at_ms: null,
      error_code: null,
    },
    'system',
    'Built, inspected and simulated',
  );
}

export async function listVaultPositions(deps: ExecutionDeps, account: string) {
  if (!StrKey.isValidEd25519PublicKey(account)) throw new AppError('INVALID_REQUEST', 'Send a Stellar account (G…).');
  try {
    const vaults = requireWithdrawals(deps);
    const catalog = await vaults.vaults();
    const positions = await Promise.all(
      catalog
        .filter((vault) => vault.symbol !== null)
        .map(async (vault) => {
          if (!(await vaults.verify(vault.address))) throw new Error('Unverified vault');
          const position = await vaults.position(vault.address, account);
          if (position.assetContract !== vault.assetContract) throw new Error('Underlying asset identity changed');
          return {
            vault: { id: vault.address, name: vault.name },
            shares: sharesView(position.balanceRaw, position.decimals),
            underlying: rawAmount(vault.symbol ?? '', position.underlyingRaw.toString()),
            assetContract: vault.assetContract,
            withdrawalTiming: TIMING,
            verified: true,
          };
        }),
    );
    return {
      network: deps.config.network,
      available: true as const,
      positions: positions.filter((position) => position.shares.raw !== '0'),
    };
  } catch {
    return {
      network: deps.config.network,
      available: false as const,
      reason: 'Owned vault shares could not be read completely right now.',
      positions: [],
    };
  }
}

export function vaultWithdrawalIntentView(row: IntentRow) {
  const decimals = row.vault_share_decimals;
  if (decimals === undefined || decimals === null)
    throw new AppError('CONFLICT', 'Share decimals are missing; start a new withdrawal.');
  return {
    id: row.id,
    network: row.network,
    kind: 'vault_withdraw' as const,
    asset:
      row.whole_position === 1
        ? { symbol: row.sell_asset, amount: 'all', raw: null }
        : {
            symbol: row.sell_asset,
            amount: formatShares(rawFromText(row.sell_amount_raw), decimals),
            raw: row.sell_amount_raw,
          },
    vault: { id: row.market_id ?? '' },
    wholePosition: row.whole_position === 1,
    source: row.source,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

export function vaultWithdrawalPlanView(row: PlanRow, intent: IntentRow, quote: QuoteRow) {
  const facts = row.prepared_facts
    ? z
        .object({
          sharesRaw: RAW,
          minimumRaw: RAW,
          amountRaw: RAW,
          decimals: z.number().int().min(0).max(38),
          feeStroops: RAW,
        })
        .parse(JSON.parse(row.prepared_facts))
    : null;
  return {
    ...basePlanView(row),
    kind: 'vault_withdraw' as const,
    offer: withdrawalOfferView(quote, intent),
    prepared:
      row.prepared_xdr && row.prepared_hash && facts
        ? {
            xdr: row.prepared_xdr,
            hash: row.prepared_hash,
            networkPassphrase: NETWORK_PASSPHRASES[row.network],
            fee: feeView(facts.feeStroops),
            shares: sharesView(rawFromText(facts.sharesRaw), facts.decimals),
            expected: rawAmount(intent.sell_asset, facts.amountRaw),
            minimum: rawAmount(intent.sell_asset, facts.minimumRaw),
            validUntil: row.valid_until_ms ? new Date(row.valid_until_ms).toISOString() : null,
          }
        : null,
  };
}

function withdrawalOfferView(row: QuoteRow, _intent: IntentRow) {
  const offer = parseOffer(row);
  return {
    id: row.id,
    intentId: row.intent_id,
    venue: 'defindex' as const,
    kind: 'vault_withdraw' as const,
    vault: { id: offer.vaultId, name: offer.name },
    asset: rawAmount(offer.symbol, row.amount_out_raw),
    minimum: rawAmount(offer.symbol, row.min_out_raw),
    shares: sharesView(rawFromText(row.amount_in_raw), offer.decimals),
    position: { account: offer.account, shares: sharesView(rawFromText(offer.balanceRaw), offer.decimals) },
    withdrawalTiming: TIMING,
    verified: offer.verified,
    nestFeeBps: 0,
    observedAt: new Date(row.observed_at_ms).toISOString(),
    expiresAt: new Date(row.expires_at_ms).toISOString(),
  };
}

function requireWithdrawals(deps: ExecutionDeps) {
  const venue = deps.vaults;
  if (!venue?.position || !venue.shareDecimals || !venue.shareAmount || !venue.withdraw)
    throw new AppError('UNAVAILABLE', 'Vault withdrawals are not connected on this network.');
  return {
    ...venue,
    position: venue.position,
    shareDecimals: venue.shareDecimals,
    shareAmount: venue.shareAmount,
    withdraw: venue.withdraw,
  };
}

async function reservedShares(deps: ExecutionDeps, vault: string, account: string, exceptPlan = ''): Promise<bigint> {
  const { results } = await deps.db
    .prepare(`SELECT quotes.amount_in_raw FROM plans JOIN quotes ON quotes.id = plans.quote_id JOIN intents ON intents.id = plans.intent_id
    WHERE plans.network = ? AND plans.account_id = ? AND intents.market_id = ? AND intents.kind = 'vault_withdraw' AND plans.id != ?
    AND (plans.status IN ('submitted','confirming') OR (plans.status IN ('awaiting_review','awaiting_signature') AND plans.valid_until_ms > ?))`)
    .bind(deps.config.network, account, vault, exceptPlan, deps.now())
    .all<{ amount_in_raw: string }>();
  return results.reduce((total, row) => total + rawFromText(row.amount_in_raw), 0n);
}

function parseOffer(quote: QuoteRow) {
  return OfferSchema.parse(JSON.parse(quote.provider_quote));
}
function withdrawalOf(quote: QuoteRow, account: string): VaultWithdrawal {
  const offer = parseOffer(quote);
  return {
    vault: offer.vaultId,
    account,
    assetContract: offer.assetContract,
    shares: rawFromText(quote.amount_in_raw),
    minAmount: rawFromText(quote.min_out_raw),
  };
}
function sharesView(raw: bigint, decimals: number) {
  return { symbol: 'shares' as const, amount: formatShares(raw, decimals), raw: rawToText(raw), decimals };
}
function formatShares(raw: bigint, decimals: number) {
  return decimals === 0 ? raw.toString() : formatRawAmount(raw, decimals);
}
