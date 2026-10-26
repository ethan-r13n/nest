import { env } from 'cloudflare:workers';
import type { MarketView, ReserveView } from '@nest/adapters/blend/reader';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import {
  XOXNO,
  type XoxnoAccount,
  type XoxnoCall,
  type XoxnoMarket,
  type XoxnoReserve,
} from '@nest/adapters/xoxno/lending';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { compareLending, createLendingIntent, listLendingPositions } from '../src/execution/lending.ts';
import { approvePlan, createPlan, preparePlan, readPlan, submitPlan } from '../src/execution/lifecycle.ts';
import { type ExecutionDeps, loadIntent } from '../src/execution/store.ts';

const START_MS = 1_800_000_000_000;
const DEPLOYMENT = XOXNO.mainnet;
const USDC_1000 = 10_000_000_000n;

function xoxnoReserve(symbol: 'XLM' | 'USDC', overrides: Partial<XoxnoReserve> = {}): XoxnoReserve {
  return {
    symbol,
    contractId: DEPLOYMENT.assets[symbol].contractId,
    hubId: 1,
    priceUsd: symbol === 'USDC' ? 1 : 0.1685,
    borrowApyPct: symbol === 'USDC' ? 2.56 : 0.01,
    supplyApyPct: symbol === 'USDC' ? 1.07 : 0,
    utilizationPct: 46.6,
    availableRaw: 119_736_169_839n,
    loanToValue: symbol === 'USDC' ? 0.76 : 0.75,
    liquidationThreshold: symbol === 'USDC' ? 0.8 : 0.78,
    canCollateral: true,
    canBorrow: true,
    ...overrides,
  };
}

function blendMarket(): MarketView {
  const reserve = (symbol: 'USDC' | 'XLM', contractId: string): ReserveView =>
    ({
      symbol,
      contractId,
      enabled: true,
      supplyApyPct: 5,
      borrowApyPct: 7.99,
      utilizationPct: 60,
      availableRaw: 1_000_000_000_000n,
      collateralFactor: 0.75,
      liabilityFactor: 1.05,
      priceUsd: symbol === 'USDC' ? 1 : 0.1685,
    }) as ReserveView;
  return {
    poolId: 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS',
    name: 'Blend YieldBlox',
    status: 1,
    statusLabel: 'Active',
    canSupply: true,
    canBorrow: true,
    reserves: [
      reserve('USDC', 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'),
      reserve('XLM', 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'),
    ],
    observedAtMs: START_MS,
  } as MarketView;
}

function hubAsset(contractId: string) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('asset'), val: new Address(contractId).toScVal() }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hub_id'), val: nativeToScVal(1, { type: 'u32' }) }),
  ]);
}

/** A controller call shaped like the RPC assembles it: a supply authorizes its token transfer to the pool. */
function controllerCall(account: string, call: XoxnoCall, nowMs: number) {
  const assets = xdr.ScVal.scvVec(
    call.assets.map((asset) =>
      xdr.ScVal.scvVec([
        hubAsset(DEPLOYMENT.assets[asset.symbol].contractId),
        nativeToScVal(asset.amount, { type: 'i128' }),
      ]),
    ),
  );
  const caller = new Address(account).toScVal();
  const id = nativeToScVal(call.accountId, { type: 'u64' });
  const args =
    call.method === 'supply'
      ? [caller, id, nativeToScVal(call.spokeId, { type: 'u32' }), assets]
      : [caller, id, assets, xdr.ScVal.scvVoid()];
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: new Address(DEPLOYMENT.controller).toScAddress(),
    functionName: call.method,
    args,
  });
  const transfers =
    call.method === 'supply'
      ? call.assets.map(
          (asset) =>
            new xdr.SorobanAuthorizedInvocation({
              function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
                new xdr.InvokeContractArgs({
                  contractAddress: new Address(DEPLOYMENT.assets[asset.symbol].contractId).toScAddress(),
                  functionName: 'transfer',
                  args: [caller, new Address(DEPLOYMENT.pool).toScVal(), nativeToScVal(asset.amount, { type: 'i128' })],
                }),
              ),
              subInvocations: [],
            }),
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
    fee: '300000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: DEPLOYMENT.controller, function: call.method, args, auth: [auth] }),
    )
    .build()
    .toXDR();
}

function createFixture() {
  const user = Keypair.random();
  const clock = { now: START_MS };
  const state = {
    usdc: xoxnoReserve('USDC'),
    accounts: [] as XoxnoAccount[],
    built: [] as XoxnoCall[],
    tamper: null as ((call: XoxnoCall) => XoxnoCall) | null,
  };
  const market = (): XoxnoMarket => ({
    controller: DEPLOYMENT.controller,
    name: 'XOXNO Blue Chip',
    spokeId: 1,
    reserves: { USDC: state.usdc, XLM: xoxnoReserve('XLM') },
    minBorrowCollateralUsd: 5,
    observedAtMs: clock.now,
  });
  const deps: ExecutionDeps = {
    db: env.DB,
    config: {
      network: 'mainnet',
      executionEnabled: true,
      writeAdapters: new Set(['blend', 'xoxno']),
      soroswapApiKey: null,
      defindexApiKey: null,
      rpcUrl: 'https://rpc.test',
    },
    venue: null,
    vaults: null,
    ranges: null,
    lending: {
      markets: async () => [blendMarket()],
      positions: async () => [],
      health: async () => ({ before: null, after: 1.6, collateralUsdAfter: 0, liabilitiesUsdAfter: 0 }),
      build: async () => {
        throw new Error('not used');
      },
    },
    xoxno: {
      market: async () => market(),
      accounts: async () => state.accounts,
      build: async ({ account, call }) => {
        state.built.push(call);
        return controllerCall(account, state.tamper ? state.tamper(call) : call, clock.now);
      },
    },
    buildTrustline: async () => {
      throw new Error('not used');
    },
    rpc: {
      simulate: async () => ({ ok: true, minResourceFee: 0n, returnValue: null }),
      send: async () => ({ status: 'PENDING', error: null }),
      get: async () => ({ status: 'SUCCESS', ledger: 654, returnValue: null }),
    },
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
  return { deps, user, clock, state };
}

async function borrowPlan(h: ReturnType<typeof createFixture>, intentId: string) {
  const compared = await compareLending(h.deps, await loadIntent(h.deps, intentId));
  const quote = compared.quotes.find((offer) => offer.venue === 'xoxno');
  if (!quote) throw new Error(`no XOXNO offer: ${JSON.stringify(compared.excluded)}`);
  const plan = await createPlan(h.deps, {
    intentId,
    quoteId: quote.id,
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { compared, plan: await preparePlan(h.deps, plan.id) };
}

async function signAndSubmit(h: ReturnType<typeof createFixture>, plan: Awaited<ReturnType<typeof preparePlan>>) {
  if (!plan.prepared) throw new Error(`not prepared: ${plan.errorCode}`);
  await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
  const tx = TransactionBuilder.fromXDR(plan.prepared.xdr, NETWORK_PASSPHRASES.mainnet);
  tx.sign(h.user);
  return submitPlan(h.deps, plan.id, tx.toXDR());
}

describe('XOXNO borrowing', () => {
  it('compares XOXNO with Blend and picks the cheaper loan, collateral sized for health 1.6', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });
    const compared = await compareLending(h.deps, await loadIntent(h.deps, intent.id));
    expect(compared.quotes.map((offer) => [offer.venue, offer.pool.name, offer.borrowApyPct])).toEqual([
      ['xoxno', 'XOXNO Blue Chip', 2.56],
      ['blend', 'Blend YieldBlox', 7.99],
    ]);
    const best = compared.quotes[0];
    expect(compared.selectedQuoteId).toBe(best?.id);
    // 1000 USDC × 1.6 / ($0.1685 × 0.78 liquidation threshold) ≈ 12,173.8 XLM.
    expect(Number(best?.collateral?.amount)).toBeCloseTo(12_173.8, 0);
    expect(best?.estimatedHealth).toBeCloseTo(1.6, 3);
  });

  it('names XOXNO among the exclusions when it cannot lend that much', async () => {
    const h = createFixture();
    h.state.usdc = xoxnoReserve('USDC', { availableRaw: 5_000_000_000n });
    const intent = await createLendingIntent(h.deps, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });
    const compared = await compareLending(h.deps, await loadIntent(h.deps, intent.id));
    expect(compared.quotes.map((offer) => offer.venue)).toEqual(['blend']);
    expect(compared.excluded).toContainEqual({
      poolId: DEPLOYMENT.controller,
      name: 'XOXNO',
      reason: 'XOXNO has 500 USDC available to borrow.',
    });
  });

  it('deposits the reviewed collateral first, then borrows on the account it opened', async () => {
    const h = createFixture();
    const intent = await createLendingIntent(h.deps, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'chat' });

    const first = await borrowPlan(h, intent.id);
    const collateral = h.state.built[0];
    expect(collateral).toMatchObject({ method: 'supply', accountId: 0n, spokeId: 1 });
    expect(first.plan.prepared).toMatchObject({
      step: 'collateral',
      requests: [{ type: 'supplyCollateral', symbol: 'XLM' }],
    });
    expect(await signAndSubmit(h, first.plan)).toMatchObject({ status: 'confirmed', ledger: 654 });

    // XOXNO opened account 41 with that collateral; the loan now builds on it.
    const deposited = collateral?.method === 'supply' ? (collateral.assets[0]?.amount ?? 0n) : 0n;
    h.state.accounts = [
      {
        accountId: 41n,
        spokeId: 1,
        collateralRaw: { XLM: deposited, USDC: 0n },
        debtRaw: { XLM: 0n, USDC: 0n },
        healthFactor: null,
      },
    ];
    const second = await borrowPlan(h, intent.id);
    expect(h.state.built[1]).toEqual({
      method: 'borrow',
      accountId: 41n,
      assets: [{ symbol: 'USDC', amount: USDC_1000 }],
    });
    expect(second.plan.prepared).toMatchObject({
      step: 'borrow',
      requests: [{ type: 'borrow', symbol: 'USDC', amount: '1000' }],
    });
    const prepared = second.plan.prepared;
    expect(prepared && 'health' in prepared ? prepared.health.after : null).toBeCloseTo(1.6, 2);
    expect(await signAndSubmit(h, second.plan)).toMatchObject({ status: 'confirmed' });
    expect(await readPlan(h.deps, second.plan.id)).toMatchObject({
      status: 'confirmed',
      offer: { venue: 'xoxno', pool: { name: 'XOXNO Blue Chip' } },
    });
  });

  it('blocks a build that differs from the reviewed call', async () => {
    const h = createFixture();
    h.state.tamper = (call) => ({ ...call, accountId: 7n });
    const intent = await createLendingIntent(h.deps, { kind: 'borrow', asset: 'USDC', amount: '1000', source: 'form' });
    expect((await borrowPlan(h, intent.id)).plan).toMatchObject({ status: 'blocked', errorCode: 'ARGUMENTS_MISMATCH' });
  });

  it('borrows on XOXNO only: lending and exits there go through Blend', async () => {
    const h = createFixture();
    for (const kind of ['supply', 'repay', 'withdraw'] as const) {
      await expect(
        createLendingIntent(h.deps, {
          kind,
          asset: 'USDC',
          amount: '10',
          poolId: DEPLOYMENT.controller,
          source: 'form',
        }),
      ).rejects.toThrow('Nest borrows on XOXNO');
    }
    const intent = await createLendingIntent(h.deps, {
      kind: 'borrow',
      asset: 'USDC',
      amount: '1000',
      poolId: DEPLOYMENT.controller,
      source: 'form',
    });
    const compared = await compareLending(h.deps, await loadIntent(h.deps, intent.id));
    expect(compared.quotes.map((offer) => offer.venue)).toEqual(['xoxno']);
  });

  it('lists the wallet’s XOXNO accounts next to its Blend positions', async () => {
    const h = createFixture();
    h.state.accounts = [
      {
        accountId: 41n,
        spokeId: 1,
        collateralRaw: { XLM: 121_738_000_000n, USDC: 0n },
        debtRaw: { XLM: 0n, USDC: USDC_1000 },
        healthFactor: 1.6,
      },
    ];
    expect(await listLendingPositions(h.deps, h.user.publicKey())).toMatchObject({
      blend: { available: true, pools: [] },
      xoxno: {
        available: true,
        name: 'XOXNO Blue Chip',
        accounts: [
          {
            accountId: '41',
            collateral: [{ symbol: 'XLM', amount: '12173.8' }],
            debt: [{ symbol: 'USDC', amount: '1000' }],
            healthFactor: 1.6,
          },
        ],
      },
    });
    await expect(listLendingPositions(h.deps, 'G')).rejects.toThrow('Send a Stellar account');
  });
});
