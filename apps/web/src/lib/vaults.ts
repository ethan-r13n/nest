import { useQuery } from '@tanstack/react-query';

import { execution } from './execution.ts';

export function useVaults() {
  return useQuery({ queryKey: ['defindex-vaults'], queryFn: execution.vaults, refetchInterval: 60_000 });
}
