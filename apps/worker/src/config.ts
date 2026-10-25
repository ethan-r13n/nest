import { type StellarNetwork, StellarNetworkSchema } from '@nest/domain/network';
import { z } from 'zod';

const ConfigSchema = z.object({
  STELLAR_NETWORK: StellarNetworkSchema,
  EXECUTION_ENABLED: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export interface Config {
  network: StellarNetwork;
  executionEnabled: boolean;
}

/** Names the variables that failed to decode; never their values. */
export class ConfigError extends Error {
  override name = 'ConfigError';
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid Worker configuration: ${variables.join(', ')}`);
    this.variables = variables;
  }
}

export function decodeConfig(env: unknown): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '(root)')))]);
  }
  return { network: parsed.data.STELLAR_NETWORK, executionEnabled: parsed.data.EXECUTION_ENABLED };
}
