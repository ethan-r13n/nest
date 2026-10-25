/* Protocol research: dated DeFiLlama observations and Raven's public Scout source. */
(() => {
  'use strict';
  const U = window.NestUI;
  const e = value => U.escape(value);
  const money = value => value == null ? '—' : '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const rate = value => value == null ? '—' : Number(value).toLocaleString('en-US', {
    maximumFractionDigits: value !== 0 && Math.abs(value) < .01 ? 5 : 2,
  }) + '%';
  const date = value => {
    const d = new Date(value);
    return value && Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }) : 'Not supplied';
  };
  const observed = value => {
    const d = new Date(value);
    return value && Number.isFinite(d.getTime()) ? date(value) + ' · ' + d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC' : 'Observation time unavailable';
  };
  const safeUrl = value => {
    try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
    catch { return ''; }
  };
  const external = (url, label, cls = '') => safeUrl(url)
    ? `<a class="${e(cls)}" href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : e(label);
  const facts = (rows, cls = '') => `<dl class="details-list ${cls}">${rows.map(([key, value]) =>
    `<div><dt>${e(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  const panel = (title, body, action = '', cls = '') => `<section class="panel ${cls}">
    <div class="panel-head"><h2>${e(title)}</h2>${action}</div><div class="panel-body">${body}</div></section>`;

  function yieldPanel(protocol, pools) {
    if (!pools.length) return '';
    const query = new URLSearchParams({ protocol: protocol.name, chain: 'Stellar' });
    const source = 'https://defillama.com/yields?' + query;
    const poolLink = pool => external('https://defillama.com/yields/pool/' + encodeURIComponent(pool.pool_id), pool.symbol);
    const rows = pools.map(pool => `<tr>
      <td><strong>${poolLink(pool)}</strong><small>${e(pool.pool_meta || protocol.name)}</small></td>
      <td>${money(pool.tvl_usd)}</td><td>${rate(pool.total_apy_pct)}</td>
      <td>${rate(pool.base_apy_pct)}</td>
      <td>${rate(pool.apy_mean_30d_pct)}</td></tr>`).join('');
    return `<section class="panel p-yields" id="protocol-yields" aria-labelledby="protocol-yields-title">
      <div class="panel-head"><div><span class="eyebrow">Stellar · ${pools.length} source pools</span>
      <h2 id="protocol-yields-title">Yield opportunities</h2></div>${external(source, 'DeFiLlama yields', 'p-source-link')}</div>
      <div class="table-wrap"><table class="data-table p-yield-table"><caption class="sr-only">${e(protocol.name)} Stellar yield pools, observed ${e(observed(pools[0].observed_at))}</caption>
      <thead><tr><th scope="col">Asset / pool</th><th scope="col">Pool TVL</th><th scope="col">APY</th>
      <th scope="col">Base APY</th><th scope="col">30d mean APY</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="p-panel-note"><p>DeFiLlama snapshot · ${e(observed(pools[0].observed_at))}. Rates are variable; — means not reported.</p>
      <p>These are source-reported yields. Pool TVL does not establish available deposit or withdrawal capacity.</p></div></section>`;
  }

  function overview(protocol, pools) {
    const rows = [
      ['Networks', e(protocol.protocol_chains.join(' · ') || 'Not supplied')],
      ['1d change · protocol-wide', rate(protocol.protocol_change_pct?.['1d'])],
      ['7d change · protocol-wide', rate(protocol.protocol_change_pct?.['7d'])],
    ];
    const borrowed = protocol.stellar_tvl_components_usd?.['Stellar-borrowed'];
    if (borrowed != null) rows.push(['Stellar borrowed value', money(borrowed)]);
    if (protocol.symbol && protocol.symbol !== '-') rows.push(['Protocol token', e(protocol.symbol)]);
    if (protocol.listed_at_unix) rows.push(['Listed on DeFiLlama', date(protocol.listed_at_unix * 1000)]);
    if (!pools.length) rows.push(['Yield coverage', 'No matching Stellar pools in the captured yield feed.']);
    return panel('Protocol overview', facts(rows, 'p-overview-facts') +
      '<p class="data-note mt-24">Percentage changes cover the protocol across all chains. Values retain their source definitions.</p>',
    external('https://defillama.com/protocol/' + encodeURIComponent(protocol.slug), 'DeFiLlama protocol', 'p-source-link'));
  }

  function ravenPanel(record) {
    const sourceNote = '<p class="data-note p-source-note">Scout is a Raven source family. This snapshot was read from Scout’s public API; Raven MCP is not connected.</p>';
    if (!record?.project) return panel('Raven research', `<p class="muted">${record?.status === 'unavailable'
      ? 'Scout could not be read for this protocol.'
      : 'No verified project match in the retrieved Scout results. The available DeFiLlama facts are shown above.'}</p>` +
      (record ? external(record.source_url, 'Scout lookup', 'p-source-link') : '') + sourceNote);
    const project = record.project;
    const rows = [];
    if (project.status) rows.push(['Project status', external(project.statusSourceUrl, project.status) +
      `<small>As of ${e(date(project.statusAsOf))}</small>`]);
    if (project.builtBy?.name) rows.push(['Built by', e(project.builtBy.name)]);
    if (project.types?.length) rows.push(['Project focus', e(project.types.join(' · '))]);
    if (project.scfAwarded === true) rows.push(['SCF funding · project', external(project.scfSourceUrl,
      project.scfTotalAwardedUSD == null ? 'Award reported · amount not disclosed' : money(project.scfTotalAwardedUSD)) +
      `<small>Source record · ${e(date(project.scfAsOf))}</small>`]);
    const scope = record.scope === 'project_family'
      ? `<p class="data-note p-scope">Project context: ${e(project.name)}. These references can cover other versions or products in the same project.</p>` : '';
    const links = Object.entries(project.links || {}).filter(([key, url]) => key !== 'website' && safeUrl(url))
      .map(([key, url]) => external(url, ({ github: 'GitHub', twitter: 'X', discord: 'Discord', docs: 'Documentation' })[key] || key));
    const audits = record.audits || [];
    const repos = record.repos || [];
    const contracts = (record.contracts || []).filter(c => /^[C][A-Z2-7]{55}$/.test(c.address));
    const auditSection = audits.length ? `<details class="p-references"><summary>Project audit references <span>${audits.length}</span></summary>
      <ul>${audits.map(a => `<li>${external(a.reportUrl, a.title)}<small>${e(a.auditor || 'Auditor not supplied')} · Portal date ${e(date(a.publishedAt))}</small></li>`).join('')}</ul>
      <p class="data-note">Project-level registry entries; check the audited code and version. A report listing is not a safety rating.</p></details>` : '';
    const repoSection = repos.length ? `<details class="p-references"><summary>Repositories <span>${repos.length}</span></summary><ul>${repos.map(r =>
      `<li>${external(r.url, r.fullName)}<small>${e(r.primaryLanguage || 'Language not supplied')} · Last commit ${e(date(r.lastCommitAt))}</small></li>`).join('')}</ul></details>` : '';
    const contractSection = contracts.length ? `<details class="p-references"><summary>Source-reported contracts <span>${contracts.length}</span></summary>
      <p class="data-note">Project-level references · ${e(date(record.contracts_as_of))}. Verify network and deployment before use.</p><ul>${contracts.map(c =>
      `<li>${external('https://stellar.expert/explorer/public/contract/' + c.address, c.label || 'Contract')}<small class="mono">${e(c.address)}</small></li>`).join('')}</ul></details>` : '';
    return panel('Raven research', `<div class="p-context-heading"><span class="eyebrow">Scout / ${e(project.name)}</span>
      <span class="data-note">${e(date(record.observed_at))} snapshot</span></div>${scope}
      ${project.shortDescription ? `<p class="p-project-summary">${e(project.shortDescription)}</p>` : ''}
      ${facts(rows, 'p-overview-facts')}${project.statusCaveat ? `<p class="data-note mt-24">${e(project.statusCaveat)}</p>` : ''}
      ${links.length ? `<div class="p-project-links">${links.join('')}</div>` : ''}
      ${auditSection}${repoSection}${contractSection}${sourceNote}`,
    external(project.url || record.source_url, 'Scout project', 'p-source-link'));
  }

  function marketsPanel(protocol) {
    const venue = window.NestVenueForProtocol?.(protocol.slug);
    if (!venue) return '';
    const related = venue.id === 'upshift' ? ['gami-labs', 'stellar-defi-hub'] : venue.id === 'gami' || venue.id === 'sentora' ? ['upshift'] : [];
    const lending = venue.category === 'Lending', spot = venue.category === 'Spot';
    const actions = spot
      ? '<a class="btn" href="#trade">Compare swap routes ↗</a>'
      : lending ? '<a class="btn" href="#supply">Compare supply ↗</a><a class="btn" href="#borrow">Compare borrowing ↗</a>'
      : '<a class="btn" href="#vaults">Compare vault products ↗</a>';
    const role = venue.id === 'gami' ? 'Curator · products accessed through Upshift' : venue.id === 'sentora'
      ? 'Product / campaign · confirm the canonical deployment' : venue.id === 'upshift'
      ? 'Platform · curators and underlying venues are separate roles' : venue.type;
    return panel('Markets & capabilities', `<div class="p-market-intro"><strong>${e(venue.assets)}</strong>${U.badge('Adapter verification pending', 'warning')}</div>
      <dl class="p-market-facts"><div><dt>Product role</dt><dd>${e(role)}</dd></div>
      <div><dt>Actions in the integration design</dt><dd>${e(venue.actions.join(' · '))}</dd></div>
      <div><dt>${spot ? 'Quotes & routes' : 'Rates & capacity'}</dt><dd>Fresh, amount-specific adapter reads required.</dd></div>
      <div><dt>State source</dt><dd>${e(venue.source)}</dd></div>
      <div><dt>Network & identity</dt><dd>Stellar Mainnet · verify deployment, asset issuer and contract before use. Testnet is a separate scope.</dd></div>
      <div><dt>Withdrawal & settlement</dt><dd>${e(venue.exit)}</dd></div></dl>
      <details class="p-market-reads"><summary>What Nest can inspect · ${venue.reads.length} read groups</summary><ul>${venue.reads.map(read => `<li>${e(read)}</li>`).join('')}</ul></details>
      ${related.length ? `<div class="p-market-related"><span>Related roles</span>${related.map(slug => `<a href="#protocol-detail?slug=${slug}">${e(window.NestResearchSnapshot.protocols.find(p => p.slug === slug)?.name || slug)} ↗</a>`).join('')}</div>` : ''}
      <div class="p-market-actions">${actions}<a class="btn btn-ghost" href="#chat?context=${venue.id}">Discuss in chat ↗</a></div>
      <p class="data-note" style="margin:12px 0 0">Integration design metadata applies to verified markets only. Curator, platform and underlying exposure are not additive positions. Current rates, liquidity and native risk remain unverified.</p>`, '', 'p-protocol-markets');
  }

  window.NestScreens['protocol-detail'] = () => {
    const data = window.NestResearchSnapshot;
    const slug = new URLSearchParams(location.hash.split('?')[1] || '').get('slug') || 'blend-pools-v2';
    const protocol = data.protocols.find(p => p.slug === slug);
    if (!protocol) return `<div class="empty-state"><h1>Protocol unavailable</h1><p>This protocol is not in the captured dataset.</p><a class="btn" href="#research-defi">All protocols</a></div>`;
    const pools = (window.NestProtocolYields?.pools || []).filter(pool => pool.chain === 'Stellar' && pool.project === protocol.slug);
    const record = window.NestProtocolContext?.records[protocol.slug];
    const protocolSource = 'https://defillama.com/protocol/' + encodeURIComponent(protocol.slug);
    const controls = facts([
      ['Network', 'Stellar'],
      ['Audit evidence', protocol.audit_links?.length ? protocol.audit_links.map((url, i) => external(url, 'Source audit' + (protocol.audit_links.length > 1 ? ' ' + (i + 1) : ''))).join('<br>') : 'No report in this snapshot'],
      ['Admin / upgrades', 'Not captured'],
      ['Oracle / liquidations', 'Not captured'],
      ['Observed', e(observed(protocol.observed_at))],
    ], 'p-compact-facts');
    const opportunityTarget = pools.length ? '#protocol-yields' : '#vaults';
    return `${window.NestResearchTabs?.('research-defi') || ''}<div class="page-head"><div><span class="eyebrow"><a href="#research-defi">Research / DeFi</a> / Protocol</span>
      <h1>${U.logo?.(protocol.name) || ''} ${e(protocol.name)}</h1><p>${e(protocol.description || 'Protocol description unavailable in the captured source.')}</p></div>
      <div class="page-head-actions"><a class="btn" href="#research-defi">← All protocols</a><button class="btn" data-bookmark="${e(protocol.name)}">Save protocol</button></div></div>
      <div class="c-detail-grid p-protocol-layout"><div class="stack">
      <div class="panel metric-grid">${U.stat('Stellar TVL', money(protocol.stellar_tvl_usd), 'Observed · ' + date(protocol.observed_at))}
      ${protocol.protocol_chains.length > 1 ? U.stat('Protocol-wide TVL', money(protocol.protocol_tvl_all_chains_usd), protocol.protocol_chains.length + ' chains · distinct scope') : U.stat('Stellar yield pools', String(pools.length), 'Exact protocol matches in the captured feed')}
      ${U.stat('Category', e(protocol.category), 'Source classification')}</div>
      ${yieldPanel(protocol, pools)}${marketsPanel(protocol)}${overview(protocol, pools)}${ravenPanel(record)}</div>
      <aside class="stack p-protocol-sidebar" aria-label="Protocol references">
      ${panel('Explore this protocol', `<div class="c-identity">${U.logo?.(protocol.name) || ''}<div><b>${e(protocol.name)}</b><small>${e(protocol.category)}</small></div></div>
        <p class="muted mt-24">Explore source-reported opportunities and the protocol’s own website.</p>
        <div class="p-protocol-actions"><a class="btn btn-primary" href="${opportunityTarget}" ${pools.length ? 'data-protocol-opportunities' : ''}>View opportunities</a>
        ${external(protocol.url || protocolSource, 'Protocol website', 'btn')}</div>`)}
      ${panel('Source boundaries', `<p class="muted">TVL, yield pools and project context retain their own scope and observation dates. Research data does not establish executable capacity.</p>
        <div class="p-source-links">${external(protocolSource, 'DeFiLlama protocol')}${record?.project ? external(record.project.url, 'Scout project context') : ''}</div>`)}
      ${panel('Dependencies & controls', controls, '', 'p-controls')}
      </aside></div>`;
  };
  window.NestBinders['protocol-detail'] = root => {
    root.querySelector('[data-protocol-opportunities]')?.addEventListener('click', event => {
      // Keep the protocol hash route; only scroll within the current screen.
      event.preventDefault();
      root.querySelector('#protocol-yields')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
})();
