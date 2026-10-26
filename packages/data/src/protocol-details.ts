import { z } from 'zod';

const URL = z.url().refine((value) => value.startsWith('https://'));
const DATE = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const ContextSchema = z.object({
  status: z.string(),
  source_url: URL,
  observed_at: DATE,
  scope: z.string().optional(),
  project: z
    .object({
      name: z.string(),
      url: URL,
      shortDescription: z.string().nullish(),
      status: z.string().nullish(),
      statusAsOf: DATE.nullish(),
      statusSourceUrl: URL.nullish(),
      statusCaveat: z.string().nullish(),
      builtBy: z.object({ name: z.string() }).nullish(),
      types: z.array(z.string()).optional(),
      links: z.record(z.string(), URL).optional(),
      scfAwarded: z.boolean().optional(),
      scfTotalAwardedUSD: z.number().finite().nonnegative().nullish(),
      scfAsOf: DATE.nullish(),
      scfSourceUrl: URL.nullish(),
    })
    .nullish(),
  audits: z
    .array(z.object({ title: z.string(), reportUrl: URL, auditor: z.string().nullish(), publishedAt: DATE.nullish() }))
    .default([]),
  repos: z
    .array(
      z.object({ fullName: z.string(), url: URL, primaryLanguage: z.string().nullish(), lastCommitAt: DATE.nullish() }),
    )
    .default([]),
  contracts: z
    .array(z.object({ address: z.string().regex(/^C[A-Z2-7]{55}$/), label: z.string().nullish() }))
    .default([]),
  contracts_as_of: DATE.nullish(),
});
const Schema = z.object({
  schemaVersion: z.literal('nest.protocol.details.v1'),
  protocols: z.record(
    z.string(),
    z.object({
      description: z.string().nullable(),
      protocol_tvl_all_chains_usd: z.number().finite().nullable(),
      stellar_tvl_components_usd: z.record(z.string(), z.number().finite()).nullable(),
      audit_links: z.array(URL).nullable(),
      listed_at_unix: z.number().int().nullable(),
    }),
  ),
  contexts: z.record(z.string(), ContextSchema),
  venues: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      type: z.string(),
      assets: z.string(),
      reads: z.array(z.string()),
      actions: z.array(z.string()),
      source: z.string(),
      exit: z.string(),
      slugs: z.array(z.string()),
    }),
  ),
});

export type ProtocolContext = z.infer<typeof ContextSchema>;
export type ProtocolVenue = z.infer<typeof Schema>['venues'][number];

export function parseProtocolDetails(input: unknown) {
  return Schema.parse(input);
}
