import { describe, expect, it } from 'vitest';
import history from '../../../research/data/defillama-stellar.json' with { type: 'json' };
import catalog from '../../../research/data/raven-catalog.json' with { type: 'json' };
import snapshot from '../../../research/data/stellar-research-ui.json' with { type: 'json' };
import { parseRavenCatalog, parseResearchHistory, parseResearchSnapshot, safeResearchUrl } from '../src/research.ts';

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

describe('research detail coverage', () => {
  it('preserves distinct RWA identities, empty league coverage and source precision', () => {
    const data = parseResearchSnapshot(snapshot);
    expect(data.rwaAssets).toHaveLength(109);
    expect(new Set(data.rwaAssets.map((asset) => asset.id)).size).toBe(109);
    expect(data.rwaLeagueTables.reduce((sum, table) => sum + table.rows.length, 0)).toBe(62);
    expect(
      data.rwaLeagueTables.find((table) => table.assetType === 'represented' && table.groupBy === 'manager')?.rows,
    ).toEqual([]);
    expect(data.rwaAssets[0]?.totalValueDisplay).toBe('$ 1,464,692,684 ▲');
    expect(data.stablecoins).toHaveLength(13);
  });

  it('rejects execution claims and non-web references in asset rows', () => {
    const first = snapshot.rwa.assets[0];
    expect(() =>
      parseResearchSnapshot({ ...snapshot, rwa: { ...snapshot.rwa, assets: [{ ...first, executable: true }] } }),
    ).toThrow();
    expect(() =>
      parseResearchSnapshot({
        ...snapshot,
        rwa: { ...snapshot.rwa, assets: [{ ...first, assetUrl: 'javascript:alert(1)' }] },
      }),
    ).toThrow();
    expect(safeResearchUrl('javascript:alert(1)')).toBeNull();
    expect(safeResearchUrl('https://example.com/path')).toBe('https://example.com/path');
  });
});

describe('published Raven catalog', () => {
  it('retains all published entries and distinguishes catalog from runtime verification', () => {
    const data = parseRavenCatalog(catalog);
    expect(data.entries).toHaveLength(80);
    expect(data.counts).toEqual({ operation: 60, skill: 20, 'skill-section': 202 });
    expect(data.runtimeVerified).toBe(false);
  });

  it('rejects mismatched coverage counts or an asserted runtime connection', () => {
    expect(() => parseRavenCatalog({ ...catalog, counts: { ...catalog.counts, operation: 61 } })).toThrow();
    expect(() => parseRavenCatalog({ ...catalog, runtimeVerified: true })).toThrow();
  });
});

describe('chain history', () => {
  it('uses actual daily provider observations and USD-converted stablecoin totals', () => {
    const data = parseResearchHistory(history);
    expect(data.series[0]?.points).toHaveLength(972);
    expect(data.series[1]?.points).toHaveLength(1668);
    expect(data.series[2]?.points).toHaveLength(1627);
    expect(data.series[0]?.points.at(-1)?.valueUsd).toBe(222949713);
    expect(data.series[2]?.points.at(-1)?.valueUsd).toBeCloseTo(438284578.91, 2);
  });
});
