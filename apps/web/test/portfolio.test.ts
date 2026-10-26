import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LendingPositions, LimitOrders, SwapBalances, VaultPositions } from '../src/lib/execution.ts';
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
const KNOWN = { lending: false, limits: false };

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
  const valuation = valuationOf(positionRows(BALANCES, POSITIONS, NO_ORDERS, 0.17), KNOWN);
  // Wallet 7363.75 × 0.17 + 1000; collateral 12635.0553108 × 0.17; debt 1000.
  assert.equal(valuation.wallet?.toFixed(2), '2251.84');
  assert.equal(valuation.supplied?.toFixed(2), '2147.96');
  assert.equal(valuation.debt, 1000);
  assert.equal(valuation.net?.toFixed(2), '3399.80');
});

test('leaves a value unknown rather than zero without a price', () => {
  const valuation = valuationOf(positionRows(BALANCES, POSITIONS, NO_ORDERS, null), KNOWN);
  assert.equal(valuation.wallet, null);
  assert.equal(valuation.net, null);
  assert.equal(valuation.debt, 1000);
});

test('unknown XOXNO positions leave lending totals unknown while preserving the wallet value', () => {
  const positions: LendingPositions = {
    ...POSITIONS,
    xoxno: { available: false, reason: 'Positions unavailable', accounts: [] },
  };
  const valuation = valuationOf(positionRows(BALANCES, positions, NO_ORDERS, 0.17), {
    lending: positions.blend.available === false || positions.xoxno.available === false,
    limits: false,
  });
  assert.equal(valuation.wallet?.toFixed(2), '2251.84');
  assert.equal(valuation.supplied, null);
  assert.equal(valuation.gross, null);
  assert.equal(valuation.debt, null);
  assert.equal(valuation.net, null);
});

test('unknown limit orders leave asset totals unknown without hiding known debt', () => {
  const limits: LimitOrders = { available: false, reason: 'Orders unavailable', orders: [] };
  const valuation = valuationOf(positionRows(BALANCES, POSITIONS, limits, 0.17), {
    lending: false,
    limits: limits.available === false,
  });
  assert.equal(valuation.wallet?.toFixed(2), '2251.84');
  assert.equal(valuation.supplied, null);
  assert.equal(valuation.gross, null);
  assert.equal(valuation.debt, 1000);
  assert.equal(valuation.net, null);
});

test('vault shares contribute their underlying once, and an unavailable vault source never becomes zero', () => {
  const vaults: VaultPositions = {
    network: 'testnet',
    available: true,
    positions: [
      {
        vault: { id: 'vault', name: 'USDC vault' },
        shares: { symbol: 'shares', amount: '5', raw: '500000000', decimals: 8 },
        underlying: { symbol: 'USDC', amount: '6', raw: '60000000' },
        assetContract: 'asset',
        withdrawalTiming: { lockup: 'none', cooldown: 'none', summary: 'Subject to strategy liquidity.' },
        verified: true,
      },
    ],
  };
  const rows = positionRows(BALANCES, POSITIONS, NO_ORDERS, 0.17, vaults);
  const known = valuationOf(rows, { ...KNOWN, vaults: false });
  const unavailable = valuationOf(positionRows(BALANCES, POSITIONS, NO_ORDERS, 0.17), { ...KNOWN, vaults: true });
  assert.equal(known.vaults, 6);
  assert.equal(known.net?.toFixed(2), '3405.80');
  assert.equal(known.supplied?.toFixed(2), '2147.96');
  assert.equal(unavailable.vaults, null);
  assert.equal(unavailable.gross, null);
  assert.equal(unavailable.net, null);
  assert.equal(unavailable.debt, 1000);
});
