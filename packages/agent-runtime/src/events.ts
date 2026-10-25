import type { AgentEvent } from '@earendil-works/pi-agent-core';

/** Actions an agent proposal can carry; the browser picks the card by kind. */
export const PROPOSAL_KINDS = ['swap', 'supply', 'borrow', 'repay', 'withdraw', 'withdraw_collateral'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** The only agent events that reach the browser. Hidden reasoning, prompts and raw arguments never do. */
export type PublicAgentEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_started'; toolCallId: string; name: string }
  | { type: 'tool_completed'; toolCallId: string; name: string; isError: boolean }
  /** An application-created proposal the browser renders from its own records, never from model text. */
  | { type: 'proposal'; kind: ProposalKind; intentId: string }
  | { type: 'settled' }
  /** `stopped`: the user stopped it. `lost`: the process running it went away. */
  | { type: 'interrupted'; reason: 'stopped' | 'lost' }
  /** `provider_unavailable`: the model provider refused or failed; retrying later can work. */
  | { type: 'error'; code: 'provider_unavailable' | 'deadline' | 'failed'; message: string };

export function toPublicEvent(event: AgentEvent): PublicAgentEvent | null {
  switch (event.type) {
    case 'message_update':
      return event.assistantMessageEvent.type === 'text_delta'
        ? { type: 'text_delta', delta: event.assistantMessageEvent.delta }
        : null;
    case 'tool_execution_start':
      return { type: 'tool_started', toolCallId: event.toolCallId, name: event.toolName };
    case 'tool_execution_end':
      return { type: 'tool_completed', toolCallId: event.toolCallId, name: event.toolName, isError: event.isError };
    default:
      return null;
  }
}

export function isTerminal(event: PublicAgentEvent): boolean {
  return event.type === 'settled' || event.type === 'interrupted' || event.type === 'error';
}
