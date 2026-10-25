/* Template patterns adapted for the buildless design preview. React contracts are in spec/refinement.json. */
(() => {
  const U = window.NestUI;
  const tablePreferences = new Map();

  function enhanceTable(table, route, index) {
    if (table.dataset.refined) return;
    const header = table.tHead?.rows[0];
    if (!header || !table.tBodies.length) return;
    table.dataset.refined = 'true';
    table.classList.add('n-data-table');
    const key = `${route}:${index}`;
    const state = tablePreferences.get(key) || { density: 'compact', hidden: new Set([...header.cells].flatMap((cell, i) => cell.hidden ? [i] : [])) };
    tablePreferences.set(key, state);
    const labels = [...header.cells].map(cell => cell.textContent.trim().replace(/[↓↑⌄]/g, '').trim());
    const identity = labels[0] === '#' ? 1 : 0;
    const wrap = table.parentElement;
    wrap.classList.add('n-table-viewport');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', `${labels[identity]} data table, scroll horizontally for more columns`);
    const tools = document.createElement('div');
    tools.className = 'n-table-tools';
    tools.innerHTML = `<span class="n-table-hint">${U.icon('info')} Scroll to inspect every column</span><div class="n-table-options"><label>Density <select class="input" aria-label="Table density"><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><details class="n-column-menu"><summary>Columns <span aria-hidden="true">⌄</span></summary><div class="n-column-options">${labels.map((label, i) => `<label class="check"><input type="checkbox" aria-label="${U.escape(label)}${i === identity ? ' (required)' : ''}" data-column="${i}" ${state.hidden.has(i) ? '' : 'checked'} ${i === identity ? 'disabled' : ''}> ${U.escape(label)}${i === identity ? ' · required' : ''}</label>`).join('')}</div></details></div>`;
    wrap.before(tools);
    tools.querySelector('select').value = state.density;
    function apply() {
      table.dataset.density = state.density;
      [...table.rows].forEach(row => {
        if (row.cells.length !== header.cells.length) return;
        [...row.cells].forEach((cell, i) => {
          cell.hidden = false;
          cell.classList.toggle('n-column-hidden', state.hidden.has(i));
          cell.classList.toggle('n-identity-cell', i === identity);
        });
      });
    }
    tools.querySelector('select').onchange = event => { state.density = event.target.value; apply(); };
    tools.addEventListener('change', event => {
      if (!event.target.matches('[data-column]')) return;
      const column = Number(event.target.dataset.column);
      event.target.checked ? state.hidden.delete(column) : state.hidden.add(column);
      apply();
    });
    tools.addEventListener('keydown', event => {
      if (event.key === 'Escape') { tools.querySelector('details').open = false; tools.querySelector('summary').focus(); }
    });
    const observer = new MutationObserver(apply);
    observer.observe(table.tBodies[0], { childList: true });
    rootCleanups.push(() => observer.disconnect());
    apply();
  }

  let rootCleanups = [];
  window.NestRefine = {
    dispose() { rootCleanups.forEach(clean => clean()); rootCleanups = []; },
    init(root, route) {
      root.dataset.route = route;
      this.refresh(root, route);
      const observer = new MutationObserver(() => this.refresh(root, route));
      observer.observe(root, { childList: true, subtree: true });
      rootCleanups.push(() => observer.disconnect());
      if (route === 'portfolio') {
        root.addEventListener('click', event => {
          const button = event.target.closest('[data-portfolio-view]');
          if (!button) return;
          root.querySelectorAll('[data-portfolio-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
          root.querySelectorAll('[data-allocation-view]').forEach(item => item.hidden = item.dataset.allocationView !== button.dataset.portfolioView);
        });
      }
    },
    refresh(root, route) {
      if (route.startsWith('research-')) root.querySelectorAll('.data-table').forEach((table, index) => enhanceTable(table, route, index));
      root.querySelectorAll('.mkt-amount,.credit-amount').forEach(group => {
        group.classList.add('n-input-group');
        const input = group.querySelector('input:not([type=range])');
        if (!input || input.dataset.fieldRefined) return;
        input.dataset.fieldRefined = 'true';
        const helper = group.querySelector('small,.credit-amount-foot');
        if (helper) {
          helper.id ||= `${input.id || 'amount'}-help`;
          input.setAttribute('aria-describedby', helper.id);
        }
      });
    }
  };
})();
