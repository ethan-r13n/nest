import type { StellarNetwork } from '@nest/domain/network';
import {
  Address,
  type Asset,
  buildInvocationTree,
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

/** Inclusion fee; simulation adds the resource fee on top. */
const INCLUSION_FEE_STROOPS = '1000';
const VALIDITY_SECONDS = 180;
const DEPOSIT_FUNCTION = 'deposit';

export interface VaultDeposit {
  vault: string;
  account: string;
  assetContract: string;
  amount: bigint;
  /** The least of the asset the vault may take; a single-asset vault takes the whole amount. */
  minAmount: bigint;
  /** Whether the vault invests the deposit into its strategies right away. */
  invest: boolean;
}

function depositArgs(deposit: VaultDeposit): xdr.ScVal[] {
  // deposit(amounts_desired: Vec<i128>, amounts_min: Vec<i128>, from: Address, invest: bool)
  return [
    xdr.ScVal.scvVec([nativeToScVal(deposit.amount, { type: 'i128' })]),
    xdr.ScVal.scvVec([nativeToScVal(deposit.minAmount, { type: 'i128' })]),
    new Address(deposit.account).toScVal(),
    xdr.ScVal.scvBool(deposit.invest),
  ];
}

/**
 * Builds the vault's `deposit` for the account after checking its balance, and lets the RPC
 * simulate and assemble it. DeFindex's API builds transactions with no expiry, so Nest builds the
 * call itself with a short validity window.
 */
export async function buildVaultDeposit(
  input: VaultDeposit & { network: StellarNetwork; rpcUrl: string; asset: Asset; nowMs: number; fetch?: typeof fetch },
): Promise<string> {
  const account = await loadClassicAccount(input.network, input.account, input.fetch);
  requireFunds(account, {
    spend: [{ asset: input.asset, amount: input.amount }],
    receive: [],
    feeStroops: 10_000_000n,
  });
  const server = new rpc.Server(input.rpcUrl);
  const tx = new TransactionBuilder(await server.getAccount(input.account), {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: NETWORK_PASSPHRASES[input.network],
    timebounds: { minTime: 0, maxTime: Math.floor(input.nowMs / 1000) + VALIDITY_SECONDS },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: input.vault, function: DEPOSIT_FUNCTION, args: depositArgs(input) }),
    )
    .build();
  try {
    return (await server.prepareTransaction(tx)).toXDR();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new VenueRefusal('SIMULATION_FAILED', `The vault refused this in simulation: ${detail.slice(0, 200)}`);
  }
}

/**
 * Accepts a built deposit only when it is exactly the reviewed one: a single `deposit` on that
 * vault, for the account, with the reviewed amounts and invest flag, authorizing nothing but the
 * transfer of that amount of the vault's asset from the account to the vault.
 */
export function inspectVaultDeposit(
  xdrText: string,
  expected: VaultDeposit & { network: StellarNetwork; maxFeeStroops: bigint; nowSeconds: number },
): { hash: string; feeStroops: bigint; validUntilSeconds: number } {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);
  const op = tx.operations[0];
  if (op?.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('OPERATION_NOT_ALLOWED', 'The transaction does not call a vault.');
  }
  if (op.source !== undefined && op.source !== expected.account) {
    fail('OPERATION_SOURCE', 'The operation runs as a different account.');
  }
  const call = op.func.invokeContract;
  if (Address.fromScAddress(call.contractAddress).toString() !== expected.vault) {
    fail('CONTRACT_NOT_ALLOWED', 'The transaction calls a contract that is not the reviewed vault.');
  }
  if (call.functionName.toString() !== DEPOSIT_FUNCTION)
    fail('FUNCTION_NOT_ALLOWED', 'Only a vault deposit is supported.');
  const [amounts, minimums, from, invest] = call.args.map((arg) => scValToNative(arg) as unknown);
  if (call.args.length !== 4 || from !== expected.account) {
    fail('ACCOUNT_MISMATCH', 'The deposit is not for the reviewed account.');
  }
  if (!only(amounts, expected.amount) || !only(minimums, expected.minAmount) || invest !== expected.invest) {
    fail('AMOUNT_MISMATCH', 'The deposit amounts differ from the reviewed ones.');
  }

  for (const entry of op.auth ?? []) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') {
      fail('AUTH_CREDENTIALS', 'The deposit asks for a separate authorization signature.');
    }
    const root = entry.rootInvocation.function;
    if (
      root.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      root.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for a different call than the deposit.');
    }
    let left = expected.amount;
    for (const child of buildInvocationTree(entry.rootInvocation).invocations) {
      const args = child.args;
      if (
        child.type !== 'execute' ||
        !('function' in args) ||
        args.function !== 'transfer' ||
        child.invocations.length
      ) {
        fail('AUTH_UNEXPECTED', 'The deposit authorizes a call other than a token transfer.');
      }
      const [sender, receiver, amount] = args.args;
      if (
        args.source !== expected.assetContract ||
        sender !== expected.account ||
        receiver !== expected.vault ||
        typeof amount !== 'bigint' ||
        amount > left
      ) {
        fail('AUTH_UNEXPECTED', 'The deposit authorizes moving more, or another token, than is being deposited.');
      }
      left -= amount;
    }
  }
  return { hash: hex(tx.hash()), feeStroops, validUntilSeconds };
}

function only(value: unknown, amount: bigint): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === amount;
}
