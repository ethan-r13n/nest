import { env } from 'cloudflare:workers';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import {
  bandForLimit,
  estimateRangeDeposit,
  filledAmount,
  inspectRangeCall,
  RANGE_POOLS,
  type RangeCall,
  readRangePool,
  usdcPerXlmAt,
} from '../src/aquarius/range.ts';
import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';

const NOW = 1_800_000_000;
const POOL = RANGE_POOLS.testnet[0]?.id ?? '';
const USDC = 'CAZRY5GSFBFXD7H6GAFBA5YGYQTDXU4QKWKMYFWBAZFUCURN3WKX6LF5';
const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const user = Keypair.random();
const stranger = Keypair.random();
// The Testnet pool: token0 USDC, token1 XLM, so the pool price is XLM per USDC = 1.0001^tick.
const STATE = {
  tick: 18150,
  tickSpacing: 200,
  tickBounds: [-887200, 887200] as [number, number],
  usdcIndex: 0 as const,
};

describe('limit bands', () => {
  it('reads the price the pool quotes', () => {
    expect(usdcPerXlmAt(18150, 0)).toBeCloseTo(0.16285, 4);
    expect(usdcPerXlmAt(-18150, 1)).toBeCloseTo(0.16285, 4);
  });

  it('places a buy above the current tick so it fills only at or below the limit', () => {
    const band = bandForLimit('buy', 0.15, STATE);
    expect(band).toMatchObject({ tickLower: 19000, tickUpper: 19200, depositIndex: 0 });
    expect(band.fillStartsAt).toBeLessThanOrEqual(0.15);
    expect(band.fillCompletesAt).toBeLessThan(band.fillStartsAt);
  });

  it('places a sell below the current tick so it fills only at or above the limit', () => {
    const band = bandForLimit('sell', 0.18, STATE);
    expect(band).toMatchObject({ tickLower: 16800, tickUpper: 17000, depositIndex: 1 });
    expect(band.fillStartsAt).toBeGreaterThanOrEqual(0.18);
    expect(band.fillCompletesAt).toBeGreaterThan(band.fillStartsAt);
  });

  it('mirrors the bands when USDC is the pool’s second token', () => {
    const flipped = { ...STATE, tick: -18150, usdcIndex: 1 as const };
    expect(bandForLimit('buy', 0.15, flipped)).toMatchObject({ tickLower: -19200, tickUpper: -19000, depositIndex: 1 });
    expect(bandForLimit('sell', 0.18, flipped)).toMatchObject({
      tickLower: -17000,
      tickUpper: -16800,
      depositIndex: 0,
    });
  });

  it('refuses a limit on the wrong side of the market', () => {
    expect(() => bandForLimit('buy', 0.17, STATE)).toThrow('must be below the current price');
    expect(() => bandForLimit('sell', 0.16, STATE)).toThrow('must be above the current price');
    expect(() => bandForLimit('buy', 0, STATE)).toThrow('above zero');
  });

  it('matches a real Testnet fill: 10 USDC in 18400–18600 became 63.5923 XLM plus fees', () => {
    // The withdrawal returned 63.9134863 XLM: this principal plus 0.3211733 XLM of earned fees.
    const received = filledAmount({ tickLower: 18400, tickUpper: 18600, depositIndex: 0 }, 25_218_672_131n);
    expect(Number(received)).toBeCloseTo(639_134_863 - 3_211_733, -2);
  });
});

function u128(value: bigint) {
  return nativeToScVal(value, { type: 'u128' });
}

function call(o: {
  pool?: string;
  method?: string;
  args?: xdr.ScVal[];
  transfers?: xdr.SorobanAuthorizedInvocation[];
  fee?: string;
}) {
  const pool = o.pool ?? POOL;
  const method = o.method ?? 'deposit_position';
  const args = o.args ?? [
    new Address(user.publicKey()).toScVal(),
    nativeToScVal(19000, { type: 'i32' }),
    nativeToScVal(19200, { type: 'i32' }),
    xdr.ScVal.scvVec([u128(1_000_000_000n), u128(0n)]),
    u128(25_000_000_000n),
  ];
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: new Address(pool).toScAddress(),
    functionName: method,
    args,
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),
      subInvocations: o.transfers ?? [transfer(USDC, user.publicKey(), pool, 1_000_000_000n)],
    }),
  });
  return new TransactionBuilder(new Account(user.publicKey(), '3'), {
    fee: o.fee ?? '400000',
    networkPassphrase: NETWORK_PASSPHRASES.testnet,
    timebounds: { minTime: 0, maxTime: NOW + 180 },
  })
    .addOperation(Operation.invokeContractFunction({ contract: pool, function: method, args, auth: [auth] }))
    .build()
    .toXDR();
}

function transfer(token: string, from: string, to: string, amount: bigint) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(token).toScAddress(),
        functionName: 'transfer',
        args: [new Address(from).toScVal(), new Address(to).toScVal(), u128(amount)],
      }),
    ),
    subInvocations: [],
  });
}

const DEPOSIT: RangeCall = {
  method: 'deposit_position',
  tickLower: 19000,
  tickUpper: 19200,
  amounts: [1_000_000_000n, 0n],
  minLiquidity: 25_000_000_000n,
};

function codeOf(xdrText: string, expected: RangeCall = DEPOSIT): string {
  try {
    inspectRangeCall(xdrText, {
      network: 'testnet',
      account: user.publicKey(),
      poolId: POOL,
      tokens: [USDC, XLM],
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

describe('inspectRangeCall', () => {
  it('accepts exactly the reviewed deposit', () => {
    expect(codeOf(call({}))).toBe('ACCEPTED');
  });

  it('accepts a withdrawal that authorizes no transfer of the account’s tokens', () => {
    const withdraw: RangeCall = {
      method: 'withdraw_position',
      tickLower: 19000,
      tickUpper: 19200,
      liquidity: 25_000_000_000n,
      minAmounts: [0n, 6_000_000_000n],
    };
    const args = [
      new Address(user.publicKey()).toScVal(),
      nativeToScVal(19000, { type: 'i32' }),
      nativeToScVal(19200, { type: 'i32' }),
      u128(25_000_000_000n),
      xdr.ScVal.scvVec([u128(0n), u128(6_000_000_000n)]),
    ];
    expect(codeOf(call({ method: 'withdraw_position', args, transfers: [] }), withdraw)).toBe('ACCEPTED');
    expect(
      codeOf(
        call({ method: 'withdraw_position', args, transfers: [transfer(XLM, user.publicKey(), POOL, 1n)] }),
        withdraw,
      ),
    ).toBe('AUTH_UNEXPECTED');
  });

  it.each([
    [
      'an unregistered pool',
      { pool: 'CDE57N6XTUPBKYYDGQMXX7E7SLNOLFY3JEQB4MULSMR2AKTSAENGX2HC' },
      'CONTRACT_NOT_ALLOWED',
    ],
    ['another function', { method: 'swap' }, 'FUNCTION_NOT_ALLOWED'],
    [
      'a different band',
      {
        args: [
          new Address(user.publicKey()).toScVal(),
          nativeToScVal(18800, { type: 'i32' }),
          nativeToScVal(19000, { type: 'i32' }),
          xdr.ScVal.scvVec([u128(1_000_000_000n), u128(0n)]),
          u128(25_000_000_000n),
        ],
      },
      'ARGUMENTS_MISMATCH',
    ],
    [
      'a position for someone else',
      {
        args: [
          new Address(stranger.publicKey()).toScVal(),
          nativeToScVal(19000, { type: 'i32' }),
          nativeToScVal(19200, { type: 'i32' }),
          xdr.ScVal.scvVec([u128(1_000_000_000n), u128(0n)]),
          u128(25_000_000_000n),
        ],
      },
      'ARGUMENTS_MISMATCH',
    ],
    [
      'a transfer above the deposit',
      { transfers: [transfer(USDC, user.publicKey(), POOL, 1_000_000_001n)] },
      'AUTH_UNEXPECTED',
    ],
    ['a transfer of the other token', { transfers: [transfer(XLM, user.publicKey(), POOL, 1n)] }, 'AUTH_UNEXPECTED'],
    [
      'a transfer to another address',
      { transfers: [transfer(USDC, user.publicKey(), stranger.publicKey(), 1n)] },
      'AUTH_UNEXPECTED',
    ],
    ['a fee above the limit', { fee: '10000001' }, 'FEE_ABOVE_LIMIT'],
  ] as const)('blocks %s', (_name, overrides, code) => {
    expect(codeOf(call(overrides as Parameters<typeof call>[0]))).toBe(code);
  });
});

describe('mainnet pool (live, read-only)', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')(
    'places a buy and a sell band on the registered mainnet pool and prices both deposits',
    async () => {
      const options = { network: 'mainnet' as const, rpcUrl: 'https://mainnet.sorobanrpc.com' };
      const poolId = RANGE_POOLS.mainnet[0]?.id ?? '';
      const state = await readRangePool(poolId, options);
      expect(state).toMatchObject({ usdcIndex: 1, tickSpacing: 20, feeBps: 10, depositsEnabled: true });
      const buy = bandForLimit('buy', state.usdcPerXlm * 0.98, state);
      const sell = bandForLimit('sell', state.usdcPerXlm * 1.02, state);
      const buyEstimate = await estimateRangeDeposit(
        poolId,
        buy,
        buy.depositIndex === 0 ? [100_000_000n, 0n] : [0n, 100_000_000n],
        options,
      );
      const sellEstimate = await estimateRangeDeposit(
        poolId,
        sell,
        sell.depositIndex === 0 ? [1_000_000_000n, 0n] : [0n, 1_000_000_000n],
        options,
      );
      console.log(
        JSON.stringify({
          price: state.usdcPerXlm,
          buy: {
            band: [buy.fillStartsAt, buy.fillCompletesAt],
            deposit: '10 USDC',
            xlmOnFill: Number(filledAmount(buy, buyEstimate.liquidity)) / 1e7,
          },
          sell: {
            band: [sell.fillStartsAt, sell.fillCompletesAt],
            deposit: '100 XLM',
            usdcOnFill: Number(filledAmount(sell, sellEstimate.liquidity)) / 1e7,
          },
        }),
      );
      expect(buyEstimate.used[buy.depositIndex]).toBe(100_000_000n);
      expect(sellEstimate.used[sell.depositIndex]).toBe(1_000_000_000n);
    },
    60_000,
  );
});
