import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkArbitrageDemo, emptyArbitrageDemo } from '../src/lib/arbitrage-demo.ts';

const NOW = '2026-10-26T03:00:00.000Z';

test('a gap raises one simulated alert until prices converge, then can alert again', () => {
  const initial = emptyArbitrageDemo();
  const balanced = checkArbitrageDemo(initial, 'balanced', NOW);
  assert.equal(balanced.preview?.result, 'false');
  assert.equal(balanced.alerts, 0);
  const gap = checkArbitrageDemo(balanced, 'gap', NOW);
  assert.equal(gap.preview?.result, 'true');
  assert.equal(gap.alerts, 1);
  assert.equal(gap.armed, false);
  assert.equal(gap.preview?.evidence.profitBps, 512.48);
  assert.equal(gap.preview?.evidence.readings[0]?.xlmReserve, '10000000000000');
  assert.equal(gap.preview?.evidence.readings[0]?.usdcReserve, '1700000000000');
  const repeated = checkArbitrageDemo(gap, 'gap', NOW);
  assert.equal(repeated.alerts, 1);
  assert.equal(repeated.checks, 3);
  const closed = checkArbitrageDemo(repeated, 'balanced', NOW);
  assert.equal(closed.armed, true);
  const reopened = checkArbitrageDemo(closed, 'gap', NOW);
  assert.equal(reopened.alerts, 2);
  assert.equal(initial.checks, 0);
});

test('reset clears all demo evidence and never represents a chain receipt', () => {
  const gap = checkArbitrageDemo(emptyArbitrageDemo(), 'gap', NOW);
  assert.ok(
    gap.preview?.evidence.readings.every(
      (reading) => reading.poolId.startsWith('simulated-') && reading.ledger === null,
    ),
  );
  const reset = emptyArbitrageDemo();
  assert.equal(reset.preview, null);
  assert.equal(reset.checks, 0);
  assert.equal(reset.alerts, 0);
  assert.equal(checkArbitrageDemo(reset, 'gap', NOW).alerts, 1);
});
