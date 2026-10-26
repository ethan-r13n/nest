import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseLendingCommand, type SelectionContext } from '../src/lib/command.ts';

const context: SelectionContext = {
  poolId: 'pool-a',
  poolName: 'Blend',
  asset: 'USDC',
  rate: 'supply',
  apyPct: 8.5,
  canSupply: true,
  canBorrow: true,
};

test('runs a lending command in the selected eligible pool', () => {
  assert.deepEqual(parseLendingCommand('lend 100 usdc', context), {
    kind: 'supply',
    asset: 'USDC',
    amount: '100',
    poolId: 'pool-a',
  });
  assert.deepEqual(parseLendingCommand('100', context), {
    kind: 'supply',
    asset: 'USDC',
    amount: '100',
    poolId: 'pool-a',
  });
  assert.equal(parseLendingCommand('supply $1,000', context)?.amount, '1000');
  assert.equal(parseLendingCommand('borrow 1.234567891k', context)?.amount, '1234.567891');
});

test('compares all pools when the selected pool cannot supply or the requested asset differs', () => {
  assert.deepEqual(parseLendingCommand('lend 100 usdc', { ...context, canSupply: false }), {
    kind: 'supply',
    asset: 'USDC',
    amount: '100',
  });
  assert.deepEqual(parseLendingCommand('lend 100 xlm', context), { kind: 'supply', asset: 'XLM', amount: '100' });
  assert.deepEqual(parseLendingCommand('borrow 100 usdc', { ...context, canBorrow: false }), {
    kind: 'borrow',
    asset: 'USDC',
    amount: '100',
  });
});

test('keeps Stellar decimal precision and sends non-commands to the assistant', () => {
  assert.equal(parseLendingCommand('lend 0.0000001 USDC', context)?.amount, '0.0000001');
  for (const value of [
    'lend 0 usdc',
    'lend -1 usdc',
    'lend 0.00000001 usdc',
    'lend 1e3 usdc',
    'why is utilization high?',
  ]) {
    assert.equal(parseLendingCommand(value, context), null);
  }
  assert.equal(parseLendingCommand('100', null), null);
  assert.deepEqual(parseLendingCommand('repay 50 XLM', null), { kind: 'repay', asset: 'XLM', amount: '50' });
});
