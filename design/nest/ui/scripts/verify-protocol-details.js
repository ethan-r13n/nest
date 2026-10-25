const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'screens/research.js'), 'utf8');
const snapshot = JSON.parse(source.match(/const SNAPSHOT = (.+);/)[1]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const context = vm.createContext({
  window: { NestScreens: {}, NestBinders: {}, NestResearchSnapshot: snapshot,
    NestUI: { escape, logo: () => '', stat: (name, value, detail) => `<div>${name} ${value} ${detail}</div>` } },
  location: { hash: '' }, URL, URLSearchParams,
});
for (const file of ['protocol-yields.js', 'protocol-context.js', 'screens/protocols.js'])
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const render = slug => {
  context.location.hash = '#protocol-detail?slug=' + slug;
  return context.window.NestScreens['protocol-detail']();
};
let withYield = 0;
for (const p of snapshot.protocols) {
  const html = render(p.slug);
  assert.ok(html.includes(escape(p.name)));
  assert.ok(!html.includes('Reward APY'));
  assert.ok(!html.includes('Market access') && !html.includes('History &amp; coverage'));
  assert.ok(!html.includes('Historical series not captured'));
  assert.ok(html.indexOf('Dependencies &amp; controls') > html.indexOf('<aside'));
  assert.match(html, /p-protocol-actions/);
  assert.match(html, /Raven research/);
  const pools = context.window.NestProtocolYields.pools.filter(pool => pool.chain === 'Stellar' && pool.project === p.slug);
  assert.equal((html.match(/https:\/\/defillama.com\/yields\/pool\//g) || []).length, pools.length);
  if (pools.length) { withYield++; assert.ok(html.includes('Yield opportunities')); }
  else { assert.ok(!html.includes('Yield opportunities')); assert.ok(html.includes('No matching Stellar pools')); }
}
const blend = render('blend-pools-v2');
assert.match(blend, /0\.00009%/); // Preserve tiny, nonzero rates.
assert.match(render('xoxno-lending'), /<td>0%<\/td>/); // Retain reported zero in the remaining APY columns.
assert.match(blend, /other versions or products/); // Scout's Blend record has project-family scope.
assert.ok(!render('blend-backstop-v2').includes('Yield opportunities')); // Never borrow V2 pool yields for the backstop.
context.window.NestProtocolYields.pools.push({ chain: 'Ethereum', project: 'blend-backstop-v2', pool_id: 'wrong-chain' });
assert.ok(!render('blend-backstop-v2').includes('wrong-chain'));
assert.match(render('not-a-protocol'), /Protocol unavailable/);
const protocol = snapshot.protocols.find(p => p.slug === 'gami-labs');
const oldUrl = protocol.url;
protocol.url = 'javascript:alert(1)';
assert.ok(!render(protocol.slug).includes('href="javascript:'));
protocol.url = oldUrl;
for (const [name, global] of [['protocol-context', 'NestProtocolContext'], ['protocol-yields', 'NestProtocolYields']])
  assert.equal(JSON.stringify(context.window[global], (k, v) => k === 'pools' && name === 'protocol-yields' ? v.filter(p => p.pool_id !== 'wrong-chain') : v),
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'spec', name + '.json'), 'utf8'))));
console.log(JSON.stringify({ result: 'passed', protocols: snapshot.protocols.length, protocolsWithStellarYields: withYield,
  matchedScoutRecords: Object.values(context.window.NestProtocolContext.records).filter(r => r.status === 'matched').length,
  checked: ['exact project and chain matching', 'zero and tiny APY in displayed columns', 'project-family scope', 'safe links', 'generated snapshot parity'] }, null, 2));
