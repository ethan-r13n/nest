import type { StellarNetwork } from '@nest/domain/network';
import {
  Account,
  Address,
  Asset,
  buildInvocationTree,
  Contract,
  type InvocationTree,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import { loadClassicAccount, requireFunds } from '../stellar/accounts.ts';
import { fail, hex, parseTransaction, validUntil } from '../stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../stellar/networks.ts';
import { VenueRefusal } from '../venue.ts';

/**
 * Aquarius concentrated-liquidity pools Nest may place range orders in. A one-sided position in a
 * single tick band behaves as a limit order: it converts entirely to the other token once the
 * price crosses the band (docs.aqua.network/developers/concentrated-liquidity). Pools were found
 * in Aquarius' full pool catalog (amm-api.aqua.network/api/external/v2/pools) and checked on chain
 * on 2026-10-26: `get_tokens` returns XLM and that network's USDC, `pool_type` is concentrated.
 */
export interface RangePool {
  id: string;
  name: string;
  /** The USDC this pool lists; Aquarius' Testnet USDC is its own test asset, not Circle's. */
  usdcIssuer: string;
}

export const RANGE_POOLS: Record<StellarNetwork, readonly RangePool[]> = {
  mainnet: [
    {
      // XLM/USDC concentrated, 0.10% fee, tick spacing 20: bands about 0.2% wide.
      id: 'CBBMQBNHB2FYVZYV7VNHOJHUMTFJLR4PUMRVQYNW6RHIKZO2NQMIBUCV',
      name: 'Aquarius XLM/USDC concentrated',
      usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    },
  ],
  testnet: [
    // XLM/USDC concentrated, 1% fee, tick spacing 200, listing Aquarius' own Testnet USDC.
    {
      id: 'CAD5TBS4NKO35YDYZN3ULQFXDXVL7BPK4Q2RUG7N4DVPYNNOEAUAQJ6F',
      name: 'Aquarius XLM/USDC concentrated',
      usdcIssuer: 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER',
    },
  ],
};

export type LimitSide = 'buy' | 'sell';

export interface RangePoolState {
  poolId: string;
  name: string;
  /** The pool's token contracts in its own order (token0, token1). */
  tokens: [string, string];
  /** Which of the two tokens is USDC; the other is XLM. */
  usdcIndex: 0 | 1;
  tick: number;
  tickSpacing: number;
  tickBounds: [number, number];
  feeBps: number;
  depositsEnabled: boolean;
  usdcPerXlm: number;
  observedAtMs: number;
}

export interface Band {
  tickLower: number;
  tickUpper: number;
  /** The pool token index deposited: USDC to buy XLM, XLM to sell it. */
  depositIndex: 0 | 1;
  /** USDC per XLM at each edge of the band, in the order the price crosses them. */
  fillStartsAt: number;
  fillCompletesAt: number;
}

export type RangeCall =
  | {
      method: 'deposit_position';
      tickLower: number;
      tickUpper: number;
      amounts: readonly [bigint, bigint];
      minLiquidity: bigint;
    }
  | {
      method: 'withdraw_position';
      tickLower: number;
      tickUpper: number;
      liquidity: bigint;
      minAmounts: readonly [bigint, bigint];
    };

export interface RangePosition {
  liquidity: bigint;
  /** What a full withdrawal returns now, per pool token, earned swap fees included. */
  amounts: [bigint, bigint];
  /** The swap fees within `amounts`, per pool token. */
  fees: [bigint, bigint];
}

const TICK_BASE = 1.0001;
const INCLUSION_FEE_STROOPS = '1000';
const VALIDITY_SECONDS = 180;
/** Simulation needs a source account but reads nothing from it; this is the all-zero key. */
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
/** The pool's error when an account has no position in a band. */
const NO_POSITION_ERROR = 'Error(Contract, #2118)';

export function rangePool(network: StellarNetwork, poolId: string): RangePool | undefined {
  return RANGE_POOLS[network].find((pool) => pool.id === poolId);
}

export function rangeAssets(network: StellarNetwork, pool: RangePool) {
  const passphrase = NETWORK_PASSPHRASES[network];
  const usdc = new Asset('USDC', pool.usdcIssuer);
  const xlm = Asset.native();
  return {
    usdc: { classic: usdc, contractId: usdc.contractId(passphrase) },
    xlm: { classic: xlm, contractId: xlm.contractId(passphrase) },
  };
}

/** USDC per XLM at a tick, given which pool token is USDC. Pool price is token1 per token0 = 1.0001^tick. */
export function usdcPerXlmAt(tick: number, usdcIndex: 0 | 1): number {
  return usdcIndex === 0 ? TICK_BASE ** -tick : TICK_BASE ** tick;
}

function tickAt(usdcPerXlm: number, usdcIndex: 0 | 1): number {
  const tick = Math.log(usdcPerXlm) / Math.log(TICK_BASE);
  return usdcIndex === 0 ? -tick : tick;
}

/**
 * The single-spacing band that fills entirely at or better than `limitUsdcPerXlm`: a buy only
 * between the limit and below, a sell only between the limit and above. The band must sit on the
 * unfilled side of the current price, so the deposit is one token only.
 */
export function bandForLimit(
  side: LimitSide,
  limitUsdcPerXlm: number,
  pool: Pick<RangePoolState, 'tick' | 'tickSpacing' | 'tickBounds' | 'usdcIndex'>,
): Band {
  if (!(limitUsdcPerXlm > 0) || !Number.isFinite(limitUsdcPerXlm)) {
    throw new VenueRefusal('LIMIT_PRICE_INVALID', 'Enter a limit price above zero.');
  }
  const { tick, tickSpacing: spacing, usdcIndex } = pool;
  const depositIndex: 0 | 1 = side === 'buy' ? usdcIndex : usdcIndex === 0 ? 1 : 0;
  const target = tickAt(limitUsdcPerXlm, usdcIndex);
  // Token0 sits in bands above the current tick; token1 in bands below it.
  const tickLower =
    depositIndex === 0 ? Math.ceil(target / spacing) * spacing : Math.floor(target / spacing) * spacing - spacing;
  const tickUpper = tickLower + spacing;
  const unfilledSide = depositIndex === 0 ? tick < tickLower : tick > tickUpper;
  if (!unfilledSide) {
    throw new VenueRefusal(
      'LIMIT_ON_WRONG_SIDE',
      side === 'buy'
        ? 'A limit buy must be below the current price. Swap instead to buy now.'
        : 'A limit sell must be above the current price. Swap instead to sell now.',
    );
  }
  if (tickLower < pool.tickBounds[0] || tickUpper > pool.tickBounds[1]) {
    throw new VenueRefusal('LIMIT_PRICE_INVALID', 'That price is outside the range this pool supports.');
  }
  const near = usdcPerXlmAt(depositIndex === 0 ? tickLower : tickUpper, usdcIndex);
  const far = usdcPerXlmAt(depositIndex === 0 ? tickUpper : tickLower, usdcIndex);
  return { tickLower, tickUpper, depositIndex, fillStartsAt: near, fillCompletesAt: far };
}

/** What a band position holds once the price has crossed it completely, from its liquidity. */
export function filledAmount(band: Pick<Band, 'tickLower' | 'tickUpper' | 'depositIndex'>, liquidity: bigint): bigint {
  const lower = TICK_BASE ** (band.tickLower / 2);
  const upper = TICK_BASE ** (band.tickUpper / 2);
  const amount =
    band.depositIndex === 0 ? Number(liquidity) * (upper - lower) : Number(liquidity) * (1 / lower - 1 / upper);
  return BigInt(Math.floor(amount));
}

export interface RangeReaderOptions {
  network: StellarNetwork;
  rpcUrl: string;
  now?: () => number;
}

/** Reads a registered pool's tokens, price and settings, and checks its tokens are XLM and its USDC. */
export async function readRangePool(poolId: string, options: RangeReaderOptions): Promise<RangePoolState> {
  const pool = rangePool(options.network, poolId);
  if (!pool) throw new VenueRefusal('POOL_NOT_REGISTERED', 'That pool is not a registered Aquarius concentrated pool.');
  const [tokens, slot0, spacing, bounds, fee, killed] = await Promise.all([
    simulate(options, poolId, 'get_tokens'),
    simulate(options, poolId, 'get_slot0'),
    simulate(options, poolId, 'get_tick_spacing'),
    simulate(options, poolId, 'get_tick_bounds'),
    simulate(options, poolId, 'get_fee_fraction'),
    simulate(options, poolId, 'get_is_killed_deposit'),
  ]);
  const assets = rangeAssets(options.network, pool);
  if (!Array.isArray(tokens) || tokens.length !== 2) throw new Error('The pool did not list two tokens.');
  const [token0, token1] = tokens as [string, string];
  const usdcIndex = token0 === assets.usdc.contractId ? 0 : token1 === assets.usdc.contractId ? 1 : null;
  const xlmIndex = usdcIndex === null ? null : usdcIndex === 0 ? 1 : 0;
  if (usdcIndex === null || tokens[xlmIndex ?? 0] !== assets.xlm.contractId) {
    throw new VenueRefusal('POOL_TOKENS_CHANGED', 'The pool no longer holds the registered XLM and USDC.');
  }
  const tick = Number((slot0 as { tick: number }).tick);
  return {
    poolId,
    name: pool.name,
    tokens: [token0, token1],
    usdcIndex,
    tick,
    tickSpacing: Number(spacing),
    tickBounds: [Number((bounds as number[])[0]), Number((bounds as number[])[1])],
    feeBps: Number(fee),
    depositsEnabled: killed === false,
    usdcPerXlm: usdcPerXlmAt(tick, usdcIndex),
    observedAtMs: options.now?.() ?? Date.now(),
  };
}

/** The tokens a deposit would use and the liquidity it would mint, from the pool's own estimate. */
export async function estimateRangeDeposit(
  poolId: string,
  band: Pick<Band, 'tickLower' | 'tickUpper'>,
  amounts: readonly [bigint, bigint],
  options: RangeReaderOptions,
): Promise<{ used: [bigint, bigint]; liquidity: bigint }> {
  const result = await simulate(options, poolId, 'estimate_deposit_position', [
    i32(band.tickLower),
    i32(band.tickUpper),
    pair(amounts),
  ]);
  const [used, liquidity] = result as [[bigint, bigint], bigint];
  return { used: [BigInt(used[0]), BigInt(used[1])], liquidity: BigInt(liquidity) };
}

/** The account's position in one band, or null when it holds none. */
export async function readRangePosition(
  poolId: string,
  account: string,
  band: Pick<Band, 'tickLower' | 'tickUpper'>,
  options: RangeReaderOptions,
): Promise<RangePosition | null> {
  const owner = new Address(account).toScVal();
  let position: { liquidity: bigint };
  try {
    position = (await simulate(options, poolId, 'get_position', [owner, i32(band.tickLower), i32(band.tickUpper)])) as {
      liquidity: bigint;
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes(NO_POSITION_ERROR)) return null;
    throw error;
  }
  const liquidity = BigInt(position.liquidity);
  if (liquidity === 0n) return null;
  const [amounts, fees] = await Promise.all([
    simulate(options, poolId, 'estimate_withdraw_position', [
      owner,
      i32(band.tickLower),
      i32(band.tickUpper),
      nativeToScVal(liquidity, { type: 'u128' }),
    ]),
    simulate(options, poolId, 'get_position_fees', [owner, i32(band.tickLower), i32(band.tickUpper)]),
  ]);
  const [a0, a1] = amounts as [bigint, bigint];
  const [f0, f1] = fees as [bigint, bigint];
  return { liquidity, amounts: [BigInt(a0), BigInt(a1)], fees: [BigInt(f0), BigInt(f1)] };
}

/** Every band the account holds a position in, from the pool's own index. */
export async function listRangePositions(
  poolId: string,
  account: string,
  options: RangeReaderOptions,
): Promise<{ tickLower: number; tickUpper: number }[]> {
  const snapshot = (await simulate(options, poolId, 'get_user_position_snapshot', [
    new Address(account).toScVal(),
  ])) as {
    ranges?: { tick_lower: number; tick_upper: number }[];
  };
  return (snapshot.ranges ?? []).map((range) => ({
    tickLower: Number(range.tick_lower),
    tickUpper: Number(range.tick_upper),
  }));
}

/**
 * Builds one pool call for the account after checking it can fund the deposit and hold both
 * tokens, and lets the RPC simulate and assemble it.
 */
export async function buildRangeCall(input: {
  network: StellarNetwork;
  rpcUrl: string;
  poolId: string;
  account: string;
  call: RangeCall;
  nowMs: number;
  fetch?: typeof fetch;
}): Promise<string> {
  const pool = rangePool(input.network, input.poolId);
  if (!pool) throw new VenueRefusal('POOL_NOT_REGISTERED', 'That pool is not a registered Aquarius concentrated pool.');
  const assets = rangeAssets(input.network, pool);
  const state = await readRangePool(input.poolId, { network: input.network, rpcUrl: input.rpcUrl });
  const classicOf = (index: 0 | 1) =>
    state.tokens[index] === assets.usdc.contractId ? assets.usdc.classic : assets.xlm.classic;
  const account = await loadClassicAccount(input.network, input.account, input.fetch);
  const spend =
    input.call.method === 'deposit_position'
      ? input.call.amounts.flatMap((amount, index) =>
          amount > 0n ? [{ asset: classicOf(index as 0 | 1), amount }] : [],
        )
      : [];
  requireFunds(account, { spend, receive: [assets.usdc.classic], feeStroops: 10_000_000n });

  const server = new rpc.Server(input.rpcUrl);
  const source = await server.getAccount(input.account);
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: NETWORK_PASSPHRASES[input.network],
    timebounds: { minTime: 0, maxTime: Math.floor(input.nowMs / 1000) + VALIDITY_SECONDS },
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.poolId,
        function: input.call.method,
        args: argsOf(input.account, input.call),
      }),
    )
    .build();
  try {
    return (await server.prepareTransaction(tx)).toXDR();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Pool error codes: docs.aqua.network/developers/concentrated-liquidity/contract-interface-reference.
    if (detail.includes('Error(Contract, #2119)')) {
      throw new VenueRefusal(
        'TOO_MANY_POSITIONS',
        'This wallet already holds 20 positions in this pool. Withdraw one first.',
      );
    }
    if (detail.includes('Error(Contract, #205)')) {
      throw new VenueRefusal('POOL_STATUS', 'Aquarius has paused deposits into this pool.');
    }
    throw new VenueRefusal('SIMULATION_FAILED', `Aquarius refused this in simulation: ${detail.slice(0, 200)}`);
  }
}

/**
 * Accepts a built transaction only when it is exactly the reviewed pool call: one call on the
 * registered pool, for the account, with exactly the reviewed band and amounts, and authorizing
 * at most a transfer of the deposited token from the account to that pool. A withdrawal authorizes
 * no transfer of the account's tokens at all.
 */
export function inspectRangeCall(
  xdrText: string,
  expected: {
    network: StellarNetwork;
    account: string;
    poolId: string;
    tokens: readonly [string, string];
    call: RangeCall;
    maxFeeStroops: bigint;
    nowSeconds: number;
  },
): { hash: string; feeStroops: bigint; validUntilSeconds: number } {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);
  const op = tx.operations[0];
  if (op?.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('OPERATION_NOT_ALLOWED', 'The transaction does not call a liquidity pool.');
  }
  if (op.source !== undefined && op.source !== expected.account) {
    fail('OPERATION_SOURCE', 'The operation runs as a different account.');
  }
  const call = op.func.invokeContract;
  const contractId = Address.fromScAddress(call.contractAddress).toString();
  if (contractId !== expected.poolId || !rangePool(expected.network, contractId)) {
    fail('CONTRACT_NOT_ALLOWED', 'The transaction calls a contract that is not the reviewed Aquarius pool.');
  }
  if (call.functionName.toString() !== expected.call.method) {
    fail('FUNCTION_NOT_ALLOWED', 'The transaction calls a different pool function than the one reviewed.');
  }
  const actual = canonical(call.args.map((arg) => scValToNative(arg) as unknown));
  if (actual !== canonical(argsOf(expected.account, expected.call).map((arg) => scValToNative(arg) as unknown))) {
    fail('ARGUMENTS_MISMATCH', 'The pool call differs from the reviewed band, amounts or account.');
  }

  const allowance = new Map<string, bigint>();
  if (expected.call.method === 'deposit_position') {
    expected.call.amounts.forEach((amount, index) => {
      if (amount > 0n) allowance.set(expected.tokens[index] as string, amount);
    });
  }
  for (const entry of op.auth ?? []) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') {
      fail('AUTH_CREDENTIALS', 'The pool call asks for a separate authorization signature.');
    }
    const root = entry.rootInvocation.function;
    if (
      root.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      root.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for a different call than the pool call.');
    }
    for (const child of buildInvocationTree(entry.rootInvocation).invocations) spend(child, expected, allowance);
  }
  return { hash: hex(tx.hash()), feeStroops, validUntilSeconds };
}

function spend(node: InvocationTree, expected: { account: string; poolId: string }, allowance: Map<string, bigint>) {
  const invocation = node.args;
  if (
    node.type !== 'execute' ||
    !('function' in invocation) ||
    invocation.function !== 'transfer' ||
    node.invocations.length
  ) {
    fail('AUTH_UNEXPECTED', 'The pool call authorizes a call other than a token transfer.');
  }
  const [from, to, amount] = invocation.args;
  const left = allowance.get(invocation.source);
  if (
    from !== expected.account ||
    to !== expected.poolId ||
    typeof amount !== 'bigint' ||
    left === undefined ||
    amount > left
  ) {
    fail('AUTH_UNEXPECTED', 'The pool call authorizes moving more, or another token, than is being deposited.');
  }
  allowance.set(invocation.source, left - amount);
}

function argsOf(account: string, call: RangeCall): xdr.ScVal[] {
  const owner = new Address(account).toScVal();
  const band = [i32(call.tickLower), i32(call.tickUpper)];
  if (call.method === 'deposit_position') {
    return [owner, ...band, pair(call.amounts), nativeToScVal(call.minLiquidity, { type: 'u128' })];
  }
  return [owner, ...band, nativeToScVal(call.liquidity, { type: 'u128' }), pair(call.minAmounts)];
}

async function simulate(options: RangeReaderOptions, contractId: string, method: string, args: xdr.ScVal[] = []) {
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
    const detail = rpc.Api.isSimulationError(simulation) ? simulation.error.slice(0, 200) : 'no result';
    throw new Error(`Reading ${method} failed in simulation: ${detail}`);
  }
  return scValToNative(simulation.result.retval) as unknown;
}

function i32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'i32' });
}

function pair(values: readonly [bigint, bigint]): xdr.ScVal {
  return xdr.ScVal.scvVec(values.map((value) => nativeToScVal(value, { type: 'u128' })));
}

function canonical(values: unknown[]): string {
  return JSON.stringify(values, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value));
}
