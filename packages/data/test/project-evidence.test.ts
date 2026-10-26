import { describe, expect, it } from 'vitest';

import snapshot from '../../../research/data/project-evidence.json' with { type: 'json' };
import { parseProjectEvidence } from '../src/project-evidence.ts';

describe('project evidence', () => {
  it('preserves dated source references without representing execution readiness', () => {
    const data = parseProjectEvidence(snapshot);
    expect(data.records['soroswap-amm']).toMatchObject({
      projectSlug: 'soroswap',
      auditReferences: 3,
      repositories: 5,
      contractReferences: 2,
    });
    expect(data.records['soroswap-amm']?.observedAt).toMatch(/^2026-10-25T/);
  });
  it('rejects invalid reference counts and non-web source links', () => {
    const record = snapshot.records['soroswap-amm'];
    expect(() =>
      parseProjectEvidence({ ...snapshot, records: { source: { ...record, auditReferences: -1 } } }),
    ).toThrow();
    expect(() =>
      parseProjectEvidence({ ...snapshot, records: { source: { ...record, sourceUrl: 'javascript:alert(1)' } } }),
    ).toThrow();
  });
});
