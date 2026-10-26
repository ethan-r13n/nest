import { env } from 'cloudflare:workers';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { lendingAsset } from '../src/blend/markets.ts';
import { inspectVaultWithdrawal, readVaultSharePosition, type VaultWithdrawal } from '../src/defindex/withdraw.ts';
import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';

const NOW = 1_800_000_000;
const account = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
const VAULT = 'CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3';
const WITHDRAWAL: VaultWithdrawal = {
  vault: VAULT,
  account,
  assetContract: lendingAsset('mainnet', 'USDC').contractId,
  shares: 1_000_000_000n,
  minAmount: 995_000_000n,
};

function transaction(
  input: {
    vault?: string;
    from?: string;
    shares?: bigint;
    minimum?: bigint;
    method?: string;
    child?: boolean;
    noAuth?: boolean;
    fee?: string;
    validFor?: number;
  } = {},
) {
  const vault = input.vault ?? VAULT;
  const method = input.method ?? 'withdraw';
  const args = [
    nativeToScVal(input.shares ?? WITHDRAWAL.shares, { type: 'i128' }),
    xdr.ScVal.scvVec([nativeToScVal(input.minimum ?? WITHDRAWAL.minAmount, { type: 'i128' })]),
    new Address(input.from ?? account).toScVal(),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(vault).toScAddress(),
    functionName: method,
    args,
  });
  const root = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
    subInvocations: [],
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: input.child ? [root] : [],
    }),
  });
  return new TransactionBuilder(new Account(account, '3'), {
    fee: input.fee ?? '300000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: NOW + (input.validFor ?? 180) },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: vault, function: method, args, auth: input.noAuth ? [] : [auth] }),
    )
    .build()
    .toXDR();
}

function inspect(input: Parameters<typeof transaction>[0]) {
  try {
    inspectVaultWithdrawal(transaction(input), {
      ...WITHDRAWAL,
      network: 'mainnet',
      maxFeeStroops: 10_000_000n,
      nowSeconds: NOW,
    });
    return 'ACCEPTED';
  } catch (error) {
    if (error instanceof InspectionError) return error.code;
    throw error;
  }
}

describe('DeFindex withdrawal inspection', () => {
  it('accepts exactly the reviewed shares, minimum and owner with no wallet spend authorization', () =>
    expect(inspect({})).toBe('ACCEPTED'));
  it.each([
    ['another vault', { vault: 'CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK' }, 'CONTRACT_NOT_ALLOWED'],
    ['another owner or destination', { from: other }, 'ARGUMENTS_MISMATCH'],
    ['more shares burned', { shares: WITHDRAWAL.shares + 1n }, 'ARGUMENTS_MISMATCH'],
    ['lower minimum proceeds', { minimum: 1n }, 'ARGUMENTS_MISMATCH'],
    ['a different function', { method: 'deposit' }, 'FUNCTION_NOT_ALLOWED'],
    ['extra authorization', { child: true }, 'AUTH_UNEXPECTED'],
    ['no account authorization', { noAuth: true }, 'AUTH_CREDENTIALS'],
    ['fee above approved maximum', { fee: '10000001' }, 'FEE_ABOVE_LIMIT'],
    ['excessive validity', { validFor: 3600 }, 'VALIDITY'],
  ] satisfies [string, Parameters<typeof transaction>[0], string][])('blocks %s', (_label, input, code) =>
    expect(inspect(input)).toBe(code),
  );
});

it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
  'reads existing Testnet vault shares without submitting any transaction',
  async () => {
    const position = await readVaultSharePosition(
      'CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6',
      'GDS2ZV5TQMIAMCBKVKBKXRARFI66MCCD4P6APS7SQKCYPX525G533MCH',
      { network: 'testnet', rpcUrl: 'https://soroban-testnet.stellar.org' },
    );
    expect(position.decimals).toBeGreaterThanOrEqual(0);
    expect(position.balanceRaw).toBeGreaterThanOrEqual(0n);
    expect(position.underlyingRaw).toBeGreaterThanOrEqual(0n);
  },
);
