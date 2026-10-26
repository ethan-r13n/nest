import { env } from 'cloudflare:workers';
import { RANGE_POOLS, type RangeCall, type RangePoolState, type RangePosition } from '@nest/adapters/aquarius/range';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { approvePlan, compareIntent, createPlan, preparePlan, submitPlan } from '../src/execution/lifecycle.ts';
import { createLimitCloseIntent, createLimitOrderIntent, listLimitOrders } from '../src/execution/limit.ts';
import type { ExecutionDeps } from '../src/execution/store.ts';

const START_MS = 1_800_000_000_000;
const POOL = RANGE_POOLS.testnet[0]?.id ?? '';
const USDC = 'CAZRY5GSFBFXD7H6GAFBA5YGYQTDXU4QKWKMYFWBAZFUCURN3WKX6LF5';
const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const LIQUIDITY = 25_000_000_000n;

function u128(value: bigint) {
  return nativeToScVal(value, { type: 'u128' });
}

/** A pool call shaped like what the RPC assembles: a deposit authorizes only its token transfer. */
function poolCall(account: string, call: RangeCall, nowMs: number) {
  const band = [nativeToScVal(call.tickLower, { type: 'i32' }), nativeToScVal(call.tickUpper, { type: 'i32' })];
  const owner = new Address(account).toScVal();
  const args =
    call.method === 'deposit_position'
      ? [owner, ...band, xdr.ScVal.scvVec(call.amounts.map(u128)), u128(call.minLiquidity)]
      : [owner, ...band, u128(call.liquidity), xdr.ScVal.scvVec(call.minAmounts.map(u128))];
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: new Address(POOL).toScAddress(),
    functionName: call.method,
    args,
  });
  const transfers =
    call.method === 'deposit_position'
      ? call.amounts.flatMap((amount, index) =>
          amount > 0n
            ? [
                new xdr.SorobanAuthorizedInvocation({
                  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
                    new xdr.InvokeContractArgs({
                      contractAddress: new Address(index === 0 ? USDC : XLM).toScAddress(),
                      functionName: 'transfer',
                      args: [owner, new Address(POOL).toScVal(), u128(amount)],
                    }),
                  ),
                  subInvocations: [],
                }),
              ]
            : [],
        )
      : [];
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),
      subInvocations: transfers,
    }),
  });
  return new TransactionBuilder(new Account(account, '9'), {
    fee: '400000',
    networkPassphrase: NETWORK_PASSPHRASES.testnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
  })
    .addOperation(Operation.invokeContractFunction({ contract: POOL, function: call.method, args, auth: [auth] }))
    .build()
    .toXDR();
}

function harness(network: 'testnet' | 'mainnet' = 'testnet') {
  const user = Keypair.random();
  const clock = { now: START_MS };
  const state = {
    tick: 18_150,
    position: null as RangePosition | null,
    bands: [] as { tickLower: number; tickUpper: number }[],
    built: [] as RangeCall[],
    tamper: null as ((call: RangeCall) => RangeCall) | null,
  };
  const pool = (): RangePoolState => ({
    poolId: POOL,
    name: 'Aquarius XLM/USDC concentrated',
    tokens: [USDC, XLM],
    usdcIndex: 0,
    tick: state.tick,
    tickSpacing: 200,
    tickBounds: [-887_200, 887_200],
    feeBps: 100,
    depositsEnabled: true,
    usdcPerXlm: 1.0001 ** -state.tick,
    observedAtMs: clock.now,
  });
  const deps: ExecutionDeps = {
    db: env.DB,
    config: {
      network,
      executionEnabled: true,
      writeAdapters: new Set(['aquarius_range']),
      soroswapApiKey: null,
      defindexApiKey: null,
      rpcUrl: 'https://rpc.test',
    },
    venue: null,
    lending: null,
    vaults: null,
    xoxno: null,
    ranges: {
      pool: async () => pool(),
      estimate: async (_poolId, _band, amounts) => ({ used: [amounts[0], amounts[1]], liquidity: LIQUIDITY }),
      position: async () => state.position,
      positions: async () => state.bands,
      build: async ({ account, call }) => {
        state.built.push(call);
        return poolCall(account, state.tamper ? state.tamper(call) : call, clock.now);
      },
    },
    buildTrustline: async () => {
      throw new Error('not used');
    },
    rpc: {
      simulate: async () => ({ ok: true, minResourceFee: 0n, returnValue: null }),
      send: async () => ({ status: 'PENDING', error: null }),
      get: async () => ({ status: 'SUCCESS', ledger: 777, returnValue: null }),
    },
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
  return { deps, user, clock, state };
}

async function planFor(h: ReturnType<typeof harness>, intentId: string, account = h.user.publicKey()) {
  const compared = await compareIntent(h.deps, intentId, account);
  const plan = await createPlan(h.deps, {
    intentId,
    quoteId: compared.selectedQuoteId ?? '',
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { compared, plan: plan.status === 'policy_checked' ? await preparePlan(h.deps, plan.id) : plan };
}

describe('limit orders', () => {
  it('only uses a registered Aquarius pool', async () => {
    const h = harness('mainnet');
    await expect(
      createLimitOrderIntent(h.deps, {
        side: 'buy',
        amountXlm: '100',
        priceUsdc: '0.15',
        poolId: 'CDE57N6XTUPBKYYDGQMXX7E7SLNOLFY3JEQB4MULSMR2AKTSAENGX2HC',
        source: 'chat',
      }),
    ).rejects.toThrow('not a registered Aquarius pool');
    const intent = await createLimitOrderIntent(h.deps, {
      side: 'buy',
      amountXlm: '100',
      priceUsdc: '0.15',
      source: 'chat',
    });
    expect(intent.poolId).toBe(RANGE_POOLS.mainnet[0]?.id);
  });

  it('places a limit buy as USDC in the band that fills at or below the limit, then confirms', async () => {
    const h = harness();
    const intent = await createLimitOrderIntent(h.deps, {
      side: 'buy',
      amountXlm: '100',
      priceUsdc: '0.15',
      source: 'chat',
    });
    expect(intent.deposit).toMatchObject({ symbol: 'USDC', amount: '15' });
    const { compared, plan } = await planFor(h, intent.id);
    const offer = compared.quotes[0];
    expect(offer && 'order' in offer ? offer.order : null).toMatchObject({ side: 'buy', limitPrice: 0.15 });
    expect(h.state.built).toEqual([
      {
        method: 'deposit_position',
        tickLower: 19000,
        tickUpper: 19200,
        amounts: [150_000_000n, 0n],
        minLiquidity: 24_875_000_000n,
      },
    ]);
    if (!plan.prepared) throw new Error(`not prepared: ${plan.errorCode}`);
    await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    const tx = TransactionBuilder.fromXDR(plan.prepared.xdr, NETWORK_PASSPHRASES.testnet);
    tx.sign(h.user);
    expect(await submitPlan(h.deps, plan.id, tx.toXDR())).toMatchObject({ status: 'confirmed', ledger: 777 });

    // The order then lists as waiting, and as filled once the price crosses the band.
    h.state.bands = [{ tickLower: 19000, tickUpper: 19200 }];
    h.state.position = { liquidity: LIQUIDITY, amounts: [150_000_000n, 0n], fees: [0n, 0n] };
    expect((await listLimitOrders(h.deps, h.user.publicKey())).orders[0]).toMatchObject({
      side: 'buy',
      status: 'waiting',
    });
    h.state.tick = 19_350;
    expect((await listLimitOrders(h.deps, h.user.publicKey())).orders[0]).toMatchObject({ status: 'filled' });
  });

  it('refuses a limit on the wrong side of the market', async () => {
    const h = harness();
    const intent = await createLimitOrderIntent(h.deps, {
      side: 'buy',
      amountXlm: '10',
      priceUsdc: '0.2',
      source: 'form',
    });
    await expect(compareIntent(h.deps, intent.id)).rejects.toThrow('must be below the current price');
  });

  it('blocks before signing when the price has moved into the band', async () => {
    const h = harness();
    const intent = await createLimitOrderIntent(h.deps, {
      side: 'sell',
      amountXlm: '50',
      priceUsdc: '0.18',
      source: 'form',
    });
    const compared = await compareIntent(h.deps, intent.id);
    const plan = await createPlan(h.deps, {
      intentId: intent.id,
      quoteId: compared.selectedQuoteId ?? '',
      accountId: h.user.publicKey(),
      idempotencyKey: crypto.randomUUID(),
    });
    h.state.tick = 16_900; // now inside the 16800–17000 band
    expect(await preparePlan(h.deps, plan.id)).toMatchObject({ status: 'blocked', errorCode: 'PRICE_MOVED' });
    expect(h.state.built).toEqual([]);
  });

  it('blocks a build whose band differs from the reviewed one', async () => {
    const h = harness();
    h.state.tamper = (call) => ({ ...call, tickLower: call.tickLower + 200, tickUpper: call.tickUpper + 200 });
    const intent = await createLimitOrderIntent(h.deps, {
      side: 'buy',
      amountXlm: '100',
      priceUsdc: '0.15',
      source: 'form',
    });
    const { plan } = await planFor(h, intent.id);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'ARGUMENTS_MISMATCH' });
  });

  it('withdraws a whole position, fees included, for the wallet that holds it', async () => {
    const h = harness();
    const close = await createLimitCloseIntent(h.deps, {
      poolId: POOL,
      tickLower: 19000,
      tickUpper: 19200,
      source: 'form',
    });
    await expect(compareIntent(h.deps, close.id)).rejects.toThrow('Connect your wallet');
    await expect(compareIntent(h.deps, close.id, h.user.publicKey())).rejects.toThrow('no limit order in that band');

    h.state.position = { liquidity: LIQUIDITY, amounts: [0n, 1_003_211_733n], fees: [0n, 3_211_733n] };
    const { plan } = await planFor(h, close.id);
    expect(plan.status).toBe('awaiting_review');
    expect(h.state.built).toEqual([
      {
        method: 'withdraw_position',
        tickLower: 19000,
        tickUpper: 19200,
        liquidity: LIQUIDITY,
        minAmounts: [0n, 993_179_615n],
      },
    ]);

    const elsewhere = await planFor(h, close.id, Keypair.random().publicKey());
    expect(elsewhere.plan).toMatchObject({ status: 'blocked', errorCode: 'ACCOUNT_MISMATCH' });
  });
});
