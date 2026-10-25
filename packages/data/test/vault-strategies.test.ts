import { describe, expect, it } from 'vitest';

import source from '../../../research/data/vault-strategies.json' with { type: 'json' };
import { findVaultStrategy, parseVaultStrategies } from '../src/vault-strategies.ts';

describe('sourced vault strategies', () => {
  it('keeps every description short and every displayed fact attached to a source', () => {
    const context = parseVaultStrategies(source);
    expect(Object.keys(context.profiles)).toHaveLength(9);
    for (const profile of Object.values(context.profiles)) {
      expect(profile.description.split(/\s+/).length).toBeLessThan(55);
      for (const fact of [
        ...profile.facts,
        ...profile.risks,
        ...profile.fees,
        ...profile.contracts,
        ...profile.counterparties,
      ]) {
        expect(context.sources[fact.sourceId]?.url).toMatch(/^https:\/\//);
      }
    }
  });
  it('uses the correct receipt and underlying for the two Gami products', () => {
    const context = parseVaultStrategies(source);
    expect(findVaultStrategy(context, 'gami-labs', 'EARNUSDC')?.description).toContain('earnUSDC');
    expect(findVaultStrategy(context, 'gami-labs', 'EARNXLM')?.description).toContain('earnXLM');
    expect(findVaultStrategy(context, 'blend-pools-v2', 'EURC')?.description).toContain('Supply EURC');
    expect(findVaultStrategy(context, 'unknown', 'USDC')).toBeUndefined();
  });
  it('leaves unverified rates and contracts out of protocol profiles', () => {
    const context = parseVaultStrategies(source);
    expect(context.profiles.defindex?.fees).toEqual([]);
    expect(context.profiles.defindex?.contracts).toEqual([]);
    expect(context.profiles.templar?.fees).toEqual([]);
  });
  it('rejects a description whose facts cite a missing source', () => {
    const broken = {
      ...source,
      sources: Object.fromEntries(Object.entries(source.sources).filter(([id]) => id !== 'sentora')),
    };
    expect(() => parseVaultStrategies(broken)).toThrow();
  });
});
