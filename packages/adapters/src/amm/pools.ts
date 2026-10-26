import { aquariusBase } from '@nest/data/aquarius';
import type { StellarNetwork } from '@nest/domain/network';
import { Account, Address, Contract, rpc, scValToNative, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { SOROSWAP_CONTRACTS } from '../soroswap/contracts.ts';
import { HORIZON_URLS } from '../stellar/accounts.ts';
import { swapAsset } from '../stellar/assets.ts';
import { NETWORK_PASSPHRASES } from '../stellar/networks.ts';
import type { PoolReserves } from './arbitrage.ts';

/** AMMs Nest can watch for the XLM/USDC pair. Monitoring reads reserves only; it never trades. */
export const ARB_VENUES = ['aquarius', 'soroswap', 'stellar_amm'] as const;
export type ArbVenue = (typeof ARB_VENUES)[number];

export const VENUE_LABELS: Record<ArbVenue, string> = {
  aquarius: 'Aquarius',
  soroswap: 'Soroswap',
  stellar_amm: 'Stellar AMM',
};

export interface PoolReading extends PoolReserves {
  venue: ArbVenue;
  /** The pool contract, or the classic liquidity pool ID for the Stellar AMM. */
  poolId: string;
  observedAtMs: number;
  /** The ledger the reading reflects, when the source reports it. */
  ledger: number | null;
}

/** The pool exists but cannot be read for this pair on this network; the reason is shown as-is. */
export class PoolUnavailable extends Error {
  override name = 'PoolUnavailable';
}

/** Soroswap pairs charge 0.3% on the amount in (soroswap/core pair contract, 997/1000). */
const SOROSWAP_FEE_BPS = 30;
const TIMEOUT_MS = 10_000;
/** Simulation needs a source account but reads nothing from it; this is the all-zero key. */
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const AQUARIUS_CACHE_MS = 10 * 60_000;

const AquariusPoolsSchema = z.object({
  results: z.array(
    z.looseObject({
      address: z.string().regex(/^C[A-Z2-7]{55}$/),
      tokens_addresses: z.array(z.string()),
      pool_type: z.string(),
    }),
  ),
});
const LiquidityPoolsSchema = z.object({
  _embedded: z.object({
    records: z.array(
      z.looseObject({
        id: z.string().regex(/^[0-9a-f]{64}$/),
        fee_bp: z.number().int().min(0).max(10_000),
        last_modified_ledger: z.number().int(),
        reserves: z.array(z.object({ asset: z.string(), amount: z.string().regex(/^\d+(\.\d{1,7})?$/) })).length(2),
      }),
    ),
  }),
});

const aquariusPools = new Map<StellarNetwork, { atMs: number; address: string }>();

export interface PoolReaderOptions {
  network: StellarNetwork;
  rpcUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Reads the XLM/USDC reserves of one venue's pool, live from the chain or Horizon. */
export async function readPool(venue: ArbVenue, options: PoolReaderOptions): Promise<PoolReading> {
  if (venue === 'stellar_amm') return readStellarAmm(options);
  if (venue === 'soroswap') return readSoroswap(options);
  return readAquarius(options);
}

function pair(network: StellarNetwork) {
  const xlm = swapAsset(network, 'XLM');
  const usdc = swapAsset(network, 'USDC');
  return { xlm, usdc };
}

async function readSoroswap(options: PoolReaderOptions): Promise<PoolReading> {
  const { xlm, usdc } = pair(options.network);
  const router = SOROSWAP_CONTRACTS[options.network].router;
  const pairId = await simulate(options, router, 'router_pair_for', [
    new Address(xlm.ref.contractId).toScVal(),
    new Address(usdc.ref.contractId).toScVal(),
  ]);
  if (typeof pairId !== 'string' || !/^C[A-Z2-7]{55}$/.test(pairId)) {
    throw new PoolUnavailable('Soroswap has no XLM/USDC pair on this network.');
  }
  const [token0, reserves] = await Promise.all([
    simulate(options, pairId, 'token_0', []),
    simulate(options, pairId, 'get_reserves', []),
  ]);
  const [r0, r1] = bigintPair(reserves, 'Soroswap');
  const xlmFirst = token0 === xlm.ref.contractId;
  if (!xlmFirst && token0 !== usdc.ref.contractId) throw new PoolUnavailable('The Soroswap pair holds other tokens.');
  return reading(options, 'soroswap', pairId, xlmFirst ? r0 : r1, xlmFirst ? r1 : r0, SOROSWAP_FEE_BPS, null);
}

async function readAquarius(options: PoolReaderOptions): Promise<PoolReading> {
  const { xlm, usdc } = pair(options.network);
  const pool = await aquariusPool(options);
  // Confirm on chain that the indexed address is the pool for exactly these two tokens.
  const [tokens, reserves, fee] = await Promise.all([
    simulate(options, pool.address, 'get_tokens', []),
    simulate(options, pool.address, 'get_reserves', []),
    simulate(options, pool.address, 'get_fee_fraction', []),
  ]);
  if (!Array.isArray(tokens) || tokens.length !== 2)
    throw new PoolUnavailable('The Aquarius pool did not list its tokens.');
  const xlmIndex = tokens.indexOf(xlm.ref.contractId);
  if (xlmIndex === -1 || !tokens.includes(usdc.ref.contractId)) {
    throw new PoolUnavailable('The Aquarius pool holds other tokens.');
  }
  const amounts = bigintPair(reserves, 'Aquarius');
  return reading(
    options,
    'aquarius',
    pool.address,
    amounts[xlmIndex] ?? 0n,
    amounts[1 - xlmIndex] ?? 0n,
    // The pool's own fee, in basis points.
    Number(fee),
    null,
  );
}

/** The deepest constant-product XLM/USDC pool Aquarius indexes, cached for a few minutes. */
async function aquariusPool(options: PoolReaderOptions) {
  const now = options.now?.() ?? Date.now();
  const cached = aquariusPools.get(options.network);
  if (cached && now - cached.atMs < AQUARIUS_CACHE_MS) return cached;
  const { xlm, usdc } = pair(options.network);
  const tokens = [xlm.ref.contractId, usdc.ref.contractId].sort();
  const body = await getJson(
    `${aquariusBase(options.network)}/api/external/v2/pools/?tokens__in=${tokens.join(',')}&size=50`,
    options,
  );
  const parsed = AquariusPoolsSchema.safeParse(body);
  if (!parsed.success) throw new Error('Aquarius returned an unexpected pool list.');
  const candidates = parsed.data.results.filter(
    (pool) =>
      pool.pool_type === 'constant_product' &&
      pool.tokens_addresses.length === 2 &&
      tokens.every((token) => pool.tokens_addresses.includes(token)),
  );
  if (!candidates.length) {
    throw new PoolUnavailable('Aquarius has no constant-product XLM/USDC pool on this network.');
  }
  const depths = await Promise.all(
    candidates.slice(0, 4).map(async (pool) => {
      const reserves = await simulate(options, pool.address, 'get_reserves', []).catch(() => null);
      const total = Array.isArray(reserves) ? reserves.reduce((sum: bigint, value) => sum + BigInt(value), 0n) : 0n;
      return { pool, total };
    }),
  );
  depths.sort((left, right) => (right.total > left.total ? 1 : -1));
  const deepest = depths[0]?.pool;
  if (!deepest) throw new PoolUnavailable('Aquarius has no readable XLM/USDC pool on this network.');
  const chosen = { atMs: now, address: deepest.address };
  aquariusPools.set(options.network, chosen);
  return chosen;
}

async function readStellarAmm(options: PoolReaderOptions): Promise<PoolReading> {
  const { usdc } = pair(options.network);
  const asset = `${usdc.classic.getCode()}:${usdc.classic.getIssuer()}`;
  const body = await getJson(`${HORIZON_URLS[options.network]}/liquidity_pools?reserves=native,${asset}`, options);
  const parsed = LiquidityPoolsSchema.safeParse(body);
  if (!parsed.success) throw new Error('Horizon returned an unexpected liquidity pool list.');
  const pool = parsed.data._embedded.records[0];
  if (!pool) throw new PoolUnavailable('The Stellar AMM has no XLM/USDC pool on this network.');
  const xlm = pool.reserves.find((reserve) => reserve.asset === 'native');
  const quote = pool.reserves.find((reserve) => reserve.asset === asset);
  if (!xlm || !quote) throw new PoolUnavailable('The Stellar AMM pool holds other assets.');
  return reading(
    options,
    'stellar_amm',
    pool.id,
    raw(xlm.amount),
    raw(quote.amount),
    pool.fee_bp,
    pool.last_modified_ledger,
  );
}

function reading(
  options: PoolReaderOptions,
  venue: ArbVenue,
  poolId: string,
  baseReserveRaw: bigint,
  quoteReserveRaw: bigint,
  feeBps: number,
  ledger: number | null,
): PoolReading {
  if (baseReserveRaw <= 0n || quoteReserveRaw <= 0n)
    throw new PoolUnavailable(`The ${VENUE_LABELS[venue]} pool is empty.`);
  return {
    venue,
    poolId,
    baseReserveRaw,
    quoteReserveRaw,
    feeBps,
    ledger,
    observedAtMs: options.now?.() ?? Date.now(),
  };
}

async function simulate(options: PoolReaderOptions, contractId: string, method: string, args: xdr.ScVal[]) {
  const server = new rpc.Server(options.rpcUrl);
  const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASES[options.network],
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation) || !simulation.result) {
    throw new Error(`Reading ${method} failed in simulation.`);
  }
  return scValToNative(simulation.result.retval) as unknown;
}

async function getJson(url: string, options: PoolReaderOptions): Promise<unknown> {
  const response = await (options.fetch ?? fetch)(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}.`);
  return response.json();
}

function bigintPair(value: unknown, venue: string): [bigint, bigint] {
  if (!Array.isArray(value) || value.length !== 2) throw new PoolUnavailable(`The ${venue} pool returned no reserves.`);
  return [BigInt(value[0] as bigint), BigInt(value[1] as bigint)];
}

function raw(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
}
