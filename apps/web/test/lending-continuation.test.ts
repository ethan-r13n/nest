import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LendingComparison, LendingOffer } from '../src/lib/execution.ts';
import { continuationQuote } from '../src/lib/lending-continuation.ts';

const XOXNO_POOL = 'xoxno-pool';

function offer(venue: 'blend' | 'xoxno'): LendingOffer {
  return {
    id: `${venue}-quote`,
    kind: 'borrow',
    venue,
    pool: { id: `${venue}-pool`, name: venue, status: 'Active' },
    asset: { symbol: 'USDC', amount: '1000' },
    collateral: { symbol: 'XLM', amount: '12635' },
    supplyApyPct: 1,
    borrowApyPct: 3,
    utilizationPct: 50,
    available: { symbol: 'USDC', amount: '10000' },
    estimatedHealth: 1.6,
    targetHealth: 1.6,
    position: null,
    withdrawalTiming: { lockup: 'none', cooldown: 'none', summary: 'Repay before withdrawing collateral.' },
    nestFeeBps: 0,
    expiresAt: '2026-10-26T12:00:00.000Z',
  };
}

test('continues on XOXNO even when Blend is the selected best offer', () => {
  const compared: LendingComparison = {
    quotes: [offer('blend'), offer('xoxno')],
    selectedQuoteId: 'blend-quote',
    excluded: [],
  };
  assert.deepEqual(continuationQuote(compared, XOXNO_POOL), { quoteId: 'xoxno-quote' });
});

test('stops with the XOXNO exclusion reason instead of falling back to Blend', () => {
  const compared: LendingComparison = {
    quotes: [offer('blend')],
    selectedQuoteId: 'blend-quote',
    excluded: [{ poolId: XOXNO_POOL, name: 'XOXNO', reason: 'Not enough liquidity.' }],
  };
  assert.deepEqual(continuationQuote(compared, XOXNO_POOL), {
    stop: "XOXNO can't take this right now: Not enough liquidity.",
  });
});

test('stops with a generic reason when the previous venue has no quote or exclusion', () => {
  const compared: LendingComparison = {
    quotes: [offer('blend')],
    selectedQuoteId: 'blend-quote',
    excluded: [],
  };
  assert.deepEqual(continuationQuote(compared, XOXNO_POOL), { stop: "That venue can't take this right now." });
});
