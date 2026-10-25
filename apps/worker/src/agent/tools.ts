import type { AgentTool } from '@earendil-works/pi-agent-core';
import { defineTool, type ToolOutput, untrusted } from '@nest/agent-runtime/tools';
import { parseResearchSnapshot } from '@nest/data/research';
import { Type } from 'typebox';

import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };
import type { RavenCallResult, RavenToolName } from '../raven/connection.ts';

export const APPROVED_TOOLS = [
  'list_markets',
  'raven_search',
  'raven_execute',
  'compare_opportunities',
  'propose_intent',
] as const;

export interface RavenClient {
  callTool(name: RavenToolName, args: Record<string, unknown>): Promise<RavenCallResult>;
}

interface SwapProposal {
  intentId: string;
  sell: { symbol: string; amount: string };
  buy: { symbol: string };
  quote:
    | {
        expectedOut: string;
        minimumOut: string;
        slippageBps: number;
        priceImpactBps: number | null;
        protocols: string[];
      }
    | { unavailable: string };
}

type LendingProposalKind = 'supply' | 'borrow' | 'repay' | 'withdraw' | 'withdraw_collateral';
const EXIT_LABELS = { repay: 'debt', withdraw: 'supplied', withdraw_collateral: 'collateral' } as const;

export interface LendingOffer {
  pool: string;
  poolStatus: string;
  supplyApyPct: number;
  borrowApyPct: number;
  utilizationPct: number;
  collateral: { symbol: string; amount: string } | null;
  estimatedHealth: number | null;
  withdrawalTiming: string;
}

interface LendingProposal {
  intentId: string;
  kind: LendingProposalKind;
  asset: { symbol: string; amount: string };
  offers: LendingOffer[];
  excluded: { name: string; reason: string }[];
  unavailable?: string;
}

/** Creates application records only; it can never approve, sign or submit. */
export interface ProposalService {
  proposeSwap(input: { sell: 'USDC' | 'XLM'; buy: 'USDC' | 'XLM'; amount: string }): Promise<SwapProposal>;
  proposeLending(input: {
    kind: LendingProposalKind;
    asset: 'USDC' | 'XLM';
    amount: string;
    collateralAsset?: 'USDC' | 'XLM' | undefined;
  }): Promise<LendingProposal>;
  /** Live lending rates on this network, read-only. */
  lendingRates(): Promise<LendingRates>;
}

interface LendingRates {
  network: string;
  pools: {
    name: string;
    status: string;
    canSupply: boolean;
    canBorrow: boolean;
    reserves: { symbol: string; supplyApyPct: number; borrowApyPct: number; utilizationPct: number }[];
  }[];
}

const DEFAULT_LIMIT = 10;
/** Roughly Raven's own ~6k-token result cap, so one call cannot flood the conversation. */
const MAX_RAVEN_RESULT_CHARS = 24_000;
const MAX_RAVEN_CODE_CHARS = 8_000;
const RAVEN_SERVICES = ['lumenloop', 'scout', 'stellarDocs'] as const;
const research = parseResearchSnapshot(snapshotJson);

export function createTools(deps: { raven: RavenClient; proposals: ProposalService }): AgentTool[] {
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
    defineTool({
      name: 'compare_opportunities',
      label: 'Reading live lending rates',
      description: [
        'Read live supply and borrow APYs, utilization and status for every Blend pool Nest supports on this network.',
        'Use it to answer questions about current lending rates. It changes nothing. Pools that are on ice cannot',
        'take new loans; frozen pools take no deposits.',
      ].join(' '),
      parameters: Type.Object({}),
      replay: 'safe',
      run: async () => {
        try {
          return { text: JSON.stringify(await deps.proposals.lendingRates()) };
        } catch (error) {
          return { text: error instanceof Error ? error.message : 'Rates are unavailable.', isError: true };
        }
      },
    }),
    defineTool({
      name: 'propose_intent',
      label: 'Preparing a proposal',
      description: [
        'Propose an action for the user to review. kind "swap": sell USDC for XLM or XLM for USDC (sell, buy,',
        'amount); Nest gets a live quote (Soroswap on mainnet, Stellar’s DEX on testnet). kind "supply": lend',
        'asset to earn interest (asset, amount). kind "borrow": borrow asset against collateral (asset, amount,',
        'optional collateral; defaults to the other asset). For supply and borrow, Nest compares every Blend pool',
        'and picks the best rate, sizing borrow collateral for a safe health factor. kind "repay": pay back a Blend',
        'loan of asset; kind "withdraw": take back asset the user lent; kind "withdraw_collateral": take back',
        'collateral. For these three, amount may be "all" for the whole position; the card reads the position once',
        'the wallet is connected. The user sees a proposal card,',
        'connects their wallet, reviews the exact transaction and signs it there. You cannot approve, sign or submit.',
        'Explain the result from the tool output; do not compute amounts or rates yourself.',
      ].join(' '),
      parameters: Type.Object({
        kind: Type.Union([
          Type.Literal('swap'),
          Type.Literal('supply'),
          Type.Literal('borrow'),
          Type.Literal('repay'),
          Type.Literal('withdraw'),
          Type.Literal('withdraw_collateral'),
        ]),
        amount: Type.String({
          pattern: '^((0|[1-9][0-9]*)([.][0-9]{1,7})?|all)$',
          maxLength: 30,
          description:
            'Plain decimal such as "100": the amount sold, supplied, borrowed, repaid or withdrawn. "all" for a whole repay or withdrawal.',
        }),
        sell: Type.Optional(Type.Union([Type.Literal('USDC'), Type.Literal('XLM')], { description: 'Swap only.' })),
        buy: Type.Optional(Type.Union([Type.Literal('USDC'), Type.Literal('XLM')], { description: 'Swap only.' })),
        asset: Type.Optional(
          Type.Union([Type.Literal('USDC'), Type.Literal('XLM')], { description: 'Lending actions: the asset.' }),
        ),
        collateral: Type.Optional(
          Type.Union([Type.Literal('USDC'), Type.Literal('XLM')], { description: 'Borrow only: the collateral.' }),
        ),
      }),
      // It creates a record, so a crash never repeats it.
      replay: 'never',
      sequential: true,
      run: async (args) => {
        try {
          if (args.kind === 'swap') {
            if (!args.sell || !args.buy) return { text: 'A swap needs sell and buy.', isError: true };
            return swapOutput(
              await deps.proposals.proposeSwap({ sell: args.sell, buy: args.buy, amount: args.amount }),
            );
          }
          if (!args.asset) return { text: `A ${args.kind} needs asset.`, isError: true };
          return lendingOutput(
            await deps.proposals.proposeLending({
              kind: args.kind,
              asset: args.asset,
              amount: args.amount,
              collateralAsset: args.collateral,
            }),
          );
        } catch (error) {
          return { text: error instanceof Error ? error.message : 'The action could not be proposed.', isError: true };
        }
      },
    }),
  ];
}

function swapOutput(proposal: SwapProposal): ToolOutput {
  const quote = proposal.quote;
  const summary =
    'unavailable' in quote
      ? `The live quote is unavailable right now (${quote.unavailable}); the proposal card will retry.`
      : [
          `Expected about ${quote.expectedOut} ${proposal.buy.symbol}, at least ${quote.minimumOut} after`,
          `${quote.slippageBps / 100}% slippage. Price impact: ${quote.priceImpactBps === null ? 'not reported' : `${quote.priceImpactBps / 100}%`}.`,
          `Routes: ${quote.protocols.join(', ') || 'Soroswap'}. Nest fee: 0. The quote is valid for about 30 seconds and the card refreshes it.`,
        ].join(' ');
  return {
    text: `Swap proposal ready: sell ${proposal.sell.amount} ${proposal.sell.symbol} for ${proposal.buy.symbol}. ${summary} The user reviews and signs in their wallet; nothing executes until they do.`,
    details: { intentId: proposal.intentId, kind: 'swap' },
  };
}

function lendingOutput(proposal: LendingProposal): ToolOutput {
  if (proposal.kind === 'repay' || proposal.kind === 'withdraw' || proposal.kind === 'withdraw_collateral') {
    const verb = proposal.kind === 'repay' ? 'Repay' : 'Withdraw';
    const amount =
      proposal.asset.amount === 'all'
        ? `all ${proposal.asset.symbol}`
        : `${proposal.asset.amount} ${proposal.asset.symbol}`;
    return {
      text: [
        `${verb} proposal for ${amount} ${EXIT_LABELS[proposal.kind]} on Blend.`,
        'Once the user connects their wallet, the card reads their position in each Blend pool and shows what is held and the amount,',
        proposal.kind === 'repay'
          ? 'and any amount above the debt is refunded in the same transaction.'
          : 'and checks the pool has the liquidity to pay it out.',
        proposal.kind === 'withdraw_collateral'
          ? 'If they still owe, Nest checks the health factor after the withdrawal and blocks it at 1 or below.'
          : '',
        'Nest fee: 0. The user reviews and signs in their wallet; nothing executes until they do.',
      ]
        .filter(Boolean)
        .join(' '),
      details: { intentId: proposal.intentId, kind: proposal.kind },
    };
  }
  const verb = proposal.kind === 'supply' ? 'Supply' : 'Borrow';
  const [best] = proposal.offers;
  const excluded = proposal.excluded.map((entry) => `${entry.name}: ${entry.reason}`).join(' ');
  const lines = [`${verb} proposal for ${proposal.asset.amount} ${proposal.asset.symbol} on Blend.`];
  if (proposal.unavailable)
    lines.push(`Live rates are unavailable right now (${proposal.unavailable}); the card will retry.`);
  else if (!best) lines.push('No Blend pool can take this right now.');
  else if (proposal.kind === 'supply') {
    lines.push(
      `Best rate: ${best.pool}, ${best.supplyApyPct.toFixed(2)}% supply APY (variable), utilization ${best.utilizationPct.toFixed(1)}%.`,
      `Withdrawal timing: ${best.withdrawalTiming}`,
    );
  } else {
    lines.push(
      `Best rate: ${best.pool}, ${best.borrowApyPct.toFixed(2)}% borrow APY (variable).`,
      `Collateral: ${best.collateral?.amount} ${best.collateral?.symbol}, for an estimated health factor of ${best.estimatedHealth?.toFixed(2)} (Blend liquidates below 1).`,
      `Collateral withdrawal: ${best.withdrawalTiming}`,
    );
  }
  if (excluded) lines.push(`Excluded: ${excluded}`);
  lines.push('Nest fee: 0. The user reviews and signs in their wallet; nothing executes until they do.');
  return { text: lines.join(' '), details: { intentId: proposal.intentId, kind: proposal.kind } };
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
