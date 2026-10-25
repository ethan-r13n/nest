import { z } from 'zod';

export const STELLAR_NETWORKS = ['mainnet', 'testnet'] as const;

export const StellarNetworkSchema = z.enum(STELLAR_NETWORKS);
export const NetworkIdSchema = z.enum(['stellar-mainnet', 'stellar-testnet']);

export type StellarNetwork = z.infer<typeof StellarNetworkSchema>;
export type NetworkId = z.infer<typeof NetworkIdSchema>;

export function networkId(network: StellarNetwork): NetworkId {
  return network === 'mainnet' ? 'stellar-mainnet' : 'stellar-testnet';
}
