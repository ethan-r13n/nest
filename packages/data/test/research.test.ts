import { describe, expect, it } from 'vitest';

import snapshot from '../../../research/data/stellar-research-ui.json' with { type: 'json' };
import { parseResearchSnapshot } from '../src/research.ts';

describe('parseResearchSnapshot', () => {
  it('loads the committed research projection with its provenance', () => {
    const research = parseResearchSnapshot(snapshot);
    expect(research.protocols).toHaveLength(44);
    expect(research.yieldPools).toHaveLength(12);
    expect(research.rwaMetrics).toHaveLength(8);
    expect(research.sources.defillama).toMatchObject({ id: 'defillama_stellar', attribution: 'DefiLlama' });
    expect(research.sources.rwa.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(research.live).toBe(false);
    expect(research.executable).toBe(false);
  });

  it('keeps a missing value null and a reported zero zero', () => {
    const research = parseResearchSnapshot(snapshot);
    const tvl = (name: string) => research.protocols.find((row) => row.name === name)?.stellarTvlUsd;
    expect(tvl('Allbridge Core')).toBeNull();
    expect(tvl('Blend Backstop')).toBe(0);
    expect(research.rwaMetrics.some((metric) => metric.change30dPercent === null)).toBe(true);
  });

  it('refuses a snapshot that claims to be live or executable', () => {
    expect(() => parseResearchSnapshot({ ...snapshot, live: true })).toThrow();
    expect(() => parseResearchSnapshot({ ...snapshot, executable: true })).toThrow();
    expect(() => parseResearchSnapshot({ ...snapshot, schema_version: 'nest.stellar.research.ui.v2' })).toThrow();
  });
});
