/** Typed calls to Nest's monitoring rules: draft → activate → scheduled checks → alerts. */

import { call } from './execution.ts';

export const ARB_VENUES = ['aquarius', 'soroswap', 'stellar_amm'] as const;
export type ArbVenue = (typeof ARB_VENUES)[number];

export const VENUE_LABELS: Record<ArbVenue, string> = {
  aquarius: 'Aquarius',
  soroswap: 'Soroswap',
  stellar_amm: 'Stellar AMM',
};

export interface ArbitrageConfig {
  venues: [ArbVenue, ArbVenue];
  sizeUsdc: string;
  thresholdBps: number;
  cooldownMinutes: number;
  mode: 'once' | 'repeat';
}

export type EvaluationResult = 'true' | 'false' | 'unknown';

export interface Evidence {
  readings: {
    venue: ArbVenue;
    poolId: string;
    priceUsdcPerXlm: number;
    feeBps: number;
    xlmReserve: string;
    usdcReserve: string;
    observedAt: string;
    ledger: number | null;
  }[];
  errors: { venue: ArbVenue; message: string }[];
  sizeUsdc: string;
  thresholdBps: number;
  spreadBps: number | null;
  profitBps: number | null;
  profitUsdc: string | null;
  buyOn: ArbVenue | null;
  sellOn: ArbVenue | null;
}

export interface Preview {
  evaluatedAt: string;
  result: EvaluationResult;
  reason: string;
  evidence: Evidence;
}

export interface Automation {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  revision: number;
  configHash: string;
  config: ArbitrageConfig;
  intervalSeconds: number;
  armed: boolean;
  nextCheckAt: string | null;
  lastEvaluatedAt: string | null;
  lastResult: EvaluationResult | null;
  lastAlertAt: string | null;
  createdAt: string;
  unacknowledgedAlerts?: number;
}

interface Alert {
  id: string;
  ruleId: string;
  revision: number;
  summary: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface AutomationDetail extends Automation {
  evaluations: {
    id: string;
    revision: number;
    scheduledFor: string;
    evaluatedAt: string;
    delayMs: number;
    result: EvaluationResult;
    reason: string;
    evidence: Evidence;
    triggered: boolean;
  }[];
  alerts: Alert[];
}

export const automations = {
  list: async () => (await call<{ automations: Automation[] }>('/api/automations')).automations,
  read: (id: string) => call<AutomationDetail>(`/api/automations/${id}`),
  preview: (config: ArbitrageConfig) => call<Preview>('/api/automations/preview', { method: 'POST', body: { config } }),
  create: (input: { name?: string; account?: string; config: ArbitrageConfig }) =>
    call<Automation>('/api/automations', { method: 'POST', body: { kind: 'arbitrage', ...input } }),
  activate: (rule: Pick<Automation, 'id' | 'revision' | 'configHash'>) =>
    call<AutomationDetail>(`/api/automations/${rule.id}/activate`, {
      method: 'POST',
      body: { revision: rule.revision, configHash: rule.configHash },
    }),
  pause: (id: string) => call<AutomationDetail>(`/api/automations/${id}/pause`, { method: 'POST' }),
  remove: (id: string) => call<{ ok: true }>(`/api/automations/${id}`, { method: 'DELETE' }),
  acknowledge: (alertId: string) =>
    call<{ ok: true }>(`/api/automations/alerts/${alertId}/acknowledge`, { method: 'POST' }),
};

/** Basis points as a signed percentage, e.g. 512.48 → "+5.12%". */
export function percent(bps: number | null, signed = true): string {
  if (bps === null) return '—';
  return `${signed && bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
}
