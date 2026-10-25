import type { AssetRef } from '@nest/domain/asset';
import { networkId, type StellarNetwork } from '@nest/domain/network';
import { Asset } from '@stellar/stellar-sdk';

import { NETWORK_PASSPHRASES } from './networks.ts';

export const SWAP_SYMBOLS = ['XLM', 'USDC'] as const;
export type SwapSymbol = (typeof SWAP_SYMBOLS)[number];

export interface SwapAsset {
  symbol: SwapSymbol;
  ref: AssetRef & { contractId: string };
  /** The Classic asset, for path payments; its Stellar Asset Contract is `ref.contractId`. */
  classic: Asset;
}

/** Circle's USDC issuer accounts on Stellar. Ticker alone never identifies an asset. */
const USDC_ISSUERS: Record<StellarNetwork, string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};
// Classic assets, and the contracts that wrap them, use seven decimals.
const CLASSIC_DECIMALS = 7;

export function swapAsset(network: StellarNetwork, symbol: SwapSymbol): SwapAsset {
  const classic = symbol === 'XLM' ? Asset.native() : new Asset('USDC', USDC_ISSUERS[network]);
  return {
    symbol,
    classic,
    ref: {
      network: networkId(network),
      canonicalId: classic.isNative() ? 'XLM' : `${classic.getCode()}:${classic.getIssuer()}`,
      contractId: classic.contractId(NETWORK_PASSPHRASES[network]),
      ...(classic.isNative() ? { code: 'XLM' } : { code: classic.getCode(), issuer: classic.getIssuer() }),
      decimals: CLASSIC_DECIMALS,
    },
  };
}
