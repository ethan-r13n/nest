(function () {
  let cleanup = () => {};
  const intervals = ['1m', '5m', '15m', '1H', '4H', '1D'];
  const format = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: Number(value) < .01 ? 8 : Number(value) < 10 ? 5 : 2 });
  const stamp = time => new Date(time * 1000).toLocaleString('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  function normalize(payload, asset, interval) {
    if (payload.asset !== asset || payload.quote !== 'USDC' || payload.interval !== interval || !['line', 'candles'].includes(payload.kind)) throw Error('History does not match this market');
    const seen = new Map(), now = Date.now() / 1000, sampled = payload.kind === 'line';
    for (const row of payload.rows || []) {
      if (!Number.isInteger(row.time) || row.time > now + 60 || row.time <= 0) continue;
      const values = sampled ? [row.value] : [row.open, row.high, row.low, row.close];
      if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) continue;
      if (!sampled && (row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close) || row.volume != null && (!Number.isFinite(row.volume) || row.volume < 0))) continue;
      seen.set(row.time, row);
    }
    let rows = [...seen.values()].sort((a, b) => a.time - b.time);
    if (sampled) {
      const step = { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 }[interval], buckets = new Map();
      for (const point of rows) {
        const time = Math.floor(point.time / step) * step;
        if (!buckets.has(time)) buckets.set(time, { time, open: point.value, high: point.value, low: point.value, close: point.value, samples: 0 });
        const row = buckets.get(time); row.high = Math.max(row.high, point.value); row.low = Math.min(row.low, point.value); row.close = point.value; row.samples++;
      }
      rows = [...buckets.values()];
    }
    if (!rows.length) throw Error('No valid history for this interval');
    return { ...payload, kind: 'candles', candleBasis: sampled ? 'observations' : payload.candleBasis, note: sampled ? 'Sampled-price OHLC. ' + payload.note : payload.note, volumeAvailable: !sampled && payload.volumeAvailable !== false && rows.every(row => Number.isFinite(row.volume)), rows };
  }
  function mount(root, market = { asset: 'XLM', label: 'XLM' }) {
    cleanup();
    const host = root.querySelector('[data-trade-chart]'), L = window.LightweightCharts;
    if (!host) return;
    if (!L) { host.textContent = 'Chart library unavailable. Reload to retry.'; return; }
    const events = new AbortController();
    host.dataset.asset = market.asset; host.dataset.pointCount = '0';
    root.querySelector('[data-market-price]').textContent = '—'; root.querySelector('[data-market-change]').textContent = '—'; root.querySelector('[data-market-source]').textContent = 'Loading…'; root.querySelector('[data-market-volume]').textContent = 'Loading…'; root.querySelector('[data-chart-source]').textContent = 'Loading timestamped market history…';
    let controller, generation = 0, rows = [], series, volume, chartKind, interval = market.asset === 'EUTBL' ? '1D' : '1H', selected, disposed = false, timer, fetching = false;
    host.innerHTML = `<div class="nest-candle-readout" data-candle-readout aria-live="off">Loading ${market.label} / USDC…</div><div class="nest-tv-shell"><div class="nest-tv-stage" data-candle-stage tabindex="0" role="group" aria-label="${market.label} / USDC interactive TradingView chart. Scroll or pinch to zoom, drag to pan. Plus and minus zoom; arrows pan."></div><div class="nest-tv-message" data-chart-message role="status">Loading market history…</div></div><div class="nest-candle-controls"><span data-chart-range>UTC · USDC</span><div role="group" aria-label="Chart navigation"><button type="button" data-chart-action="older" aria-label="Earlier prices">←</button><button type="button" data-chart-action="newer" aria-label="Later prices">→</button><button type="button" data-chart-action="out" aria-label="Zoom out">−</button><button type="button" data-chart-action="in" aria-label="Zoom in">+</button><button type="button" data-chart-action="fit">Fit</button><button type="button" data-chart-action="auto" aria-pressed="true">Auto</button><button type="button" data-chart-action="log" aria-pressed="false">Log</button><button type="button" data-chart-action="retry" aria-label="Refresh chart data">↻</button></div></div><span class="sr-only" role="status" data-candle-announcement></span>`;
    const stage = host.querySelector('[data-candle-stage]'), readout = host.querySelector('[data-candle-readout]'), message = host.querySelector('[data-chart-message]');
    const colors = getComputedStyle(root), theme = name => colors.getPropertyValue(name).trim();
    const chart = L.createChart(stage, {
      width: Math.max(240, stage.clientWidth), height: 390,
      layout: { background: { type: L.ColorType.Solid, color: theme('--bg') || '#0d150c' }, textColor: theme('--dim') || '#9bab91', fontFamily: 'monospace', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: '#84927614' }, horzLines: { color: '#84927620' } },
      rightPriceScale: { autoScale: true, borderColor: '#84927630', minimumWidth: 64 },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4, borderColor: '#84927630' },
      crosshair: { mode: L.CrosshairMode.Normal, vertLine: { labelBackgroundColor: '#253020' }, horzLine: { labelBackgroundColor: '#253020' } },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    const valueOf = row => row.close;
    function inspect(row) {
      if (!row) return;
      selected = row;
      readout.replaceChildren();
      const text = `${stamp(row.time)} UTC   O ${format(row.open)}  H ${format(row.high)}  L ${format(row.low)}  C ${format(row.close)} USDC` + (Number.isFinite(row.volume) ? `   Vol ${format(row.volume)} ${market.label}` : '');
      readout.textContent = text;
    }
    chart.subscribeCrosshairMove(event => { const bar = event.seriesData.get(series); if (bar) inspect(rows.find(r => r.time === event.time)); });
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range) return;
      const count = Math.max(1, Math.round(range.to - range.from));
      host.querySelector('[data-chart-range]').textContent = `${count} bars in view · UTC · USDC`;
      host.dataset.visibleBars = String(count);
    });
    function auto() { chart.priceScale('right').applyOptions({ autoScale: true }); host.querySelector('[data-chart-action=auto]').setAttribute('aria-pressed', 'true'); }
    function action(kind) {
      const scale = chart.timeScale(), range = scale.getVisibleLogicalRange();
      if (kind === 'retry') { load(false); return; }
      if (kind === 'fit') { auto(); scale.fitContent(); return; }
      if (kind === 'auto') { auto(); return; }
      if (kind === 'log') { const button = host.querySelector('[data-chart-action=log]'), on = button.getAttribute('aria-pressed') !== 'true'; chart.priceScale('right').applyOptions({ mode: on ? L.PriceScaleMode.Logarithmic : L.PriceScaleMode.Normal, autoScale: true }); button.setAttribute('aria-pressed', String(on)); return; }
      if (!range || !rows.length) return;
      const width = range.to - range.from;
      if (kind === 'older' || kind === 'newer') {
        const shift = width * (kind === 'older' ? -.2 : .2); scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
      } else {
        const next = Math.max(5, Math.min(rows.length * 2, width * (kind === 'in' ? .75 : 1.333333))), center = (range.from + range.to) / 2;
        auto(); scale.setVisibleLogicalRange({ from: center - next / 2, to: center + next / 2 });
      }
    }
    host.querySelectorAll('[data-chart-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.chartAction), { signal: events.signal }));
    stage.addEventListener('keydown', event => {
      const actions = { '+': 'in', '=': 'in', '-': 'out', ArrowLeft: 'older', ArrowRight: 'newer', Home: 'fit' };
      if (actions[event.key]) { event.preventDefault(); action(actions[event.key]); host.querySelector('[data-candle-announcement]').textContent = host.querySelector('[data-chart-range]').textContent; }
    }, { signal: events.signal });
    const observer = new ResizeObserver(() => chart.applyOptions({ width: Math.max(240, stage.clientWidth) })); observer.observe(stage);
    function intervalButtons() {
      root.querySelectorAll('[data-time]').forEach(button => { button.disabled = market.asset === 'EUTBL' && button.dataset.time !== '1D'; button.classList.toggle('active', button.dataset.time === interval); button.setAttribute('aria-pressed', String(button.dataset.time === interval)); button.title = button.disabled ? 'The issuer publishes daily NAV' : ''; });
    }
    root.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => { if (interval === button.dataset.time) return; interval = button.dataset.time; intervalButtons(); load(true); }, { signal: events.signal }));
    async function load(reset) {
      if (fetching && !reset) return;
      controller?.abort(); controller = new AbortController();
      const current = ++generation; fetching = true;
      const requestController = controller, timeout = setTimeout(() => requestController.abort(), 60000);
      if (reset || !rows.length) { rows = []; series?.setData([]); volume?.setData([]); message.hidden = false; message.textContent = 'Loading market history…'; }
      root.querySelector('[data-chart-interval]').textContent = interval + ' history';
      let payload, snapshot = false;
      try {
        const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
        const base = local ? `http://${location.hostname}:8766` : '';
        const response = await fetch(`${base}/api/market-history?asset=${encodeURIComponent(market.asset)}&interval=${interval}`, { signal: requestController.signal });
        if (!response.ok) throw Error('History provider unavailable');
        payload = normalize(await response.json(), market.asset, interval);
      } catch (error) {
        if (disposed || current !== generation) { clearTimeout(timeout); return; }
        try { const response = await fetch('trade-market-history.json', { signal: events.signal }); if (!response.ok) throw error; payload = normalize((await response.json())[market.asset], market.asset, interval); snapshot = true; }
        catch (_) { if (!rows.length) { message.hidden = false; message.textContent = 'History is temporarily unavailable for this interval. Try another interval or refresh.'; readout.textContent = market.label + ' / USDC'; } root.querySelector('[data-chart-source]').textContent = 'History unavailable · refresh to retry'; fetching = false; clearTimeout(timeout); return; }
      }
      clearTimeout(timeout);
      if (disposed || current !== generation) return;
      fetching = false;
      const changed = !series || Boolean(volume) !== payload.volumeAvailable;
      if (changed) { if (series) chart.removeSeries(series); if (volume) chart.removeSeries(volume); volume = null; chartKind = 'candles';
        const close = payload.rows.at(-1).close, precision = close < .01 ? 8 : close < 10 ? 5 : 2;
        series = chart.addSeries(L.CandlestickSeries, { upColor: '#a6c794', downColor: '#f5827a', wickUpColor: '#a6c794', wickDownColor: '#f5827a', borderVisible: false, color: '#ff6b00', lineWidth: 2, priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
        chart.priceScale('right').applyOptions({ scaleMargins: { top: .08, bottom: payload.volumeAvailable ? .25 : .08 } });
        if (payload.volumeAvailable) { volume = chart.addSeries(L.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false }); volume.priceScale().applyOptions({ scaleMargins: { top: .82, bottom: 0 } }); chart.priceScale('right').applyOptions({ scaleMargins: { top: .08, bottom: .25 } }); }
      }
      const range = chart.timeScale().getVisibleLogicalRange(); rows = payload.rows; series.setData(rows);
      if (volume) volume.setData(rows.map(r => ({ time: r.time, value: r.volume, color: r.close >= r.open ? '#a6c79450' : '#f5827a50' })));
      message.hidden = true; inspect(rows.at(-1));
      if (reset || changed || !range) chart.timeScale().fitContent(); else chart.timeScale().setVisibleLogicalRange(range);
      host.dataset.chartKind = chartKind; host.dataset.candleBasis = payload.candleBasis || 'observations'; host.dataset.pointCount = String(rows.length); host.dataset.source = payload.source; host.dataset.asset = market.asset;
      const at = rows.at(-1).time, reference = valueOf(rows.at(-1));
      root.querySelector('[data-market-price]').textContent = format(payload.spot?.value || reference) + ' USDC';
      root.querySelector('[data-market-source]').textContent = (payload.spot?.source || payload.source) + (snapshot ? ' · saved' : '');
      root.querySelector('[data-market-volume]').textContent = `${rows.length} candles`;
      const yesterday = [...rows].reverse().find(r => r.time <= at - 86400), change = root.querySelector('[data-market-change]');
      change.textContent = yesterday ? ((reference / valueOf(yesterday) - 1) * 100).toFixed(2) + '%' : '—'; change.className = yesterday ? (reference >= valueOf(yesterday) ? 'positive' : 'negative') : '';
      root.querySelector('[data-chart-source]').textContent = `${payload.source} · ${snapshot ? 'saved ' : ''}${stamp(at)} UTC · ${payload.note}`;
      root.querySelector('[data-chart-interval]').textContent = interval + ' candles';
    }
    intervalButtons(); load(true); timer = setInterval(() => load(false), 60000);
    cleanup = () => { disposed = true; generation++; events.abort(); controller?.abort(); clearInterval(timer); observer.disconnect(); chart.remove(); cleanup = () => {}; };
  }
  window.NestTradeChart = { mount, dispose: () => cleanup(), normalize, intervals };
})();
