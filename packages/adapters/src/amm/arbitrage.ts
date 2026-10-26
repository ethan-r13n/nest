/** Live reserves of one constant-product pool, in raw seven-decimal units of the pair's assets. */
export interface PoolReserves {
  baseReserveRaw: bigint;
  quoteReserveRaw: bigint;
  /** The pool's swap fee, charged on the amount in. */
  feeBps: number;
}

export type ArbitrageDirection = 'buy_a_sell_b' | 'buy_b_sell_a';

export interface RoundTrip {
  /** Quote per base in each pool from its reserves, before fees and price impact. */
  priceA: number;
  priceB: number;
  /** How far apart the two prices are, relative to the lower one. */
  spreadBps: number;
  direction: ArbitrageDirection;
  sizeRaw: bigint;
  /** Base asset bought in the first pool and sold in the second. */
  baseRaw: bigint;
  returnRaw: bigint;
  /** Signed: what the round trip ends with minus what it started with, after both pools' fees. */
  profitRaw: bigint;
  profitBps: number;
}

const BPS = 10_000n;

/** Output of a constant-product swap with the fee taken from the input (x · y = k). */
export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const afterFee = amountIn * (BPS - BigInt(feeBps));
  return (afterFee * reserveOut) / (reserveIn * BPS + afterFee);
}

export function midPrice(pool: PoolReserves): number {
  return Number(pool.quoteReserveRaw) / Number(pool.baseReserveRaw);
}

/**
 * Spends `sizeRaw` of the quote asset buying base in one pool and sells all of it in the other,
 * in whichever direction ends with more. The result accounts for both pools' fees and price impact
 * at this size; it excludes network fees and any aggregator fee.
 */
export function roundTrip(a: PoolReserves, b: PoolReserves, sizeRaw: bigint): RoundTrip {
  if (sizeRaw <= 0n) throw new RangeError('The trade size must be above zero.');
  const leg = (buy: PoolReserves, sell: PoolReserves) => {
    const baseRaw = amountOut(sizeRaw, buy.quoteReserveRaw, buy.baseReserveRaw, buy.feeBps);
    return { baseRaw, returnRaw: amountOut(baseRaw, sell.baseReserveRaw, sell.quoteReserveRaw, sell.feeBps) };
  };
  const ab = leg(a, b);
  const ba = leg(b, a);
  const best =
    ab.returnRaw >= ba.returnRaw
      ? { ...ab, direction: 'buy_a_sell_b' as const }
      : { ...ba, direction: 'buy_b_sell_a' as const };
  const priceA = midPrice(a);
  const priceB = midPrice(b);
  const profitRaw = best.returnRaw - sizeRaw;
  return {
    priceA,
    priceB,
    spreadBps: (Math.abs(priceA - priceB) / Math.min(priceA, priceB)) * 10_000,
    direction: best.direction,
    sizeRaw,
    baseRaw: best.baseRaw,
    returnRaw: best.returnRaw,
    profitRaw,
    profitBps: Number((profitRaw * 1_000_000n) / sizeRaw) / 100,
  };
}
