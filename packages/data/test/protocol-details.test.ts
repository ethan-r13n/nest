import { describe, expect, it } from 'vitest';

import details from '../../../research/data/protocol-details.json' with { type: 'json' };
import snapshot from '../../../research/data/stellar-research-ui.json' with { type: 'json' };
import { parseProtocolDetails } from '../src/protocol-details.ts';
import { parseResearchSnapshot } from '../src/research.ts';

describe('protocol detail evidence', () => {
  it('retains top-five protocol facts, exact pool matches and small reported yields', () => {
    const parsed = parseProtocolDetails(details);
    for (const slug of ['blend-pools-v2', 'stellar-defi-hub', 'aquarius-stellar', 'gami-labs', 'upshift']) {
      expect(parsed.protocols[slug]?.description).toBeTruthy();
      expect(parsed.contexts[slug]?.project?.name).toBeTruthy();
    }
    expect(parsed.contexts['blend-pools-v2']?.audits).toHaveLength(6);
    expect(parsed.contexts['blend-pools-v2']?.contracts).toHaveLength(4);
    const pools = parseResearchSnapshot(snapshot).yieldPools.filter((pool) => pool.project === 'blend-pools-v2');
    expect(pools).toHaveLength(5);
    expect(pools[0]?.mean30dApyPct).toBe(0.00009);
    expect(parsed.protocols['blend-pools-v2']?.stellar_tvl_components_usd?.['Stellar-borrowed']).toBeGreaterThan(0);
  });

  it('rejects unsafe external links and malformed contract evidence', () => {
    const source = details.contexts['blend-pools-v2'];
    expect(() =>
      parseProtocolDetails({ ...details, contexts: { source: { ...source, source_url: 'javascript:alert(1)' } } }),
    ).toThrow();
    expect(() =>
      parseProtocolDetails({
        ...details,
        contexts: { source: { ...source, contracts: [{ address: 'wrong-network-id' }] } },
      }),
    ).toThrow();
  });
});
