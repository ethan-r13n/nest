import { VENUE_LABELS } from '@nest/adapters/amm/pools';
import { AppError } from '@nest/domain/errors';
import type { StellarNetwork } from '@nest/domain/network';
import { StrKey } from '@stellar/stellar-sdk';

import type { AUTOMATION_STATUSES, EVALUATION_RESULTS } from '../db/schema.ts';
import { type ArbitrageConfig, ArbitrageConfigSchema, EVALUATION_INTERVAL_MS } from './config.ts';
import type { PoolSource } from './evaluate.ts';

export interface AutomationDeps {
  db: D1Database;
  network: StellarNetwork;
  pools: PoolSource;
  now(): number;
}

export interface RuleRow {
  id: string;
  network: StellarNetwork;
  kind: 'arbitrage';
  name: string;
  owner_account: string | null;
  status: (typeof AUTOMATION_STATUSES)[number];
  revision: number;
  config: string;
  config_hash: string;
  mode: 'once' | 'repeat';
  interval_ms: number;
  cooldown_ms: number;
  armed: number;
  next_due_at_ms: number | null;
  last_evaluated_at_ms: number | null;
  last_result: (typeof EVALUATION_RESULTS)[number] | null;
  last_triggered_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
}

interface EvaluationRow {
  id: string;
  revision: number;
  scheduled_for_ms: number;
  evaluated_at_ms: number;
  result: (typeof EVALUATION_RESULTS)[number];
  reason: string;
  evidence: string;
  triggered: number;
}

interface TriggerRow {
  id: string;
  rule_id: string;
  revision: number;
  evaluation_id: string;
  summary: string;
  created_at_ms: number;
  acknowledged_at_ms: number | null;
}

const HISTORY_LIMIT = 30;

export function parseConfig(value: unknown): ArbitrageConfig {
  const parsed = ArbitrageConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'The monitor settings are invalid.');
  }
  return parsed.data;
}

/** Saves a draft. Nothing is evaluated on a schedule until the user activates this exact revision. */
export async function createRule(
  deps: AutomationDeps,
  input: { name?: string | undefined; account?: string | undefined; config: unknown },
) {
  const config = parseConfig(input.config);
  if (input.account && !StrKey.isValidEd25519PublicKey(input.account)) {
    throw new AppError('INVALID_REQUEST', 'The account must be a Stellar account (G…).');
  }
  const now = deps.now();
  const row: RuleRow = {
    id: crypto.randomUUID(),
    network: deps.network,
    kind: 'arbitrage',
    name: input.name?.trim() || defaultName(config),
    owner_account: input.account ?? null,
    status: 'draft',
    revision: 1,
    config: JSON.stringify(config),
    config_hash: await configHash(config, 1),
    mode: config.mode,
    interval_ms: EVALUATION_INTERVAL_MS,
    cooldown_ms: config.cooldownMinutes * 60_000,
    armed: 1,
    next_due_at_ms: null,
    last_evaluated_at_ms: null,
    last_result: null,
    last_triggered_at_ms: null,
    created_at_ms: now,
    updated_at_ms: now,
  };
  await deps.db
    .prepare(
      `INSERT INTO automation_rules (id, network, kind, name, owner_account, status, revision, config, config_hash, mode,
         interval_ms, cooldown_ms, armed, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.network,
      row.kind,
      row.name,
      row.owner_account,
      row.status,
      row.revision,
      row.config,
      row.config_hash,
      row.mode,
      row.interval_ms,
      row.cooldown_ms,
      row.armed,
      row.created_at_ms,
      row.updated_at_ms,
    )
    .run();
  return ruleView(row);
}

/** Replaces the settings with a new revision, which returns the rule to draft until re-activated. */
export async function reviseRule(
  deps: AutomationDeps,
  id: string,
  input: { expectedRevision: number; name?: string | undefined; config: unknown },
) {
  const config = parseConfig(input.config);
  const current = await loadRule(deps, id);
  if (current.status === 'deleted') throw new AppError('NOT_FOUND', 'No such automation.');
  const revision = current.revision + 1;
  const result = await deps.db
    .prepare(
      `UPDATE automation_rules SET revision = ?, name = ?, config = ?, config_hash = ?, mode = ?, cooldown_ms = ?,
         status = 'draft', armed = 1, next_due_at_ms = NULL, updated_at_ms = ?
       WHERE id = ? AND revision = ? AND status != 'deleted'`,
    )
    .bind(
      revision,
      input.name?.trim() || current.name,
      JSON.stringify(config),
      await configHash(config, revision),
      config.mode,
      config.cooldownMinutes * 60_000,
      deps.now(),
      id,
      input.expectedRevision,
    )
    .run();
  if (result.meta.changes !== 1) throw new AppError('CONFLICT', 'The automation changed since you loaded it.');
  return readRule(deps, id);
}

/** Starts scheduled checks for exactly the revision the user reviewed. */
export async function activateRule(deps: AutomationDeps, id: string, input: { revision: number; configHash: string }) {
  const now = deps.now();
  const result = await deps.db
    .prepare(
      `UPDATE automation_rules SET status = 'active', armed = 1, next_due_at_ms = ?, updated_at_ms = ?
       WHERE id = ? AND network = ? AND revision = ? AND config_hash = ? AND status IN ('draft', 'paused', 'completed')`,
    )
    .bind(now, now, id, deps.network, input.revision, input.configHash)
    .run();
  if (result.meta.changes !== 1) {
    await loadRule(deps, id);
    throw new AppError('CONFLICT', 'The automation changed since you reviewed it, or is already active.');
  }
  return readRule(deps, id);
}

/** Stops scheduling. Checks already running finish, but a paused rule's result never fires. */
export async function pauseRule(deps: AutomationDeps, id: string) {
  await setStatus(deps, id, 'paused', ['active']);
  return readRule(deps, id);
}

export async function deleteRule(deps: AutomationDeps, id: string) {
  await setStatus(deps, id, 'deleted', ['draft', 'active', 'paused', 'completed']);
}

export async function listRules(deps: AutomationDeps) {
  const { results } = await deps.db
    .prepare(
      `SELECT * FROM automation_rules WHERE network = ? AND status != 'deleted' ORDER BY created_at_ms DESC LIMIT 50`,
    )
    .bind(deps.network)
    .all<RuleRow>();
  const unacknowledged = await deps.db
    .prepare(
      `SELECT rule_id, COUNT(*) AS count FROM automation_triggers
       WHERE acknowledged_at_ms IS NULL AND rule_id IN (SELECT id FROM automation_rules WHERE network = ?)
       GROUP BY rule_id`,
    )
    .bind(deps.network)
    .all<{ rule_id: string; count: number }>();
  const counts = new Map(unacknowledged.results.map((row) => [row.rule_id, row.count]));
  return results.map((row) => ({ ...ruleView(row), unacknowledgedAlerts: counts.get(row.id) ?? 0 }));
}

/** The rule with its recent evaluations and alerts, newest first. */
export async function readRule(deps: AutomationDeps, id: string) {
  const row = await loadRule(deps, id);
  const [evaluations, triggers] = await Promise.all([
    deps.db
      .prepare('SELECT * FROM automation_evaluations WHERE rule_id = ? ORDER BY evaluated_at_ms DESC LIMIT ?')
      .bind(id, HISTORY_LIMIT)
      .all<EvaluationRow>(),
    deps.db
      .prepare('SELECT * FROM automation_triggers WHERE rule_id = ? ORDER BY created_at_ms DESC LIMIT ?')
      .bind(id, HISTORY_LIMIT)
      .all<TriggerRow>(),
  ]);
  return {
    ...ruleView(row),
    evaluations: evaluations.results.map((evaluation) => ({
      id: evaluation.id,
      revision: evaluation.revision,
      scheduledFor: iso(evaluation.scheduled_for_ms),
      evaluatedAt: iso(evaluation.evaluated_at_ms),
      // How late the check ran against its schedule, so scheduler delay stays visible.
      delayMs: evaluation.evaluated_at_ms - evaluation.scheduled_for_ms,
      result: evaluation.result,
      reason: evaluation.reason,
      evidence: JSON.parse(evaluation.evidence) as unknown,
      triggered: evaluation.triggered === 1,
    })),
    alerts: triggers.results.map(triggerView),
  };
}

export async function acknowledgeTrigger(deps: AutomationDeps, triggerId: string) {
  const result = await deps.db
    .prepare(
      `UPDATE automation_triggers SET acknowledged_at_ms = COALESCE(acknowledged_at_ms, ?)
       WHERE id = ? AND rule_id IN (SELECT id FROM automation_rules WHERE network = ?)`,
    )
    .bind(deps.now(), triggerId, deps.network)
    .run();
  if (result.meta.changes !== 1) throw new AppError('NOT_FOUND', 'No such alert.');
}

export async function loadRule(deps: AutomationDeps, id: string): Promise<RuleRow> {
  const row = await deps.db
    .prepare(`SELECT * FROM automation_rules WHERE id = ? AND network = ? AND status != 'deleted'`)
    .bind(id, deps.network)
    .first<RuleRow>();
  if (!row) throw new AppError('NOT_FOUND', 'No such automation.');
  return row;
}

async function setStatus(
  deps: AutomationDeps,
  id: string,
  status: RuleRow['status'],
  from: readonly RuleRow['status'][],
) {
  const result = await deps.db
    .prepare(
      `UPDATE automation_rules SET status = ?, next_due_at_ms = NULL, updated_at_ms = ?
       WHERE id = ? AND network = ? AND status IN (${from.map(() => '?').join(', ')})`,
    )
    .bind(status, deps.now(), id, deps.network, ...from)
    .run();
  if (result.meta.changes !== 1) {
    await loadRule(deps, id);
    throw new AppError('CONFLICT', `This automation cannot be ${status === 'deleted' ? 'deleted' : status} now.`);
  }
}

/** Binds activation to the exact settings and revision the user reviewed. */
async function configHash(config: ArbitrageConfig, revision: number): Promise<string> {
  const text = JSON.stringify({ revision, ...config });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function defaultName(config: ArbitrageConfig): string {
  const [a, b] = config.venues;
  return `XLM/USDC · ${VENUE_LABELS[a]} vs ${VENUE_LABELS[b]}`;
}

function ruleView(row: RuleRow) {
  return {
    id: row.id,
    network: row.network,
    kind: row.kind,
    name: row.name,
    account: row.owner_account,
    status: row.status,
    revision: row.revision,
    configHash: row.config_hash,
    config: JSON.parse(row.config) as ArbitrageConfig,
    intervalSeconds: row.interval_ms / 1000,
    armed: row.armed === 1,
    nextCheckAt: row.next_due_at_ms === null ? null : iso(row.next_due_at_ms),
    lastEvaluatedAt: row.last_evaluated_at_ms === null ? null : iso(row.last_evaluated_at_ms),
    lastResult: row.last_result,
    lastAlertAt: row.last_triggered_at_ms === null ? null : iso(row.last_triggered_at_ms),
    createdAt: iso(row.created_at_ms),
  };
}

function triggerView(row: TriggerRow) {
  return {
    id: row.id,
    ruleId: row.rule_id,
    revision: row.revision,
    evaluationId: row.evaluation_id,
    summary: row.summary,
    createdAt: iso(row.created_at_ms),
    acknowledgedAt: row.acknowledged_at_ms === null ? null : iso(row.acknowledged_at_ms),
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
