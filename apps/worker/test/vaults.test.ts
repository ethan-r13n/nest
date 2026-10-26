import { env } from 'cloudflare:workers';
import { lendingAsset } from '@nest/adapters/blend/markets';
import type { VaultDeposit } from '@nest/adapters/defindex/deposit';
import type { VaultView } from '@nest/adapters/defindex/vaults';
import type { VaultWithdrawal } from '@nest/adapters/defindex/withdraw';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { VenueRefusal } from '@nest/adapters/venue';
import { Account, Address, Keypair, nativeToScVal, Operation, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import {
  approvePlan,
  compareIntent,
  createPlan,
  listActivity,
  preparePlan,
  submitPlan,
} from '../src/execution/lifecycle.ts';
import { type ExecutionDeps, loadIntent } from '../src/execution/store.ts';
import { createVaultWithdrawalIntent, listVaultPositions } from '../src/execution/vault-withdrawals.ts';
import { compareVault, createVaultIntent } from '../src/execution/vaults.ts';

const START_MS = 1_800_000_000_000;
const VAULT = 'CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3';
const usdc = lendingAsset('mainnet', 'USDC').contractId;

function vaultView(overrides: Partial<VaultView> = {}): VaultView {
  return {
    address: VAULT,
    name: 'BeansUsdcVault',
    symbol: 'USDC',
    assetContract: usdc,
    apyPct: 5.92,
    totalRaw: 2_566_781_084_249n,
    idleRaw: 1_000_000n,
    investedRaw: 2_566_780_084_249n,
    vaultFeeBps: 100,
    defindexFeeBps: 2000,
    strategies: [{ name: 'USDC Blend Strategy', paused: false }],
    ...overrides,
  };
}

/** The deposit the RPC assembles: the vault call, authorizing only the transfer into the vault. */
function depositTransaction(deposit: VaultDeposit, nowMs: number, tamper = 0n) {
  const args = [
    xdr.ScVal.scvVec([nativeToScVal(deposit.amount + tamper, { type: 'i128' })]),
    xdr.ScVal.scvVec([nativeToScVal(deposit.minAmount, { type: 'i128' })]),
    new Address(deposit.account).toScVal(),
    xdr.ScVal.scvBool(deposit.invest),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(deposit.vault).toScAddress(),
    functionName: 'deposit',
    args,
  });
  const transfer = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(deposit.assetContract).toScAddress(),
        functionName: 'transfer',
        args: [
          new Address(deposit.account).toScVal(),
          new Address(deposit.vault).toScVal(),
          nativeToScVal(deposit.amount, { type: 'i128' }),
        ],
      }),
    ),
    subInvocations: [],
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: [transfer],
    }),
  });
  return new TransactionBuilder(new Account(deposit.account, '9'), {
    fee: '300000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: deposit.vault, function: 'deposit', args, auth: [auth] }),
    )
    .build()
    .toXDR();
}

function createFixture(options: { writeAdapters?: string[] } = {}) {
  const user = Keypair.random();
  const clock = { now: START_MS };
  const state = {
    vault: vaultView(),
    verified: [true] as boolean[],
    tamper: 0n,
    refusal: null as VenueRefusal | null,
    built: [] as VaultDeposit[],
    withdrawals: [] as VaultWithdrawal[],
    sharesRaw: 20_000_000_000n,
    sharesUnavailable: false,
    underlyingContract: usdc,
    returnValue: null as unknown,
  };
  const deps: ExecutionDeps = {
    db: env.DB,
    config: {
      network: 'mainnet',
      executionEnabled: true,
      writeAdapters: new Set(options.writeAdapters ?? ['defindex']),
      soroswapApiKey: null,
      defindexApiKey: 'test',
      rpcUrl: 'https://rpc.test',
    },
    venue: null,
    lending: null,
    xoxno: null,
    ranges: null,
    vaults: {
      vaults: async () => [state.vault],
      vault: async () => state.vault,
      verify: async () => state.verified.shift() ?? true,
      build: async (deposit) => {
        if (state.refusal) throw state.refusal;
        state.built.push(deposit);
        return depositTransaction(deposit, clock.now, state.tamper);
      },
      shareDecimals: async () => 9,
      position: async (_vault, account) => {
        if (state.sharesUnavailable) throw new Error('Unavailable');
        return {
          account,
          assetContract: state.underlyingContract,
          balanceRaw: state.sharesRaw,
          decimals: 9,
          underlyingRaw: state.sharesRaw / 100n,
        };
      },
      shareAmount: async (_vault, shares) => shares / 100n,
      withdraw: async (withdrawal) => {
        if (state.refusal) throw state.refusal;
        state.withdrawals.push(withdrawal);
        state.returnValue = [withdrawal.shares / 100n];
        return withdrawalTransaction(withdrawal, clock.now, state.tamper);
      },
    },
    buildTrustline: async () => {
      throw new Error('not used');
    },
    rpc: {
      simulate: async () => ({ ok: true, minResourceFee: 0n, returnValue: null }),
      send: async () => ({ status: 'PENDING', error: null }),
      get: async () => ({ status: 'SUCCESS', ledger: 777, returnValue: state.returnValue }),
    },
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
  return { deps, user, state };
}

async function preparedDeposit(h: ReturnType<typeof createFixture>, amount = '100') {
  const intent = await createVaultIntent(h.deps, { vaultId: VAULT, amount, source: 'form' });
  const compared = await compareVault(h.deps, await loadIntent(h.deps, intent.id));
  if (!compared.selectedQuoteId) throw new Error(`no offer: ${JSON.stringify(compared.excluded)}`);
  const plan = await createPlan(h.deps, {
    intentId: intent.id,
    quoteId: compared.selectedQuoteId,
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { compared, plan: plan.status === 'blocked' ? plan : await preparePlan(h.deps, plan.id) };
}

describe('vault deposits', () => {
  it('routes vault comparisons through the shared lifecycle', async () => {
    const h = createFixture();
    const intent = await createVaultIntent(h.deps, { vaultId: VAULT, amount: '100', source: 'form' });
    const compared = await compareIntent(h.deps, intent.id);
    expect(compared.quotes[0]).toMatchObject({ kind: 'vault_deposit', vault: { id: VAULT } });
  });

  it('offers the vault with its APY, fees, withdrawal timing and a 0.5% minimum', async () => {
    const h = createFixture();
    const { compared } = await preparedDeposit(h);
    expect(compared.quotes[0]).toMatchObject({
      kind: 'vault_deposit',
      vault: { id: VAULT, name: 'BeansUsdcVault' },
      asset: { symbol: 'USDC', amount: '100' },
      minimum: { amount: '99.5' },
      apyPct: 5.92,
      fees: { vaultFeeBps: 100, defindexFeeBps: 2000 },
      verified: true,
      invest: true,
      withdrawalTiming: { lockup: 'none', cooldown: 'none' },
    });
  });

  it('deposits through review, signature and confirmation', async () => {
    const h = createFixture();
    const { plan } = await preparedDeposit(h);
    expect(plan.status).toBe('awaiting_review');
    if (!plan.prepared || !('deposit' in plan.prepared)) throw new Error('not prepared');
    expect(h.state.built).toEqual([
      {
        vault: VAULT,
        account: h.user.publicKey(),
        assetContract: usdc,
        amount: 1_000_000_000n,
        minAmount: 995_000_000n,
        invest: true,
      },
    ]);
    const approved = await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    expect(approved.status).toBe('awaiting_signature');
    const tx = TransactionBuilder.fromXDR(plan.prepared.xdr, NETWORK_PASSPHRASES.mainnet);
    tx.sign(h.user);
    expect(await submitPlan(h.deps, plan.id, tx.toXDR())).toMatchObject({ status: 'confirmed', ledger: 777 });
    expect((await listActivity(h.deps, h.user.publicKey())).items).toEqual([
      expect.objectContaining({
        kind: 'vault_deposit',
        title: 'Deposit USDC',
        venue: 'DeFindex · BeansUsdcVault',
        sent: [{ symbol: 'USDC', amount: '100' }],
        received: [],
      }),
    ]);
  });

  it('excludes a contract that does not run DeFindex’s vault code', async () => {
    const h = createFixture();
    h.state.verified = [false];
    const intent = await createVaultIntent(h.deps, { vaultId: VAULT, amount: '1', source: 'form' });
    expect(await compareVault(h.deps, await loadIntent(h.deps, intent.id))).toMatchObject({
      quotes: [],
      selectedQuoteId: null,
      excluded: [{ poolId: VAULT, reason: 'It does not run DeFindex’s published vault code.' }],
    });
  });

  it('blocks when the vault’s code changes between the offer and the build', async () => {
    const h = createFixture();
    h.state.verified = [true, false];
    const { plan } = await preparedDeposit(h);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'VAULT_UNVERIFIED' });
    expect(h.state.built).toEqual([]);
  });

  it('warns that an uninvested vault keeps the deposit idle', async () => {
    const h = createFixture();
    h.state.vault = vaultView({ investedRaw: 0n });
    const { plan } = await preparedDeposit(h);
    expect(plan.status).toBe('awaiting_review');
    expect(plan.policy.reasons.find((reason) => !reason.pass)).toMatchObject({ code: 'VAULT_IDLE', severity: 'warn' });
    expect(h.state.built[0]?.invest).toBe(false);
  });

  it('blocks a build whose amount differs from the reviewed one', async () => {
    const h = createFixture();
    h.state.tamper = 1n;
    const { plan } = await preparedDeposit(h);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'AMOUNT_MISMATCH' });
  });

  it('blocks with the venue reason when the account cannot fund it', async () => {
    const h = createFixture();
    h.state.refusal = new VenueRefusal('INSUFFICIENT_BALANCE', 'This account holds no USDC.');
    const { plan } = await preparedDeposit(h);
    expect(plan).toMatchObject({ status: 'blocked', errorCode: 'INSUFFICIENT_BALANCE' });
  });

  it('refuses vaults of other assets and submits only with DeFindex enabled', async () => {
    const h = createFixture({ writeAdapters: ['blend'] });
    h.state.vault = vaultView({ symbol: null });
    await expect(createVaultIntent(h.deps, { vaultId: VAULT, amount: '1', source: 'form' })).rejects.toThrow(
      'Nest supports USDC and XLM vaults for now.',
    );
    h.state.vault = vaultView();
    const { plan } = await preparedDeposit(h);
    if (!plan.prepared) throw new Error('not prepared');
    await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    await expect(submitPlan(h.deps, plan.id, plan.prepared.xdr)).rejects.toThrow('turned off');
  });
});

function withdrawalTransaction(withdrawal: VaultWithdrawal, nowMs: number, tamper = 0n) {
  const args = [
    nativeToScVal(withdrawal.shares + tamper, { type: 'i128' }),
    xdr.ScVal.scvVec([nativeToScVal(withdrawal.minAmount, { type: 'i128' })]),
    new Address(withdrawal.account).toScVal(),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(withdrawal.vault).toScAddress(),
    functionName: 'withdraw',
    args,
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: [],
    }),
  });
  return new TransactionBuilder(new Account(withdrawal.account, '9'), {
    fee: '300000',
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
    timebounds: { minTime: 0, maxTime: Math.floor(nowMs / 1000) + 180 },
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: withdrawal.vault, function: 'withdraw', args, auth: [auth] }),
    )
    .build()
    .toXDR();
}

async function comparedWithdrawal(h: ReturnType<typeof createFixture>, amount = 'all') {
  const intent = await createVaultWithdrawalIntent(h.deps, { vaultId: VAULT, amount, source: 'form' });
  const compared = await compareIntent(h.deps, intent.id, h.user.publicKey());
  return { intent, compared };
}

async function preparedWithdrawal(h: ReturnType<typeof createFixture>, amount = 'all') {
  const { intent, compared } = await comparedWithdrawal(h, amount);
  if (!compared.selectedQuoteId) throw new Error('No withdrawal quote');
  const plan = await createPlan(h.deps, {
    intentId: intent.id,
    quoteId: compared.selectedQuoteId,
    accountId: h.user.publicKey(),
    idempotencyKey: crypto.randomUUID(),
  });
  return { intent, compared, plan: await preparePlan(h.deps, plan.id) };
}

describe('vault withdrawals', () => {
  it('reads owned share decimals and underlying rather than assuming the asset decimals', async () => {
    const h = createFixture();
    expect(await listVaultPositions(h.deps, h.user.publicKey())).toMatchObject({
      available: true,
      positions: [
        { shares: { raw: '20000000000', amount: '20', decimals: 9 }, underlying: { amount: '20', symbol: 'USDC' } },
      ],
    });
    const { compared } = await comparedWithdrawal(h, '5.123456789');
    expect(compared.quotes[0]).toMatchObject({
      kind: 'vault_withdraw',
      shares: { raw: '5123456789', amount: '5.123456789', decimals: 9 },
      asset: { amount: '5.1234567' },
    });
  });

  it('withdraws all owned shares through review, exact signature and original-hash reconciliation', async () => {
    const h = createFixture();
    const { plan } = await preparedWithdrawal(h);
    expect(plan).toMatchObject({
      status: 'awaiting_review',
      kind: 'vault_withdraw',
      prepared: { shares: { amount: '20' }, expected: { amount: '20' }, minimum: { amount: '19.9' } },
    });
    if (!plan.prepared) throw new Error('Not prepared');
    await approvePlan(h.deps, plan.id, { digest: plan.digest, preparedHash: plan.prepared.hash });
    const tx = TransactionBuilder.fromXDR(plan.prepared.xdr, NETWORK_PASSPHRASES.mainnet);
    tx.sign(h.user);
    expect(await submitPlan(h.deps, plan.id, tx.toXDR())).toMatchObject({ status: 'confirmed', ledger: 777 });
    expect((await listActivity(h.deps, h.user.publicKey())).items[0]).toMatchObject({
      kind: 'vault_withdraw',
      title: 'Withdraw USDC',
      received: [{ symbol: 'USDC', amount: '20' }],
    });
  });

  it('does not make shares reserved by an unresolved signed review available twice', async () => {
    const h = createFixture();
    await preparedWithdrawal(h);
    expect((await comparedWithdrawal(h)).compared).toMatchObject({ quotes: [], selectedQuoteId: null });
  });

  it('does not offer an amount larger than the owned share balance', async () => {
    const h = createFixture();
    expect((await comparedWithdrawal(h, '21')).compared).toMatchObject({
      quotes: [],
      excluded: [{ reason: 'The requested shares exceed the available owned balance.' }],
    });
  });

  it('re-checks share ownership at preparation and blocks a changed balance', async () => {
    const h = createFixture();
    const { intent, compared } = await comparedWithdrawal(h);
    if (!compared.selectedQuoteId) throw new Error('No withdrawal quote');
    const plan = await createPlan(h.deps, {
      intentId: intent.id,
      quoteId: compared.selectedQuoteId,
      accountId: h.user.publicKey(),
      idempotencyKey: crypto.randomUUID(),
    });
    h.state.sharesRaw = 1n;
    expect(await preparePlan(h.deps, plan.id)).toMatchObject({ status: 'blocked', errorCode: 'INSUFFICIENT_SHARES' });
    expect(h.state.withdrawals).toEqual([]);
  });

  it('blocks a transaction that burns a different share amount', async () => {
    const h = createFixture();
    h.state.tamper = 1n;
    expect((await preparedWithdrawal(h)).plan).toMatchObject({ status: 'blocked', errorCode: 'ARGUMENTS_MISMATCH' });
  });

  it('reports an unavailable source instead of zero shares', async () => {
    const h = createFixture();
    h.state.sharesUnavailable = true;
    expect(await listVaultPositions(h.deps, h.user.publicKey())).toMatchObject({ available: false, positions: [] });
  });

  it('rejects source metadata that disagrees with the on-chain vault asset', async () => {
    const h = createFixture();
    h.state.underlyingContract = lendingAsset('mainnet', 'XLM').contractId;
    await expect(comparedWithdrawal(h)).rejects.toThrow('The vault’s code, asset or share decimals changed');
    expect(h.state.withdrawals).toEqual([]);
  });

  it('keeps shares owned and blocks the review when strategy liquidity cannot unwind', async () => {
    const h = createFixture();
    h.state.refusal = new VenueRefusal('SIMULATION_FAILED', 'Strategy liquidity cannot unwind now.');
    expect((await preparedWithdrawal(h)).plan).toMatchObject({ status: 'blocked', errorCode: 'SIMULATION_FAILED' });
    expect(h.state.sharesRaw).toBe(20_000_000_000n);
  });

  it('binds the compared share owner to the plan account', async () => {
    const h = createFixture();
    const { intent, compared } = await comparedWithdrawal(h);
    if (!compared.selectedQuoteId) throw new Error('No withdrawal quote');
    expect(
      await createPlan(h.deps, {
        intentId: intent.id,
        quoteId: compared.selectedQuoteId,
        accountId: Keypair.random().publicKey(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).toMatchObject({ status: 'blocked', errorCode: 'ACCOUNT_MISMATCH' });
  });
});
