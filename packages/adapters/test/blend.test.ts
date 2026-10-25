import { env } from 'cloudflare:workers';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { BLEND_POOLS, lendingAsset, poolAllows } from '../src/blend/markets.ts';
import { loadBlendMarkets } from '../src/blend/reader.ts';
import { BLEND_REQUEST_TYPES, buildBlendSubmit, inspectBlendSubmit, type LendingRequest } from '../src/blend/submit.ts';
import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';

const NOW = 1_800_000_000;
const user = Keypair.random();
const stranger = Keypair.random();
const [FIXED, YIELDBLOX] = BLEND_POOLS.mainnet.map((pool) => pool.id) as [string, string];
const usdc = lendingAsset('mainnet', 'USDC');
const xlm = lendingAsset('mainnet', 'XLM');

const SUPPLY: LendingRequest[] = [{ type: 'supply', contractId: usdc.contractId, amount: 1_000_000_000n }];
const REPAY: LendingRequest[] = [{ type: 'repay', contractId: usdc.contractId, amount: 10_010_000_000n }];
const WITHDRAW_COLLATERAL: LendingRequest[] = [
  { type: 'withdrawCollateral', contractId: xlm.contractId, amount: 50_000_000_000n },
];
const BORROW: LendingRequest[] = [
  { type: 'supplyCollateral', contractId: xlm.contractId, amount: 120_000_000_000n },
  { type: 'borrow', contractId: usdc.contractId, amount: 10_000_000_000n },
];

function requestScVal(request: { type: number; contractId: string; amount: bigint }) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('address'), val: new Address(request.contractId).toScVal() }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: nativeToScVal(request.amount, { type: 'i128' }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('request_type'), val: nativeToScVal(request.type, { type: 'u32' }) }),
  ]);
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

interface Overrides {
  pool?: string;
  functionName?: string;
  to?: string;
  requests?: { type: number; contractId: string; amount: bigint }[];
  transfers?: (pool: string) => xdr.SorobanAuthorizedInvocation[];
  addressCredentials?: boolean;
  fee?: string;
  validFor?: number;
}

/** A pool submit shaped like what the RPC assembles for a G-account. */
function submitTransaction(base: LendingRequest[], o: Overrides = {}) {
  const pool = o.pool ?? FIXED;
  const functionName = o.functionName ?? 'submit';
  const requests = o.requests ?? base.map((request) => ({ ...request, type: BLEND_REQUEST_TYPES[request.type] }));
  const args = [
    new Address(user.publicKey()).toScVal(),
    new Address(user.publicKey()).toScVal(),
    new Address(o.to ?? user.publicKey()).toScVal(),
    xdr.ScVal.scvVec(requests.map(requestScVal)),
  ];
  const call = new xdr.InvokeContractArgs({ contractAddress: new Address(pool).toScAddress(), functionName, args });
  const defaultTransfers = (target: string) =>
    base
      .filter((request) => ['supply', 'supplyCollateral', 'repay'].includes(request.type))
      .map((request) => transfer(request.contractId, user.publicKey(), target, request.amount));
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
      subInvocations: (o.transfers ?? defaultTransfers)(pool),
    }),
  });
  return new TransactionBuilder(new Account(user.publicKey(), '5'), {
    fee: o.fee ?? '150000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: NOW + (o.validFor ?? 180) },
  })
    .addOperation(Operation.invokeContractFunction({ contract: pool, function: functionName, args, auth: [auth] }))
    .build()
    .toXDR();
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof InspectionError) return error.code;
    throw error;
  }
  return 'ACCEPTED';
}

const expectedFor = (requests: LendingRequest[], poolId = FIXED) => ({
  network: 'mainnet' as const,
  account: user.publicKey(),
  poolId,
  requests,
  maxFeeStroops: 10_000_000n,
  nowSeconds: NOW,
});

describe('Blend registry', () => {
  it('derives the reserve token contracts Blend lists for each network', () => {
    expect(lendingAsset('testnet', 'USDC').contractId).toBe('CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU');
    expect(lendingAsset('testnet', 'XLM').contractId).toBe('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
    expect(usdc.contractId).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
    expect(xlm.contractId).toBe('CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA');
  });

  it('follows Blend’s pool status rules', () => {
    expect([0, 1, 2, 3, 4].map((status) => poolAllows(status, 'borrow'))).toEqual([true, true, false, false, false]);
    expect([0, 3, 4, 5, 6].map((status) => poolAllows(status, 'supply'))).toEqual([true, true, false, false, false]);
  });
});

describe('inspectBlendSubmit', () => {
  it('accepts exactly the reviewed supply', () => {
    expect(inspectBlendSubmit(submitTransaction(SUPPLY), expectedFor(SUPPLY))).toMatchObject({
      feeStroops: 150_000n,
      validUntilSeconds: NOW + 180,
    });
  });

  it('accepts collateral plus borrow with only the collateral transfer authorized', () => {
    expect(codeOf(() => inspectBlendSubmit(submitTransaction(BORROW), expectedFor(BORROW)))).toBe('ACCEPTED');
  });

  it('accepts a repay that authorizes only the repaid transfer, and a withdrawal that authorizes none', () => {
    expect(codeOf(() => inspectBlendSubmit(submitTransaction(REPAY), expectedFor(REPAY)))).toBe('ACCEPTED');
    expect(
      codeOf(() => inspectBlendSubmit(submitTransaction(WITHDRAW_COLLATERAL), expectedFor(WITHDRAW_COLLATERAL))),
    ).toBe('ACCEPTED');
  });

  it.each([
    [
      'a repay that moves more than the reviewed amount',
      REPAY,
      { transfers: (pool: string) => [transfer(usdc.contractId, user.publicKey(), pool, 10_010_000_001n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a withdrawal that also spends the account’s tokens',
      WITHDRAW_COLLATERAL,
      { transfers: (pool: string) => [transfer(xlm.contractId, user.publicKey(), pool, 1n)] },
      'AUTH_UNEXPECTED',
    ],
    ['a withdrawal paid to someone else', WITHDRAW_COLLATERAL, { to: stranger.publicKey() }, 'ACCOUNT_MISMATCH'],
    [
      'a withdrawal turned into a borrow',
      WITHDRAW_COLLATERAL,
      { requests: [{ type: 4, contractId: xlm.contractId, amount: 50_000_000_000n }] },
      'REQUESTS_MISMATCH',
    ],
    ['another registered pool', SUPPLY, { pool: YIELDBLOX }, 'CONTRACT_NOT_ALLOWED'],
    [
      'an unregistered contract',
      SUPPLY,
      { pool: 'CDE57N6XTUPBKYYDGQMXX7E7SLNOLFY3JEQB4MULSMR2AKTSAENGX2HC' },
      'CONTRACT_NOT_ALLOWED',
    ],
    ['another function', SUPPLY, { functionName: 'flash_loan' }, 'FUNCTION_NOT_ALLOWED'],
    ['tokens sent to someone else', BORROW, { to: stranger.publicKey() }, 'ACCOUNT_MISMATCH'],
    [
      'a changed amount',
      SUPPLY,
      { requests: [{ type: 0, contractId: usdc.contractId, amount: 1_000_000_001n }] },
      'REQUESTS_MISMATCH',
    ],
    [
      'supply turned into borrow',
      SUPPLY,
      { requests: [{ type: 4, contractId: usdc.contractId, amount: 1_000_000_000n }] },
      'REQUESTS_MISMATCH',
    ],
    [
      'an extra request',
      SUPPLY,
      {
        requests: [
          { type: 0, contractId: usdc.contractId, amount: 1_000_000_000n },
          { type: 4, contractId: xlm.contractId, amount: 1n },
        ],
      },
      'REQUESTS_MISMATCH',
    ],
    [
      'a transfer above the supply',
      SUPPLY,
      { transfers: (pool: string) => [transfer(usdc.contractId, user.publicKey(), pool, 1_000_000_001n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a transfer to another address',
      SUPPLY,
      { transfers: () => [transfer(usdc.contractId, user.publicKey(), stranger.publicKey(), 1n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a transfer of the borrowed asset',
      BORROW,
      { transfers: (pool: string) => [transfer(usdc.contractId, user.publicKey(), pool, 1n)] },
      'AUTH_UNEXPECTED',
    ],
    ['a separate authorization signature', SUPPLY, { addressCredentials: true }, 'AUTH_CREDENTIALS'],
    ['a fee above the limit', SUPPLY, { fee: '10000001' }, 'FEE_ABOVE_LIMIT'],
    ['a validity window too long', SUPPLY, { validFor: 3600 }, 'VALIDITY'],
  ] satisfies [string, LendingRequest[], Overrides, string][])('blocks %s', (_name, base, overrides, code) => {
    expect(codeOf(() => inspectBlendSubmit(submitTransaction(base, overrides), expectedFor(base)))).toBe(code);
  });
});

describe('Blend on Testnet (live)', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'reads markets, then builds a collateral supply the inspector accepts',
    async () => {
      const rpcUrl = 'https://soroban-testnet.stellar.org';
      const markets = await loadBlendMarkets('testnet', rpcUrl);
      const testnet = markets[0];
      expect(testnet).toMatchObject({ name: 'Blend Testnet V2', canSupply: true });
      expect(testnet?.reserves.map((reserve) => reserve.symbol).sort()).toEqual(['USDC', 'XLM']);

      const wallet = Keypair.random();
      await fetch(`https://friendbot.stellar.org/?addr=${wallet.publicKey()}`);
      const requests: LendingRequest[] = [
        { type: 'supplyCollateral', contractId: lendingAsset('testnet', 'XLM').contractId, amount: 1_000_000_000n },
      ];
      const poolId = BLEND_POOLS.testnet[0]?.id ?? '';
      const built = await buildBlendSubmit({
        network: 'testnet',
        rpcUrl,
        poolId,
        account: wallet.publicKey(),
        requests,
        nowMs: Date.now(),
      });
      const inspected = inspectBlendSubmit(built, {
        network: 'testnet',
        account: wallet.publicKey(),
        poolId,
        requests,
        maxFeeStroops: 10_000_000n,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      console.log(
        JSON.stringify({
          fee: inspected.feeStroops.toString(),
          validFor: inspected.validUntilSeconds - Math.floor(Date.now() / 1000),
        }),
      );
      expect(inspected.hash).toHaveLength(64);
    },
    60_000,
  );
});
