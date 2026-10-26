import type { StellarNetwork } from '@nest/domain/network';
import { z } from 'zod';

import { type SwapVenue, VenueRefusal } from '../venue.ts';

const BASE_URL = 'https://api.soroswap.finance';
const TIMEOUT_MS = 30_000;
/**
 * Route sources for market swaps. Classic SDEX is left out for now: Soroswap builds it as a path
 * payment plus a separate fee payment, valid for an hour, which the inspector does not accept.
 */
export const SWAP_PROTOCOLS = ['soroswap', 'aqua', 'sushi', 'comet'] as const;

export class SoroswapError extends Error {
  override name = 'SoroswapError';
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface SoroswapQuote {
  amountIn: bigint;
  amountOut: bigint;
  /** The least the swap may return after slippage; the built transaction must enforce at least this. */
  minAmountOut: bigint;
  /** Price impact in basis points, or null when the provider did not report one. */
  priceImpactBps: number | null;
  platform: string;
  protocols: string[];
  /** The provider's quote, passed back unchanged to build the transaction. */
  raw: Record<string, unknown>;
}

export interface QuoteRequest {
  network: StellarNetwork;
  assetIn: string;
  assetOut: string;
  amountIn: bigint;
  slippageBps: number;
}

// Upstream amounts arrive as JSON; integers above 2^53 are only safe as strings.
const RawAmount = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((value, context) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    context.addIssue({ code: 'custom', message: 'unsafe integer amount' });
    return z.NEVER;
  }
  return BigInt(value);
});

const QuoteSchema = z.looseObject({
  assetIn: z.string(),
  assetOut: z.string(),
  amountIn: RawAmount,
  amountOut: RawAmount,
  otherAmountThreshold: RawAmount,
  priceImpactPct: z.union([z.string(), z.number()]).optional(),
  platform: z.string(),
  tradeType: z.literal('EXACT_IN'),
  routePlan: z.array(z.unknown()).optional(),
});

const BuildSchema = z.looseObject({ xdr: z.string().min(1) });
const TrustlineActionSchema = z.looseObject({ action: z.literal('CREATE_TRUSTLINE') });

export function createSoroswapClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const send = options.fetch ?? fetch;

  async function post(path: string, network: StellarNetwork, body: unknown): Promise<unknown> {
    const response = await send(`${BASE_URL}${path}?network=${network}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      if (path === '/quote/build' && response.status === 428) {
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
        if (TrustlineActionSchema.safeParse(body).success) {
          throw new VenueRefusal('TRUSTLINE_MISSING', 'Add the swap’s USDC trustline, then compare again.');
        }
      }
      throw new SoroswapError(`Soroswap ${path} answered ${response.status}: ${text.slice(0, 300)}`, response.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new SoroswapError(`Soroswap ${path} returned invalid JSON.`);
    }
  }

  return {
    async quote(request: QuoteRequest): Promise<SoroswapQuote> {
      const body = await post('/quote', request.network, {
        assetIn: request.assetIn,
        assetOut: request.assetOut,
        amount: request.amountIn.toString(),
        tradeType: 'EXACT_IN',
        protocols: SWAP_PROTOCOLS,
        slippageBps: request.slippageBps,
      });
      const parsed = QuoteSchema.safeParse(body);
      if (!parsed.success) throw new SoroswapError('Soroswap returned a quote Nest does not recognize.');
      const quote = parsed.data;
      // The quote must answer exactly the question asked.
      if (
        quote.assetIn !== request.assetIn ||
        quote.assetOut !== request.assetOut ||
        quote.amountIn !== request.amountIn
      ) {
        throw new SoroswapError('Soroswap quoted different assets or amounts than requested.');
      }
      if (quote.amountOut <= 0n || quote.otherAmountThreshold <= 0n || quote.otherAmountThreshold > quote.amountOut) {
        throw new SoroswapError('Soroswap returned an unusable output amount.');
      }
      return {
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        minAmountOut: quote.otherAmountThreshold,
        priceImpactBps: toBps(quote.priceImpactPct),
        platform: quote.platform,
        protocols: protocolsOf(quote.routePlan ?? []),
        raw: body as Record<string, unknown>,
      };
    },

    async build(request: { network: StellarNetwork; quote: Record<string, unknown>; from: string }): Promise<string> {
      // No referral or platform fee: Nest charges nothing on execution.
      const body = await post('/quote/build', request.network, {
        quote: request.quote,
        from: request.from,
        to: request.from,
      });
      const parsed = BuildSchema.safeParse(body);
      if (!parsed.success) throw new SoroswapError('Soroswap did not return a transaction.');
      return parsed.data.xdr;
    },
  };
}

export type SoroswapClient = ReturnType<typeof createSoroswapClient>;

function toBps(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const percent = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(percent) && percent >= 0 ? Math.round(percent * 100) : null;
}

function protocolsOf(routePlan: readonly unknown[]): string[] {
  const names = new Set<string>();
  for (const step of routePlan) {
    const protocol =
      (step as { swapInfo?: { protocol?: unknown }; protocol?: unknown })?.swapInfo?.protocol ??
      (step as { protocol?: unknown })?.protocol;
    if (typeof protocol === 'string') names.add(protocol);
  }
  return [...names];
}

/** Soroswap as a swap venue: quotes and builds through its aggregator by token contract. */
export function createSoroswapVenue(options: { apiKey: string; fetch?: typeof fetch }): SwapVenue {
  const client = createSoroswapClient(options);
  return {
    id: 'soroswap',
    quote: ({ network, sell, buy, amountIn, slippageBps }) =>
      client.quote({ network, assetIn: sell.ref.contractId, assetOut: buy.ref.contractId, amountIn, slippageBps }),
    build: (request) => client.build(request),
  };
}
