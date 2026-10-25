const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['trade-chart.js', 'trade-positions.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const { NestTradeChart: chart, NestTradePositions: positions } = context.window;
let candles = 0;
for (const interval of ['1m', '5m', '15m', '1H', '4H', '1D']) {
  const rows = chart.fixture(interval);
  assert.equal(rows.length, 120);
  assert.equal(rows.at(-1).close, 1742800);
  rows.forEach((r, i) => {
    assert.ok(r.high >= Math.max(r.open, r.close));
    assert.ok(r.low <= Math.min(r.open, r.close));
    assert.ok(r.low > 0 && r.volume >= 0);
    if (i) assert.ok(r.time > rows[i - 1].time);
    candles++;
  });
}
assert.equal(positions.values().notional, '435.70');
assert.equal(positions.values().pnl, '+$35.70');
assert.equal(positions.values().percent, '+8.93');
assert.equal(positions.values({ quantity: '2500', entry: '0.2000000', mark: '0.1742800' }).pnl, '−$64.30');
assert.equal(positions.values({ quantity: '2500', entry: null, mark: '0.1742800' }).pnl, null);
assert.equal(positions.values({ quantity: '0.0000001', entry: '0', mark: '0.1742800' }).notional, '0.00');
assert.equal(positions.values({ quantity: '12345678901234567890.1234567', entry: null, mark: '1' }).notional, '12,345,678,901,234,567,890.12');
assert.throws(() => positions.units('1.00000001'));
const expected = positions.units('2500.0000000') * positions.units('0.1740200');
assert.equal(positions.fixed(expected, 100000000000000n, 5), '435.05000');
assert.equal(positions.fixed(expected * 995n, 100000000000000000n, 5), '432.87475');
const access = JSON.parse(fs.readFileSync(path.join(root, 'spec/rwa-access.json'), 'utf8'));
const entries = Object.entries(access.records);
assert.equal(entries.length, 109);
for (const [identity, r] of entries) {
  assert.ok(identity.startsWith(r.assetUrl + '|'));
  assert.match(r.assetUrl, /^https:\/\/app\.rwa\.xyz\/assets\/[a-zA-Z0-9_-]+$/);
  for (const field of ['kyc', 'mint', 'dex']) assert.ok(r[field].detail && r[field].sources.length);
  assert.ok(['required', 'unknown'].includes(r.kyc.status));
  assert.ok(['reported', 'unknown'].includes(r.mint.status));
  if (r.dex.status === 'observed') assert.ok(r.dex.observedAt && r.dex.sources[0].startsWith('https://horizon.stellar.org/order_book?'));
}
console.log(JSON.stringify({ result: 'passed', candles, intervals: 6, positionAccounting: 'exact decimal; gain, loss, unknown basis and small/large amounts', rwaIdentities: entries.length, closeMinimum: '432.87475 USDC' }, null, 2));
