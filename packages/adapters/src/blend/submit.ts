import type { StellarNetwork } from '@nest/domain/network';
import {
  Address,
  buildInvocationTree,
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
import { blendPool, LENDING_SYMBOLS, lendingAsset } from './markets.ts';

/** Blend pool request types (blend-sdk RequestType). Auctions and flash loans are not offered. */
export const BLEND_REQUEST_TYPES = {
  supply: 0,
  withdraw: 1,
  supplyCollateral: 2,
  withdrawCollateral: 3,
  borrow: 4,
  repay: 5,
} as const;
export type LendingRequestType = keyof typeof BLEND_REQUEST_TYPES;

export interface LendingRequest {
  type: LendingRequestType;
  contractId: string;
  amount: bigint;
}

/** Inclusion fee; simulation adds the resource fee on top. */
const INCLUSION_FEE_STROOPS = '1000';
const VALIDITY_SECONDS = 180;
const SUBMIT_FUNCTION = 'submit';

/** Requests that move the user's tokens into the pool, which the user authorizes as a transfer. */
function spends(request: LendingRequest): boolean {
  return request.type === 'supply' || request.type === 'supplyCollateral' || request.type === 'repay';
}

function requestScVal(request: LendingRequest): xdr.ScVal {
  // A Soroban struct is a map with its field names as symbols, in sorted order.
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('address'), val: new Address(request.contractId).toScVal() }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: nativeToScVal(request.amount, { type: 'i128' }) }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('request_type'),
      val: nativeToScVal(BLEND_REQUEST_TYPES[request.type], { type: 'u32' }),
    }),
  ]);
}

/**
 * Builds `submit(from, spender, to, requests)` on a registered pool, with the account in all three
 * roles, after checking balances and trustlines, and lets the RPC simulate and assemble it.
 */
export async function buildBlendSubmit(input: {
  network: StellarNetwork;
  rpcUrl: string;
  poolId: string;
  account: string;
  requests: readonly LendingRequest[];
  nowMs: number;
  fetch?: typeof fetch;
}): Promise<string> {
  if (!blendPool(input.network, input.poolId))
    throw new VenueRefusal('POOL_NOT_REGISTERED', 'That pool is not a registered Blend pool.');
  const classic = (contractId: string) => {
    const symbol = LENDING_SYMBOLS.find(
      (candidate) => lendingAsset(input.network, candidate).contractId === contractId,
    );
    if (!symbol) throw new VenueRefusal('ASSET_NOT_REGISTERED', 'That asset is not registered for lending.');
    return lendingAsset(input.network, symbol).classic;
  };
  const account = await loadClassicAccount(input.network, input.account, input.fetch);
  requireFunds(account, {
    spend: input.requests
      .filter(spends)
      .map((request) => ({ asset: classic(request.contractId), amount: request.amount })),
    receive: input.requests.filter((request) => !spends(request)).map((request) => classic(request.contractId)),
    feeStroops: 10_000_000n,
  });

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
        function: SUBMIT_FUNCTION,
        args: [
          new Address(input.account).toScVal(),
          new Address(input.account).toScVal(),
          new Address(input.account).toScVal(),
          xdr.ScVal.scvVec(input.requests.map(requestScVal)),
        ],
      }),
    )
    .build();
  try {
    return (await server.prepareTransaction(tx)).toXDR();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new VenueRefusal('SIMULATION_FAILED', `Blend refused this in simulation: ${detail.slice(0, 200)}`);
  }
}

export interface InspectedLending {
  hash: string;
  feeStroops: bigint;
  validUntilSeconds: number;
}

/**
 * Accepts a built Blend transaction only when it is exactly the reviewed action: one `submit` on
 * the registered pool, the account as from, spender and receiver, exactly the reviewed requests,
 * and authorization only for transferring what is supplied or repaid, from the account to that pool.
 */
export function inspectBlendSubmit(
  xdrText: string,
  expected: {
    network: StellarNetwork;
    account: string;
    poolId: string;
    requests: readonly LendingRequest[];
    maxFeeStroops: bigint;
    nowSeconds: number;
  },
): InspectedLending {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);
  const op = tx.operations[0];
  if (op?.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('OPERATION_NOT_ALLOWED', 'The transaction does not call a lending pool.');
  }
  if (op.source !== undefined && op.source !== expected.account)
    fail('OPERATION_SOURCE', 'The operation runs as a different account.');

  const call = op.func.invokeContract;
  const contractId = Address.fromScAddress(call.contractAddress).toString();
  if (contractId !== expected.poolId || !blendPool(expected.network, contractId)) {
    fail('CONTRACT_NOT_ALLOWED', 'The transaction calls a contract that is not the reviewed Blend pool.');
  }
  if (call.functionName.toString() !== SUBMIT_FUNCTION)
    fail('FUNCTION_NOT_ALLOWED', 'Only a pool submit is supported.');
  const [from, spender, to, requests] = call.args.map((arg) => scValToNative(arg) as unknown);
  if (call.args.length !== 4 || from !== expected.account || spender !== expected.account || to !== expected.account) {
    fail('ACCOUNT_MISMATCH', 'The pool action is not entirely for the reviewed account.');
  }
  if (!sameRequests(requests, expected.requests))
    fail('REQUESTS_MISMATCH', 'The pool requests differ from the reviewed ones.');
  checkLendingAuth(op.auth ?? [], call, expected);
  return { hash: hex(tx.hash()), feeStroops, validUntilSeconds };
}

function sameRequests(actual: unknown, expected: readonly LendingRequest[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((request, index) => {
    const want = expected[index];
    const got = request as { address?: unknown; amount?: unknown; request_type?: unknown } | null;
    return (
      want !== undefined &&
      got?.address === want.contractId &&
      got.amount === want.amount &&
      got.request_type === BLEND_REQUEST_TYPES[want.type]
    );
  });
}

function checkLendingAuth(
  entries: readonly xdr.SorobanAuthorizationEntry[],
  call: xdr.InvokeContractArgs,
  expected: { account: string; poolId: string; requests: readonly LendingRequest[] },
): void {
  const allowance = new Map<string, bigint>();
  for (const request of expected.requests.filter(spends)) {
    allowance.set(request.contractId, (allowance.get(request.contractId) ?? 0n) + request.amount);
  }
  for (const entry of entries) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') {
      fail('AUTH_CREDENTIALS', 'The pool action asks for a separate authorization signature.');
    }
    const root = entry.rootInvocation.function;
    if (
      root.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      root.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for a different call than the pool action.');
    }
    for (const child of buildInvocationTree(entry.rootInvocation).invocations) spend(child, expected, allowance);
  }
}

function spend(
  node: InvocationTree,
  expected: { account: string; poolId: string },
  allowance: Map<string, bigint>,
): void {
  const invocation = node.args;
  if (
    node.type !== 'execute' ||
    !('function' in invocation) ||
    invocation.function !== 'transfer' ||
    node.invocations.length > 0
  ) {
    fail('AUTH_UNEXPECTED', 'The pool action authorizes a call other than a token transfer.');
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
    fail(
      'AUTH_UNEXPECTED',
      'The pool action authorizes moving more, or another token, than is being supplied or repaid.',
    );
  }
  allowance.set(invocation.source, left - amount);
}
