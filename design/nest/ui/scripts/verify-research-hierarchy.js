const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const context = vm.createContext({
  window: { NestScreens: {}, NestBinders: {}, NestUI: { escape, logo: () => '', badge: (text) => `<span>${text}</span>`, stat: (name, value, detail) => `<div>${name} ${value} ${detail}</div>` } },
  document: { addEventListener() {} }, location: { hash: '' }, URL, URLSearchParams,
});
for (const file of ['research-ui.js', 'screens/research.js', 'protocol-yields.js', 'protocol-context.js', 'screens/protocols.js', 'raven-catalog.js', 'screens/discovery.js', 'screens/mcp-contents.js'])
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const W = context.window;
const pager = W.NestResearchUI;
for (const total of [0, 1, 10, 11, 33, 80, 109]) for (const pageSize of [10, 25, 50]) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  for (const requested of [-1, 1, 2, pages, pages + 1]) {
    const m = pager.model({ page: requested, pageSize }, total);
    assert.ok(m.page >= 1 && m.page <= pages);
    assert.ok(m.start >= 0 && m.end <= total);
    assert.ok(m.items.includes(m.page) && m.items.includes(1) && m.items.includes(pages));
    assert.ok(m.items.filter(n => typeof n === 'number').every(n => n >= 1 && n <= pages));
    assert.equal(m.items.at(0), 1); assert.equal(m.items.at(-1), pages);
  }
}
const nav = W.NestResearchTabs('research-mcp');
assert.match(nav, /MCP Contents/); assert.equal((nav.match(/class="tab /g) || []).length, 3);
assert.ok(!nav.includes('research-map') && !nav.includes('research-markets'));
assert.ok(W.NestResearchNodes.length > W.NestVenueCatalog.length);
assert.equal(W.NestResearchNodes.filter(n => n.integration).length, 8);
assert.ok(W.NestResearchNodes.every(n => n.record?.project && n.protocol.category !== 'CEX'));
assert.equal(new Set(W.NestResearchNodes.map(n => n.record.project.slug)).size, W.NestResearchNodes.length);
assert.equal(W.NestResearchRoute('#research-map'), '#research-mcp');
assert.equal(W.NestResearchRoute('#research-markets?view=catalog'), '#research-mcp');
for (const v of W.NestVenueCatalog) {
  const slug = W.NestProtocolForVenue(v.id);
  assert.equal(W.NestVenueForProtocol(slug).id, v.id);
  assert.equal(W.NestResearchRoute('#venue-detail?id=' + v.id), '#protocol-detail?slug=' + slug);
  context.location.hash = '#protocol-detail?slug=' + slug;
  const html = W.NestScreens['protocol-detail']();
  assert.match(html, /Markets &amp; capabilities/);
  assert.ok(html.includes(escape(v.exit)) && html.includes(escape(v.source)));
  for (const read of v.reads) assert.ok(html.includes(escape(read)));
  assert.ok(!html.includes('#market-detail') && !html.includes('#venue-detail'));
}
assert.equal(W.NestResearchRoute('#market-detail?id=gami-usdc'), '#protocol-detail?slug=gami-labs');
assert.equal(W.NestVenueForProtocol('blend-backstop-v2'), undefined);
assert.equal(W.NestVenueForProtocol('not-a-protocol'), undefined);
assert.equal(W.NestResearchRoute('#market-detail?id=unknown'), '#research-defi');
const defi = W.NestScreens['research-defi']();
assert.ok(!defi.includes('Available action') && !defi.includes('Research only'));
assert.match(defi, /r-network-summary/); assert.match(defi, /r-protocol-pages/);
assert.match(W.NestScreens['research-rwa'](), /r-asset-pages/);
const mcp = W.NestScreens['research-mcp']();
assert.ok(mcp.indexOf('mcp-map-section') < mcp.indexOf('mcp-catalog-section'));
assert.ok(!mcp.includes('Venue markets') && !mcp.includes('Open market'));
assert.match(mcp, /mcp-catalog-pages/);
console.log(JSON.stringify({ result: 'passed', researchTabs: 3, mapProjects: W.NestResearchNodes.length,
  integrationTargets: 8, catalogEntries: W.NestRavenCatalog.entries.length,
  checked: ['pagination bounds, empty results and page sizes', 'identity joins and grouped project coverage', 'all integration protocol details', 'legacy route migration', 'no backstop / lending conflation', 'map before catalog'] }, null, 2));
