import type { PublicAgentEvent } from '@nest/agent-runtime/events';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PreparationStep {
  id: string;
  label: string;
  state: 'running' | 'complete' | 'failed';
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  preparation?: PreparationStep[];
  error?: string;
  /** The user stopped this answer; what arrived before the stop stays. */
  stopped?: boolean;
  /** Swap intents Nest created for this answer; each renders as a proposal card. */
  proposals?: string[];
}

export interface AgentChat {
  messages: ConversationMessage[];
  running: boolean;
  send(text: string): Promise<void>;
  /** Stops the answer being generated. It never cancels anything already done. */
  stop(): void;
  /** Forgets the current conversation; the next message starts a new one. */
  reset(): void;
}

interface Admitted {
  status: 'started' | 'duplicate';
  runId: string;
  afterEventId: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_markets: 'Read the dated research snapshot',
  raven_search: 'Searched Raven',
  raven_execute: 'Ran a Raven research script',
  propose_intent: 'Prepared a swap proposal for your review',
};

export class ChatRequestError extends Error {
  override name = 'ChatRequestError';
}

/** One conversation with the Nest agent: send a message, then follow its events until the turn ends. */
export function useAgentChat(): AgentChat {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [running, setRunning] = useState(false);
  const conversationId = useRef<string | null>(null);
  const runId = useRef<string | null>(null);
  const source = useRef<EventSource | null>(null);

  useEffect(() => () => source.current?.close(), []);

  const send = useCallback(async (text: string) => {
    const messageId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    setRunning(true);
    try {
      conversationId.current ??= await createConversation();
      const admitted = await postMessage(conversationId.current, messageId, text);
      setMessages((current) => [
        ...current,
        { id: messageId, role: 'user', text },
        { id: replyId, role: 'assistant', text: '' },
      ]);
      runId.current = admitted.runId;
      source.current = follow(conversationId.current, admitted.runId, admitted.afterEventId, (event) => {
        setMessages((current) => current.map((message) => (message.id === replyId ? apply(message, event) : message)));
        if (isTerminal(event)) {
          runId.current = null;
          setRunning(false);
        }
      });
    } catch (error) {
      setRunning(false);
      throw error;
    }
  }, []);

  const stop = useCallback(() => {
    const conversation = conversationId.current;
    const run = runId.current;
    // The stream reports the stop; a failed request leaves the answer running, which the stream also shows.
    if (conversation && run) {
      fetch(`/api/agent/conversations/${conversation}/runs/${run}/abort`, { method: 'POST' }).catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    source.current?.close();
    source.current = null;
    conversationId.current = null;
    runId.current = null;
    setMessages([]);
    setRunning(false);
  }, []);

  return { messages, running, send, stop, reset };
}

async function createConversation(): Promise<string> {
  const response = await fetch('/api/agent/conversations', { method: 'POST' });
  if (!response.ok) throw new ChatRequestError('Could not start a conversation.');
  const body: { conversationId: string } = await response.json();
  return body.conversationId;
}

async function postMessage(conversationId: string, messageId: string, text: string): Promise<Admitted> {
  const response = await fetch(`/api/agent/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messageId, text }),
  });
  if (response.ok) return response.json();
  const body: { error?: { message?: string; retryAfterSeconds?: number } } = await response.json().catch(() => ({}));
  const message = body.error?.message ?? 'The message was not sent.';
  const wait = body.error?.retryAfterSeconds;
  throw new ChatRequestError(wait ? `${message} Try again in ${formatWait(wait)}.` : message);
}

function formatWait(seconds: number): string {
  return seconds < 90 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`;
}

function follow(
  conversationId: string,
  runId: string,
  after: number,
  onEvent: (event: PublicAgentEvent) => void,
): EventSource {
  const events = new EventSource(`/api/agent/conversations/${conversationId}/runs/${runId}/events?after=${after}`);
  events.onmessage = (message: MessageEvent<string>) => {
    const event: PublicAgentEvent = JSON.parse(message.data);
    onEvent(event);
    // The server closes the stream after a terminal event; closing here stops EventSource reconnecting.
    if (isTerminal(event)) events.close();
  };
  // EventSource retries dropped connections itself; CLOSED means it has given up.
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) {
      onEvent({ type: 'error', code: 'failed', message: 'Lost the connection to Nest.' });
    }
  };
  return events;
}

function isTerminal(event: PublicAgentEvent): boolean {
  return event.type === 'settled' || event.type === 'interrupted' || event.type === 'error';
}

function apply(message: ConversationMessage, event: PublicAgentEvent): ConversationMessage {
  switch (event.type) {
    case 'text_delta':
      return { ...message, text: message.text + event.delta };
    case 'tool_started':
      return {
        ...message,
        preparation: [
          ...(message.preparation ?? []),
          { id: event.toolCallId, label: TOOL_LABELS[event.name] ?? event.name, state: 'running' },
        ],
      };
    case 'tool_completed':
      if (!message.preparation) return message;
      return {
        ...message,
        preparation: message.preparation.map((step) =>
          step.id === event.toolCallId ? { ...step, state: event.isError ? 'failed' : 'complete' } : step,
        ),
      };
    case 'error':
      return { ...message, error: event.message };
    case 'interrupted':
      return event.reason === 'stopped'
        ? { ...message, stopped: true }
        : { ...message, error: 'The answer was interrupted. Send the message again.' };
    case 'proposal':
      return { ...message, proposals: [...(message.proposals ?? []), event.intentId] };
    case 'settled':
      return message;
  }
}
