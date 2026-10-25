import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Static, TSchema } from 'typebox';

export interface ToolOutput {
  text: string;
  details?: Record<string, unknown>;
  /** The model reads `text` as a failed call; the browser shows the tool as failed. */
  isError?: boolean;
}

export interface ToolDefinition<P extends TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: P;
  /** `safe` only for reads, or effects keyed by the tool call id. A call a crash interrupted is otherwise never rerun. */
  replay: 'safe' | 'never';
  /** Tools that change state run one at a time, never alongside another call. */
  sequential?: boolean;
  run(args: Static<P>, signal: AbortSignal | undefined): Promise<ToolOutput>;
}

/** Pairs a TypeBox schema with its implementation. Pi validates the arguments before `run` sees them. */
export function defineTool<P extends TSchema>(definition: ToolDefinition<P>): AgentTool<P> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    replay: definition.replay,
    ...(definition.sequential ? { executionMode: 'sequential' as const } : {}),
    async execute(_toolCallId, params, signal) {
      const output = await definition.run(params, signal);
      return {
        content: [{ type: 'text', text: output.text }],
        details: output.details ?? {},
        ...(output.isError ? { isError: true } : {}),
      };
    },
  };
}

/**
 * Outside text (sources, posts, provider descriptions) as data the model reads but never obeys.
 * The label is one attribute, and the body cannot close the envelope early.
 */
export function untrusted(label: string, body: string): string {
  const safeLabel = label.replace(/["<>\n]/g, '');
  const safeBody = body.replace(/<\/untrusted/gi, '&lt;/untrusted');
  return `<untrusted source="${safeLabel}">\n${safeBody}\n</untrusted>`;
}

/** Fails startup when the tools handed to Pi differ from the approved registry, in either direction. */
export function assertExactTools(tools: readonly AgentTool[], approved: readonly string[]): void {
  const names = tools.map((tool) => tool.name).sort();
  const expected = [...approved].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error(`Agent tools ${names.join(', ')} do not match the approved set ${expected.join(', ')}.`);
  }
}
