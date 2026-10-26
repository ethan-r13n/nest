import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseResearchSnapshot } from '@nest/data/research';

import provenance from '../../../design/nest/ui/spec/logo-provenance.json' with { type: 'json' };
import snapshot from '../../../research/data/stellar-research-ui.json' with { type: 'json' };
import { logoAssetPath } from '../src/lib/logos.ts';

test('bundled artwork matches the recorded source files', () => {
  for (const asset of provenance.assets) {
    const bytes = readFileSync(new URL(`../../../design/nest/ui/${asset.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
  }
});

test('every captured brand alias resolves to its documented local asset', () => {
  for (const [name, path] of Object.entries(provenance.name_map)) {
    assert.equal(logoAssetPath(name), path, name);
    assert.ok(existsSync(new URL(`../../../design/nest/ui/${path}`, import.meta.url)), path);
  }
});

test('all protocol identities resolve; missing RWA artwork stays explicitly missing', () => {
  const research = parseResearchSnapshot(snapshot);
  for (const protocol of research.protocols) {
    assert.ok(logoAssetPath(protocol.name), protocol.name);
  }
  assert.deepEqual(
    research.rwaAssets
      .filter((asset) => !logoAssetPath(asset.name))
      .map((asset) => asset.name)
      .sort(),
    provenance.missing.map((asset) => asset.name).sort(),
  );
  assert.deepEqual(
    [...new Set(research.rwaAssets.filter((asset) => !logoAssetPath(asset.platform)).map((asset) => asset.platform))],
    ['Stablecorp Digital Currencies Inc.'],
  );
});

test('canonical ticker and project aliases work without guessing unrelated identities', () => {
  for (const alias of ['XOXNO', 'Templar', 'Gami', 'XLM', 'USDC', 'USDT0', 'AQUA', 'SolvBTC', 'EUTBL', 'X']) {
    assert.ok(logoAssetPath(alias), alias);
  }
  assert.equal(logoAssetPath('  SoLvBtC  '), logoAssetPath('SolvBTC'));
  assert.equal(logoAssetPath('Spiko Unknown Product'), undefined);
  assert.equal(logoAssetPath('CARTAO56 -'), undefined);
});
