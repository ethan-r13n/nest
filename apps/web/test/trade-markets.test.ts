import assert from 'node:assert/strict';
import { test } from 'node:test';

import snapshot from '../../../design/nest/ui/trade-market-history.json' with { type: 'json' };
import { MARKET_ASSETS } from '../src/lib/market-assets.ts';
import { parseMarketHistory } from '../src/lib/market-history.ts';
import { swapDraftRequest } from '../src/lib/swap-draft.ts';

test('every research market in the asset window has its own captured candle series', () => {
  for (const asset of MARKET_ASSETS) {
    const history = parseMarketHistory(snapshot, asset.symbol);
    assert.ok(history, asset.symbol);
    assert.ok(history.rows.length > 1, asset.symbol);
  }
});

test('research-only markets cannot become fallback XLM swap requests', () => {
  for (const asset of MARKET_ASSETS.filter((asset) => asset.symbol !== 'XLM')) {
    assert.equal(swapDraftRequest(asset.symbol, 'USDC', '5'), null);
    assert.equal(swapDraftRequest('USDC', asset.symbol, '5'), null);
  }
  assert.equal(swapDraftRequest('XLM', 'XLM', '5'), null);
  assert.equal(swapDraftRequest('XLM', 'USDC', ''), null);
  assert.equal(swapDraftRequest('XLM', 'USDC', 'W'), null);
  assert.deepEqual(swapDraftRequest('XLM', 'USDC', '5'), {
    sellAsset: 'XLM',
    buyAsset: 'USDC',
    sellAmount: '5',
  });
  assert.deepEqual(swapDraftRequest('USDC', 'XLM', '5'), {
    sellAsset: 'USDC',
    buyAsset: 'XLM',
    sellAmount: '5',
  });
});
