import { env } from 'cloudflare:workers';
import { BLEND_POOLS, lendingAsset } from '@nest/adapters/blend/markets';
import type { MarketView, ReserveView } from '@nest/adapters/blend/reader';
import { BLEND_REQUEST_TYPES, type LendingRequest } from '@nest/adapters/blend/submit';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { createLendingIntent } from '../src/execution/lending.ts';
import { approvePlan, compareIntent, createPlan, preparePlan, submitPlan } from '../src/execution/lifecycle.ts';
import type { ExecutionDeps } from '../src/execution/store.ts';
import { prepareTrustline, submitTrustline } from '../src/execution/trustline.ts';

const START_MS = 1_800_000_000_000;
const [FIXED, YIELDBLOX] = BLEND_POOLS.mainnet.map((pool) => pool.id) as [string, string];
const usdc = lendingAsset('mainnet', 'USDC');
const xlm = lendingAsset('mainnet', 'XLM');

function reserve(symbol: 'USDC' | 'XLM', overrides: Partial<ReserveView> = {}): ReserveView {
  return {
    symbol,
    contractId: symbol === 'USDC' ? usdc.contractId : xlm.contractId,
    supplyApyPct: 5,
    borrowApyPct: 9,
    utilizationPct: 60,
    suppliedRaw: 100_000_0000000n,
    borrowedRaw: 60_000_0000000n,
    availableRaw: 40_000_0000000n,
    collateralFactor: symbol === 'XLM' ? 0.75 : 0.95,
    liabilityFactor: 1 / 0.95,
    enabled: true,
    priceUsd: symbol === 'XLM' ? 0.3 : 1,
    ...overrides,
  };
}

function market(poolId: string, name: string, status: number, usdcOverrides: Partial<ReserveView>): MarketView {
  return {
    poolId,
    name,
    status,
    statusLabel: status === 3 ? 'On ice' : 'Active',
    canSupply: status <= 3,
    canBorrow: status <= 1,
    reserves: [reserve('USDC', usdcOverrides), reserve('XLM')],
    observedAtMs: START_MS,
  };
}

/** A pool submit shaped like what the RPC assembles: only the supplied transfers are authorized. */
function poolSubmit(account: string, poolId: string, requests: readonly LendingRequest[], nowMs: number) {
  const encoded = requests.map((request) =>
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('address'), val: new Address(request.contractId).toScVal() }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: nativeToScVal(request.amount, { type: 'i128' }) }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('request_type'),
        val: nativeToScVal(BLEND_REQUEST_TYPES[request.type], { type: 'u32' }),
      }),
    ]),
  );
  const args = [
    new Address(account).toScVal(),
    new Address(account).toScVal(),
    new Address(account).toScVal(),
    xdr.ScVal.scvVec(encoded),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(poolId).toScAddress(),
    functionName: 'submit',
    args,
  });
  const transfers = requests
    .filter((request) => request.type !== 'borrow')
    .map(
      (request) =>
        new xdr.SorobanAuthorizedInvocation({
          function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
            new xdr.InvokeContractArgs({
              contractAddress: new Address(request.contractId).toScAddress(),
              functionName: 'transfer',
              args: [
                new Address(account).toScVal(),
                new Address(poolId).toScVal(),
                nativeToScVal(request.amount, { type: 'i128' }),
              ],
            }),
          ),
          subInvocations: [],
        }),
    );
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: transfers,
    }),
  });
  return new TransactionBuilder(new Account(account, '9'), {
    fee: '200000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
  })
    .addOperation(Operation.invokeContractFunction({ contract: poolId, function: 'submit', args, auth: [auth] }))
    .build()
    .toXDR();
}

function createFixture(options: { writeAdapters?: string[] } = {}) {
  const user = Keypair.random();
  const clock = { now: START_MS };
  const state = {
    healthAfter: 1.6 as number | null,
    tamper: null as ((requests: readonly LendingRequest[]) => LendingRequest[]) | null,
    refusal: null as VenueRefusal | null,
    built: [] as LendingRequest[][],
  };
  const deps: ExecutionDeps = {
    db: env.DB,
    config: {
      network: 'mainnet',
      executionEnabled: true,
      writeAdapters: new Set(options.writeAdapters ?? ['blend']),
      soroswapApiKey: null,
      rpcUrl: 'https://rpc.test',
    },
    venue: null,
    buildTrustline: async () => {
      throw new Error('not used');
    },
    lending: {
      markets: async () => [
        market(FIXED, 'Blend Fixed', 0, { supplyApyPct: 5.88, borrowApyPct: 10.15 }),
        market(YIELDBLOX, 'Blend YieldBlox', 3, { supplyApyPct: 6.39, borrowApyPct: 7.99 }),
      ],
      health: async () => ({ before: null, after: state.healthAfter, collateralUsdAfter: 0, liabilitiesUsdAfter: 0 }),
      build: async ({ poolId, account, requests }) => {
        if (state.refusal) throw state.refusal;
        state.built.push([...requests]);
        return poolSubmit(account, poolId, state.tamper ? state.tamper(requests) : requests, clock.now);
      },
    },
    rpc: {
      simulate: async () => ({ ok: true, minResourceFee: 0n, returnValue: null }),
      send: async () => ({ status: 'PENDING', error: null }),
      get: async () => ({ status: 'SUCCESS', ledger: 321, returnValue: null }),
    },
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
  return { deps, user, clock, state };
}

async function preparedLending(h: ReturnType<typeof createFixture>, input: Parameters<typeof createLendingIntent>[1]) {
  const intent = await createLendingIntent(h.deps, input);
  const compared = await compareIntent(h.deps, intent.id);
  if (!('excluded' in compared) || !compared.selectedQuoteId) throw new Error('no offer');
  const plan = await createPlan(h.deps, {
    intentId: intent.id,
    quoteId: compared.selectedQuoteId,
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { compared, plan: await preparePlan(h.deps, plan.id) };
}

describe('lending offers', () => {
  it('ranks supply by APY across pools that accept deposits, with withdrawal timing', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, { kind: 'supply', asset: 'USDC', amount: '100', source: 'chat' });
    const compared = await compareIntent(h.deps, intent.id);
    if (!('excluded' in compared)) throw new Error('expected lending offers');
    expect(compared.quotes.map((quote) => [quote.pool.name, quote.supplyApyPct])).toEqual([
      ['Blend YieldBlox', 6.39],
      ['Blend Fixed', 5.88],
    ]);
    expect(compared.selectedQuoteId).toBe(compared.quotes[0]?.id);
    expect(compared.quotes[0]?.withdrawalTiming).toMatchObject({ lockup: 'none', cooldown: 'none' });
    expect(compared.excluded).toEqual([]);
  });

  it('picks the cheapest pool that allows borrowing, sizes collateral and names the excluded pool', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });
    expect(intent.collateral).toEqual({ symbol: 'XLM' });
    const compared = await compareIntent(h.deps, intent.id);
    if (!('excluded' in compared)) throw new Error('expected lending offers');
    expect(compared.quotes).toHaveLength(1);
    const [offer] = compared.quotes;
    expect(offer?.pool.name).toBe('Blend Fixed');
    // 1000 USDC × 1/0.95 liability factor × 1.6 target ÷ (0.75 collateral factor × $0.30).
    expect(Number(offer?.collateral?.amount)).toBeCloseTo(7485.38, 1);
    expect(offer?.estimatedHealth).toBeCloseTo(1.6, 4);
    expect(compared.excluded).toEqual([
      { poolId: YIELDBLOX, name: 'Blend YieldBlox', reason: 'The pool is on ice, so borrowing is disabled.' },
    ]);
  });

  it('excludes a pool without enough liquidity to lend', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, {
      kind: 'borrow',
      asset: 'USDC',
      amount: '50000',
      source: 'form',
    });
    const compared = await compareIntent(h.deps, intent.id);
    if (!('excluded' in compared)) throw new Error('expected lending offers');
    expect(compared.selectedQuoteId).toBeNull();
    expect(compared.excluded.map((entry) => entry.reason)).toContain('The pool has 40,000 USDC available to borrow.');
  });

  it('blocks a borrow whose stated collateral is below liquidation at plan time', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, {
      kind: 'borrow',
      asset: 'USDC',
      amount: '1000',
      collateralAmount: '3000',
      source: 'form',
    });
    const compared = await compareIntent(h.deps, intent.id);
    if (!('excluded' in compared) || !compared.selectedQuoteId) throw new Error('no offer');
    const plan = await createPlan(h.deps, {
      intentId: intent.id,
      quoteId: compared.selectedQuoteId,
      accountId: h.user.publicKey(),
      idempotencyKey: crypto.randomUUID(),
    });
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'HEALTH_TOO_LOW' });
  });

  it('rejects collateral on a supply and an unregistered pool', async () => {
    const h = createFixture();
    await expect(
      createLendingIntent(h.deps, {
        kind: 'supply',
        asset: 'USDC',
        amount: '1',
        collateralAsset: 'XLM',
        source: 'form',
      }),
    ).rejects.toThrow('Collateral applies to borrowing only.');
    await expect(
      createLendingIntent(h.deps, {
        kind: 'supply',
        asset: 'USDC',
        amount: '1',
        poolId: 'CDE57N6XTUPBKYYDGQMXX7E7SLNOLFY3JEQB4MULSMR2AKTSAENGX2HC',
        source: 'form',
      }),
    ).rejects.toThrow('registered Blend pool');
  });
});

describe('lending lifecycle', () => {
  it('supplies through review, signature and confirmation', async () => {
    const h = createFixture();
    const { plan } = await preparedLending(h, { kind: 'supply', asset: 'USDC', amount: '100', source: 'chat' });
    expect(plan.status).toBe('awaiting_review');
    if (!plan.prepared || !('requests' in plan.prepared)) throw new Error('not prepared');
    expect(plan.prepared.requests).toEqual([{ type: 'supply', symbol: 'USDC', amount: '100', raw: '1000000000' }]);
    expect(h.state.built).toEqual([[{ type: 'supply', contractId: usdc.contractId, amount: 1_000_000_000n }]]);
    const approved = await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    expect(approved.status).toBe('awaiting_signature');
    const tx = TransactionBuilder.fromXDR(plan.prepared.xdr, NETWORK_PASSPHRASES.mainnet);
    tx.sign(h.user);
    expect(await submitPlan(h.deps, plan.id, tx.toXDR())).toMatchObject({ status: 'confirmed', ledger: 321 });
  });

  it('borrows with collateral in one submit and reports health', async () => {
    const h = createFixture();
    const { plan } = await preparedLending(h, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });
    if (!plan.prepared || !('health' in plan.prepared)) throw new Error('not prepared');
    expect(plan.prepared.requests.map((request) => request.type)).toEqual(['supplyCollateral', 'borrow']);
    expect(plan.prepared.health).toEqual({ before: null, after: 1.6, warning: false });
  });

  it('blocks when the pool health check says the account would be liquidatable', async () => {
    const h = createFixture();
    h.state.healthAfter = 0.97;
    const { plan } = await preparedLending(h, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'HEALTH_TOO_LOW' });
  });

  it('blocks a build whose requests differ from the reviewed ones', async () => {
    const h = createFixture();
    h.state.tamper = (requests) => requests.map((request) => ({ ...request, amount: request.amount + 1n }));
    const { plan } = await preparedLending(h, { kind: 'supply', asset: 'USDC', amount: '100', source: 'chat' });
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'REQUESTS_MISMATCH' });
  });

  it('blocks with the venue reason when the account cannot fund it', async () => {
    const h = createFixture();
    h.state.refusal = new VenueRefusal('TRUSTLINE_MISSING', 'Add a USDC trustline first.');
    const { plan } = await preparedLending(h, { kind: 'borrow', asset: 'USDC', amount: '10', source: 'chat' });
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'TRUSTLINE_MISSING' });
  });

  it('refuses to submit unless Blend is an enabled write adapter', async () => {
    const h = createFixture({ writeAdapters: ['soroswap'] });
    const { plan } = await preparedLending(h, { kind: 'supply', asset: 'USDC', amount: '100', source: 'chat' });
    if (!plan.prepared) throw new Error('not prepared');
    await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    await expect(submitPlan(h.deps, plan.id, plan.prepared.xdr)).rejects.toThrow('turned off');
  });
});

describe('trustline step', () => {
  it('builds the Blend USDC trustline, then submits only that signed trustline', async () => {
    const h = createFixture();
    const blendUsdc = lendingAsset('mainnet', 'USDC').classic;
    h.deps.buildTrustline = async ({ account, asset, nowMs }) => {
      const tx = new TransactionBuilder(new Account(account, '9'), {
        fee: '10000',
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
        timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
      })
        .addOperation(Operation.changeTrust({ asset }))
        .build();
      return { xdr: tx.toXDR(), hash: Buffer.from(tx.hash()).toString('hex') };
    };
    const prepared = await prepareTrustline(h.deps, { accountId: h.user.publicKey(), use: 'lending' });
    expect(prepared.asset).toEqual({ code: 'USDC', issuer: blendUsdc.getIssuer() });

    const unsigned = submitTrustline(h.deps, {
      accountId: h.user.publicKey(),
      use: 'lending',
      signedXdr: prepared.xdr,
    });
    await expect(unsigned).rejects.toThrow('not signed by the reviewed account');

    const tx = TransactionBuilder.fromXDR(prepared.xdr, NETWORK_PASSPHRASES.mainnet);
    tx.sign(h.user);
    expect(
      await submitTrustline(h.deps, { accountId: h.user.publicKey(), use: 'lending', signedXdr: tx.toXDR() }),
    ).toMatchObject({ status: 'confirmed', ledger: 321 });
  });
});
