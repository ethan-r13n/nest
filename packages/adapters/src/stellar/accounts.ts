import { MAX_CLASSIC_RAW, parseDecimalAmount } from '@nest/domain/amount';
import type { StellarNetwork } from '@nest/domain/network';
import type { Asset } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { VenueRefusal } from '../venue.ts';

/** Classic account data (balances, trustlines, reserves) that Stellar RPC does not serve. */
export const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};
const TIMEOUT_MS = 15_000;
const DECIMALS = 7;
// Each account must keep 0.5 XLM per base entry and subentry; spending into the reserve fails.
const BASE_RESERVE_RAW = 5_000_000n;

const AccountSchema = z.looseObject({
  sequence: z.string(),
  subentry_count: z.number().int().nonnegative(),
  num_sponsoring: z.number().int().nonnegative().optional(),
  num_sponsored: z.number().int().nonnegative().optional(),
  balances: z.array(
    z.looseObject({
      asset_type: z.string(),
      asset_code: z.string().optional(),
      asset_issuer: z.string().optional(),
      balance: z.string(),
    }),
  ),
});

export type ClassicAccount = z.infer<typeof AccountSchema>;

export async function loadClassicAccount(
  network: StellarNetwork,
  account: string,
  send: typeof fetch = fetch,
): Promise<ClassicAccount> {
  const response = await send(`${HORIZON_URLS[network]}/accounts/${account}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) {
    throw new VenueRefusal('ACCOUNT_NOT_FOUND', 'This account does not exist on this network yet. Fund it first.');
  }
  const parsed = AccountSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) throw new Error(`Horizon account read answered ${response.status}.`);
  return parsed.data;
}

/**
 * Refuses before signing what would fail on chain: receiving an asset without a trustline, or
 * spending more than the account holds after its XLM reserve and the network fee.
 */
export function requireFunds(
  account: ClassicAccount,
  needs: { spend: readonly { asset: Asset; amount: bigint }[]; receive: readonly Asset[]; feeStroops: bigint },
): void {
  const balanceOf = (asset: Asset) =>
    account.balances.find((balance) =>
      asset.isNative()
        ? balance.asset_type === 'native'
        : balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer(),
    );
  for (const asset of needs.receive) {
    if (!asset.isNative() && !balanceOf(asset)) {
      throw new VenueRefusal('TRUSTLINE_MISSING', `Add ${asset.getCode()} to your wallet first.`);
    }
  }
  for (const { asset, amount } of needs.spend) {
    const held = balanceOf(asset);
    const label = asset.isNative() ? 'XLM' : asset.getCode();
    if (!held) throw new VenueRefusal('INSUFFICIENT_BALANCE', `This account holds no ${label}.`);
    let available = parseDecimalAmount(held.balance, DECIMALS, MAX_CLASSIC_RAW);
    if (asset.isNative()) {
      const entries =
        2n + BigInt(account.subentry_count) + BigInt(account.num_sponsoring ?? 0) - BigInt(account.num_sponsored ?? 0);
      available -= entries * BASE_RESERVE_RAW + needs.feeStroops;
    }
    if (amount > available) {
      throw new VenueRefusal(
        'INSUFFICIENT_BALANCE',
        `This account does not hold enough ${label} (after the XLM reserve).`,
      );
    }
  }
}
