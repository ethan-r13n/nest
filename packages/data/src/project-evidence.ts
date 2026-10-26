import { z } from 'zod';

const DATE = z.iso.datetime({ offset: true });
const URL = z.url().refine((value) => value.startsWith('https://'));
const Schema = z.object({
  schemaVersion: z.literal('nest.project.evidence.v1'),
  capturedAt: DATE,
  provider: z.string(),
  documentation: URL,
  records: z.record(
    z.string(),
    z.object({
      projectSlug: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      status: z.string().nullable(),
      statusAsOf: DATE.nullable(),
      statusCaveat: z.string().nullable(),
      url: URL,
      observedAt: DATE,
      sourceUrl: URL,
      auditReferences: z.number().int().nonnegative(),
      repositories: z.number().int().nonnegative(),
      contractReferences: z.number().int().nonnegative(),
      scfAwarded: z.boolean(),
      scfTotalAwardedUsd: z.number().finite().nonnegative().nullable(),
      scfAsOf: z.union([DATE, z.iso.date()]).nullable(),
    }),
  ),
});

export function parseProjectEvidence(input: unknown) {
  return Schema.parse(input);
}
