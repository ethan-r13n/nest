(function () {
  const periods = { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };
  const end = Date.parse('2026-10-25T14:30:00Z') / 1000;
  let cleanup = () => {};

  function fixture(interval) {
    const step = periods[interval] || periods['1H'];
    let seed = 7241 + step, previous = 1630000;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rows = Array.from({ length: 120 }, (_, i) => {
      const open = previous, close = Math.max(1300000, open + Math.round((random() - .46) * 18000));
      previous = close;
      return { time: Math.floor(end / step) * step - (119 - i) * step, open, close,
        high: Math.max(open, close) + Math.round(2000 + random() * 11000),
        low: Math.min(open, close) - Math.round(2000 + random() * 11000),
        volume: Math.round(20000 + random() * 160000) };
    });
    const offset = 1742800 - rows[119].close;
    return rows.map(row => ({ ...row, open: row.open + offset, high: row.high + offset,
      low: row.low + offset, close: row.close + offset }));
  }

  const price = value => (value / 1e7).toFixed(5);
  function mount(root) {
    cleanup();
    const host = root.querySelector('[data-trade-chart]');
    if (!host) return;
    host.innerHTML = `<div class="nest-candle-readout" data-candle-readout></div>
      <div class="nest-candle-stage" tabindex="0" role="group" aria-label="XLM USDC candlestick chart. Use left and right arrows to inspect candles, plus and minus to zoom." data-candle-stage></div>
      <div class="nest-candle-controls"><span>OHLC · volume · UTC</span><div role="group" aria-label="Chart navigation"><button type="button" data-chart-action="older" aria-label="Earlier candles">←</button><button type="button" data-chart-action="newer" aria-label="Later candles">→</button><button type="button" data-chart-action="out" aria-label="Zoom out">−</button><button type="button" data-chart-action="in" aria-label="Zoom in">+</button><button type="button" data-chart-action="reset">Fit</button></div></div><span class="sr-only" role="status" data-candle-announcement></span>`;
    const stage = host.querySelector('[data-candle-stage]'), readout = host.querySelector('[data-candle-readout]');
    let interval = '1H', rows = fixture(interval), count = 72, last = rows.length, selected = last - 1, metrics;
    const stamp = row => new Date(row.time * 1000).toLocaleString('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    function inspect(announce = false) {
      const row = rows[selected];
      readout.innerHTML = `<span>${stamp(row)}</span><span>O <b>${price(row.open)}</b></span><span>H <b>${price(row.high)}</b></span><span>L <b>${price(row.low)}</b></span><span>C <b class="${row.close >= row.open ? 'positive' : 'negative'}">${price(row.close)}</b></span><span>Vol <b>${row.volume.toLocaleString('en-US')} XLM</b></span>`;
      const line = stage.querySelector('[data-crosshair]');
      if (line && metrics) {
        const x = metrics.left + (selected - metrics.first + .5) * metrics.cell;
        const y = metrics.y(row.close);
        line.innerHTML = `<path d="M${x} 12V${metrics.height - 28}M${metrics.left} ${y}H${metrics.width - 64}"/><circle cx="${x}" cy="${y}" r="3"/>`;
      }
      if (announce) host.querySelector('[data-candle-announcement]').textContent = `${stamp(row)} UTC. Open ${price(row.open)}, high ${price(row.high)}, low ${price(row.low)}, close ${price(row.close)} USDC. Volume ${row.volume} XLM.`;
    }
    function draw() {
      const width = Math.max(260, Math.round(stage.getBoundingClientRect().width)), height = 360, left = 8, right = 64;
      const visibleCount = Math.min(count, width < 480 ? 42 : count), first = Math.max(0, last - visibleCount), visible = rows.slice(first, last);
      selected = Math.max(first, Math.min(last - 1, selected));
      const low = Math.min(...visible.map(r => r.low)), high = Math.max(...visible.map(r => r.high)), pad = (high - low) * .12;
      const y = value => 18 + (high + pad - value) / (high - low + pad * 2) * 248;
      const cell = (width - left - right) / visible.length, body = Math.max(1, Math.min(9, cell * .65));
      const maxVolume = Math.max(...visible.map(r => r.volume));
      metrics = { width, height, left, cell, first, y };
      const grid = Array.from({ length: 5 }, (_, i) => {
        const value = high + pad - (high - low + pad * 2) * i / 4, top = y(value);
        return `<path class="nc-grid" d="M${left} ${top}H${width - right}"/><text x="${width - right + 8}" y="${top + 4}">${price(value)}</text>`;
      }).join('');
      const candles = visible.map((r, i) => {
        const x = left + (i + .5) * cell, tone = r.close >= r.open ? 'nc-up' : 'nc-down';
        return `<g class="${tone}" data-candle><path d="M${x} ${y(r.high)}V${y(r.low)}"/><rect x="${x - body / 2}" y="${Math.min(y(r.open), y(r.close))}" width="${body}" height="${Math.max(1, Math.abs(y(r.open) - y(r.close)))}"/><rect class="nc-volume" x="${x - body / 2}" y="${322 - r.volume / maxVolume * 44}" width="${body}" height="${r.volume / maxVolume * 44}"/></g>`;
      }).join('');
      const labels = [0, Math.floor((visible.length - 1) / 2), visible.length - 1].map((i, n) => `<text x="${left + (i + .5) * cell}" y="348" text-anchor="${n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}">${stamp(visible[i])}</text>`).join('');
      const current = y(rows[rows.length - 1].close);
      stage.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${candles}<path class="nc-last" d="M${left} ${current}H${width - right}"/><rect class="nc-price-tag" x="${width - right}" y="${current - 10}" width="64" height="20"/><text class="nc-price-text" x="${width - right + 6}" y="${current + 4}">0.17428</text><g data-crosshair class="nc-crosshair"></g>${labels}</svg>`;
      host.querySelector('[data-chart-action=older]').disabled = last <= visibleCount;
      host.querySelector('[data-chart-action=newer]').disabled = last >= rows.length;
      host.querySelector('[data-chart-action=in]').disabled = count <= 24;
      host.querySelector('[data-chart-action=out]').disabled = count >= 120;
      inspect();
    }
    function action(key) {
      if (key === 'in') count = Math.max(24, count - 12);
      if (key === 'out') count = Math.min(120, count + 12);
      if (key === 'older') last = Math.max(Math.min(count, 42), last - 12);
      if (key === 'newer') last = Math.min(rows.length, last + 12);
      if (key === 'reset') { count = 72; last = rows.length; }
      selected = last - 1; draw();
    }
    const pointer = event => {
      selected = Math.max(metrics.first, Math.min(last - 1, metrics.first + Math.floor((event.clientX - stage.getBoundingClientRect().left - metrics.left) / metrics.cell)));
      inspect();
    };
    const keys = event => {
      if (['ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '+' || event.key === '=') action('in');
        else if (event.key === '-') action('out');
        else { selected = Math.max(metrics.first, Math.min(last - 1, selected + (event.key === 'ArrowLeft' ? -1 : 1))); inspect(true); }
      }
    };
    host.querySelectorAll('[data-chart-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.chartAction)));
    root.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => {
      interval = button.dataset.time; rows = fixture(interval); last = rows.length; selected = last - 1;
      root.querySelectorAll('[data-time]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      root.querySelector('[data-chart-interval]').textContent = interval + ' candles'; draw();
    }));
    stage.addEventListener('pointermove', pointer); stage.addEventListener('keydown', keys);
    const observer = new ResizeObserver(draw); observer.observe(stage); draw();
    cleanup = () => { observer.disconnect(); stage.removeEventListener('pointermove', pointer); stage.removeEventListener('keydown', keys); cleanup = () => {}; };
  }
  window.NestTradeChart = { mount, dispose: () => cleanup(), fixture };
})();
