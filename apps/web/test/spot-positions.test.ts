import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ActivityItem, SwapBalances } from '../src/lib/execution.ts';
import { spotRows } from '../src/lib/spot-positions.ts';

const balances: SwapBalances = {
  network: 'mainnet',
  funded: true,
  balances: [
    { symbol: 'XLM', spendable: '150' },
    { symbol: 'USDC', spendable: '20' },
  ],
};

function swap(sent: [string, string], received: [string, string], status: ActivityItem['status'] = 'confirmed') {
  return {
    id: `${sent.join('')}-${received.join('')}-${status}`,
    kind: 'swap',
    status,
    createdAt: '2026-10-26T09:16:00Z',
    txHash: null,
    explorerUrl: null,
    errorCode: null,
    title: `Swap ${sent[1]} → ${received[1]}`,
    venue: 'Soroswap',
    sent: [{ amount: sent[0], symbol: sent[1] }],
    received: [{ amount: received[0], symbol: received[1] }],
  } satisfies ActivityItem;
}

test('values wallet balances without inventing an entry when Nest bought no XLM', () => {
  const rows = spotRows(balances, [swap(['10', 'XLM'], ['1.6884865', 'USDC'])], 0.17);
  assert.deepEqual(
    rows.map((row) => [row.symbol, row.quantity, row.usd, row.entry, row.pnl]),
    [
      ['XLM', '150', 150 * 0.17, null, null],
      ['USDC', '20', 20, null, null],
    ],
  );
});

test('averages confirmed Nest buys and limits P&L to the XLM Nest bought and still holds', () => {
  const activity = [
    swap(['20', 'USDC'], ['100', 'XLM']),
    swap(['30', 'USDC'], ['100', 'XLM']),
    swap(['50', 'XLM'], ['9', 'USDC']),
    swap(['999', 'USDC'], ['1', 'XLM'], 'failed'),
  ];
  const [xlm] = spotRows(balances, activity, 0.3);
  assert.equal(xlm?.entry, 0.25);
  assert.equal(xlm?.nestHeld, 150);
  assert.equal(xlm?.pnlQuantity, 150);
  assert.ok(Math.abs((xlm?.pnl ?? 0) - 7.5) < 1e-9);
});

test('caps attributed P&L at the current holding and reports nothing without a mark', () => {
  const activity = [swap(['50', 'USDC'], ['250', 'XLM'])];
  const [capped] = spotRows(balances, activity, 0.3);
  assert.equal(capped?.pnlQuantity, 150);
  const [unpriced] = spotRows(balances, activity, null);
  assert.equal(unpriced?.usd, null);
  assert.equal(unpriced?.pnl, null);
});

test('skips empty balances and missing trustlines', () => {
  const rows = spotRows(
    {
      network: 'mainnet',
      funded: true,
      balances: [
        { symbol: 'XLM', spendable: '0' },
        { symbol: 'USDC', spendable: null },
      ],
    },
    [],
    0.17,
  );
  assert.deepEqual(rows, []);
});
