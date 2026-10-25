import { MAX_CLASSIC_RAW, parseDecimalAmount } from '@nest/domain/amount';
import type { StellarNetwork } from '@nest/domain/network';
import {
  Address,
  buildInvocationTree,
  FeeBumpTransaction,
  type InvocationTree,
  Keypair,
  scValToNative,
  type Transaction,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';

import { SOROSWAP_CONTRACTS } from '../soroswap/contracts.ts';
import type { SwapAsset } from './assets.ts';
import { NETWORK_PASSPHRASES } from './networks.ts';

/** A built transaction may stay valid this long; anything longer is refused rather than reviewed. */
const MAX_VALIDITY_SECONDS = 15 * 60;
const LEGACY_SWAP_FUNCTION = 'swap_exact_tokens_for_tokens';
const V3_SWAP_FUNCTION = 'swap_exact_in';
/** A provider fee above 1% of the input is refused rather than reviewed. */
const MAX_PROVIDER_FEE_BPS = 100n;
const CLASSIC_DECIMALS = 7;

export class InspectionError extends Error {
  override name = 'InspectionError';
  /** Stable reason code shown with the blocked review. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SwapExpectation {
  network: StellarNetwork;
  account: string;
  sell: SwapAsset;
  buy: SwapAsset;
  amountIn: bigint;
  /** The least the reviewed plan accepts; the transaction itself must enforce at least this. */
  minAmountOut: bigint;
  maxFeeStroops: bigint;
  nowSeconds: number;
}

export interface InspectedSwap {
  hash: string;
  route: 'soroban' | 'classic';
  contractId: string | null;
  amountIn: bigint;
  /** The minimum output the transaction enforces on chain. */
  minAmountOut: bigint;
  /** What the provider keeps from the input, in the sold asset's raw units. */
  providerFee: bigint;
  feeStroops: bigint;
  validUntilSeconds: number;
}

/**
 * Decodes an unsigned swap built by a provider and accepts it only when it does exactly the
 * reviewed swap: one call to a verified Soroswap contract (or one Classic path payment), from and
 * to the user's account, spending exactly the approved amount with at least the approved minimum
 * output, within the fee and validity limits. Any other shape is refused.
 */
export function inspectSwapTransaction(xdrText: string, expected: SwapExpectation): InspectedSwap {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);

  const op = tx.operations[0];
  if (!op) fail('OPERATION_COUNT', 'The transaction has no operation.');
  if (op.source !== undefined && op.source !== expected.account) {
    fail('OPERATION_SOURCE', 'The operation runs as a different account.');
  }
  const base = { hash: hex(tx.hash()), feeStroops, validUntilSeconds };

  if (op.type === 'pathPaymentStrictSend') {
    if (!op.sendAsset.equals(expected.sell.classic) || !op.destAsset.equals(expected.buy.classic)) {
      fail('ASSET_MISMATCH', 'The path payment sends or receives a different asset.');
    }
    if (op.destination !== expected.account) fail('RECEIVER_MISMATCH', 'The output goes to a different account.');
    const amountIn = parseDecimalAmount(op.sendAmount, CLASSIC_DECIMALS, MAX_CLASSIC_RAW);
    const minAmountOut = parseDecimalAmount(op.destMin, CLASSIC_DECIMALS, MAX_CLASSIC_RAW);
    checkAmounts(amountIn, minAmountOut, expected);
    return { ...base, route: 'classic', contractId: null, amountIn, minAmountOut, providerFee: 0n };
  }

  if (op.type !== 'invokeHostFunction')
    fail('OPERATION_NOT_ALLOWED', `A ${op.type} operation is not a supported swap.`);
  if (op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('HOST_FUNCTION', 'The transaction does not call a contract function.');
  }
  const call = op.func.invokeContract;
  const contractId = Address.fromScAddress(call.contractAddress).toString();
  const functionName = call.functionName.toString();
  const swap = decodeSwapCall(contractId, functionName, call.args, expected.network);

  if (swap.tokenIn !== expected.sell.ref.contractId || swap.tokenOut !== expected.buy.ref.contractId) {
    fail('ASSET_MISMATCH', 'The swap sells or buys a different token.');
  }
  if (swap.to !== expected.account) fail('RECEIVER_MISMATCH', 'The output goes to a different account.');
  if (swap.deadline !== null && swap.deadline < BigInt(expected.nowSeconds)) {
    fail('DEADLINE_PASSED', 'The swap deadline has already passed.');
  }
  checkAmounts(swap.amountIn, swap.minAmountOut, expected);
  if (swap.providerFee < 0n || swap.providerFee * 10_000n > swap.amountIn * MAX_PROVIDER_FEE_BPS) {
    fail('PROVIDER_FEE_TOO_HIGH', 'The provider keeps more than 1% of the input.');
  }
  checkAuthorizations(op.auth ?? [], call, expected);
  return {
    ...base,
    route: 'soroban',
    contractId,
    amountIn: swap.amountIn,
    minAmountOut: swap.minAmountOut,
    providerFee: swap.providerFee,
  };
}

/**
 * Accepts the wallet's signed transaction only if it is the exact prepared transaction (same hash
 * on this network) and carries a valid signature from the reviewed account.
 */
export function verifySignedTransaction(
  signedXdr: string,
  expected: { network: StellarNetwork; account: string; preparedHash: string },
): Transaction {
  const tx = parseTransaction(signedXdr, expected.network);
  const hashBytes = tx.hash();
  if (hex(hashBytes) !== expected.preparedHash) {
    fail('SIGNED_PAYLOAD_CHANGED', 'The signed transaction is not the one that was reviewed.');
  }
  const keypair = Keypair.fromPublicKey(expected.account);
  const signed = tx.signatures.some((signature) => keypair.verify(hashBytes, signature.signature));
  if (!signed) fail('SIGNATURE_MISSING', 'The transaction is not signed by the reviewed account.');
  return tx;
}

function parseTransaction(xdrText: string, network: StellarNetwork): Transaction {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdrText, NETWORK_PASSPHRASES[network]);
  } catch {
    fail('INVALID_XDR', 'The transaction could not be decoded.');
  }
  if (parsed instanceof FeeBumpTransaction) fail('FEE_BUMP', 'Fee-bump transactions are not supported.');
  return parsed;
}

function validUntil(tx: Transaction, nowSeconds: number): number {
  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  if (!maxTime) fail('VALIDITY', 'The transaction has no expiry.');
  if (maxTime <= nowSeconds) fail('VALIDITY', 'The transaction has already expired.');
  if (maxTime > nowSeconds + MAX_VALIDITY_SECONDS) fail('VALIDITY', 'The transaction stays valid for too long.');
  return maxTime;
}

function checkAmounts(amountIn: bigint, minAmountOut: bigint, expected: SwapExpectation): void {
  if (amountIn !== expected.amountIn) fail('AMOUNT_IN_MISMATCH', 'The transaction spends a different amount.');
  if (minAmountOut < expected.minAmountOut) {
    fail('MIN_OUT_TOO_LOW', 'The transaction accepts less output than the reviewed minimum.');
  }
}

interface SwapCall {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  to: string;
  /** Contract-level deadline in seconds; v3 has none and relies on the transaction's validity window. */
  deadline: bigint | null;
  providerFee: bigint;
}

/** Decodes the verified Soroswap entry points; their argument order is fixed by contract. */
function decodeSwapCall(
  contractId: string,
  functionName: string,
  args: readonly xdr.ScVal[],
  network: StellarNetwork,
): SwapCall {
  const contracts = SOROSWAP_CONTRACTS[network];
  const values: unknown[] = args.map((arg) => scValToNative(arg));
  if (contracts.aggregatorV3 !== null && contractId === contracts.aggregatorV3) {
    if (functionName !== V3_SWAP_FUNCTION)
      fail('FUNCTION_NOT_ALLOWED', `${functionName} is not a supported swap function.`);
    // swap_exact_in(user, token_in, amount_in, token_out, min_out, routes, partner). `user` pays and
    // receives; a partner would add its own fee on top, which Nest never accepts.
    const [user, tokenIn, amountIn, tokenOut, minAmountOut, routes, partner] = values;
    if (values.length !== 7 || !Array.isArray(routes) || routes.length === 0) {
      fail('ARGUMENTS', 'The aggregator call has unexpected arguments.');
    }
    if (partner !== null && partner !== undefined) fail('PARTNER_FEE', 'The swap adds a partner fee.');
    const call = swapCall(tokenIn, tokenOut, amountIn, minAmountOut, user, null);
    const routed = routes.reduce<bigint>((sum, route) => sum + routeAmount(route), 0n);
    return { ...call, providerFee: call.amountIn - routed };
  }
  if (contractId !== contracts.aggregator && contractId !== contracts.router) {
    fail('CONTRACT_NOT_ALLOWED', 'The transaction calls a contract that is not a verified Soroswap contract.');
  }
  if (functionName !== LEGACY_SWAP_FUNCTION) {
    fail('FUNCTION_NOT_ALLOWED', `${functionName} is not a supported swap function.`);
  }
  if (contractId === contracts.aggregator) {
    // swap_exact_tokens_for_tokens(token_in, token_out, amount_in, amount_out_min, distribution, to, deadline)
    const [tokenIn, tokenOut, amountIn, minAmountOut, , to, deadline] = values;
    if (values.length !== 7) fail('ARGUMENTS', 'The aggregator call has unexpected arguments.');
    return { ...swapCall(tokenIn, tokenOut, amountIn, minAmountOut, to, deadline), providerFee: 0n };
  }
  // swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline) on the router
  const [amountIn, minAmountOut, path, to, deadline] = values;
  if (values.length !== 5 || !Array.isArray(path) || path.length < 2) {
    fail('ARGUMENTS', 'The router call has unexpected arguments.');
  }
  return { ...swapCall(path[0], path.at(-1), amountIn, minAmountOut, to, deadline), providerFee: 0n };
}

function swapCall(
  ...[tokenIn, tokenOut, amountIn, minAmountOut, to, deadline]: unknown[]
): Omit<SwapCall, 'providerFee'> {
  if (
    typeof tokenIn !== 'string' ||
    typeof tokenOut !== 'string' ||
    typeof amountIn !== 'bigint' ||
    typeof minAmountOut !== 'bigint' ||
    typeof to !== 'string' ||
    (deadline !== null && typeof deadline !== 'bigint')
  ) {
    fail('ARGUMENTS', 'The swap call has arguments of unexpected types.');
  }
  return { tokenIn, tokenOut, amountIn, minAmountOut, to, deadline };
}

/** A v3 route's share of the input: `Route { amount_in: i128, hops }`. */
function routeAmount(route: unknown): bigint {
  const amount = (route as { amount_in?: unknown } | null)?.amount_in;
  if (typeof amount !== 'bigint' || amount < 0n) fail('ARGUMENTS', 'A route has an invalid input share.');
  return amount;
}

/**
 * The account authorizes through its transaction signature only, for exactly this swap call, and
 * the only nested authorizations are transfers of the sold token from the account, in total no
 * more than the approved amount.
 */
function checkAuthorizations(
  entries: readonly xdr.SorobanAuthorizationEntry[],
  call: xdr.InvokeContractArgs,
  expected: SwapExpectation,
): void {
  let transferred = 0n;
  for (const entry of entries) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') {
      fail('AUTH_CREDENTIALS', 'The swap asks for a separate authorization signature.');
    }
    const root = entry.rootInvocation;
    const rootFunction = root.function;
    if (
      rootFunction.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      rootFunction.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for a different call than the swap.');
    }
    for (const child of buildInvocationTree(root).invocations) transferred += authorizedTransfer(child, expected);
  }
  if (transferred > expected.amountIn)
    fail('AUTH_UNEXPECTED', 'The swap authorizes moving more than the approved amount.');
}

function authorizedTransfer(node: InvocationTree, expected: SwapExpectation): bigint {
  const invocation = node.args;
  if (
    node.type !== 'execute' ||
    !('function' in invocation) ||
    invocation.source !== expected.sell.ref.contractId ||
    invocation.function !== 'transfer' ||
    node.invocations.length > 0
  ) {
    fail('AUTH_UNEXPECTED', 'The swap authorizes a call other than transferring the sold token.');
  }
  const [from, , amount] = invocation.args;
  if (from !== expected.account || typeof amount !== 'bigint' || amount < 0n) {
    fail('AUTH_UNEXPECTED', 'The swap authorizes an unexpected transfer.');
  }
  return amount;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fail(code: string, message: string): never {
  throw new InspectionError(code, message);
}
