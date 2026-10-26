import { RANGE_POOLS, rangeAssets } from '@nest/adapters/aquarius/range';
import { lendingAsset } from '@nest/adapters/blend/markets';
import { swapAsset } from '@nest/adapters/stellar/assets';
import { hex, InspectionError, verifySignedTransaction } from '@nest/adapters/stellar/inspect';
import { NETWORK_PASSPHRASES } from '@nest/adapters/stellar/networks';
import { inspectTrustline } from '@nest/adapters/stellar/trustline';
import { VenueRefusal } from '@nest/adapters/venue';
import { xoxnoAsset } from '@nest/adapters/xoxno/lending';
import { AppError } from '@nest/domain/errors';
import { type Asset, StrKey } from '@stellar/stellar-sdk';

import { type ExecutionDeps, logFailure } from './store.ts';

/** Which feature the asset is for: on Testnet, swaps, Blend, Aquarius and XOXNO do not all list the same USDC. */
export type TrustlineUse = 'swap' | 'lending' | 'aquarius' | 'xoxno';

const CONFIRM_POLL_MS = 1_000;
const CONFIRM_WAIT_MS = 20_000;

/**
 * Adding a trustline is the one step a lending or swap plan cannot include: a Soroban call must be
 * a transaction's only operation. Nest builds it; the user signs it like any other action.
 */
export async function prepareTrustline(deps: ExecutionDeps, input: { accountId: string; use: TrustlineUse }) {
  const asset = assetFor(deps, input);
  try {
    const built = await deps.buildTrustline({
      network: deps.config.network,
      account: input.accountId,
      asset,
      nowMs: deps.now(),
    });
    return {
      asset: { code: asset.getCode(), issuer: asset.getIssuer() },
      xdr: built.xdr,
      hash: built.hash,
      networkPassphrase: NETWORK_PASSPHRASES[deps.config.network],
    };
  } catch (error) {
    if (error instanceof VenueRefusal) throw new AppError('CONFLICT', error.message);
    logFailure('trustline_build', error);
    throw new AppError('UNAVAILABLE', 'The trustline could not be prepared right now. Try again shortly.');
  }
}

/** Submits the signed trustline after checking it is exactly that, then waits for confirmation. */
export async function submitTrustline(
  deps: ExecutionDeps,
  input: { accountId: string; use: TrustlineUse; signedXdr: string },
) {
  if (!deps.config.executionEnabled)
    throw new AppError('EXECUTION_DISABLED', 'Execution is turned off on this server.');
  if (!deps.rpc) throw new AppError('UNAVAILABLE', 'Execution needs a Stellar RPC on this server.');
  const asset = assetFor(deps, input);
  let tx: ReturnType<typeof verifySignedTransaction>;
  try {
    const { hash } = inspectTrustline(input.signedXdr, {
      network: deps.config.network,
      account: input.accountId,
      asset,
      nowSeconds: Math.floor(deps.now() / 1000),
    });
    tx = verifySignedTransaction(input.signedXdr, {
      network: deps.config.network,
      account: input.accountId,
      preparedHash: hash,
    });
  } catch (error) {
    if (error instanceof InspectionError) throw new AppError('INVALID_REQUEST', error.message);
    throw error;
  }
  const hash = hex(tx.hash());
  const sent = await deps.rpc.send(tx);
  if (sent.status === 'ERROR') throw new AppError('INVALID_REQUEST', 'The network rejected the trustline.');
  const deadline = deps.now() + CONFIRM_WAIT_MS;
  while (deps.now() < deadline) {
    const outcome = await deps.rpc.get(hash);
    if (outcome.status === 'SUCCESS') return { status: 'confirmed' as const, txHash: hash, ledger: outcome.ledger };
    if (outcome.status === 'FAILED') throw new AppError('INVALID_REQUEST', 'The trustline failed on chain.');
    await deps.sleep(CONFIRM_POLL_MS);
  }
  return { status: 'pending' as const, txHash: hash, ledger: null };
}

function assetFor(deps: ExecutionDeps, input: { accountId: string; use: TrustlineUse }): Asset {
  if (!StrKey.isValidEd25519PublicKey(input.accountId)) {
    throw new AppError('INVALID_REQUEST', 'Connect a Stellar account (G…) first.');
  }
  if (input.use === 'lending') return lendingAsset(deps.config.network, 'USDC').classic;
  if (input.use === 'swap') return swapAsset(deps.config.network, 'USDC').classic;
  if (input.use === 'xoxno') return xoxnoAsset(deps.config.network, 'USDC').classic;
  const pool = RANGE_POOLS[deps.config.network][0];
  if (!pool) throw new AppError('UNAVAILABLE', 'Aquarius limit orders are not available on this network.');
  return rangeAssets(deps.config.network, pool).usdc.classic;
}
