import { describe, expect, it } from 'vitest';
import { createModelSource } from '../src/agent/models.ts';
import { ConfigError } from '../src/config.ts';

const KEY = 'test-placeholder';

describe('createModelSource', () => {
  it('accepts free OpenRouter models', () => {
    for (const modelId of ['thinkingmachines/inkling:free', 'openrouter/free']) {
      expect(createModelSource({ provider: 'openrouter', modelId, apiKey: KEY }).model.id).toBe(modelId);
    }
  });

  it('refuses paid and unknown models instead of falling back', () => {
    for (const modelId of ['anthropic/claude-sonnet-5.5', 'thinkingmachines/inkling', 'nope/not-a-model:free']) {
      expect(() => createModelSource({ provider: 'openrouter', modelId, apiKey: KEY })).toThrow(ConfigError);
    }
  });
});
