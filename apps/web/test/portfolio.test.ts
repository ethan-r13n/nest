import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LendingPositions, LimitOrders, SwapBalances } from '../src/lib/execution.ts';
import { positionRows, valuationOf } from '../src/lib/portfolio.ts';

// The Testnet wallet after borrowing 1000 USDC on XOXNO against 12,635 XLM, 2026-10-26.
const BALANCES: SwapBalances = {
  network: 'testnet',
  funded: true,
  balances: [
    { symbol: 'XLM', spendable: '7363.75' },
    { symbol: 'USDC', spendable: '1000' },
  ],
};
const POSITIONS: LendingPositions = {
  network: 'testnet',
  blend: { available: true, pools: [] },
  xoxno: {
    available: true,
    name: 'XOXNO Blue Chip',
    accounts: [
      {
        accountId: '127',
        spokeId: 1,
        collateral: [{ symbol: 'XLM', amount: '12635.0553108' }],
        debt: [{ symbol: 'USDC', amount: '1000' }],
        healthFactor: 1.6000000039752247,
      },
    ],
  },
};
const NO_ORDERS: LimitOrders = { available: true, currentPrice: 0.17, orders: [] };

test('lists wallet balances and the XOXNO loan, with debt kept apart from assets', () => {
  const rows = positionRows(BALANCES, POSITIONS, NO_ORDERS, 0.17);
  assert.deepEqual(
    rows.map((row) => [row.label, row.venue, row.side, row.accounting]),
    [
      ['XLM in wallet', 'Wallet', 'asset', 'Spendable, after the account reserve'],
      ['USDC in wallet', 'Wallet', 'asset', 'Spendable'],
      ['Collateral XLM', 'XOXNO Blue Chip · account 127', 'asset', 'health 1.60'],
      ['Debt USDC', 'XOXNO Blue Chip · account 127', 'debt', 'health 1.60'],
    ],
  );
});

test('values XLM at the reference price and USDC at $1, net of debt', () => {
  const valuation = valuationOf(positionRows(BALANCES, POSITIONS, NO_ORDERS, 0.17));
  // Wallet 7363.75 × 0.17 + 1000; collateral 12635.0553108 × 0.17; debt 1000.
  assert.equal(valuation.wallet?.toFixed(2), '2251.84');
  assert.equal(valuation.supplied?.toFixed(2), '2147.96');
  assert.equal(valuation.debt, 1000);
  assert.equal(valuation.net?.toFixed(2), '3399.80');
});

test('leaves a value unknown rather than zero without a price', () => {
  const valuation = valuationOf(positionRows(BALANCES, POSITIONS, NO_ORDERS, null));
  assert.equal(valuation.wallet, null);
  assert.equal(valuation.net, null);
  assert.equal(valuation.debt, 1000);
});
