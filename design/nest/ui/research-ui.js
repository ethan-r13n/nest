/* Shared pagination for the dated Research datasets. */
(() => {
  const pageItems = (page, pages) => {
    const visible = new Set([1, pages, page - 1, page, page + 1].filter(n => n > 0 && n <= pages));
    if (page < 4) [2, 3, 4].filter(n => n <= pages).forEach(n => visible.add(n));
    if (page > pages - 3) [pages - 3, pages - 2, pages - 1].filter(n => n > 0).forEach(n => visible.add(n));
    const items = [];
    [...visible].sort((a, b) => a - b).forEach(n => {
      if (items.length && n - items.at(-1) > 1) items.push('…');
      items.push(n);
    });
    return items;
  };
  const model = (state, total) => {
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    const page = Math.max(1, Math.min(state.page, pages));
    return { page, pages, start: total ? (page - 1) * state.pageSize + 1 : 0, end: Math.min(page * state.pageSize, total), items: pageItems(page, pages) };
  };
  const footer = (id, label) => `<div class="r-footer research-pagination" data-pagination="${id}">
    <span id="${id}-page" role="status" aria-live="polite" aria-atomic="true"></span>
    <label class="n-page-size">Rows <select class="input" id="${id}-page-size" aria-label="${label} rows per page"><option>10</option><option>25</option><option>50</option></select></label>
    <nav aria-label="${label} pagination"><button class="btn btn-ghost" type="button" id="${id}-prev" aria-label="Previous ${label.toLowerCase()} page">←</button>
    <span id="${id}-pages" class="research-page-numbers"></span><button class="btn btn-ghost" type="button" id="${id}-next" aria-label="Next ${label.toLowerCase()} page">→</button></nav></div>`;
  function update(root, id, label, state, total) {
    const m = model(state, total); state.page = m.page;
    const noun = total === 1 ? ({ Entries: 'entry', Protocols: 'protocol', Assets: 'asset' }[label] || label.toLowerCase()) : label.toLowerCase();
    root.querySelector(`#${id}-page`).textContent = `${m.start}–${m.end} of ${total} ${noun} · Page ${m.page} of ${m.pages}`;
    root.querySelector(`#${id}-pages`).innerHTML = m.items.map(n => n === '…' ? '<span class="research-page-gap" aria-hidden="true">…</span>' :
      `<button class="btn btn-ghost" type="button" data-page-for="${id}" data-page="${n}" aria-label="Page ${n}" ${n === m.page ? 'aria-current="page"' : ''}>${n}</button>`).join('');
    root.querySelector(`#${id}-prev`).disabled = m.page === 1;
    root.querySelector(`#${id}-next`).disabled = m.page === m.pages;
    root.querySelector(`#${id}-page-size`).value = String(state.pageSize);
  }
  function bind(root, id, state, draw, anchor) {
    const change = page => {
      state.page = page; draw(root);
      const heading = root.querySelector(anchor);
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
      heading?.focus({ preventScroll: true });
    };
    root.querySelector(`#${id}-prev`).onclick = () => change(state.page - 1);
    root.querySelector(`#${id}-next`).onclick = () => change(state.page + 1);
    root.querySelector(`#${id}-page-size`).onchange = event => { state.pageSize = Number(event.target.value); change(1); };
    root.addEventListener('click', event => {
      const button = event.target.closest(`[data-page-for="${id}"]`);
      if (button) change(Number(button.dataset.page));
    });
  }
  window.NestResearchUI = { model, footer, update, bind };
})();
