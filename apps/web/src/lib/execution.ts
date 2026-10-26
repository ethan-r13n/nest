/** Typed calls to Nest's intent → quote → plan → prepare → approve → submit endpoints. */

interface AssetAmount {
  symbol: string;
  amount: string;
}

export interface Intent {
  id: string;
  network: 'mainnet' | 'testnet';
  sell: AssetAmount;
  buy: { symbol: string };
}

export interface Quote {
  id: string;
  venue: 'soroswap' | 'sdex';
  sell: AssetAmount;
  expectedOut: AssetAmount;
  minimumOut: AssetAmount;
  slippageBps: number;
  priceImpactBps: number | null;
  protocols: string[];
  nestFeeBps: number;
  expiresAt: string;
}

type PlanStatus =
  | 'policy_checked'
  | 'blocked'
  | 'awaiting_review'
  | 'awaiting_signature'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'expired';

interface PlanBase {
  id: string;
  status: PlanStatus;
  network: 'mainnet' | 'testnet';
  account: string;
  digest: string;
  policy: {
    verdict: 'allow' | 'warn' | 'block';
    reasons: { pass: boolean; code: string; detail: string; severity: 'block' | 'warn' }[];
  };
  maxFee: AssetAmount;
  prepared: { xdr: string; hash: string; networkPassphrase: string; validUntil: string | null } | null;
  txHash: string | null;
  ledger: number | null;
  errorCode: string | null;
  explorerUrl: string | null;
}

export interface Plan extends PlanBase {
  kind: 'swap';
  quote: Quote;
  prepared: {
    xdr: string;
    hash: string;
    networkPassphrase: string;
    route: 'soroban' | 'classic';
    enforcedMinimumOut: AssetAmount;
    simulatedOut: AssetAmount | null;
    fee: AssetAmount;
    providerFee: AssetAmount & { bps: number };
    validUntil: string | null;
  } | null;
  received: AssetAmount | null;
}

export type LendingKind = 'supply' | 'borrow' | 'repay' | 'withdraw' | 'withdraw_collateral';
type LendingRequestType = 'supply' | 'supplyCollateral' | 'borrow' | 'repay' | 'withdraw' | 'withdrawCollateral';

/** Repay and withdraw act on a position the connected wallet already holds. */
export function isExitKind(kind: LendingKind): kind is 'repay' | 'withdraw' | 'withdraw_collateral' {
  return kind === 'repay' || kind === 'withdraw' || kind === 'withdraw_collateral';
}

export interface LendingIntent {
  id: string;
  network: 'mainnet' | 'testnet';
  kind: LendingKind;
  /** `amount` is "all" when the whole position is repaid or withdrawn. */
  asset: AssetAmount;
  wholePosition: boolean;
  collateral: (Partial<AssetAmount> & { symbol: string }) | null;
}

export interface LendingOffer {
  id: string;
  kind: LendingKind;
  /** Blend for lending and exits; borrows also compare XOXNO. */
  venue: 'blend' | 'xoxno';
  pool: { id: string; name: string; status: string };
  asset: AssetAmount;
  collateral: AssetAmount | null;
  supplyApyPct: number;
  borrowApyPct: number;
  utilizationPct: number;
  available: AssetAmount;
  estimatedHealth: number | null;
  targetHealth: number | null;
  /** Repay and withdraw: what the account holds in this pool now and what the request asks for. */
  position: {
    held: AssetAmount;
    kind: 'debt' | 'supplied' | 'collateral';
    health: number | null;
    requested: AssetAmount;
  } | null;
  withdrawalTiming: { lockup: string; cooldown: string; summary: string };
  nestFeeBps: number;
  expiresAt: string;
}

export interface LendingComparison {
  quotes: LendingOffer[];
  selectedQuoteId: string | null;
  excluded: { poolId: string; name: string; reason: string }[];
}

export interface LendingPlan extends PlanBase {
  kind: LendingKind;
  offer: LendingOffer;
  prepared: {
    xdr: string;
    hash: string;
    networkPassphrase: string;
    fee: AssetAmount;
    requests: (AssetAmount & { type: LendingRequestType })[];
    health: { before: number | null; after: number | null; warning: boolean };
    /** XOXNO loans take two transactions: the collateral, then the loan. Null on Blend. */
    step: 'collateral' | 'borrow' | 'repay' | 'withdraw' | null;
    accountId?: string | null;
    validUntil: string | null;
  } | null;
}

export interface LendingMarkets {
  network: 'mainnet' | 'testnet';
  markets: {
    poolId: string;
    name: string;
    statusLabel: string;
    canSupply: boolean;
    canBorrow: boolean;
    reserves: {
      symbol: 'USDC' | 'XLM';
      supplyApyPct: number;
      borrowApyPct: number;
      utilizationPct: number;
      availableRaw: string;
      collateralFactor: number;
    }[];
    observedAtMs: number;
  }[];
}

export interface VaultSummary {
  address: string;
  name: string;
  symbol: 'USDC' | 'XLM' | null;
  assetContract: string;
  apyPct: number | null;
  totalRaw: string;
  idleRaw: string;
  investedRaw: string;
  vaultFeeBps: number;
  defindexFeeBps: number;
  strategies: { name: string; paused: boolean }[];
  asset: { code: 'USDC' | 'XLM'; issuer: string | null } | null;
}

export interface VaultOffer {
  id: string;
  kind: 'vault_deposit';
  vault: { id: string; name: string };
  asset: AssetAmount;
  minimum: AssetAmount;
  apyPct: number | null;
  total: AssetAmount;
  invested: AssetAmount;
  fees: { vaultFeeBps: number; defindexFeeBps: number };
  strategies: { name: string; paused: boolean }[];
  verified: boolean;
  invest: boolean;
  withdrawalTiming: { lockup: string; cooldown: string; summary: string };
  nestFeeBps: number;
  expiresAt: string;
}

export interface VaultIntent {
  id: string;
  network: 'mainnet' | 'testnet';
  kind: 'vault_deposit';
  asset: AssetAmount;
  vault: { id: string; name?: string };
}

export interface VaultPlan extends PlanBase {
  kind: 'vault_deposit';
  offer: VaultOffer;
  prepared: {
    xdr: string;
    hash: string;
    networkPassphrase: string;
    fee: AssetAmount;
    deposit: AssetAmount;
    minimum: AssetAmount;
    invest: boolean;
    validUntil: string | null;
  } | null;
}

interface VaultShares {
  symbol: 'shares';
  amount: string;
  raw: string;
  decimals: number;
}

export interface VaultPosition {
  vault: { id: string; name: string };
  shares: VaultShares;
  underlying: AssetAmount & { raw: string };
  assetContract: string;
  withdrawalTiming: { lockup: string; cooldown: string; summary: string };
  verified: boolean;
}

export type VaultPositions =
  | { network: 'mainnet' | 'testnet'; available: true; positions: VaultPosition[] }
  | { network: 'mainnet' | 'testnet'; available: false; reason: string; positions: [] };

export interface VaultWithdrawIntent {
  id: string;
  network: 'mainnet' | 'testnet';
  kind: 'vault_withdraw';
  asset: AssetAmount;
  vault: { id: string; name?: string };
  wholePosition: boolean;
}

export interface VaultWithdrawOffer {
  id: string;
  kind: 'vault_withdraw';
  vault: { id: string; name: string };
  asset: AssetAmount;
  minimum: AssetAmount;
  shares: VaultShares;
  position: { account: string; shares: VaultShares };
  withdrawalTiming: { lockup: string; cooldown: string; summary: string };
  expiresAt: string;
}

export interface VaultWithdrawPlan extends PlanBase {
  kind: 'vault_withdraw';
  offer: VaultWithdrawOffer;
  prepared: {
    xdr: string;
    hash: string;
    networkPassphrase: string;
    fee: AssetAmount;
    shares: VaultShares;
    expected: AssetAmount;
    minimum: AssetAmount;
    validUntil: string | null;
  } | null;
}

/** On Testnet, swaps, Blend and Aquarius each list a different USDC, so the trustline depends on the feature. */
export type TrustlineUse = 'swap' | 'lending' | 'aquarius' | 'xoxno';

type LimitKind = 'limit_order' | 'limit_close';

export interface LimitIntent {
  id: string;
  network: 'mainnet' | 'testnet';
  kind: LimitKind;
  side: 'buy' | 'sell' | null;
  deposit: AssetAmount | null;
  limitPrice: number | null;
  poolId: string | null;
  band: { tickLower: number; tickUpper: number } | null;
}

export interface LimitOffer {
  id: string;
  kind: LimitKind;
  pool: { id: string; name: string; feeBps: number };
  /** USDC per XLM in the pool now. */
  currentPrice: number;
  band: { tickLower: number; tickUpper: number; prices: [number, number] };
  order: {
    side: 'buy' | 'sell';
    limitPrice: number;
    deposit: AssetAmount;
    /** Held once the price has crossed the whole band; earned swap fees come on top. */
    onFill: AssetAmount;
    fillStartsAt: number;
    fillCompletesAt: number;
  } | null;
  /** A close: what withdrawing returns now, earned fees included, and the fees within it. */
  position: { returns: [AssetAmount, AssetAmount]; fees: [AssetAmount, AssetAmount] } | null;
  nestFeeBps: number;
  expiresAt: string;
}

export interface LimitPlan extends PlanBase {
  kind: LimitKind;
  offer: LimitOffer;
  prepared: {
    xdr: string;
    hash: string;
    networkPassphrase: string;
    fee: AssetAmount;
    method: string;
    validUntil: string | null;
  } | null;
}

export type LimitPool =
  | {
      available: true;
      poolId: string;
      name: string;
      usdcPerXlm: number;
      feeBps: number;
      tickSpacing: number;
      depositsEnabled: boolean;
      usdcIssuer: string;
      observedAt: string;
    }
  | { available: false; reason: string };

export interface LimitOrderRow {
  poolId: string;
  tickLower: number;
  tickUpper: number;
  prices: [number, number];
  side: 'buy' | 'sell' | null;
  limitPrice: number | null;
  status: 'waiting' | 'filling' | 'filled' | 'in_range' | 'out_of_range';
  returns: [AssetAmount, AssetAmount];
  fees: [AssetAmount, AssetAmount];
}

export type LimitOrders =
  | { available: true; currentPrice: number; orders: LimitOrderRow[] }
  | { available: false; reason: string; orders: LimitOrderRow[] };

export type SwapSymbol = 'XLM' | 'USDC';

/** What the wallet can spend now: XLM after its reserve; null without a trustline. */
export interface SwapBalances {
  network: 'mainnet' | 'testnet';
  funded: boolean;
  balances: { symbol: SwapSymbol; spendable: string | null }[];
}

/** A plan of the wallet's that reached the network: what left it and what came back. */
export interface ActivityItem {
  id: string;
  kind: string;
  status: PlanStatus;
  createdAt: string;
  txHash: string | null;
  explorerUrl: string | null;
  errorCode: string | null;
  title: string;
  venue: string;
  sent: AssetAmount[];
  received: AssetAmount[];
}

/** The wallet's Blend positions and XOXNO accounts; each side says when it could not be read. */
export interface LendingPositions {
  network: 'mainnet' | 'testnet';
  blend:
    | {
        available: true;
        pools: {
          poolId: string;
          name: string;
          health: number | null;
          positions: {
            symbol: string;
            supplied: AssetAmount;
            collateral: AssetAmount;
            debt: AssetAmount;
            supplyApyPct: number;
            borrowApyPct: number;
          }[];
        }[];
      }
    | { available: false; reason: string; pools: [] };
  xoxno:
    | {
        available: true;
        name: string;
        poolId?: string;
        accounts: {
          accountId: string;
          spokeId: number;
          collateral: AssetAmount[];
          debt: AssetAmount[];
          healthFactor: number | null;
        }[];
      }
    | { available: false; reason: string; accounts: [] };
}

interface PreparedTrustline {
  asset: { code: string; issuer: string };
  xdr: string;
  hash: string;
  networkPassphrase: string;
}

export class ExecutionRequestError extends Error {
  override name = 'ExecutionRequestError';
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<NoInfer<T>> {
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ExecutionRequestError(error?.message ?? 'The request failed.', error?.code);
  }
  return body as T;
}

export const execution = {
  intent: (id: string) => call<Intent>(`/api/intents/${id}`),
  createSwap: (input: { sellAsset: SwapSymbol; buyAsset: SwapSymbol; sellAmount: string }) =>
    call<Intent>('/api/intents', { method: 'POST', body: { kind: 'swap', ...input } }),
  balances: (account: string) => call<SwapBalances>(`/api/balances?account=${encodeURIComponent(account)}`),
  positions: (account: string) => call<LendingPositions>(`/api/positions?account=${encodeURIComponent(account)}`),
  activity: (account: string) =>
    call<{ network: 'mainnet' | 'testnet'; items: ActivityItem[] }>(
      `/api/plans?account=${encodeURIComponent(account)}`,
    ),
  lendingIntent: (id: string) => call<LendingIntent>(`/api/intents/${id}`),
  createLending: (input: {
    kind: LendingKind;
    asset: 'USDC' | 'XLM';
    amount: string;
    poolId?: string;
    lendingAccountId?: string;
  }) => call<LendingIntent>('/api/intents', { method: 'POST', body: input }),
  compareLending: (intentId: string, accountId?: string) =>
    call<LendingComparison>(`/api/intents/${intentId}/compare`, {
      method: 'POST',
      ...(accountId ? { body: { accountId } } : {}),
    }),
  lendingMarkets: () => call<LendingMarkets>('/api/markets/lending'),
  vaults: () => call<{ network: 'mainnet' | 'testnet'; vaults: VaultSummary[] }>('/api/vaults'),
  vaultPositions: (account: string) =>
    call<VaultPositions>(`/api/vaults/positions?account=${encodeURIComponent(account)}`),
  createVaultWithdraw: (input: { vaultId: string; amount: string }) =>
    call<VaultWithdrawIntent>('/api/intents', { method: 'POST', body: { kind: 'vault_withdraw', ...input } }),
  compareVaultWithdraw: (intentId: string, accountId: string) =>
    call<{ quotes: VaultWithdrawOffer[]; selectedQuoteId: string | null; excluded: LendingComparison['excluded'] }>(
      `/api/intents/${intentId}/compare`,
      { method: 'POST', body: { accountId } },
    ),
  vaultIntent: (id: string) => call<VaultIntent>(`/api/intents/${id}`),
  createVaultDeposit: (input: { vaultId: string; amount: string }) =>
    call<VaultIntent>('/api/intents', { method: 'POST', body: { kind: 'vault_deposit', ...input } }),
  compareVault: (intentId: string) =>
    call<{ quotes: VaultOffer[]; selectedQuoteId: string | null; excluded: LendingComparison['excluded'] }>(
      `/api/intents/${intentId}/compare`,
      { method: 'POST' },
    ),
  limitIntent: (id: string) => call<LimitIntent>(`/api/intents/${id}`),
  createLimitOrder: (input: { side: 'buy' | 'sell'; amountXlm: string; priceUsdc: string }) =>
    call<LimitIntent>('/api/intents', { method: 'POST', body: { kind: 'limit_order', ...input } }),
  createLimitClose: (input: { poolId: string; tickLower: number; tickUpper: number }) =>
    call<LimitIntent>('/api/intents', { method: 'POST', body: { kind: 'limit_close', ...input } }),
  compareLimit: (intentId: string, accountId?: string) =>
    call<{ quotes: LimitOffer[]; selectedQuoteId: string }>(`/api/intents/${intentId}/compare`, {
      method: 'POST',
      ...(accountId ? { body: { accountId } } : {}),
    }),
  limitPool: () => call<LimitPool>('/api/limit-orders/pool'),
  limitOrders: (account: string) => call<LimitOrders>(`/api/limit-orders?account=${encodeURIComponent(account)}`),
  trustline: (input: { accountId: string; use: TrustlineUse }) =>
    call<PreparedTrustline>('/api/trustlines', { method: 'POST', body: input }),
  submitTrustline: (input: { accountId: string; use: TrustlineUse; signedXdr: string }) =>
    call<{ status: 'confirmed' | 'pending'; txHash: string }>('/api/trustlines/submit', {
      method: 'POST',
      body: input,
    }),
  quote: async (intentId: string) =>
    (await call<{ quotes: Quote[] }>(`/api/intents/${intentId}/compare`, { method: 'POST' })).quotes[0],
  plan: <T extends PlanBase = Plan>(input: { intentId: string; quoteId: string; accountId: string }) =>
    call<T>('/api/plans', { method: 'POST', body: input, headers: { 'idempotency-key': crypto.randomUUID() } }),
  prepare: <T extends PlanBase = Plan>(planId: string) => call<T>(`/api/plans/${planId}/prepare`, { method: 'POST' }),
  approve: <T extends PlanBase>(plan: T) =>
    call<T>(`/api/plans/${plan.id}/approve`, {
      method: 'POST',
      body: { digest: plan.digest, preparedHash: plan.prepared?.hash },
    }),
  submit: <T extends PlanBase = Plan>(planId: string, signedXdr: string) =>
    call<T>(`/api/plans/${planId}/submit`, { method: 'POST', body: { signedXdr } }),
  read: <T extends PlanBase = Plan>(planId: string) => call<T>(`/api/plans/${planId}`),
};

const POLL_MS = 2_000;
const POLL_LIMIT_MS = 90_000;

/**
 * Approves a prepared plan, has the wallet sign exactly its transaction, submits it and follows it
 * until it settles or the wait runs out. Reports each plan state it sees.
 */
export async function signAndSubmit<T extends PlanBase>(
  plan: T,
  options: {
    sign(xdr: string, networkPassphrase: string): Promise<string>;
    onSigned(): void;
    onUpdate(plan: NoInfer<T>): void;
    stillWatching(): boolean;
  },
): Promise<NoInfer<T>> {
  if (!plan.prepared) return plan;
  const approved = await execution.approve(plan);
  if (approved.status !== 'awaiting_signature') return approved;
  const signedXdr = await options.sign(plan.prepared.xdr, plan.prepared.networkPassphrase);
  options.onSigned();
  let current = await execution.submit<T>(plan.id, signedXdr);
  const started = Date.now();
  while (
    (current.status === 'submitted' || current.status === 'confirming') &&
    Date.now() - started < POLL_LIMIT_MS &&
    options.stillWatching()
  ) {
    options.onUpdate(current);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    current = await execution.read<T>(plan.id);
  }
  return current;
}

export function isPending(plan: PlanBase): boolean {
  return plan.status === 'submitted' || plan.status === 'confirming';
}

/** Plain-language reasons for the stable codes a plan can stop with. */
export function planProblem(plan: PlanBase): string | null {
  switch (plan.errorCode) {
    case null:
      return null;
    case 'QUOTE_EXPIRED':
    case 'TRANSACTION_EXPIRED':
      return 'The quote expired before it was used. Get a new quote.';
    case 'MIN_OUT_TOO_LOW':
      return 'The built transaction accepted less than the reviewed minimum, so Nest stopped it.';
    case 'SIMULATION_FAILED':
      return 'It failed in simulation. Your balance or trustline may not cover it.';
    case 'SIMULATED_OUTPUT_TOO_LOW':
      return 'Simulation returned less than the minimum. Get a new quote.';
    case 'REJECTED':
      return 'The network rejected the transaction. Nothing changed.';
    case 'FAILED_ON_CHAIN':
      return 'The transaction failed on chain. Nothing changed except the network fee.';
    case 'NOT_INCLUDED':
      return 'The transaction expired without being included. Nothing changed.';
    case 'VAULT_UNVERIFIED':
      return 'The vault no longer runs DeFindex’s published vault code, so Nest stopped this.';
    case 'AMOUNT_MISMATCH':
      return 'The built transaction did not match what you reviewed, so Nest stopped it.';
    case 'HEALTH_TOO_LOW':
      return 'This would leave your loan at or below the point where Blend liquidates. Repay first, or use a smaller amount.';
    case 'POOL_STATUS':
      return 'The pool does not allow this action in its current status.';
    case 'LIQUIDITY_INSUFFICIENT':
      return 'The pool does not have enough liquidity for this loan right now.';
    case 'TRUSTLINE_MISSING':
      return 'Your account needs a trustline for this asset first.';
    case 'INSUFFICIENT_BALANCE':
      return 'Your balance does not cover this, including the network reserve and fee.';
    case 'PRICE_MOVED':
      return 'The price moved into your band before signing, so it would no longer be a one-sided order. Review it again.';
    case 'ARGUMENTS_MISMATCH':
    case 'REQUESTS_MISMATCH':
    case 'AUTH_UNEXPECTED':
      return 'The built transaction did not match what you reviewed, so Nest stopped it.';
    default:
      return `Nest stopped this (${plan.errorCode}).`;
  }
}

export function venueName(venue: Quote['venue'] | undefined): string {
  return venue === 'sdex' ? 'Stellar DEX' : 'Soroswap';
}
