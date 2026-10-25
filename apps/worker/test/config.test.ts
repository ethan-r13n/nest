import { describe, expect, it } from 'vitest';

import { ConfigError, decodeConfig } from '../src/config.ts';

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
