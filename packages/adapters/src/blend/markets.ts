import type { StellarNetwork } from '@nest/domain/network';
import { Asset } from '@stellar/stellar-sdk';

import { NETWORK_PASSPHRASES } from '../stellar/networks.ts';

export const LENDING_SYMBOLS = ['XLM', 'USDC'] as const;
export type LendingSymbol = (typeof LENDING_SYMBOLS)[number];

export interface BlendPool {
  id: string;
  name: string;
}

export interface LendingAsset {
  symbol: LendingSymbol;
  /** The Stellar Asset Contract the pool lists as its reserve. */
  contractId: string;
  classic: Asset;
  decimals: number;
}

/**
 * Blend v2 pools Nest may act on. Source: mainnet.contracts.json and testnet.contracts.json in
 * github.com/blend-capital/blend-utils (FixedV2, YieldBloxV2, TestnetV2), read 2026-10-26. The
 * mainnet backstop v2 listed there (CAQQR5…) matches docs.blend.capital/mainnet-deployments.
 */
export const BLEND_POOLS: Record<StellarNetwork, readonly BlendPool[]> = {
  mainnet: [
    { id: 'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD', name: 'Blend Fixed' },
    { id: 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS', name: 'Blend YieldBlox' },
  ],
  testnet: [{ id: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF', name: 'Blend Testnet V2' }],
};

/** Mainnet USDC is Circle's; Blend's Testnet pool lists Blend's own test USDC, a different asset. */
const USDC_ISSUERS: Record<StellarNetwork, string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56',
};

export function lendingAsset(network: StellarNetwork, symbol: LendingSymbol): LendingAsset {
  const classic = symbol === 'XLM' ? Asset.native() : new Asset('USDC', USDC_ISSUERS[network]);
  return { symbol, classic, contractId: classic.contractId(NETWORK_PASSPHRASES[network]), decimals: 7 };
}

export function blendPool(network: StellarNetwork, poolId: string): BlendPool | undefined {
  return BLEND_POOLS[network].find((pool) => pool.id === poolId);
}

/** Blend pool status codes (docs.blend.capital, pool management). */
const STATUS_LABELS = ['Admin active', 'Active', 'Admin on ice', 'On ice', 'Admin frozen', 'Frozen', 'Setup'] as const;

export function poolStatusLabel(status: number): string {
  return STATUS_LABELS[status] ?? `Unknown (${status})`;
}

/** Borrowing needs an active pool; supplying is allowed until the pool is frozen. */
export function poolAllows(status: number, action: 'supply' | 'borrow'): boolean {
  return action === 'borrow' ? status <= 1 : status <= 3;
}
