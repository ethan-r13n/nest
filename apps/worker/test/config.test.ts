import { describe, expect, it } from 'vitest';

import { ConfigError, decodeAgentConfig, decodeConfig } from '../src/config.ts';

describe('decodeConfig', () => {
  it('decodes the network and an explicit execution flag', () => {
    expect(decodeConfig({ STELLAR_NETWORK: 'testnet', EXECUTION_ENABLED: 'false' })).toEqual({
      network: 'testnet',
      executionEnabled: false,
    });
  });

  it('names every invalid variable and never echoes a value', () => {
    let caught: unknown;
    try {
      decodeConfig({ STELLAR_NETWORK: 'stellar-mainnet', EXECUTION_ENABLED: '1' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).variables).toEqual(['STELLAR_NETWORK', 'EXECUTION_ENABLED']);
    expect((caught as ConfigError).message).not.toContain('stellar-mainnet');
  });

  it('refuses a missing execution flag instead of defaulting it', () => {
    expect(() => decodeConfig({ STELLAR_NETWORK: 'mainnet' })).toThrow(ConfigError);
  });
});

describe('decodeAgentConfig', () => {
  it('requires a model and key for OpenRouter and never echoes the key', () => {
    expect(
      decodeAgentConfig({
        PI_PROVIDER: 'openrouter',
        PI_MODEL_ID: 'anthropic/claude-sonnet-5.5',
        OPENROUTER_API_KEY: 'k',
      }),
    ).toEqual({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5.5', apiKey: 'k' });
    expect(() => decodeAgentConfig({ PI_PROVIDER: 'openrouter', PI_MODEL_ID: 'm' })).toThrow(/OPENROUTER_API_KEY/);
  });

  it('refuses an unknown provider and an invalid faux script', () => {
    expect(() => decodeAgentConfig({ PI_PROVIDER: 'openai' })).toThrow(ConfigError);
    expect(() => decodeAgentConfig({ PI_PROVIDER: 'faux', PI_FAUX_SCRIPT: '[{"nope":1}]' })).toThrow(/PI_FAUX_SCRIPT/);
    expect(() => decodeAgentConfig({ PI_PROVIDER: 'faux', PI_FAUX_SCRIPT: 'not json' })).toThrow(/PI_FAUX_SCRIPT/);
  });

  it('takes a faux script as JSON text or as an already parsed array', () => {
    const script = [{ text: 'hello' }];
    expect(decodeAgentConfig({ PI_PROVIDER: 'faux', PI_FAUX_SCRIPT: JSON.stringify(script) })).toEqual({
      provider: 'faux',
      script,
    });
    expect(decodeAgentConfig({ PI_PROVIDER: 'faux', PI_FAUX_SCRIPT: script })).toEqual({ provider: 'faux', script });
  });
});
