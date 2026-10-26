import type { StellarNetwork } from '@nest/domain/network';
import {
  Account,
  Address,
  Asset,
  buildInvocationTree,
  Contract,
  type InvocationTree,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import { loadClassicAccount, requireFunds } from '../stellar/accounts.ts';
import { fail, hex, parseTransaction, validUntil } from '../stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../stellar/networks.ts';
import { VenueRefusal } from '../venue.ts';

export const XOXNO_SYMBOLS = ['XLM', 'USDC'] as const;
export type XoxnoSymbol = (typeof XOXNO_SYMBOLS)[number];

/**
 * The XOXNO Stellar Lending deployment Nest may act on: one controller every user call goes
 * through, the pool that holds the tokens, the position NFT that owns accounts, and the spoke
 * (risk profile) whose terms a new account takes. Source: configs/networks.json, markets.json and
 * spokes.json in github.com/XOXNO/rs-lending-xlm, read 2026-10-26 and checked on chain: each asset
 * contract's `name` is that network's XLM or Circle USDC, and `get_spoke_asset` lists both in the
 * spoke with XLM as collateral and USDC borrowable.
 */
export interface XoxnoDeployment {
  controller: string;
  pool: string;
  positionNft: string;
  spokeId: number;
  spokeName: string;
  assets: Record<XoxnoSymbol, { contractId: string; hubId: number; issuer: string | null }>;
}

const CIRCLE_USDC: Record<StellarNetwork, string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export const XOXNO: Record<StellarNetwork, XoxnoDeployment> = {
  mainnet: {
    controller: 'CAUCMIN5KSXEVZ7NMXR3LZATGD5EFIEUI5XWTFLYRO2R5OTXI22WE5JX',
    pool: 'CBXRNDQMAJFG4VUKMKFEMFS75UUXE2SPSNV4LEEFCSNBCN66PYRWBKXO',
    positionNft: 'CAWCSG77AY2W24QZ6ZXLHZU4UXEFHZBM6EI4A4IF7JB5CTY4XND3TI6C',
    spokeId: 1,
    spokeName: 'Blue Chip',
    assets: {
      XLM: { contractId: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', hubId: 1, issuer: null },
      USDC: {
        contractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
        hubId: 1,
        issuer: CIRCLE_USDC.mainnet,
      },
    },
  },
  testnet: {
    controller: 'CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3',
    pool: 'CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A',
    positionNft: 'CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY',
    spokeId: 1,
    spokeName: 'Blue Chip',
    assets: {
      XLM: { contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', hubId: 1, issuer: null },
      // XOXNO's Testnet lists Circle's Testnet USDC, unlike Blend's Testnet pool.
      USDC: {
        contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        hubId: 1,
        issuer: CIRCLE_USDC.testnet,
      },
    },
  },
};

export interface XoxnoReserve {
  symbol: XoxnoSymbol;
  contractId: string;
  hubId: number;
  /** Oracle price in USD, or null when the controller reports the price invalid or stale. */
  priceUsd: number | null;
  borrowApyPct: number;
  supplyApyPct: number;
  utilizationPct: number;
  /** Unborrowed tokens in the pool, raw. */
  availableRaw: bigint;
  /** Fractions of 1: the borrow ceiling and the liquidation threshold this spoke applies. */
  loanToValue: number;
  liquidationThreshold: number;
  canCollateral: boolean;
  canBorrow: boolean;
}

export interface XoxnoMarket {
  controller: string;
  name: string;
  spokeId: number;
  reserves: Record<XoxnoSymbol, XoxnoReserve>;
  /** An account with debt must keep at least this much LTV-weighted collateral, in USD. */
  minBorrowCollateralUsd: number;
  observedAtMs: number;
}

export interface XoxnoAccount {
  accountId: bigint;
  spokeId: number;
  collateralRaw: Record<XoxnoSymbol, bigint>;
  debtRaw: Record<XoxnoSymbol, bigint>;
  /** Null without debt: nothing can be liquidated. */
  healthFactor: number | null;
}

export interface XoxnoAmount {
  symbol: XoxnoSymbol;
  amount: bigint;
}

/** A controller call Nest builds. Account 0 in a supply opens a new account (a position NFT). */
export type XoxnoCall =
  | { method: 'supply'; accountId: bigint; spokeId: number; assets: readonly XoxnoAmount[] }
  | { method: 'borrow'; accountId: bigint; assets: readonly XoxnoAmount[] };

export interface XoxnoReaderOptions {
  network: StellarNetwork;
  rpcUrl: string;
  now?: () => number;
}

const RAY = 1e27;
const WAD = 1e18;
const UNIT = 10_000_000;
const INCLUSION_FEE_STROOPS = '1000';
const VALIDITY_SECONDS = 180;
// Simulation needs a source account but never signs; any valid address will do.
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
/** More accounts than this per wallet are not read; the first ones are the oldest. */
const MAX_ACCOUNTS = 10;
/** Controller error codes (common/src/errors.rs in github.com/XOXNO/rs-lending-xlm). */
const REFUSALS: Record<number, [code: string, message: string]> = {
  100: ['HEALTH_TOO_LOW', 'XOXNO refused: the collateral does not cover this loan.'],
  102: ['HEALTH_TOO_LOW', 'XOXNO refused: the loan would leave the account below a health factor of 1.'],
  112: ['LIQUIDITY_INSUFFICIENT', 'XOXNO does not have enough of this asset to lend right now.'],
  126: ['HEALTH_TOO_LOW', 'XOXNO needs at least $5 of LTV-weighted collateral behind any loan.'],
  206: ['PRICE_UNAVAILABLE', "XOXNO's price feed is stale right now, so it refuses new loans."],
  311: ['SUPPLY_CAP', 'XOXNO has reached its deposit cap for this asset.'],
  312: ['BORROW_CAP', 'XOXNO has reached its borrowing cap for this asset.'],
  315: ['POOL_STATUS', 'XOXNO has paused this asset.'],
  316: ['POOL_STATUS', 'XOXNO has frozen new positions in this asset.'],
};

export function xoxnoAsset(network: StellarNetwork, symbol: XoxnoSymbol) {
  const listed = XOXNO[network].assets[symbol];
  return { ...listed, symbol, classic: listed.issuer ? new Asset('USDC', listed.issuer) : Asset.native() };
}

/** XOXNO quotes annual rates in RAY and accrues them every second, so the APY compounds continuously. */
export function apyPctFromRay(rateRay: bigint): number {
  return (Math.exp(Number(rateRay) / RAY) - 1) * 100;
}

/** Rates, liquidity, spoke terms and oracle prices for XLM and USDC in this network's spoke. */
export async function readXoxnoMarket(options: XoxnoReaderOptions): Promise<XoxnoMarket> {
  const deployment = XOXNO[options.network];
  const symbols = [...XOXNO_SYMBOLS];
  const [indexes, minimum, ...perAsset] = await Promise.all([
    simulate(options, deployment.controller, 'get_market_indexes_detailed', [
      xdr.ScVal.scvVec(symbols.map((symbol) => hubAsset(options.network, symbol))),
    ]),
    simulate(options, deployment.controller, 'get_min_borrow_collateral_usd'),
    ...symbols.map((symbol) => {
      const key = hubAsset(options.network, symbol);
      return Promise.all([
        simulate(options, deployment.pool, 'get_borrow_rate', [key]),
        simulate(options, deployment.pool, 'get_deposit_rate', [key]),
        simulate(options, deployment.pool, 'get_utilisation', [key]),
        simulate(options, deployment.pool, 'get_reserves', [key]),
        simulate(options, deployment.controller, 'get_spoke_asset', [
          nativeToScVal(deployment.spokeId, { type: 'u32' }),
          key,
        ]),
      ]);
    }),
  ]);
  const prices = indexes as { asset: string; price_wad: bigint; valid: boolean; stale: boolean }[];
  const reserves = Object.fromEntries(
    symbols.map((symbol, index) => {
      const [borrowRate, depositRate, utilisation, available, spoke] = perAsset[index] as [
        bigint,
        bigint,
        bigint,
        bigint,
        SpokeAssetRaw,
      ];
      const { contractId, hubId } = deployment.assets[symbol];
      const price = prices.find((entry) => entry.asset === contractId);
      const reserve: XoxnoReserve = {
        symbol,
        contractId,
        hubId,
        priceUsd: price?.valid && !price.stale ? Number(price.price_wad) / WAD : null,
        borrowApyPct: apyPctFromRay(borrowRate),
        supplyApyPct: apyPctFromRay(depositRate),
        utilizationPct: (Number(utilisation) / RAY) * 100,
        availableRaw: available,
        loanToValue: spoke.loan_to_value / 10_000,
        liquidationThreshold: spoke.liquidation_threshold / 10_000,
        canCollateral: spoke.is_collateralizable && !spoke.paused && !spoke.frozen,
        canBorrow: spoke.is_borrowable && !spoke.paused && !spoke.frozen,
      };
      return [symbol, reserve];
    }),
  ) as Record<XoxnoSymbol, XoxnoReserve>;
  return {
    controller: deployment.controller,
    name: `XOXNO ${deployment.spokeName}`,
    spokeId: deployment.spokeId,
    reserves,
    minBorrowCollateralUsd: Number(minimum as bigint) / WAD,
    observedAtMs: (options.now ?? Date.now)(),
  };
}

/** The wallet's XOXNO accounts: one position NFT each, with its collateral, debt and health. */
export async function readXoxnoAccounts(owner: string, options: XoxnoReaderOptions): Promise<XoxnoAccount[]> {
  const deployment = XOXNO[options.network];
  const ownerArg = new Address(owner).toScVal();
  const count = Number((await simulate(options, deployment.positionNft, 'balance', [ownerArg])) as number);
  const ids = await Promise.all(
    Array.from({ length: Math.min(count, MAX_ACCOUNTS) }, (_, index) =>
      simulate(options, deployment.positionNft, 'get_owner_token_id', [
        ownerArg,
        nativeToScVal(index, { type: 'u32' }),
      ]),
    ),
  );
  return Promise.all(ids.map((id) => readAccount(BigInt(id as number), options)));
}

async function readAccount(accountId: bigint, options: XoxnoReaderOptions): Promise<XoxnoAccount> {
  const deployment = XOXNO[options.network];
  const id = nativeToScVal(accountId, { type: 'u64' });
  const amount = (method: string, symbol: XoxnoSymbol) =>
    simulate(options, deployment.controller, method, [id, hubAsset(options.network, symbol)]) as Promise<bigint>;
  const [attributes, health, xlmIn, usdcIn, xlmOut, usdcOut] = await Promise.all([
    simulate(options, deployment.controller, 'get_account_attributes', [id]) as Promise<{ spoke_id: number }>,
    simulate(options, deployment.controller, 'get_health_factor', [id]) as Promise<bigint>,
    amount('get_collateral_amount', 'XLM'),
    amount('get_collateral_amount', 'USDC'),
    amount('get_borrow_amount', 'XLM'),
    amount('get_borrow_amount', 'USDC'),
  ]);
  const hasDebt = xlmOut > 0n || usdcOut > 0n;
  return {
    accountId,
    spokeId: Number(attributes.spoke_id),
    collateralRaw: { XLM: xlmIn, USDC: usdcIn },
    debtRaw: { XLM: xlmOut, USDC: usdcOut },
    // With no debt the controller returns i128::MAX.
    healthFactor: hasDebt ? Number(health) / WAD : null,
  };
}

/**
 * Health factor after adding collateral and debt to an account (or a new one), from the spoke's
 * liquidation thresholds and oracle prices: threshold-weighted collateral over debt, as XOXNO
 * computes it. Null with no debt; NaN when a needed price is missing.
 */
export function healthAfter(
  market: XoxnoMarket,
  account: Pick<XoxnoAccount, 'collateralRaw' | 'debtRaw'> | null,
  change: { collateral?: XoxnoAmount; debt?: XoxnoAmount },
): number | null {
  let weighted = 0;
  let debt = 0;
  for (const symbol of XOXNO_SYMBOLS) {
    const reserve = market.reserves[symbol];
    const collateralRaw =
      (account?.collateralRaw[symbol] ?? 0n) + (change.collateral?.symbol === symbol ? change.collateral.amount : 0n);
    const debtRaw = (account?.debtRaw[symbol] ?? 0n) + (change.debt?.symbol === symbol ? change.debt.amount : 0n);
    if (collateralRaw === 0n && debtRaw === 0n) continue;
    if (reserve.priceUsd === null) return Number.NaN;
    weighted += (Number(collateralRaw) / UNIT) * reserve.priceUsd * reserve.liquidationThreshold;
    debt += (Number(debtRaw) / UNIT) * reserve.priceUsd;
  }
  return debt === 0 ? null : weighted / debt;
}

/**
 * Builds one controller call after checking the account can fund a supply and hold what a borrow
 * pays out, and lets the RPC simulate and assemble it.
 */
export async function buildXoxnoCall(input: {
  network: StellarNetwork;
  rpcUrl: string;
  account: string;
  call: XoxnoCall;
  nowMs: number;
  fetch?: typeof fetch;
}): Promise<string> {
  const deployment = XOXNO[input.network];
  const classic = await loadClassicAccount(input.network, input.account, input.fetch);
  const classicOf = (symbol: XoxnoSymbol) => xoxnoAsset(input.network, symbol).classic;
  requireFunds(classic, {
    spend:
      input.call.method === 'supply'
        ? input.call.assets.map((asset) => ({ asset: classicOf(asset.symbol), amount: asset.amount }))
        : [],
    receive: input.call.method === 'borrow' ? input.call.assets.map((asset) => classicOf(asset.symbol)) : [],
    feeStroops: 10_000_000n,
  });

  const server = new rpc.Server(input.rpcUrl);
  const source = await server.getAccount(input.account);
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: NETWORK_PASSPHRASES[input.network],
    timebounds: { minTime: 0, maxTime: Math.floor(input.nowMs / 1000) + VALIDITY_SECONDS },
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: deployment.controller,
        function: input.call.method,
        args: argsOf(input.network, input.account, input.call),
      }),
    )
    .build();
  try {
    return (await server.prepareTransaction(tx)).toXDR();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = Number(/Error\(Contract, #(\d+)\)/.exec(detail)?.[1]);
    const refusal = REFUSALS[code];
    if (refusal) throw new VenueRefusal(...refusal);
    throw new VenueRefusal('SIMULATION_FAILED', `XOXNO refused this in simulation: ${detail.slice(0, 200)}`);
  }
}

/**
 * Accepts a built transaction only when it is exactly the reviewed controller call: one call on
 * the registered controller, for the account, with exactly the reviewed account id, spoke and
 * amounts. A supply may authorize only transfers of the supplied tokens from the account to the
 * XOXNO pool; a borrow authorizes no transfer of the account's tokens at all.
 */
export function inspectXoxnoCall(
  xdrText: string,
  expected: {
    network: StellarNetwork;
    account: string;
    call: XoxnoCall;
    maxFeeStroops: bigint;
    nowSeconds: number;
  },
): { hash: string; feeStroops: bigint; validUntilSeconds: number } {
  const deployment = XOXNO[expected.network];
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const feeStroops = BigInt(tx.fee);
  if (feeStroops > expected.maxFeeStroops) fail('FEE_ABOVE_LIMIT', 'The network fee is above the approved maximum.');
  const validUntilSeconds = validUntil(tx, expected.nowSeconds);
  const op = tx.operations[0];
  if (op?.type !== 'invokeHostFunction' || op.func.type !== 'hostFunctionTypeInvokeContract') {
    fail('OPERATION_NOT_ALLOWED', 'The transaction does not call the XOXNO controller.');
  }
  if (op.source !== undefined && op.source !== expected.account) {
    fail('OPERATION_SOURCE', 'The operation runs as a different account.');
  }
  const call = op.func.invokeContract;
  if (Address.fromScAddress(call.contractAddress).toString() !== deployment.controller) {
    fail('CONTRACT_NOT_ALLOWED', 'The transaction calls a contract that is not the XOXNO controller.');
  }
  if (call.functionName.toString() !== expected.call.method) {
    fail('FUNCTION_NOT_ALLOWED', 'The transaction calls a different XOXNO function than the one reviewed.');
  }
  const actual = canonical(call.args.map((arg) => scValToNative(arg) as unknown));
  const reviewed = argsOf(expected.network, expected.account, expected.call);
  if (actual !== canonical(reviewed.map((arg) => scValToNative(arg) as unknown))) {
    fail('ARGUMENTS_MISMATCH', 'The XOXNO call differs from the reviewed account, spoke or amounts.');
  }

  const allowance = new Map<string, bigint>();
  if (expected.call.method === 'supply') {
    for (const asset of expected.call.assets) {
      const contractId = deployment.assets[asset.symbol].contractId;
      allowance.set(contractId, (allowance.get(contractId) ?? 0n) + asset.amount);
    }
  }
  for (const entry of op.auth ?? []) {
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') {
      fail('AUTH_CREDENTIALS', 'The XOXNO call asks for a separate authorization signature.');
    }
    const root = entry.rootInvocation.function;
    if (
      root.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      root.contractFn.toXdr('base64') !== call.toXdr('base64')
    ) {
      fail('AUTH_ROOT_MISMATCH', 'The authorization is for a different call than the XOXNO call.');
    }
    for (const child of buildInvocationTree(entry.rootInvocation).invocations) {
      spend(child, { account: expected.account, pool: deployment.pool }, allowance);
    }
  }
  return { hash: hex(tx.hash()), feeStroops, validUntilSeconds };
}

function spend(node: InvocationTree, expected: { account: string; pool: string }, allowance: Map<string, bigint>) {
  const invocation = node.args;
  if (
    node.type !== 'execute' ||
    !('function' in invocation) ||
    invocation.function !== 'transfer' ||
    node.invocations.length
  ) {
    fail('AUTH_UNEXPECTED', 'The XOXNO call authorizes a call other than a token transfer.');
  }
  const [from, to, amount] = invocation.args;
  const left = allowance.get(invocation.source);
  if (
    from !== expected.account ||
    to !== expected.pool ||
    typeof amount !== 'bigint' ||
    left === undefined ||
    amount > left
  ) {
    fail('AUTH_UNEXPECTED', 'The XOXNO call authorizes moving more, or another token, than is being supplied.');
  }
  allowance.set(invocation.source, left - amount);
}

interface SpokeAssetRaw {
  is_collateralizable: boolean;
  is_borrowable: boolean;
  paused: boolean;
  frozen: boolean;
  loan_to_value: number;
  liquidation_threshold: number;
}

function argsOf(network: StellarNetwork, account: string, call: XoxnoCall): xdr.ScVal[] {
  const caller = new Address(account).toScVal();
  const id = nativeToScVal(call.accountId, { type: 'u64' });
  const assets = xdr.ScVal.scvVec(
    call.assets.map((asset) =>
      xdr.ScVal.scvVec([hubAsset(network, asset.symbol), nativeToScVal(asset.amount, { type: 'i128' })]),
    ),
  );
  if (call.method === 'supply') return [caller, id, nativeToScVal(call.spokeId, { type: 'u32' }), assets];
  // `to` None pays the loan to the caller.
  return [caller, id, assets, xdr.ScVal.scvVoid()];
}

/** HubAssetKey { asset, hub_id }; Soroban encodes struct fields as a map sorted by name. */
function hubAsset(network: StellarNetwork, symbol: XoxnoSymbol): xdr.ScVal {
  const { contractId, hubId } = XOXNO[network].assets[symbol];
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('asset'), val: new Address(contractId).toScVal() }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hub_id'), val: nativeToScVal(hubId, { type: 'u32' }) }),
  ]);
}

async function simulate(options: XoxnoReaderOptions, contractId: string, method: string, args: xdr.ScVal[] = []) {
  const server = new rpc.Server(options.rpcUrl);
  const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASES[options.network],
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation) || !simulation.result) {
    const detail = rpc.Api.isSimulationError(simulation) ? simulation.error.slice(0, 200) : 'no result';
    throw new Error(`Reading XOXNO ${method} failed in simulation: ${detail}`);
  }
  return scValToNative(simulation.result.retval) as unknown;
}

function canonical(values: unknown[]): string {
  return JSON.stringify(values, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value));
}
