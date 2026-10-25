import { DurableObject } from 'cloudflare:workers';
import type { Agent, AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import { createNestAgent, DEFAULT_TURN_LIMITS, runTurn, type TurnOutcome } from '@nest/agent-runtime/agent';
import { isTerminal, type PublicAgentEvent, toPublicEvent } from '@nest/agent-runtime/events';
import { assertExactTools } from '@nest/agent-runtime/tools';

import { type AdmissionLimits, ConfigError, decodeAgentConfig } from '../config.ts';
import { TEAM_CONNECTION } from '../raven/connection.ts';
import { ADMISSION_SCOPE } from './admission.ts';
import { createModelSource } from './models.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { createProposalService } from './proposals.ts';
import { APPROVED_TOOLS, createTools } from './tools.ts';

export type AdmitResult =
  | { status: 'started' | 'duplicate'; runId: string; afterEventId: number }
  | { status: 'busy' }
  | { status: 'rate_limited' | 'at_capacity'; retryAfterMs: number };

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

interface StoredEvent {
  id: number;
  event: PublicAgentEvent;
}

interface Run {
  id: string;
  messageId: string;
  /** Events of this run have ids after this one. */
  afterEventId: number;
  /** Where this run's messages begin in the transcript. */
  messageStart: number;
  terminal: PublicAgentEvent | undefined;
  agent: Agent | undefined;
  stopRequested: boolean;
}

/** Older runs only answer reconnects with their final event; this many are remembered. */
const REMEMBERED_RUNS = 20;
const encoder = new TextEncoder();

/**
 * One guest conversation, held in memory only: before wallet verification Nest stores no chat content.
 * It runs at most one turn at a time and loses its history when evicted, as the chat UI tells the user.
 */
export class ConversationAgent extends DurableObject<Env> {
  readonly #messages: AgentMessage[] = [];
  readonly #runs = new Map<string, Run>();
  readonly #runByMessage = new Map<string, string>();
  readonly #listeners = new Set<(row: StoredEvent) => void>();
  /** Events of the latest run only; earlier runs keep just their terminal event. */
  #events: StoredEvent[] = [];
  #lastEventId = 0;
  #active: Run | undefined;
  #admitting = false;

  async admit(input: {
    messageId: string;
    text: string;
    subject: string;
    limits: AdmissionLimits;
  }): Promise<AdmitResult> {
    const existing = this.#runs.get(this.#runByMessage.get(input.messageId) ?? '');
    if (existing) return { status: 'duplicate', runId: existing.id, afterEventId: existing.afterEventId };
    if (this.#active || this.#admitting) return { status: 'busy' };

    const runId = crypto.randomUUID();
    // Held before the admission round trip, so a concurrent message sees this conversation busy.
    this.#admitting = true;
    try {
      const result = await this.#admission().acquire({ runId, subject: input.subject, limits: input.limits });
      if (result.status !== 'admitted') return result;
    } finally {
      this.#admitting = false;
    }

    const run: Run = {
      id: runId,
      messageId: input.messageId,
      afterEventId: this.#lastEventId,
      messageStart: this.#messages.length,
      terminal: undefined,
      agent: undefined,
      stopRequested: false,
    };
    this.#remember(run);
    this.#events = [];
    this.#active = run;
    // #execute never rejects. Pending I/O and timers keep this object alive until the turn ends.
    this.ctx.waitUntil(this.#execute(run, input.text));
    return { status: 'started', runId, afterEventId: run.afterEventId };
  }

  /** Stops generation only; it never cancels or repeats a financial action. */
  stop(runId: string): { status: 'stopping' | 'not_running' } {
    const run = this.#active;
    if (!run || run.id !== runId) return { status: 'not_running' };
    run.stopRequested = true;
    run.agent?.abort();
    return { status: 'stopping' };
  }

  /** Server-sent events of one run after `after`, then live ones, ending at its terminal event. */
  events(runId: string, after: number): ReadableStream<Uint8Array> {
    const run = this.#runs.get(runId);
    let stop = () => {};
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false;
        const send = (row: StoredEvent) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`id: ${row.id}\ndata: ${JSON.stringify(row.event)}\n\n`));
          if (isTerminal(row.event)) {
            closed = true;
            stop();
            controller.close();
          }
        };
        // Unknown here means the process that ran it went away with its memory.
        if (!run) return send({ id: after + 1, event: { type: 'interrupted', reason: 'lost' } });
        if (run !== this.#active && run.terminal)
          return send({ id: Math.max(after + 1, run.afterEventId + 1), event: run.terminal });
        for (const row of this.#events) if (row.id > after) send(row);
        if (closed) return;
        this.#listeners.add(send);
        stop = () => this.#listeners.delete(send);
      },
      cancel: () => stop(),
    });
  }

  transcript(): { messages: TranscriptEntry[]; activeRunId: string | null } {
    const messages = this.#messages.flatMap((message): TranscriptEntry[] => {
      if (message.role === 'user') {
        const text =
          typeof message.content === 'string'
            ? message.content
            : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
        return [{ role: 'user', text }];
      }
      if (message.role === 'assistant') {
        const text = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
        return text ? [{ role: 'assistant', text }] : [];
      }
      return [];
    });
    return { messages, activeRunId: this.#active?.id ?? null };
  }

  async #execute(run: Run, text: string): Promise<void> {
    let outcome: TurnOutcome;
    try {
      const source = createModelSource(decodeAgentConfig(this.env));
      const tools = createTools({
        raven: this.env.RAVEN.getByName(TEAM_CONNECTION),
        proposals: createProposalService(this.env),
      });
      assertExactTools(tools, APPROVED_TOOLS);
      const agent = createNestAgent({
        model: source.model,
        streamFn: source.streamFn,
        ...(source.getApiKey ? { getApiKey: source.getApiKey } : {}),
        systemPrompt: SYSTEM_PROMPT,
        tools,
        messages: [...this.#messages],
        limits: DEFAULT_TURN_LIMITS,
        sessionId: this.ctx.id.toString(),
      });
      agent.subscribe((event) => {
        if (event.type === 'message_end') this.#messages.push(event.message);
        const publicEvent = toPublicEvent(event);
        if (publicEvent) this.#emit(publicEvent);
        const proposal = proposalOf(event);
        if (proposal) this.#emit(proposal);
      });
      run.agent = agent;
      outcome = run.stopRequested
        ? { status: 'failed', reason: 'aborted', detail: undefined }
        : await runTurn(agent, text, DEFAULT_TURN_LIMITS.deadlineMs);
    } catch (error) {
      outcome = {
        status: 'failed',
        reason: 'error',
        detail: error instanceof ConfigError ? `config: ${error.variables.join(', ')}` : String(error),
      };
    }

    const terminal = terminalEvent(outcome, run.stopRequested);
    if (terminal.type === 'error') {
      console.error(
        JSON.stringify({
          runId: run.id,
          code: terminal.code,
          detail: outcome.status === 'failed' ? outcome.detail?.slice(0, 500) : undefined,
        }),
      );
    }
    // Only completed exchanges stay in the model's history: a stopped or failed question is not picked up again.
    if (terminal.type !== 'settled') this.#messages.splice(run.messageStart);
    run.terminal = terminal;
    run.agent = undefined;
    this.#active = undefined;
    this.#emit(terminal);
    await this.#admission()
      .release(run.id)
      .catch(() => {});
  }

  #emit(event: PublicAgentEvent): void {
    this.#lastEventId += 1;
    const row = { id: this.#lastEventId, event };
    this.#events.push(row);
    for (const listener of this.#listeners) listener(row);
  }

  #remember(run: Run): void {
    this.#runs.set(run.id, run);
    this.#runByMessage.set(run.messageId, run.id);
    for (const [id, old] of this.#runs) {
      if (this.#runs.size <= REMEMBERED_RUNS) break;
      this.#runs.delete(id);
      this.#runByMessage.delete(old.messageId);
    }
  }

  #admission() {
    return this.env.ADMISSION.getByName(ADMISSION_SCOPE);
  }
}

function terminalEvent(outcome: TurnOutcome, stopRequested: boolean): PublicAgentEvent {
  if (outcome.status === 'settled') return { type: 'settled' };
  // A stop can land before the model answers, which Pi records as an error; either way the user asked for it.
  if (stopRequested) return { type: 'interrupted', reason: 'stopped' };
  if (outcome.reason === 'aborted') {
    return { type: 'error', code: 'deadline', message: 'The answer took too long and was stopped.' };
  }
  // Pi reports provider failures as "<status> <body>"; 429 and 5xx are worth retrying later.
  if (/^(429|5\d\d)\b/.test(outcome.detail ?? '')) {
    return {
      type: 'error',
      code: 'provider_unavailable',
      message: 'The free model is busy or rate-limited right now. Try again in a minute.',
    };
  }
  return { type: 'error', code: 'failed', message: 'The assistant could not answer. Try again in a moment.' };
}

/** The intent ID comes from the application's tool result, so the card shows Nest's record, not model text. */
export function proposalOf(event: AgentEvent): PublicAgentEvent | null {
  if (event.type !== 'tool_execution_end' || event.toolName !== 'propose_intent' || event.isError) return null;
  const intentId: unknown = event.result?.details?.intentId;
  const kind: unknown = event.result?.details?.kind ?? 'swap';
  if (typeof intentId !== 'string' || (kind !== 'swap' && kind !== 'supply' && kind !== 'borrow')) return null;
  return { type: 'proposal', kind, intentId };
}
