import type { StellarNetwork } from '@nest/domain/network';

/** Part of every transaction hash: a mismatch makes signatures invalid on the other network. */
export const NETWORK_PASSPHRASES = {
  mainnet: 'Public Global Stellar Network ; September 2015',
  testnet: 'Test SDF Network ; September 2015',
} as const satisfies Record<StellarNetwork, string>;
