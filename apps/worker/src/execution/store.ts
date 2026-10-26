import {
  type Band,
  buildRangeCall,
  estimateRangeDeposit,
  listRangePositions,
  type RangeCall,
  type RangePoolState,
  type RangePosition,
  readRangePool,
  readRangePosition,
} from '@nest/adapters/aquarius/range';
import { lendingAsset } from '@nest/adapters/blend/markets';
import type { HealthEstimate, MarketView, PoolPositions } from '@nest/adapters/blend/reader';
import { buildBlendSubmit, type LendingRequest } from '@nest/adapters/blend/submit';
import { buildVaultDeposit, type VaultDeposit } from '@nest/adapters/defindex/deposit';
import { createDefindexClient, isDefindexVault, type VaultView } from '@nest/adapters/defindex/vaults';
import { createSoroswapVenue, SoroswapError } from '@nest/adapters/soroswap/client';
import { createSdexVenue } from '@nest/adapters/stellar/sdex';
import { buildTrustline } from '@nest/adapters/stellar/trustline';
import type { SwapVenue } from '@nest/adapters/venue';
import { formatRawAmount, rawFromText } from '@nest/domain/amount';
import { AppError } from '@nest/domain/errors';
import type { StellarNetwork } from '@nest/domain/network';
import type { Decision } from '@nest/policy/engine';

import { decodeExecutionConfig, type ExecutionConfig } from '../config.ts';
import type { INTENT_KINDS, PLAN_STATUSES } from '../db/schema.ts';
import { createSwapRpc, type SwapRpc } from './rpc.ts';

/** Highest network fee an action may carry: 1 XLM. The review shows it before signing. */
export const MAX_FEE_STROOPS = 10_000_000n;
export const XLM_DECIMALS = 7;

export type PlanStatus = (typeof PLAN_STATUSES)[number];
type IntentKind = (typeof INTENT_KINDS)[number];

/** Blend reads and builds, injected so tests can run without a network. */
interface LendingVenue {
  markets(): Promise<MarketView[]>;
  positions(account: string): Promise<PoolPositions[]>;
  health(input: {
    poolId: string;
    account: string;
    collateral?: { contractId: string; amountRaw: bigint };
    borrow?: { contractId: string; amountRaw: bigint };
  }): Promise<HealthEstimate>;
  build(input: { poolId: string; account: string; requests: readonly LendingRequest[] }): Promise<string>;
}

/** DeFindex reads, code verification and deposit builds, injected so tests can run without a network. */
interface VaultVenue {
  vaults(): Promise<VaultView[]>;
  vault(address: string): Promise<VaultView>;
  /** Whether the contract runs DeFindex's published vault code. */
  verify(address: string): Promise<boolean>;
  build(input: VaultDeposit): Promise<string>;
}

/** Aquarius concentrated-pool reads and builds, injected so tests run without a network. */
interface RangeVenue {
  pool(poolId: string): Promise<RangePoolState>;
  estimate(
    poolId: string,
    band: Pick<Band, 'tickLower' | 'tickUpper'>,
    amounts: readonly [bigint, bigint],
  ): Promise<{ used: [bigint, bigint]; liquidity: bigint }>;
  position(poolId: string, account: string, band: Pick<Band, 'tickLower' | 'tickUpper'>): Promise<RangePosition | null>;
  positions(poolId: string, account: string): Promise<{ tickLower: number; tickUpper: number }[]>;
  build(input: { poolId: string; account: string; call: RangeCall }): Promise<string>;
}

export interface ExecutionDeps {
  db: D1Database;
  config: ExecutionConfig;
  /** Where swaps are quoted and built on this network, or null when it is not configured. */
  venue: SwapVenue | null;
  lending: LendingVenue | null;
  vaults: VaultVenue | null;
  ranges: RangeVenue | null;
  buildTrustline: typeof buildTrustline;
  rpc: SwapRpc | null;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export function executionDeps(env: Env): ExecutionDeps {
  const config = decodeExecutionConfig(env);
  const rpcUrl = config.rpcUrl;
  return {
    db: env.DB,
    config,
    venue: venueFor(config),
    lending: rpcUrl
      ? {
          // Blend's SDK is large, so it loads on the first lending read rather than with every request.
          markets: async () => (await blendReader()).loadBlendMarkets(config.network, rpcUrl),
          positions: async (account) => (await blendReader()).loadBlendPositions(config.network, rpcUrl, account),
          health: async (input) =>
            (await blendReader()).estimateBlendHealth({ network: config.network, rpcUrl, ...input }),
          build: (input) => buildBlendSubmit({ network: config.network, rpcUrl, nowMs: Date.now(), ...input }),
        }
      : null,
    vaults: vaultVenue(config, rpcUrl),
    ranges: rpcUrl
      ? {
          pool: (poolId) => readRangePool(poolId, { network: config.network, rpcUrl }),
          estimate: (poolId, band, amounts) =>
            estimateRangeDeposit(poolId, band, amounts, { network: config.network, rpcUrl }),
          position: (poolId, account, band) =>
            readRangePosition(poolId, account, band, { network: config.network, rpcUrl }),
          positions: (poolId, account) => listRangePositions(poolId, account, { network: config.network, rpcUrl }),
          build: (input) => buildRangeCall({ network: config.network, rpcUrl, nowMs: Date.now(), ...input }),
        }
      : null,
    buildTrustline,
    rpc: rpcUrl ? createSwapRpc(rpcUrl) : null,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function vaultVenue(config: ExecutionConfig, rpcUrl: string | null): VaultVenue | null {
  if (!config.defindexApiKey || !rpcUrl) return null;
  const client = createDefindexClient({ apiKey: config.defindexApiKey, network: config.network });
  const network = config.network;
  return {
    vaults: client.vaults,
    vault: client.vault,
    verify: (address) => isDefindexVault(network, rpcUrl, address),
    build: async (input) => {
      const symbol = input.assetContract === lendingAsset(network, 'XLM').contractId ? 'XLM' : 'USDC';
      return buildVaultDeposit({
        ...input,
        network,
        rpcUrl,
        asset: lendingAsset(network, symbol).classic,
        nowMs: Date.now(),
      });
    },
  };
}

function blendReader() {
  return import('@nest/adapters/blend/reader');
}

/**
 * Mainnet swaps route through Soroswap's aggregator. Its API has no Testnet routes, so Testnet uses
 * Stellar's built-in DEX, which has Testnet liquidity for the same assets.
 */
function venueFor(config: ExecutionConfig): SwapVenue | null {
  if (config.network === 'testnet') return createSdexVenue({ network: 'testnet' });
  return config.soroswapApiKey ? createSoroswapVenue({ apiKey: config.soroswapApiKey }) : null;
}

export interface IntentRow {
  id: string;
  network: StellarNetwork;
  kind: IntentKind;
  /** Swaps: the asset sold. Lending: the asset supplied or borrowed. */
  sell_asset: string;
  /** Swaps: the asset bought. Lending: the same asset as `sell_asset`. */
  buy_asset: string;
  sell_amount_raw: string;
  source: 'chat' | 'form';
  market_id: string | null;
  collateral_asset: string | null;
  collateral_amount_raw: string | null;
  /** Repay and withdraw: 1 for the whole position. */
  whole_position: number;
  /** Limit orders: USDC per XLM, and the band chosen (or, for a close, withdrawn). */
  limit_price: string | null;
  tick_lower: number | null;
  tick_upper: number | null;
  created_at_ms: number;
}

export interface QuoteRow {
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

export interface PlanRow {
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
export type Patch = Partial<Record<(typeof PATCHABLE)[number], string | number | null>>;

export async function insertIntent(deps: ExecutionDeps, row: IntentRow): Promise<void> {
  await deps.db
    .prepare(
      `INSERT INTO intents (id, network, kind, sell_asset, buy_asset, sell_amount_raw, source, market_id,
         collateral_asset, collateral_amount_raw, whole_position, limit_price, tick_lower, tick_upper, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.network,
      row.kind,
      row.sell_asset,
      row.buy_asset,
      row.sell_amount_raw,
      row.source,
      row.market_id,
      row.collateral_asset,
      row.collateral_amount_raw,
      row.whole_position,
      row.limit_price,
      row.tick_lower,
      row.tick_upper,
      row.created_at_ms,
    )
    .run();
}

export async function insertQuote(deps: ExecutionDeps, row: QuoteRow): Promise<void> {
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
}

/** The existing plan for an idempotency key, refusing reuse of the key for a different plan. */
export async function existingPlan(
  deps: ExecutionDeps,
  input: { intentId: string; quoteId: string; accountId: string; idempotencyKey: string },
): Promise<PlanRow | null> {
  const existing = await deps.db
    .prepare('SELECT * FROM plans WHERE idempotency_key = ?')
    .bind(input.idempotencyKey)
    .first<PlanRow>();
  if (!existing) return null;
  if (
    existing.intent_id !== input.intentId ||
    existing.quote_id !== input.quoteId ||
    existing.account_id !== input.accountId
  ) {
    throw new AppError('CONFLICT', 'This idempotency key was already used for a different plan.');
  }
  return existing;
}

export async function insertPlan(deps: ExecutionDeps, row: PlanRow): Promise<void> {
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
      .bind(row.id, row.status, 'user', 'Plan created from a quote', row.created_at_ms),
  ]);
}

/** A new plan row with nothing prepared yet. */
export function newPlanRow(input: {
  intent: IntentRow;
  quoteId: string;
  accountId: string;
  idempotencyKey: string;
  status: PlanStatus;
  digest: string;
  policy: string;
  errorCode: string | null;
  now: number;
}): PlanRow {
  return {
    id: crypto.randomUUID(),
    intent_id: input.intent.id,
    quote_id: input.quoteId,
    network: input.intent.network,
    account_id: input.accountId,
    idempotency_key: input.idempotencyKey,
    status: input.status,
    digest: input.digest,
    policy: input.policy,
    max_fee_stroops: MAX_FEE_STROOPS.toString(),
    prepared_xdr: null,
    prepared_hash: null,
    prepared_facts: null,
    valid_until_ms: null,
    approved_at_ms: null,
    signed_xdr: null,
    tx_hash: null,
    result: null,
    error_code: input.errorCode,
    created_at_ms: input.now,
    updated_at_ms: input.now,
  };
}

/**
 * Moves a plan from its current status to `to`, recording the event in the same batch. Returns
 * false when another request changed the plan first; nothing is written then.
 */
export async function transition(
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

export async function transitionOrReload(
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

export async function loadIntent(deps: ExecutionDeps, id: string): Promise<IntentRow> {
  const row = await deps.db
    .prepare('SELECT * FROM intents WHERE id = ? AND network = ?')
    .bind(id, deps.config.network)
    .first<IntentRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such request.');
  return row;
}

export async function loadQuote(deps: ExecutionDeps, id: string): Promise<QuoteRow> {
  const row = await deps.db.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first<QuoteRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such quote.');
  return row;
}

export async function loadPlan(deps: ExecutionDeps, id: string): Promise<PlanRow> {
  const row = await deps.db
    .prepare('SELECT * FROM plans WHERE id = ? AND network = ?')
    .bind(id, deps.config.network)
    .first<PlanRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such plan.');
  return row;
}

/** Every Nest asset uses seven decimals, so raw amounts format the same way. */
export function rawAmount(symbol: string, raw: string, canonicalId?: string) {
  return {
    symbol,
    ...(canonicalId ? { canonicalId } : {}),
    amount: formatRawAmount(rawFromText(raw), XLM_DECIMALS),
    raw,
  };
}

/** Soroswap swap calls return the amounts along the route; the last one is what the account received. */
export function outputOf(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (Array.isArray(value) && typeof value.at(-1) === 'bigint') return value.at(-1) as bigint;
  return null;
}

export function bpsOf(part: bigint, whole: bigint): number {
  return whole === 0n ? 0 : Number((part * 10_000n) / whole);
}

export function canonicalJson(value: Record<string, string | number>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function logFailure(step: string, error: unknown): void {
  console.error(
    JSON.stringify({
      execution: step,
      error: error instanceof Error ? error.name : 'unknown',
      status: error instanceof SoroswapError ? error.status : undefined,
      detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
    }),
  );
}

/** Fields every plan view shares, whatever the action. */
export function basePlanView(row: PlanRow) {
  const result = row.result ? (JSON.parse(row.result) as { ledger?: number }) : null;
  return {
    id: row.id,
    status: row.status,
    network: row.network,
    account: row.account_id,
    digest: row.digest,
    policy: JSON.parse(row.policy) as Decision,
    maxFee: { symbol: 'XLM', amount: formatRawAmount(rawFromText(row.max_fee_stroops), XLM_DECIMALS) },
    txHash: row.tx_hash,
    ledger: result?.ledger ?? null,
    errorCode: row.error_code,
    explorerUrl: row.tx_hash
      ? `https://stellar.expert/explorer/${row.network === 'mainnet' ? 'public' : 'testnet'}/tx/${row.tx_hash}`
      : null,
  };
}

export function feeView(stroops: string) {
  return { symbol: 'XLM', amount: formatRawAmount(rawFromText(stroops), XLM_DECIMALS) };
}

export function firstBlock(decision: Decision): string | null {
  return decision.verdict === 'block' ? (decision.reasons.find((reason) => !reason.pass)?.code ?? null) : null;
}
