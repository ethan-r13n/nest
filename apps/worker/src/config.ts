import { type StellarNetwork, StellarNetworkSchema } from '@nest/domain/network';
import { z } from 'zod';

import { fromBase64 } from './raven/crypto.ts';

const ConfigSchema = z.object({
  STELLAR_NETWORK: StellarNetworkSchema,
  EXECUTION_ENABLED: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

const FauxStepSchema = z.union([
  z.strictObject({ text: z.string() }),
  z.strictObject({ toolCall: z.strictObject({ name: z.string(), args: z.record(z.string(), z.json()) }) }),
]);

const AgentConfigSchema = z.discriminatedUnion('PI_PROVIDER', [
  z.object({
    PI_PROVIDER: z.literal('openrouter'),
    PI_MODEL_ID: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
  }),
  // Tests and local demos only: a scripted model that never calls a provider.
  // A Wrangler var may be a JSON value, so the script arrives as text or as an array.
  z.object({
    PI_PROVIDER: z.literal('faux'),
    PI_FAUX_SCRIPT: z.preprocess(parseJsonText, z.array(FauxStepSchema)),
  }),
]);

export interface Config {
  network: StellarNetwork;
  executionEnabled: boolean;
}

export type FauxStep = z.infer<typeof FauxStepSchema>;

export type AgentConfig =
  | { provider: 'openrouter'; modelId: string; apiKey: string }
  | { provider: 'faux'; script: FauxStep[] };

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
  if (!parsed.success) throw new ConfigError(variablesOf(parsed.error));
  return { network: parsed.data.STELLAR_NETWORK, executionEnabled: parsed.data.EXECUTION_ENABLED };
}

const ENCRYPTION_KEY_BYTES = 32;
const EncryptionKeySchema = z.object({ APP_ENCRYPTION_KEY: z.base64() });

/** APP_ENCRYPTION_KEY: 32 random bytes, base64. Seals credentials Nest stores, such as the Raven grant. */
export function decodeEncryptionKey(env: unknown): Uint8Array<ArrayBuffer> {
  const parsed = EncryptionKeySchema.safeParse(env);
  const bytes = parsed.success ? fromBase64(parsed.data.APP_ENCRYPTION_KEY) : null;
  if (!bytes || bytes.length !== ENCRYPTION_KEY_BYTES) throw new ConfigError(['APP_ENCRYPTION_KEY']);
  return bytes;
}

export interface AdmissionLimits {
  /** Turns one anonymous subject may start per window. */
  guestTurns: number;
  guestWindowMs: number;
  /** Model runs in flight at once across every conversation. */
  activeRuns: number;
}

const GUEST_WINDOW_MS = 15 * 60_000;
const AdmissionSchema = z.object({
  AGENT_GUEST_TURNS_PER_15_MIN: z.coerce.number().int().min(1).max(10_000),
  AGENT_MAX_ACTIVE_RUNS: z.coerce.number().int().min(1).max(1_000),
});

export function decodeAdmissionLimits(env: unknown): AdmissionLimits {
  const parsed = AdmissionSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(variablesOf(parsed.error));
  return {
    guestTurns: parsed.data.AGENT_GUEST_TURNS_PER_15_MIN,
    guestWindowMs: GUEST_WINDOW_MS,
    activeRuns: parsed.data.AGENT_MAX_ACTIVE_RUNS,
  };
}

export function decodeAgentConfig(env: unknown): AgentConfig {
  const parsed = AgentConfigSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(variablesOf(parsed.error));
  return parsed.data.PI_PROVIDER === 'openrouter'
    ? { provider: 'openrouter', modelId: parsed.data.PI_MODEL_ID, apiKey: parsed.data.OPENROUTER_API_KEY }
    : { provider: 'faux', script: parsed.data.PI_FAUX_SCRIPT };
}

function variablesOf(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? '(root)')))];
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
