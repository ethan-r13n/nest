import { Agent, type AgentMessage, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';

export interface TurnLimits {
  /** Tool calls one turn may make before further calls are refused. */
  maxToolCalls: number;
  /** Wall-clock limit for one turn; the host enforces it, not the model. */
  deadlineMs: number;
  /** Output cap sent with every model request. Without it providers reserve the model's maximum. */
  maxOutputTokens: number;
}

export interface NestAgentOptions {
  model: Model<Api>;
  streamFn: StreamFn;
  getApiKey?: (provider: string) => string | undefined;
  systemPrompt: string;
  tools: AgentTool[];
  messages: AgentMessage[];
  limits: TurnLimits;
  sessionId: string;
}

export type TurnOutcome =
  | { status: 'settled' }
  | { status: 'failed'; reason: 'aborted' | 'error'; detail: string | undefined };

/** Calls past the budget are refused with a reason; this many more refusals end the turn. */
const REFUSALS_BEFORE_STOP = 2;

export const DEFAULT_TURN_LIMITS: TurnLimits = { maxToolCalls: 12, deadlineMs: 90_000, maxOutputTokens: 2_048 };

export function createNestAgent(options: NestAgentOptions): Agent {
  const allowed = new Set(options.tools.map((tool) => tool.name));
  let toolCalls = 0;
  return new Agent({
    initialState: {
      systemPrompt: options.systemPrompt,
      model: options.model,
      tools: options.tools,
      messages: options.messages,
    },
    streamFn: (model, context, streamOptions) =>
      options.streamFn(model, context, { ...streamOptions, maxTokens: options.limits.maxOutputTokens }),
    ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
    sessionId: options.sessionId,
    beforeToolCall: async ({ toolCall }) => {
      if (!allowed.has(toolCall.name)) {
        return { block: true, reason: `The tool ${toolCall.name} is not available.`, terminate: true };
      }
      toolCalls += 1;
      if (toolCalls <= options.limits.maxToolCalls) return undefined;
      return {
        block: true,
        reason: 'The tool budget for this answer is used up. Answer with what you already have.',
        terminate: toolCalls > options.limits.maxToolCalls + REFUSALS_BEFORE_STOP,
      };
    },
  });
}

/** Runs one user turn under the host's deadline and reports how it ended. */
export async function runTurn(agent: Agent, text: string, deadlineMs: number): Promise<TurnOutcome> {
  const timer = setTimeout(() => agent.abort(), deadlineMs);
  try {
    await agent.prompt(text);
  } finally {
    clearTimeout(timer);
  }
  const last = agent.state.messages.at(-1);
  if (last?.role === 'assistant' && (last.stopReason === 'error' || last.stopReason === 'aborted')) {
    return { status: 'failed', reason: last.stopReason, detail: last.errorMessage };
  }
  return { status: 'settled' };
}
