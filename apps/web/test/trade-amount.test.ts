import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maxSwapAmount } from '../src/lib/trade-amount.ts';

test('leaves an exact XLM fee allowance after the supplied account reserve', () => {
  assert.equal(maxSwapAmount('100.5000001', 'XLM'), '100.0000001');
  assert.equal(maxSwapAmount('0.5', 'XLM'), null);
  assert.equal(maxSwapAmount('0.4999999', 'XLM'), null);
});

test('keeps seven-decimal precision above the floating-point integer range', () => {
  assert.equal(maxSwapAmount('922337203685.4775807', 'USDC'), '922337203685.4775807');
  assert.equal(maxSwapAmount('0.0000001', 'USDC'), '0.0000001');
});

test('rejects malformed balances instead of suggesting an imprecise maximum', () => {
  for (const value of ['', '-1', '1e3', '1,000', '1.00000001', 'Infinity']) {
    assert.equal(maxSwapAmount(value, 'XLM'), null);
  }
});
