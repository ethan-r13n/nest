import {
  Account,
  Address,
  Asset,
  Keypair,
  nativeToScVal,
  Operation,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { SOROSWAP_CONTRACTS } from '../src/soroswap/contracts.ts';
import { swapAsset } from '../src/stellar/assets.ts';
import { InspectionError, inspectSwapTransaction, verifySignedTransaction } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';
import realBuild from './fixtures/soroswap-v3-usdc-xlm.json' with { type: 'json' };

const NOW = 1_800_000_000;
const user = Keypair.random();
const stranger = Keypair.random();
const sell = swapAsset('mainnet', 'USDC');
const buy = swapAsset('mainnet', 'XLM');
const AMOUNT_IN = 1_000_000_000n; // 100 USDC
const MIN_OUT = 2_500_000_000n;
const POOL = 'CDE57N6XTUPBKYYDGQMXX7E7SLNOLFY3JEQB4MULSMR2AKTSAENGX2HC';

const expected = {
  network: 'mainnet' as const,
  account: user.publicKey(),
  sell,
  buy,
  amountIn: AMOUNT_IN,
  minAmountOut: MIN_OUT,
  maxFeeStroops: 10_000_000n,
  nowSeconds: NOW,
};

interface Overrides {
  contract?: string;
  functionName?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: bigint;
  minOut?: bigint;
  to?: string;
  deadline?: bigint;
  source?: string;
  fee?: string;
  validFor?: number | null;
  extraOperation?: boolean;
  network?: 'mainnet' | 'testnet';
  auth?: (call: xdr.InvokeContractArgs) => xdr.SorobanAuthorizationEntry[];
}

function aggregatorArgs(o: Overrides): xdr.ScVal[] {
  return [
    new Address(o.tokenIn ?? sell.ref.contractId).toScVal(),
    new Address(o.tokenOut ?? buy.ref.contractId).toScVal(),
    nativeToScVal(o.amountIn ?? AMOUNT_IN, { type: 'i128' }),
    nativeToScVal(o.minOut ?? MIN_OUT, { type: 'i128' }),
    xdr.ScVal.scvVec([]),
    new Address(o.to ?? user.publicKey()).toScVal(),
    nativeToScVal(o.deadline ?? BigInt(NOW + 300), { type: 'u64' }),
  ];
}

function invocation(
  contract: string,
  functionName: string,
  args: xdr.ScVal[],
  children: xdr.SorobanAuthorizedInvocation[] = [],
) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName, args }),
    ),
    subInvocations: children,
  });
}

function transferOf(token: string, from: string, amount: bigint) {
  return invocation(token, 'transfer', [
    new Address(from).toScVal(),
    new Address(POOL).toScVal(),
    nativeToScVal(amount, { type: 'i128' }),
  ]);
}

/** What a G-account swap's recorded authorization looks like: the call, then the token transfer it makes. */
function sourceAccountAuth(
  call: xdr.InvokeContractArgs,
  children = [transferOf(sell.ref.contractId, user.publicKey(), AMOUNT_IN)],
) {
  return [
    new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
        subInvocations: children,
      }),
    }),
  ];
}

function swapTransaction(o: Overrides = {}) {
  const network = o.network ?? 'mainnet';
  const contract = o.contract ?? SOROSWAP_CONTRACTS.mainnet.aggregator;
  const functionName = o.functionName ?? 'swap_exact_tokens_for_tokens';
  const args = aggregatorArgs(o);
  const call = new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName, args });
  const builder = new TransactionBuilder(new Account(o.source ?? user.publicKey(), '41'), {
    fee: o.fee ?? '100000',
    networkPassphrase: NETWORK_PASSPHRASES[network],
    timebounds: { minTime: 0, maxTime: o.validFor === null ? 0 : NOW + (o.validFor ?? 300) },
  }).addOperation(
    Operation.invokeContractFunction({
      contract,
      function: functionName,
      args,
      auth: (o.auth ?? sourceAccountAuth)(call),
    }),
  );
  if (o.extraOperation) builder.addOperation(Operation.bumpSequence({ bumpTo: '99' }));
  return builder.build();
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

const inspect =
  (o: Overrides = {}) =>
  () =>
    inspectSwapTransaction(swapTransaction(o).toXDR(), expected);

describe('swap assets', () => {
  it('derives the same mainnet token contracts Soroswap documents', () => {
    expect(sell.ref.contractId).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
    expect(buy.ref.contractId).toBe('CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA');
    expect(sell.ref).toMatchObject({ canonicalId: `USDC:${sell.ref.issuer}`, decimals: 7, network: 'stellar-mainnet' });
  });
});

describe('inspectSwapTransaction', () => {
  it('accepts exactly the reviewed aggregator swap and reports what it enforces', () => {
    const tx = swapTransaction();
    const inspected = inspectSwapTransaction(tx.toXDR(), expected);
    expect(inspected).toMatchObject({
      route: 'soroban',
      contractId: SOROSWAP_CONTRACTS.mainnet.aggregator,
      amountIn: AMOUNT_IN,
      minAmountOut: MIN_OUT,
      feeStroops: 100_000n,
      validUntilSeconds: NOW + 300,
    });
    expect(inspected.hash).toBe(Buffer.from(tx.hash()).toString('hex'));
  });

  it('accepts a stricter minimum than the reviewed one', () => {
    expect(codeOf(inspect({ minOut: MIN_OUT + 1n }))).toBe('ACCEPTED');
  });

  it.each([
    ['an unverified contract', { contract: POOL }, 'CONTRACT_NOT_ALLOWED'],
    ['another function', { functionName: 'swap_tokens_for_exact_tokens' }, 'FUNCTION_NOT_ALLOWED'],
    ['a different amount in', { amountIn: AMOUNT_IN + 1n }, 'AMOUNT_IN_MISMATCH'],
    ['a looser minimum output', { minOut: MIN_OUT - 1n }, 'MIN_OUT_TOO_LOW'],
    ['another receiver', { to: stranger.publicKey() }, 'RECEIVER_MISMATCH'],
    ['another sold token', { tokenIn: buy.ref.contractId }, 'ASSET_MISMATCH'],
    ['another source account', { source: stranger.publicKey() }, 'SOURCE_MISMATCH'],
    ['a fee above the limit', { fee: '10000001' }, 'FEE_ABOVE_LIMIT'],
    ['no expiry', { validFor: null }, 'VALIDITY'],
    ['an expiry already passed', { validFor: -1 }, 'VALIDITY'],
    ['a validity window too long', { validFor: 16 * 60 }, 'VALIDITY'],
    ['a passed deadline', { deadline: BigInt(NOW - 1) }, 'DEADLINE_PASSED'],
    ['an extra operation', { extraOperation: true }, 'OPERATION_COUNT'],
    [
      'the testnet contracts',
      { network: 'testnet', contract: SOROSWAP_CONTRACTS.testnet.aggregator },
      'CONTRACT_NOT_ALLOWED',
    ],
  ] satisfies [string, Overrides, string][])('blocks %s', (_name, overrides, code) => {
    expect(codeOf(inspect(overrides))).toBe(code);
  });

  it('blocks authorizations that need a separate signature', () => {
    const auth = (call: xdr.InvokeContractArgs) => {
      const [entry] = sourceAccountAuth(call);
      if (!entry) throw new Error('no entry');
      return [
        new xdr.SorobanAuthorizationEntry({
          credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
            new xdr.SorobanAddressCredentials({
              address: new Address(user.publicKey()).toScAddress(),
              nonce: 1n,
              signatureExpirationLedger: 100,
              signature: xdr.ScVal.scvVoid(),
            }),
          ),
          rootInvocation: entry.rootInvocation,
        }),
      ];
    };
    expect(codeOf(inspect({ auth }))).toBe('AUTH_CREDENTIALS');
  });

  it('blocks an authorization for a different call', () => {
    const auth = () =>
      sourceAccountAuth(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(SOROSWAP_CONTRACTS.mainnet.aggregator).toScAddress(),
          functionName: 'swap_exact_tokens_for_tokens',
          args: aggregatorArgs({ minOut: 1n }),
        }),
      );
    expect(codeOf(inspect({ auth }))).toBe('AUTH_ROOT_MISMATCH');
  });

  it.each([
    ['moving more than approved', () => [transferOf(sell.ref.contractId, user.publicKey(), AMOUNT_IN + 1n)]],
    ['moving another token', () => [transferOf(buy.ref.contractId, user.publicKey(), 1n)]],
    ['another call on the account', () => [invocation(POOL, 'approve', [new Address(user.publicKey()).toScVal()])]],
    [
      'two transfers above the total',
      () => [
        transferOf(sell.ref.contractId, user.publicKey(), AMOUNT_IN),
        transferOf(sell.ref.contractId, user.publicKey(), 1n),
      ],
    ],
  ])('blocks nested authorizations %s', (_name, children) => {
    const auth = (call: xdr.InvokeContractArgs) => sourceAccountAuth(call, children());
    expect(codeOf(inspect({ auth }))).toBe('AUTH_UNEXPECTED');
  });

  it('accepts a verified router path and checks both ends of the path', () => {
    const args = (path: string[]) => [
      nativeToScVal(AMOUNT_IN, { type: 'i128' }),
      nativeToScVal(MIN_OUT, { type: 'i128' }),
      xdr.ScVal.scvVec(path.map((token) => new Address(token).toScVal())),
      new Address(user.publicKey()).toScVal(),
      nativeToScVal(BigInt(NOW + 300), { type: 'u64' }),
    ];
    const routerSwap = (path: string[]) =>
      new TransactionBuilder(new Account(user.publicKey(), '41'), {
        fee: '100000',
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
        timebounds: { minTime: 0, maxTime: NOW + 300 },
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: SOROSWAP_CONTRACTS.mainnet.router,
            function: 'swap_exact_tokens_for_tokens',
            args: args(path),
          }),
        )
        .build()
        .toXDR();
    const good = [sell.ref.contractId, POOL, buy.ref.contractId];
    expect(inspectSwapTransaction(routerSwap(good), expected)).toMatchObject({
      route: 'soroban',
      minAmountOut: MIN_OUT,
    });
    expect(codeOf(() => inspectSwapTransaction(routerSwap([sell.ref.contractId, POOL]), expected))).toBe(
      'ASSET_MISMATCH',
    );
  });

  it('accepts a Classic path payment with the same bounds and blocks a looser one', () => {
    const pathPayment = (destMin: string, destination = user.publicKey()) =>
      new TransactionBuilder(new Account(user.publicKey(), '41'), {
        fee: '200',
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
        timebounds: { minTime: 0, maxTime: NOW + 300 },
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: sell.classic,
            sendAmount: '100',
            destination,
            destAsset: Asset.native(),
            destMin,
            path: [],
          }),
        )
        .build()
        .toXDR();
    expect(inspectSwapTransaction(pathPayment('250'), expected)).toMatchObject({
      route: 'classic',
      amountIn: AMOUNT_IN,
      minAmountOut: MIN_OUT,
    });
    expect(codeOf(() => inspectSwapTransaction(pathPayment('249.9999999'), expected))).toBe('MIN_OUT_TOO_LOW');
    expect(codeOf(() => inspectSwapTransaction(pathPayment('250', stranger.publicKey()), expected))).toBe(
      'RECEIVER_MISMATCH',
    );
  });

  it('blocks any other operation and undecodable input', () => {
    const payment = new TransactionBuilder(new Account(user.publicKey(), '41'), {
      fee: '200',
      networkPassphrase: NETWORK_PASSPHRASES.mainnet,
      timebounds: { minTime: 0, maxTime: NOW + 300 },
    })
      .addOperation(Operation.payment({ destination: stranger.publicKey(), asset: sell.classic, amount: '100' }))
      .build()
      .toXDR();
    expect(codeOf(() => inspectSwapTransaction(payment, expected))).toBe('OPERATION_NOT_ALLOWED');
    expect(codeOf(() => inspectSwapTransaction('not xdr', expected))).toBe('INVALID_XDR');
  });
});

describe('verifySignedTransaction', () => {
  const prepared = swapTransaction();
  const preparedHash = Buffer.from(prepared.hash()).toString('hex');
  const check = (xdrText: string) => () =>
    verifySignedTransaction(xdrText, { network: 'mainnet', account: user.publicKey(), preparedHash });

  it('accepts the prepared transaction signed by the account', () => {
    const signed = TransactionBuilder.fromXDR(prepared.toXDR(), NETWORK_PASSPHRASES.mainnet);
    signed.sign(user);
    expect(codeOf(check(signed.toXDR()))).toBe('ACCEPTED');
  });

  it('refuses an unsigned, wrongly signed or changed transaction', () => {
    expect(codeOf(check(prepared.toXDR()))).toBe('SIGNATURE_MISSING');

    const strangerSigned = TransactionBuilder.fromXDR(prepared.toXDR(), NETWORK_PASSPHRASES.mainnet);
    strangerSigned.sign(stranger);
    expect(codeOf(check(strangerSigned.toXDR()))).toBe('SIGNATURE_MISSING');

    const changed = swapTransaction({ minOut: MIN_OUT - 1n });
    changed.sign(user);
    expect(codeOf(check(changed.toXDR()))).toBe('SIGNED_PAYLOAD_CHANGED');
  });

  it('refuses a transaction signed for the other network', () => {
    const testnetCopy = TransactionBuilder.fromXDR(prepared.toXDR(), NETWORK_PASSPHRASES.testnet);
    testnetCopy.sign(user);
    expect(codeOf(check(testnetCopy.toXDR()))).toBe('SIGNATURE_MISSING');
  });
});

describe('Soroswap Aggregator v3', () => {
  const V3 = SOROSWAP_CONTRACTS.mainnet.aggregatorV3;

  function route(amountIn: bigint) {
    return xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount_in'), val: nativeToScVal(amountIn, { type: 'i128' }) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hops'), val: xdr.ScVal.scvVec([]) }),
    ]);
  }

  function partner(bps: number) {
    return xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('bps'), val: nativeToScVal(bps, { type: 'u32' }) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvSymbol('someone') }),
    ]);
  }

  function v3Swap(
    o: {
      user?: string;
      routes?: bigint[];
      partnerArg?: xdr.ScVal;
      functionName?: string;
      contract?: string;
      network?: 'mainnet' | 'testnet';
    } = {},
  ) {
    const functionName = o.functionName ?? 'swap_exact_in';
    const contract = o.contract ?? V3;
    const args = [
      new Address(o.user ?? user.publicKey()).toScVal(),
      new Address(sell.ref.contractId).toScVal(),
      nativeToScVal(AMOUNT_IN, { type: 'i128' }),
      new Address(buy.ref.contractId).toScVal(),
      nativeToScVal(MIN_OUT, { type: 'i128' }),
      xdr.ScVal.scvVec((o.routes ?? [999_000_000n]).map(route)),
      o.partnerArg ?? xdr.ScVal.scvVoid(),
    ];
    const call = new xdr.InvokeContractArgs({
      contractAddress: new Address(contract).toScAddress(),
      functionName,
      args,
    });
    return new TransactionBuilder(new Account(user.publicKey(), '41'), {
      fee: '60000',
      networkPassphrase: NETWORK_PASSPHRASES[o.network ?? 'mainnet'],
      timebounds: { minTime: 0, maxTime: NOW + 180 },
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract,
          function: functionName,
          args,
          auth: sourceAccountAuth(call, [transferOf(sell.ref.contractId, user.publicKey(), AMOUNT_IN)]),
        }),
      )
      .build()
      .toXDR();
  }

  it('accepts the transaction Soroswap’s API actually built and reports its fee', () => {
    const inspected = inspectSwapTransaction(realBuild.xdr, {
      network: 'mainnet',
      account: realBuild.account,
      sell,
      buy,
      amountIn: BigInt(realBuild.amountInRaw),
      minAmountOut: BigInt(realBuild.minAmountOutRaw),
      maxFeeStroops: 10_000_000n,
      nowSeconds: realBuild.builtAtSeconds,
    });
    expect(inspected).toMatchObject({
      route: 'soroban',
      contractId: V3,
      amountIn: 10_000_000n,
      minAmountOut: BigInt(realBuild.minAmountOutRaw),
    });
    // Soroswap keeps 0.1% of the input: 0.001 of 1 USDC.
    expect(inspected.providerFee).toBe(10_000n);
  });

  it('accepts the same shape built for this account', () => {
    expect(inspectSwapTransaction(v3Swap(), expected)).toMatchObject({ contractId: V3, providerFee: 1_000_000n });
  });

  it.each([
    ['a partner fee', { partnerArg: partner(30) }, 'PARTNER_FEE'],
    ['a fee above 1%', { routes: [989_000_000n] }, 'PROVIDER_FEE_TOO_HIGH'],
    ['route shares above the input', { routes: [600_000_000n, 600_000_000n] }, 'PROVIDER_FEE_TOO_HIGH'],
    ['another user', { user: stranger.publicKey() }, 'RECEIVER_MISMATCH'],
    ['the exact-out entry point', { functionName: 'swap_exact_out' }, 'FUNCTION_NOT_ALLOWED'],
    ['no routes', { routes: [] }, 'ARGUMENTS'],
  ])('blocks %s', (_name, overrides, code) => {
    expect(codeOf(() => inspectSwapTransaction(v3Swap(overrides), expected))).toBe(code);
  });

  it('is not allowed on testnet, where it is not deployed', () => {
    const testnetExpected = {
      ...expected,
      network: 'testnet' as const,
      sell: swapAsset('testnet', 'USDC'),
      buy: swapAsset('testnet', 'XLM'),
    };
    expect(codeOf(() => inspectSwapTransaction(v3Swap({ network: 'testnet' }), testnetExpected))).toBe(
      'CONTRACT_NOT_ALLOWED',
    );
  });
});
