import type { StellarNetwork } from '@nest/domain/network';
import {
  Account,
  Address,
  type Asset,
  Contract,
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

export interface VaultWithdrawal {
  vault: string;
  account: string;
  assetContract: string;
  shares: bigint;
  minAmount: bigint;
}

export interface VaultSharePosition {
  account: string;
  assetContract: string;
  balanceRaw: bigint;
  decimals: number;
  underlyingRaw: bigint;
}

interface ReadOptions {
  network: StellarNetwork;
  rpcUrl: string;
}

const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export async function readVaultShareDecimals(vault: string, options: ReadOptions): Promise<number> {
  const value = await read(vault, 'decimals', [], options);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 38) {
    throw new VenueRefusal('SHARES_UNAVAILABLE', 'The vault did not report valid share decimals.');
  }
  return value;
}

export async function readVaultShareAmount(vault: string, shares: bigint, options: ReadOptions): Promise<bigint> {
  if (shares === 0n) return 0n;
  const value = await read(vault, 'get_asset_amounts_per_shares', [nativeToScVal(shares, { type: 'i128' })], options);
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'bigint' || value[0] < 0n) {
    throw new VenueRefusal('SHARES_UNAVAILABLE', 'The vault did not report one valid underlying asset amount.');
  }
  return value[0];
}

export async function readVaultSharePosition(
  vault: string,
  account: string,
  options: ReadOptions,
): Promise<VaultSharePosition> {
  const [balance, decimals, assetContract] = await Promise.all([
    read(vault, 'balance', [new Address(account).toScVal()], options),
    readVaultShareDecimals(vault, options),
    readAssetContract(vault, options),
  ]);
  if (typeof balance !== 'bigint' || balance < 0n) {
    throw new VenueRefusal('SHARES_UNAVAILABLE', 'The vault did not report a valid owned share balance.');
  }
  return {
    account,
    assetContract,
    balanceRaw: balance,
    decimals,
    underlyingRaw: await readVaultShareAmount(vault, balance, options),
  };
}

export async function buildVaultWithdrawal(
  input: VaultWithdrawal & ReadOptions & { asset: Asset; nowMs: number; fetch?: typeof fetch },
): Promise<string> {
  if ((await readAssetContract(input.vault, input)) !== input.assetContract) {
    throw new VenueRefusal('ASSET_MISMATCH', 'The vault’s underlying asset differs from the reviewed receipt.');
  }
  const account = await loadClassicAccount(input.network, input.account, input.fetch);
  requireFunds(account, { spend: [], receive: [input.asset], feeStroops: 10_000_000n });
  const server = new rpc.Server(input.rpcUrl);
  const tx = new TransactionBuilder(await server.getAccount(input.account), {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASES[input.network],
    timebounds: { minTime: 0, maxTime: Math.floor(input.nowMs / 1000) + 180 },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: input.vault, function: 'withdraw', args: withdrawalArgs(input) }),
    )
    .build();
  try {
    return (await server.prepareTransaction(tx)).toXDR();
  } catch {
    throw new VenueRefusal(
      'SIMULATION_FAILED',
      'The vault cannot redeem these shares right now; its strategies may lack withdrawal liquidity.',
    );
  }
}

export function inspectVaultWithdrawal(
  xdrText: string,
  expected: VaultWithdrawal & { network: StellarNetwork; maxFeeStroops: bigint; nowSeconds: number },
): { hash: string; feeStroops: bigint; validUntilSeconds: number } {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The withdrawal is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'A withdrawal must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);
  const op = tx.operations[0];
  if (op?.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('OPERATION_NOT_ALLOWED', 'The transaction does not withdraw from the reviewed vault.');
  }
  if (op.source !== undefined && op.source !== expected.account)
    fail('OPERATION_SOURCE', 'The operation runs as another account.');
  const call = op.func.invokeContract;
  if (Address.fromScAddress(call.contractAddress).toString() !== expected.vault)
    fail('CONTRACT_NOT_ALLOWED', 'The withdrawal calls another vault.');
  if (call.functionName.toString() !== 'withdraw')
    fail('FUNCTION_NOT_ALLOWED', 'Only the reviewed withdrawal is supported.');
  const reviewed = withdrawalArgs(expected);
  if (
    call.args.length !== reviewed.length ||
    call.args.some((value, index) => value.toXDR('base64') !== reviewed[index]?.toXDR('base64'))
  ) {
    fail('ARGUMENTS_MISMATCH', 'The withdrawal changes the shares, minimum receipt or receiving account.');
  }
  if ((op.auth ?? []).length !== 1)
    fail('AUTH_CREDENTIALS', 'The withdrawal must have exactly the account authorization.');
  for (const entry of op.auth ?? []) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount')
      fail('AUTH_CREDENTIALS', 'A separate authorization signature is not allowed.');
    const root = entry.rootInvocation.function;
    if (
      root.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      root.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for another call.');
    }
    if (entry.rootInvocation.subInvocations.length !== 0) {
      fail('AUTH_UNEXPECTED', 'A withdrawal must not authorize another operation with the wallet’s tokens.');
    }
  }
  return { hash: hex(tx.hash()), feeStroops, validUntilSeconds };
}

function withdrawalArgs(input: VaultWithdrawal): xdr.ScVal[] {
  return [
    nativeToScVal(input.shares, { type: 'i128' }),
    xdr.ScVal.scvVec([nativeToScVal(input.minAmount, { type: 'i128' })]),
    new Address(input.account).toScVal(),
  ];
}

async function read(vault: string, method: string, args: xdr.ScVal[], options: ReadOptions): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASES[options.network],
  })
    .addOperation(new Contract(vault).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await new rpc.Server(options.rpcUrl).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation) || !simulation.result)
    throw new VenueRefusal('SHARES_UNAVAILABLE', 'The vault’s shares could not be read right now.');
  return scValToNative(simulation.result.retval) as unknown;
}

async function readAssetContract(vault: string, options: ReadOptions): Promise<string> {
  const value = await read(vault, 'get_assets', [], options);
  if (!Array.isArray(value) || value.length !== 1)
    throw new VenueRefusal('ASSET_MISMATCH', 'Only a verified single-asset vault is supported.');
  const asset: unknown = value[0];
  if (
    !asset ||
    typeof asset !== 'object' ||
    !('address' in asset) ||
    typeof asset.address !== 'string' ||
    !/^C[A-Z2-7]{55}$/.test(asset.address)
  ) {
    throw new VenueRefusal('ASSET_MISMATCH', 'The vault did not report a valid underlying asset identity.');
  }
  return asset.address;
}
