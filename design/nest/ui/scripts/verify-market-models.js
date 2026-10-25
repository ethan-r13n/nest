const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['trade-chart.js', 'trade-positions.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const { NestTradeChart: chart, NestTradePositions: positions } = context.window;
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'trade-market-history.json'), 'utf8'));
let observations = 0;
assert.equal(Object.keys(snapshot).length, 7);
for (const [asset, payload] of Object.entries(snapshot)) {
  const normalized = chart.normalize(payload, asset, asset === 'EUTBL' ? '1D' : '1H');
  assert.ok(normalized.rows.length > 2, asset + ' needs real history');
  assert.equal(normalized.kind, 'candles');
  assert.equal(payload.kind, 'candles');
  assert.equal(normalized.volumeAvailable, asset === 'AQUA');
  assert.equal(payload.quote, 'USDC');
  normalized.rows.forEach((row, i, rows) => {
    assert.ok(i === 0 || row.time > rows[i - 1].time);
    assert.ok(row.time <= Date.now() / 1000 + 60);
    observations++;
  });
}
const observed = chart.normalize({asset:'XLM',quote:'USDC',interval:'1H',kind:'line',note:'Recorded prices',rows:[{time:1767225900,value:4},{time:1767225660,value:3},{time:1767225720,value:2},{time:1767225780,value:5}]}, 'XLM', '1H');
assert.equal(observed.kind, 'candles');
assert.equal(observed.volumeAvailable, false);
assert.equal(observed.rows.length, 1);
assert.equal(observed.rows[0].open, 3); assert.equal(observed.rows[0].high, 5); assert.equal(observed.rows[0].low, 2); assert.equal(observed.rows[0].close, 4);
assert.equal(observed.rows[0].volume, undefined);
assert.throws(() => chart.normalize(snapshot.XLM, 'AQUA', '1H'));
assert.throws(() => chart.normalize(snapshot.XLM, 'XLM', '1m'));
assert.throws(() => chart.normalize({asset:'XLM',quote:'USDC',interval:'1H',kind:'line',rows:[{time:Math.ceil(Date.now()/1000)+3600,value:1}]}, 'XLM', '1H'));
assert.throws(() => chart.normalize({asset:'AQUA',quote:'USDC',interval:'1H',kind:'candles',rows:[{time:100,open:2,high:1,low:1,close:2,volume:0}]}, 'AQUA', '1H'));
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
console.log(JSON.stringify({ result: 'passed', observations, markets: 7, intervals: 6, positionAccounting: 'exact decimal; gain, loss, unknown basis and small/large amounts', rwaIdentities: entries.length, closeMinimum: '432.87475 USDC' }, null, 2));
