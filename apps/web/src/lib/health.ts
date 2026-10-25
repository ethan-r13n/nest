import { useQuery } from '@tanstack/react-query';

const REFRESH_MS = 60_000;

export interface Health {
  ok: boolean;
  network: 'mainnet' | 'testnet';
  executionEnabled: boolean;
  database: 'ok' | 'error';
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: ({ signal }) => fetchHealth(signal), refetchInterval: REFRESH_MS });
}

async function fetchHealth(signal: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal });
  const body: unknown = await response.json();
  if (!isHealth(body)) throw new Error('The API returned an unexpected health response.');
  return body;
}

function isHealth(value: unknown): value is Health {
  if (typeof value !== 'object' || value === null) return false;
  const { ok, network, executionEnabled, database } = value as Record<string, unknown>;
  return (
    typeof ok === 'boolean' &&
    (network === 'mainnet' || network === 'testnet') &&
    typeof executionEnabled === 'boolean' &&
    (database === 'ok' || database === 'error')
  );
}
