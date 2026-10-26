import { env } from 'cloudflare:workers';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';
import {
  apyPctFromRay,
  healthAfter,
  inspectXoxnoCall,
  readXoxnoAccounts,
  readXoxnoMarket,
  XOXNO,
  type XoxnoCall,
  type XoxnoMarket,
  xoxnoWithdrawalHealth,
} from '../src/xoxno/lending.ts';

const NOW = 1_800_000_000;
const DEPLOYMENT = XOXNO.testnet;
const XLM = DEPLOYMENT.assets.XLM.contractId;
const USDC = DEPLOYMENT.assets.USDC.contractId;
const user = Keypair.random();
const stranger = Keypair.random();
const XLM_2000 = 20_000_000_000n;
const USDC_100 = 1_000_000_000n;

function reserve(symbol: 'XLM' | 'USDC', priceUsd: number | null, threshold: number) {
  return {
    symbol,
    contractId: DEPLOYMENT.assets[symbol].contractId,
    hubId: 1,
    priceUsd,
    priceWad: priceUsd === null ? null : BigInt(Math.round(priceUsd * 1e8)) * 10_000_000_000n,
    liquidationThresholdBps: BigInt(Math.round(threshold * 10_000)),
    borrowApyPct: 0,
    supplyApyPct: 0,
    utilizationPct: 0,
    availableRaw: 0n,
    loanToValue: threshold - 0.06,
    liquidationThreshold: threshold,
    canCollateral: true,
    canBorrow: true,
  };
}

// Testnet on 2026-10-26: XLM at $0.1685 with a 75.12% liquidation threshold, USDC at $1.
const MARKET: XoxnoMarket = {
  controller: DEPLOYMENT.controller,
  name: 'XOXNO Blue Chip',
  spokeId: 1,
  reserves: { XLM: reserve('XLM', 0.1685, 0.7512), USDC: reserve('USDC', 1, 0.98) },
  minBorrowCollateralUsd: 5,
  observedAtMs: NOW * 1000,
};

describe('XOXNO rates and health', () => {
  it('compounds the annual RAY rate per second', () => {
    // Mainnet USDC borrow rate read 2026-10-26: 2.5307…% a year.
    expect(apyPctFromRay(25_307_688_935_815_579_054_622_443n)).toBeCloseTo(2.5631, 3);
  });

  it('matches a real Testnet loan: 2000 XLM behind 100 USDC sat at health 2.53', () => {
    const health = healthAfter(MARKET, null, {
      collateral: { symbol: 'XLM', amount: XLM_2000 },
      debt: { symbol: 'USDC', amount: USDC_100 },
    });
    expect(health).toBeCloseTo(2.5316, 3);
    // More debt on the same account lowers it; no debt means nothing can be liquidated.
    const account = { collateralRaw: { XLM: XLM_2000, USDC: 0n }, debtRaw: { XLM: 0n, USDC: USDC_100 } };
    expect(healthAfter(MARKET, account, { debt: { symbol: 'USDC', amount: USDC_100 } })).toBeCloseTo(1.2658, 3);
    expect(healthAfter(MARKET, null, { collateral: { symbol: 'XLM', amount: XLM_2000 } })).toBeNull();
  });

  it('checks partial withdrawals with exact raw prices and thresholds', () => {
    const account = {
      accountId: 126n,
      spokeId: 1,
      collateralRaw: { XLM: XLM_2000, USDC: 0n },
      debtRaw: { XLM: 0n, USDC: USDC_100 },
      healthFactor: 2.53,
    };
    expect(xoxnoWithdrawalHealth(MARKET, account, { symbol: 'XLM', amount: 10_000_000_000n })).toMatchObject({
      solvent: true,
    });
    expect(xoxnoWithdrawalHealth(MARKET, account, { symbol: 'XLM', amount: 19_000_000_000n })).toMatchObject({
      solvent: false,
    });
    expect(
      xoxnoWithdrawalHealth(
        MARKET,
        { ...account, debtRaw: { XLM: 0n, USDC: 0n }, healthFactor: null },
        { symbol: 'XLM', amount: XLM_2000 },
      ),
    ).toEqual({ solvent: true, health: null });
  });

  it('refuses to guess a health factor without a price', () => {
    const unpriced = { ...MARKET, reserves: { ...MARKET.reserves, XLM: reserve('XLM', null, 0.7512) } };
    const health = healthAfter(unpriced, null, {
      collateral: { symbol: 'XLM', amount: XLM_2000 },
      debt: { symbol: 'USDC', amount: USDC_100 },
    });
    expect(Number.isNaN(health)).toBe(true);
  });
});

function hubAsset(asset: string) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('asset'), val: new Address(asset).toScVal() }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hub_id'), val: nativeToScVal(1, { type: 'u32' }) }),
  ]);
}

function amounts(asset: string, amount: bigint) {
  return xdr.ScVal.scvVec([xdr.ScVal.scvVec([hubAsset(asset), nativeToScVal(amount, { type: 'i128' })])]);
}

function supplyArgs(o: { caller?: string; accountId?: bigint; spoke?: number; amount?: bigint } = {}) {
  return [
    new Address(o.caller ?? user.publicKey()).toScVal(),
    nativeToScVal(o.accountId ?? 0n, { type: 'u64' }),
    nativeToScVal(o.spoke ?? 1, { type: 'u32' }),
    amounts(XLM, o.amount ?? XLM_2000),
  ];
}

function borrowArgs(amount = USDC_100) {
  return [
    new Address(user.publicKey()).toScVal(),
    nativeToScVal(126n, { type: 'u64' }),
    amounts(USDC, amount),
    xdr.ScVal.scvVoid(),
  ];
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

/** A controller call shaped like the RPC assembles it: the source account authorizes its token moves. */
function call(o: {
  contract?: string;
  method?: string;
  args?: xdr.ScVal[];
  transfers?: xdr.SorobanAuthorizedInvocation[];
  credentials?: xdr.SorobanCredentials;
  fee?: string;
}) {
  const contract = o.contract ?? DEPLOYMENT.controller;
  const method = o.method ?? 'supply';
  const args = o.args ?? supplyArgs();
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: new Address(contract).toScAddress(),
    functionName: method,
    args,
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: o.credentials ?? xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),
      subInvocations: o.transfers ?? [transfer(XLM, user.publicKey(), DEPLOYMENT.pool, XLM_2000)],
    }),
  });
  return new TransactionBuilder(new Account(user.publicKey(), '3'), {
    fee: o.fee ?? '400000',
    networkPassphrase: NETWORK_PASSPHRASES.testnet,
    timebounds: { minTime: 0, maxTime: NOW + 180 },
  })
    .addOperation(Operation.invokeContractFunction({ contract, function: method, args, auth: [auth] }))
    .build()
    .toXDR();
}

const SUPPLY: XoxnoCall = {
  method: 'supply',
  accountId: 0n,
  spokeId: 1,
  assets: [{ symbol: 'XLM', amount: XLM_2000 }],
};
const BORROW: XoxnoCall = { method: 'borrow', accountId: 126n, assets: [{ symbol: 'USDC', amount: USDC_100 }] };

function codeOf(xdrText: string, expected: XoxnoCall = SUPPLY): string {
  try {
    inspectXoxnoCall(xdrText, {
      network: 'testnet',
      account: user.publicKey(),
      call: expected,
      maxFeeStroops: 10_000_000n,
      nowSeconds: NOW,
    });
  } catch (error) {
    if (error instanceof InspectionError) return error.code;
    throw error;
  }
  return 'ACCEPTED';
}

describe('inspectXoxnoCall', () => {
  it('accepts exactly the reviewed collateral deposit into a new account', () => {
    expect(codeOf(call({}))).toBe('ACCEPTED');
  });

  it('accepts a borrow that authorizes no transfer of the account’s tokens', () => {
    expect(codeOf(call({ method: 'borrow', args: borrowArgs(), transfers: [] }), BORROW)).toBe('ACCEPTED');
    expect(
      codeOf(
        call({
          method: 'borrow',
          args: borrowArgs(),
          transfers: [transfer(XLM, user.publicKey(), DEPLOYMENT.pool, 1n)],
        }),
        BORROW,
      ),
    ).toBe('AUTH_UNEXPECTED');
  });

  it('accepts a bounded repayment and rejects an excessive or redirected authorization', () => {
    const repayment: XoxnoCall = { method: 'repay', accountId: 126n, assets: [{ symbol: 'USDC', amount: USDC_100 }] };
    const args = borrowArgs().slice(0, 3);
    expect(
      codeOf(
        call({ method: 'repay', args, transfers: [transfer(USDC, user.publicKey(), DEPLOYMENT.pool, USDC_100)] }),
        repayment,
      ),
    ).toBe('ACCEPTED');
    expect(
      codeOf(
        call({ method: 'repay', args, transfers: [transfer(USDC, user.publicKey(), DEPLOYMENT.pool, USDC_100 + 1n)] }),
        repayment,
      ),
    ).toBe('AUTH_UNEXPECTED');
    expect(
      codeOf(
        call({ method: 'repay', args, transfers: [transfer(USDC, user.publicKey(), stranger.publicKey(), USDC_100)] }),
        repayment,
      ),
    ).toBe('AUTH_UNEXPECTED');
  });

  it('accepts a bounded withdrawal only to the caller, without authorizing outgoing tokens', () => {
    const withdrawal: XoxnoCall = {
      method: 'withdraw',
      accountId: 126n,
      assets: [{ symbol: 'USDC', amount: USDC_100 }],
    };
    expect(codeOf(call({ method: 'withdraw', args: borrowArgs(), transfers: [] }), withdrawal)).toBe('ACCEPTED');
    const redirected = [...borrowArgs().slice(0, 3), new Address(stranger.publicKey()).toScVal()];
    expect(codeOf(call({ method: 'withdraw', args: redirected, transfers: [] }), withdrawal)).toBe(
      'ARGUMENTS_MISMATCH',
    );
    expect(
      codeOf(
        call({
          method: 'withdraw',
          args: borrowArgs(),
          transfers: [transfer(USDC, user.publicKey(), DEPLOYMENT.pool, 1n)],
        }),
        withdrawal,
      ),
    ).toBe('AUTH_UNEXPECTED');
  });

  it.each([
    ['another contract', { contract: DEPLOYMENT.pool }, 'CONTRACT_NOT_ALLOWED'],
    ['another function', { method: 'withdraw' }, 'FUNCTION_NOT_ALLOWED'],
    ['a different amount', { args: supplyArgs({ amount: XLM_2000 + 1n }) }, 'ARGUMENTS_MISMATCH'],
    ['another account id', { args: supplyArgs({ accountId: 7n }) }, 'ARGUMENTS_MISMATCH'],
    ['another spoke', { args: supplyArgs({ spoke: 3 }) }, 'ARGUMENTS_MISMATCH'],
    ['a deposit for someone else', { args: supplyArgs({ caller: stranger.publicKey() }) }, 'ARGUMENTS_MISMATCH'],
    [
      'a transfer above the deposit',
      { transfers: [transfer(XLM, user.publicKey(), DEPLOYMENT.pool, XLM_2000 + 1n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a transfer of another token',
      { transfers: [transfer(USDC, user.publicKey(), DEPLOYMENT.pool, 1n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a transfer to another address',
      { transfers: [transfer(XLM, user.publicKey(), stranger.publicKey(), 1n)] },
      'AUTH_UNEXPECTED',
    ],
    [
      'a separate signer',
      {
        credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
          new xdr.SorobanAddressCredentials({
            address: new Address(stranger.publicKey()).toScAddress(),
            nonce: xdr.Int64.fromString('1'),
            signatureExpirationLedger: 1,
            signature: xdr.ScVal.scvVoid(),
          }),
        ),
      },
      'AUTH_CREDENTIALS',
    ],
    ['a fee above the limit', { fee: '10000001' }, 'FEE_ABOVE_LIMIT'],
  ] as const)('blocks %s', (_name, overrides, code) => {
    expect(codeOf(call(overrides as Parameters<typeof call>[0]))).toBe(code);
  });
});

describe('XOXNO Testnet (live, read-only)', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'reads the spoke and a real account: 2000 XLM behind 100 USDC',
    async () => {
      const options = { network: 'testnet' as const, rpcUrl: 'https://soroban-testnet.stellar.org' };
      const market = await readXoxnoMarket(options);
      expect(market.reserves.USDC).toMatchObject({ canBorrow: true, contractId: USDC });
      expect(market.reserves.XLM.canCollateral).toBe(true);
      expect(market.reserves.XLM.priceUsd).toBeGreaterThan(0.01);
      // Opened by the prototype run on 2026-10-26 (account 126, position NFT owned by this wallet).
      const [account] = await readXoxnoAccounts('GBKUH6MHQKKMA3T3DA2PGV67YYM3E3Z7TMMPBZ6QO755EDTSKNREMSFQ', options);
      expect(account).toMatchObject({ accountId: 126n, spokeId: 1 });
      expect(account?.collateralRaw.XLM).toBeGreaterThanOrEqual(XLM_2000);
      expect(account?.debtRaw.USDC).toBeGreaterThanOrEqual(USDC_100);
      expect(account?.healthFactor).toBeGreaterThan(1);
    },
    60_000,
  );
});
