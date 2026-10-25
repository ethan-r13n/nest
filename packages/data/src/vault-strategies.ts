import { z } from 'zod';

const FactSchema = z.object({ label: z.string().min(1), value: z.string().min(1), sourceId: z.string() });
const ProfileSchema = z.object({
  description: z.string().min(1),
  scope: z.enum(['product', 'protocol']),
  sourceIds: z.array(z.string()).min(1),
  facts: z.array(FactSchema),
  risks: z.array(
    z.object({ category: z.enum(['Market', 'System', 'Execution']), text: z.string().min(1), sourceId: z.string() }),
  ),
  counterparties: z.array(z.object({ name: z.string().min(1), role: z.string().min(1), sourceId: z.string() })),
  fees: z.array(FactSchema),
  contracts: z.array(FactSchema.extend({ value: z.string().regex(/^C[A-Z2-7]{55}$/) })),
  withdrawal: z.string().min(1).optional(),
});
const StrategiesSchema = z
  .object({
    schemaVersion: z.literal('nest.vault.strategies.v1'),
    capturedAt: z.iso.datetime(),
    contextMethod: z.string(),
    sources: z.record(
      z.string(),
      z.object({
        label: z.string(),
        url: z.url().refine((url) => url.startsWith('https://')),
        checkedAt: z.iso.datetime(),
      }),
    ),
    profiles: z.record(z.string(), ProfileSchema),
    researchAssignments: z.record(
      z.string(),
      z.object({ default: z.string(), symbols: z.record(z.string(), z.string()) }),
    ),
  })
  .superRefine((data, context) => {
    for (const profile of Object.values(data.profiles)) {
      for (const id of [
        ...profile.sourceIds,
        ...[...profile.facts, ...profile.risks, ...profile.counterparties, ...profile.fees, ...profile.contracts].map(
          (fact) => fact.sourceId,
        ),
      ]) {
        if (!data.sources[id]) context.addIssue({ code: 'custom', message: 'A strategy fact has no source.' });
      }
    }
    for (const mapping of Object.values(data.researchAssignments)) {
      for (const id of [mapping.default, ...Object.values(mapping.symbols)]) {
        if (!data.profiles[id]) context.addIssue({ code: 'custom', message: 'A strategy assignment has no profile.' });
      }
    }
  });

export type VaultStrategies = z.infer<typeof StrategiesSchema>;
export type VaultStrategy = z.infer<typeof ProfileSchema>;

export function parseVaultStrategies(input: unknown): VaultStrategies {
  return StrategiesSchema.parse(input);
}

export function findVaultStrategy(context: VaultStrategies, project: string, asset: string): VaultStrategy | undefined {
  const mapping = context.researchAssignments[project];
  if (!mapping) return undefined;
  const profile = context.profiles[mapping.symbols[asset] ?? mapping.default];
  return profile ? { ...profile, description: profile.description.replaceAll('{asset}', asset) } : undefined;
}
