/* One research directory: venue relationships above the published Raven catalog. */
(() => {
  'use strict';
  const U = window.NestUI, e = value => U.escape(value), catalog = window.NestRavenCatalog;
  const protocols = window.NestResearchSnapshot.protocols;
  const records = window.NestProtocolContext?.records || {};
  const venues = window.NestVenueCatalog;
  // Explicit identity joins: never infer a deployment from a similar display name.
  const venueSlugs = {
    soroswap: ['soroswap-amm'], blend: ['blend-pools-v2', 'blend-pools'], templar: ['templar-protocol'],
    xoxno: ['xoxno-lending'], defindex: ['defindex'], upshift: ['upshift'], gami: ['gami-labs'], sentora: ['stellar-defi-hub'],
  };
  window.NestVenueForProtocol = slug => venues.find(v => venueSlugs[v.id]?.includes(slug));
  window.NestProtocolForVenue = id => venueSlugs[id]?.[0];
  window.NestResearchRoute = hash => {
    const [route, query = ''] = hash.replace(/^#/, '').split('?');
    if (['research-markets', 'research-map'].includes(route)) return '#research-mcp';
    if (route === 'venue-detail' || route === 'market-detail') {
      const id = new URLSearchParams(query).get('id');
      const venue = route === 'market-detail' && id === 'gami-usdc' ? venues.find(v => v.id === 'gami') : venues.find(v => v.id === id || (route === 'market-detail' && v.market === id));
      return venue ? '#protocol-detail?slug=' + venueSlugs[venue.id][0] : '#research-defi';
    }
    return null;
  };
  const families = {
    lumenloop: { name: 'Lumenloop', icon: '◉', label: 'Research & content' },
    scout: { name: 'Scout', icon: '⌘', label: 'Projects & evidence' },
    stellarDocs: { name: 'Stellar Docs', icon: '▤', label: 'Protocol documentation' },
    skills: { name: 'Skills', icon: '◇', label: 'Build & security playbooks' },
  };
  const groupFor = p => /Dexs/.test(p.category) ? 'Spot' : /Lending/.test(p.category) ? 'Lending' :
    /Farm|Yield|Allocator|Curator|Basis/.test(p.category) ? 'Vaults & yield' : 'Infrastructure';
  const nodes = venues.map(v => {
    const protocol = protocols.find(p => p.slug === venueSlugs[v.id][0]);
    return { ...v, group: v.category === 'Vaults' ? 'Vaults & yield' : v.category,
      slugs: [...venueSlugs[v.id]], protocol, record: records[protocol?.slug], integration: true };
  });
  const projects = new Set(nodes.map(n => n.record?.project?.slug).filter(Boolean));
  protocols.filter(p => p.category !== 'CEX' && records[p.slug]?.project).forEach(p => {
    const record = records[p.slug];
    const existing = nodes.find(n => n.record?.project?.slug === record.project.slug);
    if (existing) { if (!existing.slugs.includes(p.slug)) existing.slugs.push(p.slug); return; }
    if (projects.has(record.project.slug)) return;
    projects.add(record.project.slug);
    nodes.push({ id: 'scout-' + record.project.slug, name: record.project.name, type: p.category,
      group: groupFor(p), protocol: p, record, slugs: [p.slug], integration: false });
  });
  window.NestResearchNodes = nodes;
  const state = { search: '', family: 'all', kind: 'all', page: 1, pageSize: 10 };
  const mapState = { search: '', scope: 'all', selected: 'soroswap', expanded: new Set() };
  const profileUrl = slug => '#protocol-detail?slug=' + encodeURIComponent(slug);
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not supplied';
  const sourceLink = (url, label) => {
    try { const parsed = new URL(url); return parsed.protocol === 'https:' ? `<a href="${e(parsed.href)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : ''; }
    catch { return ''; }
  };
  const entrySearch = entry => [entry.id, entry.summary, families[entry.family]?.name, ...entry.parameters, ...entry.sections].join(' ').toLowerCase();
  const matchingEntries = () => catalog.entries.filter(entry => (state.family === 'all' || state.family === entry.family) &&
    (state.kind === 'all' || state.kind === entry.kind) && entrySearch(entry).includes(state.search.toLowerCase().trim()));
  function renderCatalog(root) {
    const all = matchingEntries();
    state.page = window.NestResearchUI.model(state, all.length).page;
    root.querySelector('#mcp-entry-count').textContent = `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
    root.querySelectorAll('[data-mcp-family]').forEach(button => button.setAttribute('aria-pressed', String(state.family === button.dataset.mcpFamily)));
    const page = all.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    root.querySelector('#mcp-entries').innerHTML = page.length ? page.map(entry => `<details class="mcp-entry">
      <summary><span class="mcp-entry-icon" aria-hidden="true">${families[entry.family]?.icon || '◇'}</span>
      <span class="mcp-entry-copy"><strong>${e(entry.id)}</strong><span>${e(entry.summary)}</span></span>
      <span class="mcp-entry-type">${e(entry.kind)}</span><span class="mcp-entry-chevron" aria-hidden="true">+</span></summary>
      <div class="mcp-entry-contract"><dl><div><dt>Source family</dt><dd>${e(families[entry.family]?.name)}</dd></div>
      <div><dt>Parameters</dt><dd>${entry.parameters.length ? e(entry.parameters.join(' · ')) : 'See pinned schema'}</dd></div>
      <div><dt>Source captured</dt><dd>${e(entry.sourceFetchedAt || 'Not supplied')}</dd></div>
      ${entry.kind === 'skill' ? `<div><dt>Sections · ${entry.sections.length}</dt><dd>${e(entry.sections.join(' · ') || 'No sections supplied')}</dd></div>` : ''}</dl>
      ${sourceLink(entry.source, 'Upstream source')}<p class="data-note">Published metadata. Runtime availability and response content have not been verified.</p></div></details>`).join('') :
      '<div class="empty-state"><h3>No matching entries</h3><p>Try a broader search or clear the filters.</p><button class="btn" data-mcp-reset>Clear filters</button></div>';
    window.NestResearchUI.update(root, 'mcp-catalog', 'Entries', state, all.length);
    root.querySelector('[data-mcp-reset]').disabled = !state.search && state.family === 'all' && state.kind === 'all';
  }
  function inspector(node) {
    if (!node) return '<p class="muted">Select a project to inspect its source coverage.</p>';
    const record = node.record, project = record?.project;
    const related = node.slugs.filter(slug => slug !== node.protocol.slug);
    const reads = node.reads || ['Project profile, status and funding', 'Published repositories and audit references', 'Source-reported contracts where supplied'];
    return `<div class="mcp-inspector-title">${U.logo(node.integration ? node.name : node.protocol.name)}<div><h3>${e(node.name)}</h3><span>${e(node.type)}</span></div></div>
      <div class="mcp-node-status"><span class="mcp-status-dot ${node.integration ? 'mcp-status-target' : ''}"></span>${node.integration ? 'Integration target' : 'Research coverage'}${project?.status ? `<span>· ${e(project.status)}</span>` : ''}</div>
      ${project?.shortDescription ? `<p class="mcp-project-summary">${e(project.shortDescription.split(/(?<=\.)\s/)[0])}</p>` : ''}
      <div class="mcp-evidence-counts"><span><strong>${record?.audits?.length || 0}</strong>audit refs</span><span><strong>${record?.repos?.length || 0}</strong>repos</span><span><strong>${record?.contracts?.length || 0}</strong>contracts</span></div>
      <details class="mcp-readable-context"><summary>Readable context · ${reads.length} groups</summary><ul class="mcp-reads">${reads.map(read => `<li>${e(read)}</li>`).join('')}</ul></details>
      ${project?.scfAwarded ? `<p class="mcp-funding">SCF funding · ${project.scfTotalAwardedUSD == null ? 'amount undisclosed' : '$' + Number(project.scfTotalAwardedUSD).toLocaleString('en-US')}<small>Project record · ${e(date(project.scfAsOf))}</small></p>` : ''}
      <a class="btn btn-primary full-width" href="${profileUrl(node.protocol.slug)}">Open protocol research ↗</a>
      ${related.length ? `<details class="mcp-related"><summary>${related.length} related protocol ${related.length === 1 ? 'record' : 'records'}</summary>${related.map(slug => `<a href="${profileUrl(slug)}">${e(protocols.find(p => p.slug === slug)?.name || slug)} ↗</a>`).join('')}</details>` : ''}
      <p class="data-note">Scout · ${e(date(record?.observed_at))}. Project evidence may span several products. ${node.integration ? 'Adapter execution remains unverified.' : 'Research coverage does not imply a Nest adapter.'}</p>`;
  }
  function renderMap(root) {
    const query = mapState.search.toLowerCase().trim();
    const rows = nodes.filter(n => (mapState.scope === 'all' || (mapState.scope === 'integrations' ? n.integration : !n.integration)) &&
      [n.name, n.type, n.assets, n.record?.project?.shortDescription, n.slugs.join(' '), n.reads?.join(' ')].join(' ').toLowerCase().includes(query));
    if (!rows.some(n => n.id === mapState.selected)) mapState.selected = rows[0]?.id;
    root.querySelector('#mcp-map-count').textContent = `${rows.length} of ${nodes.length} projects`;
    root.querySelector('#mcp-map-grid').innerHTML = rows.length ? ['Spot', 'Lending', 'Vaults & yield', 'Infrastructure'].map(group => {
      const list = rows.filter(n => n.group === group); if (!list.length) return '';
      const expanded = mapState.expanded.has(group) || !!query || mapState.scope !== 'all';
      const shown = expanded ? list : list.slice(0, 4);
      return `<section class="mcp-map-group"><h3>${group}<span>${list.length}</span></h3>${shown.map(node => `<button class="mcp-map-node ${node.id === mapState.selected ? 'selected' : ''}" type="button" data-mcp-node="${e(node.id)}" aria-pressed="${node.id === mapState.selected}">
        ${U.logo(node.integration ? node.name : node.protocol.name)}<span><strong>${e(node.name)}</strong><small>${e(node.type)}</small></span><i class="mcp-status-dot ${node.integration ? 'mcp-status-target' : ''}" aria-label="${node.integration ? 'Integration target' : 'Research only'}"></i></button>`).join('')}
        ${list.length > 4 && !query && mapState.scope === 'all' ? `<button class="mcp-map-more" type="button" data-mcp-expand="${group}" aria-expanded="${expanded}">${expanded ? 'Show less ↑' : `+ ${list.length - 4} more projects ↓`}</button>` : ''}</section>`;
    }).join('') : '<div class="empty-state"><h3>No matching projects</h3><p>Try a different project, asset, or scope.</p><button class="btn" data-mcp-map-reset>Reset map</button></div>';
    root.querySelector('#mcp-venue-inspector').innerHTML = inspector(rows.find(n => n.id === mapState.selected));
    root.querySelector('[data-mcp-map-reset]').disabled = !mapState.search && mapState.scope === 'all';
  }
  window.NestScreens['research-mcp'] = () => `<section class="mcp-screen">
    ${window.NestResearchTabs('research-mcp')}
    <div class="page-head"><div><span class="eyebrow">Research / Sources & coverage</span><h1>MCP Contents</h1><p>Explore the ecosystem, then inspect the tools and sources behind the research.</p></div>
      <a class="btn" href="#research-mcp" data-mcp-jump>Browse ${catalog.entries.length} catalog entries ↓</a></div>
    <section class="panel mcp-map-section" aria-labelledby="mcp-map-heading">
      <div class="mcp-section-heading"><div><span class="eyebrow">01 / Ecosystem coverage</span><h2 id="mcp-map-heading">Venue map <span id="mcp-map-count"></span></h2></div>
        <div class="mcp-legend"><span><i class="mcp-status-dot mcp-status-target"></i>Integration target</span><span><i class="mcp-status-dot"></i>Research only</span></div></div>
      <div class="mcp-map-toolbar"><input class="input" type="search" id="mcp-map-search" aria-label="Search venue map" placeholder="Search project, asset or capability…" value="${e(mapState.search)}">
        <select class="input" id="mcp-map-scope" aria-label="Venue map scope"><option value="all">All projects</option><option value="integrations">Integration targets</option><option value="research">Research only</option></select><button class="btn btn-ghost" data-mcp-map-reset>Reset</button></div>
      <div class="mcp-map-layout"><div class="mcp-network"><div class="mcp-network-trunk"><span>Raven / Scout</span><span aria-hidden="true">→</span><strong>Stellar ecosystem</strong><span class="data-note">Project relationships & evidence</span></div><div class="mcp-map-grid" id="mcp-map-grid"></div></div>
        <aside class="mcp-venue-inspector" id="mcp-venue-inspector" aria-label="Selected project" aria-live="polite"></aside></div>
      <p class="mcp-source-note">Scout public-source snapshot · 25 Oct 2026. Versions are grouped by project. Project status and integration readiness are separate facts.</p>
    </section>
    <section class="mcp-catalog-section" aria-labelledby="mcp-catalog-heading">
      <div class="mcp-section-heading" id="mcp-catalog-heading" tabindex="-1"><div><span class="eyebrow">02 / Published Raven catalog</span><h2>Tools & playbooks <span id="mcp-entry-count"></span></h2></div>
        <button class="btn btn-ghost" data-export-catalog>Export snapshot ↗</button></div>
      <div class="mcp-family-filters" aria-label="Filter by source family">${Object.entries(families).map(([id, family]) => `<button type="button" data-mcp-family="${id}" aria-pressed="${state.family === id}"><span class="mcp-family-icon" aria-hidden="true">${family.icon}</span><span><strong>${family.name}</strong><small>${family.label}</small></span><b>${catalog.entries.filter(x => x.family === id).length}</b></button>`).join('')}</div>
      <div class="mcp-catalog-toolbar"><input class="input" type="search" id="mcp-search" aria-label="Search MCP contents" placeholder="Search operations, skills, parameters or sections…" value="${e(state.search)}">
        <select class="input" id="mcp-kind" aria-label="Catalog entry type"><option value="all">Operations & skills</option><option value="operation">Operations</option><option value="skill">Skills</option></select><button class="btn btn-ghost" data-mcp-reset>Clear filters</button></div>
      <div class="mcp-entries panel" id="mcp-entries"></div>${window.NestResearchUI.footer('mcp-catalog', 'Catalog')}
      <details class="mcp-provenance"><summary>Snapshot provenance & coverage <span>60 operations · 20 skills · 202 section identifiers</span></summary><p>Raven catalog published ${e(date(catalog.generatedAt))}; retrieved ${e(date(catalog.capturedAt))}. Tool schemas and skill section identifiers are bundled; live responses and full section content are not. MCP runtime connection is unverified.</p>${sourceLink(catalog.source, 'Pinned Raven manifest')}</details>
    </section></section>`;
  window.NestBinders['research-mcp'] = root => {
    root.querySelector('#mcp-map-scope').value = mapState.scope;
    root.querySelector('#mcp-kind').value = state.kind;
    renderMap(root); renderCatalog(root);
    window.NestResearchUI.bind(root, 'mcp-catalog', state, renderCatalog, '#mcp-catalog-heading');
    root.querySelector('#mcp-map-search').oninput = ev => { mapState.search = ev.target.value; renderMap(root); };
    root.querySelector('#mcp-map-scope').onchange = ev => { mapState.scope = ev.target.value; renderMap(root); };
    root.querySelector('#mcp-search').oninput = ev => { state.search = ev.target.value; state.page = 1; renderCatalog(root); };
    root.querySelector('#mcp-kind').onchange = ev => { state.kind = ev.target.value; state.page = 1; renderCatalog(root); };
    root.addEventListener('click', ev => {
      const node = ev.target.closest('[data-mcp-node]'), family = ev.target.closest('[data-mcp-family]'), expand = ev.target.closest('[data-mcp-expand]');
      if (node) { mapState.selected = node.dataset.mcpNode; renderMap(root); root.querySelector(`[data-mcp-node="${mapState.selected}"]`)?.focus({ preventScroll: true }); }
      if (expand) { const group = expand.dataset.mcpExpand; if (mapState.expanded.has(group)) { mapState.expanded.delete(group); const list = nodes.filter(n => n.group === group); if (list.findIndex(n => n.id === mapState.selected) >= 4) mapState.selected = list[0].id; } else mapState.expanded.add(group); renderMap(root); root.querySelector(`[data-mcp-expand="${group}"]`)?.focus({ preventScroll: true }); }
      if (family) { state.family = state.family === family.dataset.mcpFamily ? 'all' : family.dataset.mcpFamily; state.page = 1; renderCatalog(root); }
      if (ev.target.closest('[data-mcp-reset]')) { Object.assign(state, { search: '', family: 'all', kind: 'all', page: 1 }); root.querySelector('#mcp-search').value = ''; root.querySelector('#mcp-kind').value = 'all'; renderCatalog(root); }
      if (ev.target.closest('[data-mcp-map-reset]')) { Object.assign(mapState, { search: '', scope: 'all' }); root.querySelector('#mcp-map-search').value = ''; root.querySelector('#mcp-map-scope').value = 'all'; renderMap(root); }
      if (ev.target.closest('[data-mcp-jump]')) { ev.preventDefault(); root.querySelector('#mcp-catalog-heading').scrollIntoView({ block: 'start', behavior: 'smooth' }); root.querySelector('#mcp-catalog-heading').focus({ preventScroll: true }); }
      if (ev.target.closest('[data-export-catalog]')) U.download('nest-raven-catalog-snapshot.json', JSON.stringify(catalog, null, 2), 'application/json');
    });
  };
})();
