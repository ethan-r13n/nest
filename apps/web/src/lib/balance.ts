import { useQuery } from '@tanstack/react-query';

const HORIZON = { mainnet: 'https://horizon.stellar.org', testnet: 'https://horizon-testnet.stellar.org' } as const;
const STROOPS = 10_000_000n;
/** Each account keeps 0.5 XLM per base entry and subentry; Nest also leaves its 1 XLM fee limit. */
const RESERVE_PER_ENTRY = 5_000_000n;
const FEE_HEADROOM = 10_000_000n;

interface HorizonAccount {
  subentry_count: number;
  num_sponsoring?: number;
  num_sponsored?: number;
  balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[];
}

/**
 * What the connected account can spend of an asset, read from Horizon. XLM leaves the account's
 * reserve and the network fee limit untouched. `null` means the account holds none of it.
 */
export function useSpendable(
  network: 'mainnet' | 'testnet' | undefined,
  account: string | null,
  asset: { code: string; issuer: string | null } | null,
) {
  return useQuery({
    queryKey: ['spendable', network, account, asset?.code, asset?.issuer],
    enabled: Boolean(network && account && asset),
    queryFn: async ({ signal }) => {
      const response = await fetch(`${HORIZON[network ?? 'testnet']}/accounts/${account}`, { signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('The balance could not be read.');
      const data = (await response.json()) as HorizonAccount;
      const line = data.balances.find((balance) =>
        asset?.issuer
          ? balance.asset_code === asset.code && balance.asset_issuer === asset.issuer
          : balance.asset_type === 'native',
      );
      if (!line) return null;
      let raw = decimalToRaw(line.balance);
      if (!asset?.issuer) {
        const entries =
          2n + BigInt(data.subentry_count) + BigInt(data.num_sponsoring ?? 0) - BigInt(data.num_sponsored ?? 0);
        raw -= entries * RESERVE_PER_ENTRY + FEE_HEADROOM;
      }
      return raw > 0n ? raw : 0n;
    },
  });
}

export function rawToDecimal(raw: bigint): string {
  const whole = raw / STROOPS;
  const fraction = (raw % STROOPS).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function decimalToRaw(decimal: string): bigint {
  const [whole = '0', fraction = ''] = decimal.split('.');
  return BigInt(whole) * STROOPS + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}
