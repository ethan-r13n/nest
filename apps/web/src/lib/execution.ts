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

export interface Plan {
  id: string;
  status: PlanStatus;
  network: 'mainnet' | 'testnet';
  account: string;
  digest: string;
  quote: Quote;
  policy: {
    verdict: 'allow' | 'warn' | 'block';
    reasons: { pass: boolean; code: string; detail: string; severity: 'block' | 'warn' }[];
  };
  maxFee: AssetAmount;
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
  txHash: string | null;
  received: AssetAmount | null;
  errorCode: string | null;
  explorerUrl: string | null;
}

export class ExecutionRequestError extends Error {
  override name = 'ExecutionRequestError';
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
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
  quote: async (intentId: string) =>
    (await call<{ quotes: Quote[] }>(`/api/intents/${intentId}/compare`, { method: 'POST' })).quotes[0],
  plan: (input: { intentId: string; quoteId: string; accountId: string }) =>
    call<Plan>('/api/plans', { method: 'POST', body: input, headers: { 'idempotency-key': crypto.randomUUID() } }),
  prepare: (planId: string) => call<Plan>(`/api/plans/${planId}/prepare`, { method: 'POST' }),
  approve: (plan: Plan) =>
    call<Plan>(`/api/plans/${plan.id}/approve`, {
      method: 'POST',
      body: { digest: plan.digest, preparedHash: plan.prepared?.hash },
    }),
  submit: (planId: string, signedXdr: string) =>
    call<Plan>(`/api/plans/${planId}/submit`, { method: 'POST', body: { signedXdr } }),
  read: (planId: string) => call<Plan>(`/api/plans/${planId}`),
};

/** Plain-language reasons for the stable codes a plan can stop with. */
export function planProblem(plan: Plan): string | null {
  switch (plan.errorCode) {
    case null:
      return null;
    case 'QUOTE_EXPIRED':
    case 'TRANSACTION_EXPIRED':
      return 'The quote expired before it was used. Get a new quote.';
    case 'MIN_OUT_TOO_LOW':
      return 'The built transaction accepted less than the reviewed minimum, so Nest stopped it.';
    case 'SIMULATION_FAILED':
      return 'The swap failed in simulation. Your balance or trustline may not cover it.';
    case 'SIMULATED_OUTPUT_TOO_LOW':
      return 'Simulation returned less than the minimum. Get a new quote.';
    case 'REJECTED':
      return 'The network rejected the transaction. Nothing was swapped.';
    case 'FAILED_ON_CHAIN':
      return 'The transaction failed on chain. Nothing was swapped except the network fee.';
    case 'NOT_INCLUDED':
      return 'The transaction expired without being included. Nothing was swapped.';
    default:
      return `Nest stopped this swap (${plan.errorCode}).`;
  }
}

export function venueName(venue: Quote['venue'] | undefined): string {
  return venue === 'sdex' ? 'Stellar DEX' : 'Soroswap';
}
