import type { AgentTool } from '@earendil-works/pi-agent-core';
import { defineTool, type ToolOutput, untrusted } from '@nest/agent-runtime/tools';
import { parseResearchSnapshot } from '@nest/data/research';
import { Type } from 'typebox';

import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };
import type { RavenCallResult, RavenToolName } from '../raven/connection.ts';

export const APPROVED_TOOLS = ['list_markets', 'raven_search', 'raven_execute'] as const;

export interface RavenClient {
  callTool(name: RavenToolName, args: Record<string, unknown>): Promise<RavenCallResult>;
}

const DEFAULT_LIMIT = 10;
/** Roughly Raven's own ~6k-token result cap, so one call cannot flood the conversation. */
const MAX_RAVEN_RESULT_CHARS = 24_000;
const MAX_RAVEN_CODE_CHARS = 8_000;
const RAVEN_SERVICES = ['lumenloop', 'scout', 'stellarDocs'] as const;
const research = parseResearchSnapshot(snapshotJson);

export function createTools(deps: { raven: RavenClient }): AgentTool[] {
  return [
    defineTool({
      name: 'list_markets',
      label: 'Reading the research snapshot',
      description:
        'List Stellar DeFi protocols by Stellar TVL, or yield pools sorted by APY or TVL, from the dated research snapshot. Not live data.',
      parameters: Type.Object({
        kind: Type.Union([Type.Literal('protocols'), Type.Literal('yield_pools')]),
        category: Type.Optional(
          Type.String({ maxLength: 40, description: 'Protocol category to keep, such as Lending or Dexs.' }),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25 })),
        sort: Type.Optional(
          Type.Union([Type.Literal('tvl'), Type.Literal('apy')], {
            description: 'Yield pools only: highest total APY or highest TVL first. Protocols always sort by TVL.',
          }),
        ),
      }),
      replay: 'safe',
      run: async ({ kind, category, limit, sort }) => {
        const count = limit ?? DEFAULT_LIMIT;
        const rows =
          kind === 'protocols'
            ? research.protocols
                .filter((row) => !category || row.category.toLowerCase() === category.toLowerCase())
                .sort((left, right) => (right.stellarTvlUsd ?? -1) - (left.stellarTvlUsd ?? -1))
                .slice(0, count)
                .map((row) => ({
                  name: row.name,
                  category: row.category,
                  stellarTvlUsd: row.stellarTvlUsd,
                  changeOneDayPct: row.change.day,
                  changeScope: row.change.scope,
                }))
            : [...research.yieldPools]
                .sort((left, right) =>
                  sort === 'apy'
                    ? (right.totalApyPct ?? -1) - (left.totalApyPct ?? -1)
                    : (right.tvlUsd ?? -1) - (left.tvlUsd ?? -1),
                )
                .slice(0, count)
                .map((row) => ({
                  project: row.project,
                  asset: row.symbol,
                  tvlUsd: row.tvlUsd,
                  baseApyPct: row.baseApyPct,
                  rewardApyPct: row.rewardApyPct,
                  totalApyPct: row.totalApyPct,
                }));
        const source = research.sources.defillama;
        const body = JSON.stringify({ source: source.attribution, capturedAt: source.capturedAt, live: false, rows });
        return { text: untrusted(source.attribution, body), details: { kind, rows: rows.length } };
      },
    }),
    defineTool({
      name: 'raven_search',
      label: 'Searching Raven',
      description: [
        'Search Raven, the Stellar ecosystem research service, for operations and skills to call with raven_execute.',
        'Families: lumenloop (community projects, research, funding), scout (live ecosystem graph: projects, repos,',
        'people, audits, stablecoins), stellarDocs (official protocol, SDK, contract and RPC docs), and skills',
        '(tested build playbooks). Run two or three targeted searches with different wording, filtered by service',
        'or kind when you know the family. Results list operation signatures to use in raven_execute.',
      ].join(' '),
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 300, description: 'A targeted query for one source family.' }),
        service: Type.Optional(Type.Union(RAVEN_SERVICES.map((service) => Type.Literal(service)))),
        kind: Type.Optional(Type.Union([Type.Literal('operation'), Type.Literal('skill')])),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      }),
      replay: 'safe',
      run: async (args) => ravenOutput(await deps.raven.callTool('search', args)),
    }),
    defineTool({
      name: 'raven_execute',
      label: 'Running a Raven research script',
      description: [
        "Run JavaScript in Raven's research sandbox. It has no network access and can only call the lumenloop.*,",
        'scout.* and stellarDocs.* operations found with raven_search. Write one async arrow function that calls',
        'several operations (independent ones in parallel with Promise.all) and returns one compact merged value.',
        'Each call resolves to { ok: true, data, asOf } or { ok: false, error }; read results from .data and keep',
        'asOf for citing. It retrieves research context only; it cannot trade, sign or submit anything.',
      ].join(' '),
      parameters: Type.Object({
        code: Type.String({
          minLength: 1,
          maxLength: MAX_RAVEN_CODE_CHARS,
          description: 'An async arrow function, for example: async () => { ... return result; }',
        }),
      }),
      replay: 'safe',
      run: async (args) => ravenOutput(await deps.raven.callTool('execute', args)),
    }),
  ];
}

function ravenOutput(result: RavenCallResult): ToolOutput {
  if (result.status === 'not_connected') {
    return {
      text: 'Raven is not connected on this Nest server. Answer from list_markets and say Raven was unavailable.',
      isError: true,
    };
  }
  if (result.status === 'unavailable') {
    return { text: 'Raven did not answer. Try once more or answer without it and say so.', isError: true };
  }
  const truncated = result.text.length > MAX_RAVEN_RESULT_CHARS;
  const text = truncated ? `${result.text.slice(0, MAX_RAVEN_RESULT_CHARS)}\n[truncated by Nest]` : result.text;
  return { text: untrusted('Raven', text), details: { truncated }, isError: result.isError };
}
