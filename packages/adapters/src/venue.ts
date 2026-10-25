import type { StellarNetwork } from '@nest/domain/network';

import type { SwapAsset } from './stellar/assets.ts';

export type SwapVenueId = 'soroswap' | 'sdex';

export interface VenueQuote {
  amountIn: bigint;
  amountOut: bigint;
  /** The least the swap may return after slippage; the built transaction must enforce at least this. */
  minAmountOut: bigint;
  /** Price impact in basis points, or null when the venue does not report one. */
  priceImpactBps: number | null;
  platform: string;
  protocols: string[];
  /** The venue's own quote data, passed back unchanged to build the transaction. */
  raw: Record<string, unknown>;
}

/** A source of executable swaps: a quote, then an unsigned transaction for the user's account. */
export interface SwapVenue {
  id: SwapVenueId;
  quote(request: {
    network: StellarNetwork;
    sell: SwapAsset;
    buy: SwapAsset;
    amountIn: bigint;
    slippageBps: number;
  }): Promise<VenueQuote>;
  build(request: { network: StellarNetwork; quote: Record<string, unknown>; from: string }): Promise<string>;
  /** Classic routes return no value; the venue reads the amount received from the network's record. */
  receivedAmount?(txHash: string): Promise<bigint | null>;
}

/** A venue refusal the user can act on, with a stable code, as opposed to an outage. */
export class VenueRefusal extends Error {
  override name = 'VenueRefusal';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
