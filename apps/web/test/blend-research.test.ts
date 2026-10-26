import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BLEND_POOLS } from '@nest/adapters/blend/markets';

import { blendYieldContext, resolveBlendResearchCommand } from '../src/lib/blend-research.ts';
import { parseLendingCommand, parseSelectionBase } from '../src/lib/command.ts';
import type { LendingMarkets } from '../src/lib/execution.ts';

const OBSERVED = '2026-10-25T14:35:00.000Z';
const SOURCE = { symbol: 'USDC', meta: 'Fixed Pool', observedAt: OBSERVED };

function markets(network: 'mainnet' | 'testnet'): LendingMarkets {
  return {
    network,
    markets: BLEND_POOLS[network].map((pool) => ({
      poolId: pool.id,
      name: pool.name,
      statusLabel: 'Active',
      canSupply: true,
      canBorrow: true,
      observedAtMs: Date.parse(OBSERVED),
      reserves: [
        {
          symbol: 'USDC',
          supplyApyPct: 4,
          borrowApyPct: 6,
          utilizationPct: 50,
          availableRaw: '1000000000',
          collateralFactor: 0.9,
        },
      ],
    })),
  };
}

test('only the known Blend USDC research rows gain commands', () => {
  assert.ok(blendYieldContext('blend-pools-v2', SOURCE, 'testnet'));
  assert.ok(blendYieldContext('blend-pools-v2', { ...SOURCE, meta: 'YieldBlox Pool' }, 'mainnet'));
  assert.equal(blendYieldContext('gami-labs', SOURCE, 'mainnet'), null);
  assert.equal(blendYieldContext('blend-pools-v2', { ...SOURCE, symbol: 'XLM' }, 'mainnet'), null);
  assert.equal(blendYieldContext('blend-pools-v2', { ...SOURCE, meta: 'Unknown pool' }, 'mainnet'), null);
});

test('Testnet compares its pools and never receives the captured Mainnet pool ID', () => {
  const context = blendYieldContext('blend-pools-v2', SOURCE, 'testnet');
  assert.ok(context);
  const command = parseLendingCommand('lend 100 usdc', context);
  assert.ok(command);
  const resolved = resolveBlendResearchCommand({ ...command, poolId: context.poolId }, context, markets('testnet'));
  assert.deepEqual(resolved, { kind: 'supply', asset: 'USDC', amount: '100' });
});

test('Mainnet resolves each selected source pool through the registered live pool', () => {
  for (const meta of ['Fixed Pool', 'YieldBlox Pool']) {
    const context = blendYieldContext('blend-pools-v2', { ...SOURCE, meta }, 'mainnet');
    assert.ok(context);
    const command = parseLendingCommand('100', context);
    assert.ok(command);
    const resolved = resolveBlendResearchCommand(command, context, markets('mainnet'));
    assert.equal(resolved.poolId, context.poolId);
  }
});

test('network changes and unavailable selected pools fail before creating an intent', () => {
  const context = blendYieldContext('blend-pools-v2', SOURCE, 'mainnet');
  assert.ok(context);
  const command = { kind: 'supply', asset: 'USDC', amount: '100' } as const;
  assert.throws(() => resolveBlendResearchCommand(command, context, markets('testnet')), /network changed/);
  const frozen = markets('mainnet');
  for (const pool of frozen.markets) if (pool.poolId === context.poolId) pool.canSupply = false;
  assert.throws(() => resolveBlendResearchCommand(command, context, frozen), /selected Blend pool is unavailable/);
  assert.throws(
    () => resolveBlendResearchCommand(command, context, { network: 'mainnet', markets: [] }),
    /No available/,
  );
});

test('selection metadata is decoded rather than trusting arbitrary DOM JSON', () => {
  const context = blendYieldContext('blend-pools-v2', SOURCE, 'testnet');
  assert.ok(context);
  assert.equal(parseSelectionBase(context)?.source?.executionNetwork, 'testnet');
  assert.equal(parseSelectionBase({ ...context, asset: 'FAKE' }), null);
  assert.equal(parseSelectionBase({ ...context, canSupply: 'yes' }), null);
  assert.equal(parseSelectionBase({ ...context, source: { ...context.source, network: 'testnet' } }), null);
  assert.equal(parseSelectionBase({ ...context, source: { ...context.source, observedAt: 'unknown' } }), null);
  assert.equal(parseSelectionBase({ ...context, source: { ...context.source, executionNetwork: 'other' } }), null);
});
