import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LendingPositions } from '../src/lib/execution.ts';
import { assertPositionScope, lendingExits, positionAmountIssue } from '../src/lib/position-management.ts';

test('position amounts reject excess precision and compare balances without floating point', () => {
  assert.equal(positionAmountIssue('0.0000001', '0.0000001', 7), null);
  assert.ok(positionAmountIssue('0.00000001', '1', 7));
  assert.ok(positionAmountIssue('9007199254740992.0000002', '9007199254740992.0000001', 7));
  assert.equal(positionAmountIssue('9007199254740992.0000001', '9007199254740992.0000001', 7), null);
  for (const amount of ['0', '-1', '1e3', '1,000', 'NaN']) assert.ok(positionAmountIssue(amount, '1000', 7));
  assert.equal(positionAmountIssue('all', '100', 7), null);
  assert.equal(positionAmountIssue('0.000000001', '1', 9), null);
});

test('actions require both the same network and the wallet that owns the displayed position', () => {
  const position = { network: 'mainnet', owner: 'owner' } as const;
  assert.doesNotThrow(() => assertPositionScope(position, { network: 'mainnet', owner: 'owner' }));
  assert.throws(() => assertPositionScope(position, { network: 'testnet', owner: 'owner' }), /network/);
  assert.throws(() => assertPositionScope(position, { network: undefined, owner: 'owner' }), /network/);
  assert.throws(() => assertPositionScope(position, { network: 'mainnet', owner: 'other' }), /wallet/);
});

test('XOXNO management retains the exact lending account for each debt and collateral action', () => {
  const positions: LendingPositions = {
    network: 'mainnet',
    blend: { available: true, pools: [] },
    xoxno: {
      available: true,
      poolId: 'controller',
      name: 'XOXNO',
      accounts: ['11', '12'].map((accountId) => ({
        accountId,
        spokeId: 1,
        collateral: [{ symbol: 'XLM', amount: '1000' }],
        debt: [{ symbol: 'USDC', amount: accountId }],
        healthFactor: 1.6,
      })),
    },
  };
  const exits = lendingExits(positions, 'owner');
  assert.deepEqual(
    exits.map((row) => [row.kind, row.lendingAccountId, row.poolId]),
    [
      ['repay', '11', 'controller'],
      ['withdraw_collateral', '11', 'controller'],
      ['repay', '12', 'controller'],
      ['withdraw_collateral', '12', 'controller'],
    ],
  );
  assert.ok(exits.every((row) => row.owner === 'owner' && row.network === 'mainnet'));
});
