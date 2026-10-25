import type { StellarNetwork } from '@nest/domain/network';
import { Account, type Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { VenueRefusal } from '../venue.ts';
import { loadClassicAccount } from './accounts.ts';
import { fail, hex, parseTransaction, validUntil } from './inspect.ts';
import { NETWORK_PASSPHRASES } from './networks.ts';

/** A classic operation costs the base fee; this leaves room for surge pricing. */
const FEE_STROOPS = '10000';
const MAX_FEE_STROOPS = 100_000n;
const VALIDITY_SECONDS = 180;
/** What changeTrust sets when no limit is given: the largest amount a classic asset can hold. */
const MAX_LIMIT = '922337203685.4775807';

export interface BuiltTrustline {
  xdr: string;
  hash: string;
}

/**
 * Builds a transaction with one `changeTrust` for the asset, from and for the account, with the
 * default (maximum) limit. Refuses when the account already trusts it.
 */
export async function buildTrustline(input: {
  network: StellarNetwork;
  account: string;
  asset: Asset;
  nowMs: number;
  fetch?: typeof fetch;
}): Promise<BuiltTrustline> {
  const account = await loadClassicAccount(input.network, input.account, input.fetch);
  const trusted = account.balances.some(
    (balance) => balance.asset_code === input.asset.getCode() && balance.asset_issuer === input.asset.getIssuer(),
  );
  if (trusted) throw new VenueRefusal('TRUSTLINE_EXISTS', `This account already holds ${input.asset.getCode()}.`);
  const tx = new TransactionBuilder(new Account(input.account, account.sequence), {
    fee: FEE_STROOPS,
    networkPassphrase: NETWORK_PASSPHRASES[input.network],
    timebounds: { minTime: 0, maxTime: Math.floor(input.nowMs / 1000) + VALIDITY_SECONDS },
  })
    .addOperation(Operation.changeTrust({ asset: input.asset }))
    .build();
  return { xdr: tx.toXDR(), hash: hex(tx.hash()) };
}

/**
 * Accepts a transaction only when it is exactly one `changeTrust` adding this asset at the
 * maximum limit for the account itself, with a small fee and a short validity window.
 */
export function inspectTrustline(
  xdrText: string,
  expected: { network: StellarNetwork; account: string; asset: Asset; nowSeconds: number },
): { hash: string } {
  const tx = parseTransaction(xdrText, expected.network);
  if (tx.source !== expected.account) fail('SOURCE_MISMATCH', 'The transaction is not from the reviewed account.');
  if (tx.operations.length !== 1) fail('OPERATION_COUNT', 'The transaction must contain exactly one operation.');
  const [op] = tx.operations;
  if (op?.type !== 'changeTrust') fail('OPERATION_NOT_ALLOWED', 'The transaction does not add a trustline.');
  if (op.source && op.source !== expected.account) fail('SOURCE_MISMATCH', 'The operation acts for another account.');
  if (!('getCode' in op.line) || !op.line.equals(expected.asset)) {
    fail('ASSET_MISMATCH', 'The trustline is for a different asset.');
  }
  // A zero limit would remove the trustline instead of adding it.
  if (op.limit !== MAX_LIMIT) fail('LIMIT_MISMATCH', 'The trustline must use the default limit.');
  if (BigInt(tx.fee) > MAX_FEE_STROOPS) fail('FEE_ABOVE_LIMIT', 'The network fee is above the limit.');
  validUntil(tx, expected.nowSeconds);
  return { hash: hex(tx.hash()) };
}
