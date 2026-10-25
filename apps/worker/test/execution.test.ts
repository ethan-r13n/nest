import { env, exports } from 'cloudflare:workers';
import { SOROSWAP_CONTRACTS } from '@nest/adapters/soroswap/contracts';
import { swapAsset } from '@nest/adapters/stellar/assets';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import {
  Account,
  Address,
  Keypair,
  nativeToScVal,
  Operation,
  type Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { ExecutionConfig } from '../src/config.ts';
import type { SwapRpc } from '../src/execution/rpc.ts';
import {
  approvePlan,
  compareSwap,
  createSwapIntent,
  createSwapPlan,
  type ExecutionDeps,
  preparePlan,
  readPlan,
  submitPlan,
} from '../src/execution/swap.ts';

const ORIGIN = 'https://nest.test';
const START_MS = 1_800_000_000_000;
const AMOUNT_IN = 1_000_000_000n; // 100 USDC
const AMOUNT_OUT = 2_600_000_000n;
const MIN_OUT = 2_587_000_000n;
const sell = swapAsset('mainnet', 'USDC');
const buy = swapAsset('mainnet', 'XLM');

interface ExecutionFixture {
  deps: ExecutionDeps;
  user: Keypair;
  clock: { now: number };
  sent: string[];
  rpcScript: {
    send: ('PENDING' | 'ERROR' | 'TRY_AGAIN_LATER' | 'THROW')[];
    get: ('SUCCESS' | 'FAILED' | 'NOT_FOUND')[];
  };
  build: { minOut: bigint };
}

function createFixture(overrides: Partial<ExecutionConfig> = {}): ExecutionFixture {
  const user = Keypair.random();
  const clock = { now: START_MS };
  const sent: string[] = [];
  const rpcScript: ExecutionFixture['rpcScript'] = { send: ['PENDING'], get: ['SUCCESS'] };
  const build = { minOut: MIN_OUT };
  const rpc: SwapRpc = {
    simulate: async () => ({ ok: true, minResourceFee: 50_000n, returnValue: AMOUNT_OUT }),
    send: async (tx) => {
      const next = rpcScript.send.shift() ?? 'PENDING';
      if (next === 'THROW') throw new Error('network down');
      sent.push(Buffer.from(tx.hash()).toString('hex'));
      return { status: next, error: next === 'ERROR' ? 'tx_failed' : null };
    },
    get: async () => {
      const next = rpcScript.get.shift() ?? 'NOT_FOUND';
      if (next === 'SUCCESS') return { status: 'SUCCESS', ledger: 123, returnValue: AMOUNT_OUT };
      if (next === 'FAILED') return { status: 'FAILED', ledger: 124 };
      return { status: 'NOT_FOUND' };
    },
  };
  const deps: ExecutionDeps = {
    db: env.DB,
    config: {
      network: 'mainnet',
      executionEnabled: true,
      writeAdapters: new Set(['soroswap']),
      soroswapApiKey: 'test',
      rpcUrl: 'https://rpc.test',
      ...overrides,
    },
    venue: {
      id: 'soroswap',
      quote: async (request) => ({
        amountIn: request.amountIn,
        amountOut: AMOUNT_OUT,
        minAmountOut: MIN_OUT,
        priceImpactBps: 12,
        platform: 'aggregator',
        protocols: ['soroswap', 'aqua'],
        raw: { assetIn: request.sell.ref.contractId, amountIn: request.amountIn.toString() },
      }),
      build: async (request) => aggregatorSwap(request.from, clock.now, build.minOut).toXDR(),
    },
    rpc,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
  return { deps, user, clock, sent, rpcScript, build };
}

/** The transaction Soroswap's API builds for a G-account swap: Aggregator v3 keeping a 0.1% fee. */
function aggregatorSwap(from: string, nowMs: number, minOut: bigint): Transaction {
  const contract = SOROSWAP_CONTRACTS.mainnet.aggregatorV3;
  const route = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount_in'),
      val: nativeToScVal(AMOUNT_IN - AMOUNT_IN / 1000n, { type: 'i128' }),
    }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hops'), val: xdr.ScVal.scvVec([]) }),
  ]);
  const args = [
    new Address(from).toScVal(),
    new Address(sell.ref.contractId).toScVal(),
    nativeToScVal(AMOUNT_IN, { type: 'i128' }),
    new Address(buy.ref.contractId).toScVal(),
    nativeToScVal(minOut, { type: 'i128' }),
    xdr.ScVal.scvVec([route]),
    xdr.ScVal.scvVoid(),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(contract).toScAddress(),
    functionName: 'swap_exact_in',
    args,
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: [],
    }),
  });
  return new TransactionBuilder(new Account(from, '7'), {
    fee: '120000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 300 },
  })
    .addOperation(Operation.invokeContractFunction({ contract, function: 'swap_exact_in', args, auth: [auth] }))
    .build();
}

function walletSign(xdrText: string, signer: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdrText, NETWORK_PASSPHRASES.mainnet);
  tx.sign(signer);
  return tx.toXDR();
}

async function preparedPlan(h: ExecutionFixture) {
  const intent = await createSwapIntent(h.deps, { sell: 'USDC', buy: 'XLM', amount: '100', source: 'chat' });
  const quote = await compareSwap(h.deps, intent.id);
  const plan = await createSwapPlan(h.deps, {
    intentId: intent.id,
    quoteId: quote.id,
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { intent, quote, plan: await preparePlan(h.deps, plan.id) };
}

async function signedPlan(h: ExecutionFixture) {
  const { plan } = await preparedPlan(h);
  if (!plan.prepared) throw new Error(`not prepared: ${plan.status} ${plan.errorCode}`);
  const approved = await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
  return { plan: approved, signedXdr: walletSign(plan.prepared.xdr, h.user) };
}

async function eventsOf(planId: string) {
  const { results } = await env.DB.prepare(
    'SELECT from_status, to_status, actor FROM plan_events WHERE plan_id = ? ORDER BY id',
  )
    .bind(planId)
    .all<{ from_status: string | null; to_status: string; actor: string }>();
  return results.map((row) => `${row.from_status ?? '∅'}→${row.to_status}:${row.actor}`);
}

describe('swap intents', () => {
  it('stores the exact raw amount and refuses unusable input', async () => {
    const { deps } = createFixture();
    const intent = await createSwapIntent(deps, { sell: 'USDC', buy: 'XLM', amount: '100.5', source: 'form' });
    expect(intent.sell).toMatchObject({ symbol: 'USDC', amount: '100.5', raw: '1005000000' });
    expect(intent.buy.canonicalId).toBe('XLM');

    for (const amount of ['0', '-1', '1e3', '1.00000001', 'abc']) {
      await expect(createSwapIntent(deps, { sell: 'USDC', buy: 'XLM', amount, source: 'form' })).rejects.toThrow();
    }
    await expect(createSwapIntent(deps, { sell: 'XLM', buy: 'XLM', amount: '1', source: 'form' })).rejects.toThrow(
      /different/,
    );
  });
});

describe('swap lifecycle', () => {
  it('goes from intent to a confirmed swap through review, approval and the user signature', async () => {
    const h = createFixture();
    const { quote, plan } = await preparedPlan(h);

    expect(quote).toMatchObject({
      expectedOut: { amount: '260' },
      minimumOut: { amount: '258.7' },
      nestFeeBps: 0,
      slippageBps: 50,
    });
    expect(plan.status).toBe('awaiting_review');
    expect(plan.prepared).toMatchObject({
      route: 'soroban',
      enforcedMinimumOut: { amount: '258.7' },
      simulatedOut: { amount: '260' },
      fee: { amount: '0.012' },
      providerFee: { symbol: 'USDC', amount: '0.1', bps: 10 },
    });
    expect(plan.policy.verdict).toBe('allow');

    const approved = await approvePlan(h.deps, plan.id, {
      digest: plan.digest,
      preparedHash: plan.prepared?.hash ?? '',
    });
    expect(approved.status).toBe('awaiting_signature');
    const done = await submitPlan(h.deps, plan.id, walletSign(plan.prepared?.xdr ?? '', h.user));

    expect(done).toMatchObject({
      status: 'confirmed',
      txHash: plan.prepared?.hash,
      received: { amount: '260' },
      ledger: 123,
    });
    expect(done.explorerUrl).toContain('/public/tx/');
    expect(h.sent).toEqual([plan.prepared?.hash]);
    expect(await eventsOf(plan.id)).toEqual([
      '∅→policy_checked:user',
      'policy_checked→awaiting_review:system',
      'awaiting_review→awaiting_signature:user',
      'awaiting_signature→submitted:user',
      'submitted→confirming:system',
      'confirming→confirmed:system',
    ]);
  });

  it('blocks a built transaction that accepts less than the reviewed minimum', async () => {
    const h = createFixture();
    h.build.minOut = MIN_OUT - 1n;
    const { plan } = await preparedPlan(h);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'MIN_OUT_TOO_LOW', prepared: null });
  });

  it('stops a plan with the venue’s reason when it refuses to build', async () => {
    const h = createFixture();
    if (!h.deps.venue) throw new Error('no venue');
    h.deps.venue.build = async () => {
      throw new VenueRefusal('TRUSTLINE_MISSING', 'Add XLM to your wallet before buying it.');
    };
    const { plan } = await preparedPlan(h);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'TRUSTLINE_MISSING', prepared: null });
  });

  it('only submits through the venue that quoted the plan', async () => {
    const h = createFixture({ writeAdapters: new Set(['sdex']) });
    const { plan, signedXdr } = await signedPlan(h);
    await expect(submitPlan(h.deps, plan.id, signedXdr)).rejects.toThrow(/turned off/);
  });

  it('expires a plan whose quote went stale before preparation', async () => {
    const h = createFixture();
    const intent = await createSwapIntent(h.deps, { sell: 'USDC', buy: 'XLM', amount: '100', source: 'chat' });
    const quote = await compareSwap(h.deps, intent.id);
    const plan = await createSwapPlan(h.deps, {
      intentId: intent.id,
      quoteId: quote.id,
      accountId: h.user.publicKey(),
      idempotencyKey: crypto.randomUUID(),
    });
    h.clock.now += 31_000;
    expect(await preparePlan(h.deps, plan.id)).toMatchObject({ status: 'expired', errorCode: 'QUOTE_EXPIRED' });
  });

  it('refuses approval of anything but the reviewed digest and transaction', async () => {
    const h = createFixture();
    const { plan } = await preparedPlan(h);
    await expect(
      approvePlan(h.deps, plan.id, { digest: '0'.repeat(64), preparedHash: plan.prepared?.hash ?? '' }),
    ).rejects.toThrow(/changed/);
    await expect(approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: 'f'.repeat(64) })).rejects.toThrow(
      /changed/,
    );
  });

  it('keeps execution off unless both switches allow it', async () => {
    for (const config of [{ executionEnabled: false }, { writeAdapters: new Set<string>() }]) {
      const h = createFixture(config);
      const { plan, signedXdr } = await signedPlan(h);
      await expect(submitPlan(h.deps, plan.id, signedXdr)).rejects.toThrow(/turned off/);
      expect(h.sent).toEqual([]);
    }
  });

  it('refuses an unsigned, wrongly signed or different transaction and leaves the plan waiting', async () => {
    const h = createFixture();
    const { plan } = await signedPlan(h);
    const xdrText = plan.prepared?.xdr ?? '';
    await expect(submitPlan(h.deps, plan.id, xdrText)).rejects.toThrow(/not signed/);
    await expect(submitPlan(h.deps, plan.id, walletSign(xdrText, Keypair.random()))).rejects.toThrow(/not signed/);
    const other = aggregatorSwap(h.user.publicKey(), h.clock.now, MIN_OUT + 1n);
    other.sign(h.user);
    await expect(submitPlan(h.deps, plan.id, other.toXDR())).rejects.toThrow(/not the one that was reviewed/);
    expect((await readPlan(h.deps, plan.id)).status).toBe('awaiting_signature');
    expect(h.sent).toEqual([]);
  });

  it('submits once when two requests race to submit the same plan', async () => {
    const h = createFixture();
    // The network reports the one transaction to every request that asks.
    h.rpcScript.get = Array(5).fill('SUCCESS');
    const { plan, signedXdr } = await signedPlan(h);
    const otherSignature = walletSign(plan.prepared?.xdr ?? '', h.user);
    const [first, second] = await Promise.all([
      submitPlan(h.deps, plan.id, signedXdr),
      submitPlan(h.deps, plan.id, `${otherSignature}`),
    ]);
    expect(h.sent).toHaveLength(1);
    expect([first.status, second.status]).toContain('confirmed');
  });

  it('marks a network rejection as failed without retrying', async () => {
    const h = createFixture();
    h.rpcScript.send = ['ERROR'];
    const { plan, signedXdr } = await signedPlan(h);
    expect(await submitPlan(h.deps, plan.id, signedXdr)).toMatchObject({ status: 'failed', errorCode: 'REJECTED' });
    expect(h.sent).toHaveLength(1);
  });

  it('reconciles an ambiguous send by hash, rebroadcasting the same bytes while still valid', async () => {
    const h = createFixture();
    h.rpcScript.send = ['THROW', 'PENDING'];
    h.rpcScript.get = ['NOT_FOUND', 'SUCCESS'];
    const { plan, signedXdr } = await signedPlan(h);

    expect((await submitPlan(h.deps, plan.id, signedXdr)).status).toBe('submitted');
    expect(h.sent).toEqual([]);
    expect((await readPlan(h.deps, plan.id)).status).toBe('confirming');
    expect(h.sent).toEqual([plan.prepared?.hash]);
    expect((await readPlan(h.deps, plan.id)).status).toBe('confirmed');
  });

  it('fails a submission the network never included once it can no longer land', async () => {
    const h = createFixture();
    h.rpcScript.get = Array(40).fill('NOT_FOUND');
    const { plan, signedXdr } = await signedPlan(h);
    expect((await submitPlan(h.deps, plan.id, signedXdr)).status).toBe('confirming');
    h.clock.now += 10 * 60_000;
    expect(await readPlan(h.deps, plan.id)).toMatchObject({ status: 'failed', errorCode: 'NOT_INCLUDED' });
  });

  it('returns the same plan for a repeated idempotency key and refuses a different body under it', async () => {
    const h = createFixture();
    const intent = await createSwapIntent(h.deps, { sell: 'USDC', buy: 'XLM', amount: '1', source: 'form' });
    const quote = await compareSwap(h.deps, intent.id);
    const key = crypto.randomUUID();
    const input = { intentId: intent.id, quoteId: quote.id, accountId: h.user.publicKey(), idempotencyKey: key };
    const first = await createSwapPlan(h.deps, input);
    expect((await createSwapPlan(h.deps, input)).id).toBe(first.id);
    await expect(createSwapPlan(h.deps, { ...input, accountId: Keypair.random().publicKey() })).rejects.toThrow(
      /idempotency/,
    );
  });
});

describe('execution routes', () => {
  it('validates requests and reports a missing Soroswap key as unavailable', async () => {
    const created = await exports.default.fetch(`${ORIGIN}/api/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'swap', sellAsset: 'USDC', buyAsset: 'XLM', sellAmount: '25' }),
    });
    expect(created.status).toBe(201);
    const intent: { id: string } = await created.json();

    const compare = await exports.default.fetch(`${ORIGIN}/api/intents/${intent.id}/compare`, { method: 'POST' });
    expect(compare.status).toBe(503);

    const noKey = await exports.default.fetch(`${ORIGIN}/api/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intentId: intent.id, quoteId: crypto.randomUUID(), accountId: 'G' }),
    });
    expect(noKey.status).toBe(400);

    const badAsset = await exports.default.fetch(`${ORIGIN}/api/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'swap', sellAsset: 'BTC', buyAsset: 'XLM', sellAmount: '1' }),
    });
    expect(badAsset.status).toBe(400);
  });
});
