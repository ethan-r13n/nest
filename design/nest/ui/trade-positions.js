(function () {
  const scale = 10000000n;
  const units = value => {
    if (!/^\d+(?:\.\d{1,7})?$/.test(value)) throw new Error('Expected nonnegative decimal with at most seven places');
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * scale + BigInt(fraction.padEnd(7, '0'));
  };
  const fixed = (numerator, denominator, places = 2) => {
    const negative = numerator < 0n, abs = negative ? -numerator : numerator, factor = 10n ** BigInt(places);
    const rounded = (abs * factor + denominator / 2n) / denominator;
    return (negative ? '-' : '') + (rounded / factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (places ? '.' + (rounded % factor).toString().padStart(places, '0') : '');
  };
  const position = { id: 'sample-xlm-spot', quantity: '2500.0000000', entry: '0.1600000', mark: '0.1742800' };
  function values(p = position) {
    const q = units(p.quantity), mark = units(p.mark), entry = p.entry === null ? null : units(p.entry);
    const delta = entry === null ? null : q * (mark - entry);
    return { quantity: fixed(q, scale), notional: fixed(q * mark, scale * scale),
      pnl: delta === null ? null : (delta >= 0n ? '+' : '−') + '$' + fixed(delta < 0n ? -delta : delta, scale * scale),
      percent: entry === null || entry === 0n ? null : (mark >= entry ? '+' : '') + fixed((mark - entry) * 100n, entry),
      tone: entry === null ? 'muted' : mark >= entry ? 'positive' : 'negative' };
  }
  function render(state = 'sample') {
    if (state === 'disconnected') return `<div class="empty-state"><strong>See your positions here.</strong><p class="muted">Connect your verified wallet in the real app to load balances and trade history.</p><button class="btn" data-open="wallet">Connect wallet</button></div>`;
    const p = { ...position, entry: state === 'unknown' ? null : position.entry }, v = values(p);
    return `<div class="nest-position-summary"><span>Spot holdings <b>$${v.notional}</b></span><span>Unrealized P&amp;L <b class="${v.tone}">${v.pnl || 'Unavailable'}</b></span><span class="subtle">Sample account · USD estimate</span></div>
      <div class="table-wrap" tabindex="0" aria-label="My spot positions. Scroll horizontally for all columns."><table class="mkt-small-table nest-position-table"><thead><tr><th>Asset / market</th><th>Quantity</th><th>USD notional</th><th>Avg. entry</th><th>Mark</th><th>Unrealized P&amp;L</th><th>Action</th></tr></thead><tbody><tr><td><div class="nest-position-asset">${window.NestUI.logo('Stellar')}<span><b>XLM / USDC</b><small>Spot · Stellar</small></span></div></td><td class="mono">${v.quantity} XLM</td><td class="mono">$${v.notional}</td><td class="mono">${p.entry ? '0.16000 USDC' : 'Unavailable'}</td><td class="mono">0.17428 USDC</td><td><strong class="mono ${v.tone}">${v.pnl || 'Unavailable'}</strong><small class="${v.tone}">${v.percent === null ? 'Cost basis missing' : v.percent + '%'}</small></td><td><button class="btn btn-sm" type="button" data-close-spot>Close position ↗</button></td></tr></tbody></table></div>
      <p class="nest-position-note">Illustrative account and prices. P&amp;L excludes fees and uses USDC = $1 for this fixture. Missing cost basis stays unavailable. Closing reviews a sale of the full XLM quantity; the holding changes only after a confirmed receipt.</p>`;
  }
  function mount(root) {
    const activity = root.querySelector('[data-activity-content]');
    const renderActivity = key => {
      root.querySelector('[data-position-state-label]').hidden = key !== 'positions';
      activity.innerHTML = key === 'positions' ? render(root.querySelector('[data-position-state]').value)
        : key === 'history' ? '<div class="table-wrap"><table class="mkt-small-table"><thead><tr><th>Illustrative action</th><th>Amount</th><th>State</th><th>Evidence</th></tr></thead><tbody><tr><td>XLM → USDC</td><td class="mono">500.00 XLM</td><td>Confirmed fixture</td><td>No real receipt</td></tr></tbody></table></div>'
        : '<div class="empty-state"><strong>No pending fixture workflows.</strong><p class="muted">Submitted, reconciling, partial and confirmed states remain distinct.</p></div>';
      window.NestUI.hydrateLogos?.(activity);
    };
    root.querySelectorAll('[data-activity]').forEach(button => button.addEventListener('click', () => {
      root.querySelectorAll('[data-activity]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      renderActivity(button.dataset.activity);
    }));
    root.querySelector('[data-position-state]').addEventListener('change', () => renderActivity('positions'));
    activity.addEventListener('click', event => {
      const button = event.target.closest('[data-close-spot]');
      if (!button) return;
      const expected = units(position.quantity) * units('0.1740200');
      Object.assign(button.dataset, { title: 'Close XLM spot position', venue: 'Soroswap · sample route', amount: position.quantity + ' XLM',
        inputAsset: 'XLM', outputAsset: 'USDC', expectedOutput: fixed(expected, scale * scale, 5) + ' USDC',
        minimumReceived: fixed(expected * 995n, scale * scale * 1000n, 5) + ' USDC' });
      window.openReview('trade', button);
    });
    renderActivity('positions');
  }
  window.NestTradePositions = { mount, values, units, fixed };
})();
