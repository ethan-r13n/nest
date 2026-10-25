import { Agent, type AgentEvent, type AgentTool } from '@earendil-works/pi-agent-core';
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';

function scriptedAgent(tools: AgentTool[]) {
  const faux = fauxProvider({ tokensPerSecond: 100_000 });
  const models = createModels();
  models.setProvider(faux.provider);
  const agent = new Agent({
    initialState: { systemPrompt: 'You are Nest.', model: faux.getModel(), tools },
    streamFn: models.streamSimple.bind(models),
  });
  return { agent, faux };
}

function compareTool(calls: unknown[]): AgentTool {
  return {
    name: 'compare_opportunities',
    label: 'Compare opportunities',
    description: 'Compare eligible lending venues for one asset and amount.',
    parameters: Type.Object({ asset: Type.String(), amount: Type.String() }),
    execute: async (_toolCallId, params) => {
      calls.push(params);
      return { content: [{ type: 'text', text: 'Blend supply 6.1% APY (observed 12:00Z).' }], details: {} };
    },
  };
}

describe('pi-agent-core in workerd', () => {
  it('runs a tool-calling turn with a scripted model', async () => {
    const calls: unknown[] = [];
    const { agent, faux } = scriptedAgent([compareTool(calls)]);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('compare_opportunities', { asset: 'USDC', amount: '100' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage([fauxText('Blend pays the most for 100 USDC right now.')]),
    ]);
    const events: AgentEvent['type'][] = [];
    agent.subscribe((event) => {
      events.push(event.type);
    });

    await agent.prompt('Where should I lend 100 USDC?');

    expect(calls).toEqual([{ asset: 'USDC', amount: '100' }]);
    expect(events).toEqual(expect.arrayContaining(['agent_start', 'tool_execution_end', 'agent_end']));
    const last = agent.state.messages.at(-1);
    expect(last?.role).toBe('assistant');
    expect(JSON.stringify(last)).toContain('Blend pays the most');
  });

  it('lets the host refuse a tool call before it runs', async () => {
    const calls: unknown[] = [];
    const { agent, faux } = scriptedAgent([compareTool(calls)]);
    agent.beforeToolCall = async () => ({ block: true, reason: 'Comparison budget for this run is used up.' });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('compare_opportunities', { asset: 'USDC', amount: '100' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage([fauxText('I could not compare venues this time.')]),
    ]);

    await agent.prompt('Compare USDC lending.');

    expect(calls).toEqual([]);
    expect(JSON.stringify(agent.state.messages)).toContain('Comparison budget for this run is used up.');
  });
});
