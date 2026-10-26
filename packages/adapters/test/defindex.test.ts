import { env } from 'cloudflare:workers';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { lendingAsset } from '../src/blend/markets.ts';
import { buildVaultDeposit, inspectVaultDeposit, type VaultDeposit } from '../src/defindex/deposit.ts';
import { createDefindexClient, isDefindexVault } from '../src/defindex/vaults.ts';
import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';

const NOW = 1_800_000_000;
const user = Keypair.random();
const stranger = Keypair.random();
const VAULT = 'CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3';
const OTHER_VAULT = 'CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK';
const usdc = lendingAsset('mainnet', 'USDC').contractId;
const xlm = lendingAsset('mainnet', 'XLM').contractId;

const DEPOSIT: VaultDeposit = {
  vault: VAULT,
  account: user.publicKey(),
  assetContract: usdc,
  amount: 1_000_000_000n,
  minAmount: 995_000_000n,
  invest: true,
};

interface Overrides {
  contract?: string;
  functionName?: string;
  from?: string;
  amounts?: bigint[];
  minimums?: bigint[];
  invest?: boolean;
  transfer?: { token?: string; from?: string; to?: string; amount?: bigint };
  extraTransfer?: boolean;
  addressCredentials?: boolean;
  validFor?: number;
}

function transfer(token: string, from: string, to: string, amount: bigint) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(token).toScAddress(),
        functionName: 'transfer',
        args: [new Address(from).toScVal(), new Address(to).toScVal(), nativeToScVal(amount, { type: 'i128' })],
      }),
    ),
    subInvocations: [],
  });
}

/** A deposit shaped like the one DeFindex's API and the RPC assemble for a G-account. */
function depositTransaction(o: Overrides = {}) {
  const contract = o.contract ?? VAULT;
  const functionName = o.functionName ?? 'deposit';
  const args = [
    xdr.ScVal.scvVec((o.amounts ?? [DEPOSIT.amount]).map((value) => nativeToScVal(value, { type: 'i128' }))),
    xdr.ScVal.scvVec((o.minimums ?? [DEPOSIT.minAmount]).map((value) => nativeToScVal(value, { type: 'i128' }))),
    new Address(o.from ?? user.publicKey()).toScVal(),
    xdr.ScVal.scvBool(o.invest ?? DEPOSIT.invest),
  ];
  const call = new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName, args });
  const t = o.transfer ?? {};
  const children = [
    transfer(t.token ?? usdc, t.from ?? user.publicKey(), t.to ?? contract, t.amount ?? DEPOSIT.amount),
  ];
  if (o.extraTransfer) children.push(transfer(xlm, user.publicKey(), contract, 1n));
  const credentials = o.addressCredentials
    ? xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: new Address(user.publicKey()).toScAddress(),
          nonce: 1n,
          signatureExpirationLedger: 100,
          signature: xdr.ScVal.scvVoid(),
        }),
      )
    : xdr.SorobanCredentials.sorobanCredentialsSourceAccount();
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: children,
    }),
  });
  return new TransactionBuilder(new Account(user.publicKey(), '5'), {
    fee: '300000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: NOW + (o.validFor ?? 180) },
  })
    .addOperation(Operation.invokeContractFunction({ contract, function: functionName, args, auth: [auth] }))
    .build()
    .toXDR();
}

function codeOf(overrides: Overrides): string {
  try {
    inspectVaultDeposit(depositTransaction(overrides), {
      ...DEPOSIT,
      network: 'mainnet',
      maxFeeStroops: 10_000_000n,
      nowSeconds: NOW,
    });
  } catch (error) {
    if (error instanceof InspectionError) return error.code;
    throw error;
  }
  return 'ACCEPTED';
}

describe('inspectVaultDeposit', () => {
  it('accepts exactly the reviewed deposit', () => {
    expect(codeOf({})).toBe('ACCEPTED');
  });

  it.each([
    ['another vault', { contract: OTHER_VAULT }, 'CONTRACT_NOT_ALLOWED'],
    ['a withdrawal', { functionName: 'withdraw' }, 'FUNCTION_NOT_ALLOWED'],
    ['shares minted to someone else', { from: stranger.publicKey() }, 'ACCOUNT_MISMATCH'],
    ['a changed amount', { amounts: [DEPOSIT.amount + 1n] }, 'AMOUNT_MISMATCH'],
    ['a lower minimum', { minimums: [1n] }, 'AMOUNT_MISMATCH'],
    ['a second asset', { amounts: [DEPOSIT.amount, 1n] }, 'AMOUNT_MISMATCH'],
    ['a flipped invest flag', { invest: false }, 'AMOUNT_MISMATCH'],
    ['a transfer above the deposit', { transfer: { amount: DEPOSIT.amount + 1n } }, 'AUTH_UNEXPECTED'],
    ['a transfer of another token', { transfer: { token: xlm } }, 'AUTH_UNEXPECTED'],
    ['a transfer to someone else', { transfer: { to: stranger.publicKey() } }, 'AUTH_UNEXPECTED'],
    ['an extra transfer', { extraTransfer: true }, 'AUTH_UNEXPECTED'],
    ['a separate authorization signature', { addressCredentials: true }, 'AUTH_CREDENTIALS'],
    ['no expiry window that is short', { validFor: 3600 }, 'VALIDITY'],
  ] satisfies [string, Overrides, string][])('blocks %s', (_name, overrides, code) => {
    expect(codeOf(overrides)).toBe(code);
  });
});

describe('DeFindex client', () => {
  it('reads a vault: supported asset, funds, fees, strategies and a clean name', async () => {
    const calls: string[] = [];
    const client = createDefindexClient({
      apiKey: 'test',
      network: 'mainnet',
      fetch: async (url) => {
        calls.push(String(url));
        return Response.json({
          name: 'DeFindex-Vault-BeansUsdcVault',
          displayName: null,
          apy: 5.92,
          assets: [{ address: usdc, strategies: [{ name: 'USDC Blend Strategy', paused: false }] }],
          totalManagedFunds: [{ asset: usdc, idle_amount: '10', invested_amount: '90', total_amount: '100' }],
          feesBps: { vaultFee: 100, defindexFee: 2000 },
        });
      },
    });
    expect(await client.vault(VAULT)).toMatchObject({
      name: 'BeansUsdcVault',
      symbol: 'USDC',
      apyPct: 5.92,
      totalRaw: 100n,
      idleRaw: 10n,
      investedRaw: 90n,
      vaultFeeBps: 100,
    });
    expect(calls).toEqual([`https://api.defindex.io/vault/${VAULT}?network=mainnet`]);
  });

  it('marks vaults of other assets as unsupported and refuses non-contract addresses', async () => {
    const client = createDefindexClient({
      apiKey: 'test',
      network: 'mainnet',
      fetch: async () =>
        Response.json({
          name: 'DeFindex-Vault-EURC',
          assets: [{ address: 'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV', strategies: [] }],
          feesBps: { vaultFee: 0, defindexFee: 2000 },
        }),
    });
    expect((await client.vault(VAULT)).symbol).toBeNull();
    await expect(client.vault(user.publicKey())).rejects.toThrow('Not a vault contract address.');
  });
});

describe('DeFindex on Testnet (live)', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'verifies the vault code, then builds an XLM deposit the inspector accepts',
    async () => {
      const rpcUrl = 'https://soroban-testnet.stellar.org';
      const vault = 'CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6';
      expect(await isDefindexVault('testnet', rpcUrl, vault)).toBe(true);
      expect(await isDefindexVault('testnet', rpcUrl, 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF')).toBe(
        false,
      );
      const wallet = Keypair.random();
      await fetch(`https://friendbot.stellar.org/?addr=${wallet.publicKey()}`);
      const xlmTestnet = lendingAsset('testnet', 'XLM');
      const deposit: VaultDeposit = {
        vault,
        account: wallet.publicKey(),
        assetContract: xlmTestnet.contractId,
        amount: 100_000_000n,
        minAmount: 99_500_000n,
        invest: false,
      };
      const built = await buildVaultDeposit({
        ...deposit,
        network: 'testnet',
        rpcUrl,
        asset: xlmTestnet.classic,
        nowMs: Date.now(),
      });
      const inspected = inspectVaultDeposit(built, {
        ...deposit,
        network: 'testnet',
        maxFeeStroops: 10_000_000n,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      expect(inspected.hash).toHaveLength(64);
    },
    60_000,
  );
});
