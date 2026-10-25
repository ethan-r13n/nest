import { AquariusSnapshotSchema } from '@nest/data/aquarius';
import { useQuery } from '@tanstack/react-query';

import capturedJson from '../../../../research/data/aquarius-pools.json' with { type: 'json' };
import { useHealth } from './health.ts';

const MAINNET_CAPTURE = AquariusSnapshotSchema.parse(capturedJson);

export function useLiquidityPools() {
  const health = useHealth();
  const network = health.data?.network;
  const query = useQuery({
    queryKey: ['aquarius-pools', network],
    enabled: network !== undefined,
    initialData: network === 'mainnet' ? MAINNET_CAPTURE : undefined,
    initialDataUpdatedAt: Date.parse(MAINNET_CAPTURE.retrievedAt),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/markets?kind=liquidity_pool&venue=aquarius&network=${network}`, { signal });
      if (!response.ok) throw new Error('Liquidity data is unavailable.');
      const body: unknown = await response.json();
      const parsed = AquariusSnapshotSchema.parse(body);
      if (parsed.network !== network) throw new Error('Pool network mismatch.');
      return parsed;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  return { ...query, isPending: query.isPending && !health.isError, isError: query.isError || health.isError };
}
