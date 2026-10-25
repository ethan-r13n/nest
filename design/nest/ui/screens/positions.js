(() => {
  'use strict';
  const M=window.NestCreditPositions,U=window.NestUI,e=value=>U.escape(value);
  const n=value=>value==null?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:7});
  const usd=value=>value==null?'—':'$'+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=value=>value==null?'—':Number(value).toFixed(1)+'%';
  function state() {
    const s=window.NestCreditPositionDemo||(window.NestCreditPositionDemo={position:'blend-loan',action:'add-collateral',amount:'500'});
    if(s.position==='Blend')s.position='blend-loan';if(s.position==='XOXNO')s.position='xoxno-loan';
    if(!M.find(s.position))s.position='blend-loan';
    const requested=new URLSearchParams(location.hash.split('?')[1]||'').get('position');
    if(requested && !M.find(requested))return null;
    if(requested && s.routeKey!==location.hash){s.position=requested;s.action=M.actions(M.find(requested))[0][0];s.amount=M.defaults(M.find(requested),s.action);s.routeKey=location.hash;}
    const position=M.find(s.position);
    if(!M.actions(position).some(([key])=>key===s.action)){s.action=M.actions(position)[0][0];s.amount=M.defaults(position,s.action);}
    return s;
  }
  const risk = (position,balance) => `<span class="cp-risk-line"><span>LTV</span><b>${pct(balance?.ltv)}</b></span><span class="cp-risk-line"><span>HF</span><b ${position.nativeMetric!=='hf'?'title="Native health factor not reported in this fixture"':''}>${balance?.hf==null?'—':balance.hf.toFixed(2)}</b></span>`;
  function rows(selected) {
    return M.positions.map(position=>{
      const b=M.balances(position),loan=position.kind==='loan',active=position.id===selected;
      return `<tr data-position-row="${position.id}" aria-selected="${active}" tabindex="0" aria-label="${e(position.venue+' '+(loan?'loan':'supply')+' position')}">
        <td><div class="cp-venue">${U.logo(position.venue)}<div><b>${e(position.venue)}</b><small>${e(position.market)} · ${loan?'Loan':'Supply'}</small></div></div></td>
        <td class="table-num"><span class="mono">${n(loan?position.collateral:position.supplied)} ${loan?position.collateralAsset:position.asset}</span><small>${usd(b.value)} · ${loan?'collateral':'supplied'}</small></td>
        <td class="table-num"><span class="mono">${loan?n(position.debt)+' '+position.debtAsset:'—'}</span></td>
        <td class="table-num"><span class="mono">${position.apr.toFixed(2)}%</span><small>${loan?'Borrow':'Lend'} · variable</small></td>
        <td class="cp-risk-cell">${loan?risk(position,b):'<span class="cp-not-applicable" aria-label="Not applicable to a supply position">—</span>'}</td>
        <td><button class="btn ${active?'btn-primary':''}" data-position-select="${position.id}" aria-label="Manage ${e(position.venue)} ${loan?'loan':'supply'}" aria-pressed="${active}" aria-controls="cp-selected-position">Manage</button></td></tr>`;
    }).join('');
  }
  function impact(position,preview) {
    const line=(label,before,after)=>`<div><span>${label}</span><span class="mono">${before}</span><span class="cp-after mono">${after}</span></div>`;
    return `<div class="cp-impact-head"><span>After action</span><span>Before</span><span>After</span></div>`+(position.kind==='supply'
      ?line('Supplied balance',n(preview.before.supplied)+' '+position.asset,preview.after?n(preview.after.supplied)+' '+position.asset:'—')
      :line('Collateral',n(preview.before.collateral)+' '+position.collateralAsset,preview.after?n(preview.after.collateral)+' '+position.collateralAsset:'—')+
       line('Debt',n(preview.before.debt)+' '+position.debtAsset,preview.after?n(preview.after.debt)+' '+position.debtAsset:'—')+
       `<div class="cp-impact-risk"><span>Position risk</span><span>${risk(position,preview.before)}</span><span>${preview.after?risk(position,preview.after):'—'}</span></div>`);
  }
  function manager(position,s) {
    const loan=position.kind==='loan',close=s.action==='close',preview=M.project(position,s.action,s.amount);
    const actionName=M.actions(position).find(([key])=>key===s.action)[1];
    return `<div class="cp-manager-heading"><h2>Manage position</h2><p>${e(position.venue)} · ${loan?'XLM collateral / USDC debt':'USDC supplied liquidity'}</p></div>
      <div class="cp-action-scroll" tabindex="0" role="region" aria-label="Position action choices"><div class="cp-action-tabs" role="group" aria-label="Position actions" data-kind="${position.kind}">${M.actions(position).map(([key,label])=>`<button type="button" class="${key===s.action?'active':''}" data-position-action="${key}" aria-pressed="${key===s.action}">${label}</button>`).join('')}</div></div>
      <label class="field cp-amount-field" for="position-amount"><span>${close?'Exact close-out amount':actionName+' amount'} <span class="subtle">${preview.asset}</span></span><input class="input" id="position-amount" inputmode="decimal" value="${e(close?String(position.debt):s.amount)}" ${close?'readonly':''} aria-describedby="position-amount-note position-validation"></label>
      <p class="data-note cp-amount-note" id="position-amount-note">${close?'A live close-out requires current principal, accrued interest and exact fees.':loan&&preview.asset==='XLM'?'Illustrative XLM price: $0.17. Amounts are checked again in a live review.':'Illustrative amount in '+preview.asset+'. Wallet balances and liquidity are not loaded.'}</p>
      <div class="cp-impact" id="position-impact">${impact(position,preview)}</div>
      <div class="cp-timing"><b>Withdrawal timing · Variable</b><p>${loan?'Collateral release depends on remaining debt, venue risk rules and available pool liquidity.':'Withdrawals depend on available pool liquidity. No fixed release date is modeled.'}</p></div>
      <p class="cp-validation" id="position-validation" role="alert" ${preview.errors.length?'':'hidden'}>${e(preview.errors.join(' '))}</p>
      <button class="btn btn-primary cp-review" id="position-review" ${reviewAttributes(position,s,preview)}>${reviewLabel(s.action)} ↗</button>
      <p class="data-note cp-footnote">Fixture preview · no signature or submission.</p>`;
  }
  function reviewLabel(action) {return 'Review '+({deposit:'supply',withdraw:'withdrawal','add-collateral':'collateral','withdraw-collateral':'withdrawal',repay:'repayment',close:'close-out'})[action];}
  function reviewAttributes(position,s,preview) {
    const title=M.actions(position).find(([key])=>key===s.action)[1]+' · '+position.venue;
    return `data-review="${s.action}" data-title="${e(title)}" data-venue="${e(position.venue)}" data-amount="${e(s.action==='close'?String(position.debt):s.amount)} ${preview.asset}" data-withdrawal="${position.kind==='supply'?'Withdrawal depends on pool liquidity.':'Collateral release depends on debt, native risk rules and pool liquidity.'}" ${preview.errors.length?'disabled':''}`;
  }
  window.NestScreens.positions=()=>{
    const s=state();if(!s)return '<div class="panel empty-state"><h1>Position unavailable</h1><p>This position is not in the captured account.</p><a class="btn" href="#portfolio">Portfolio</a></div>';
    const position=M.find(s.position),totals=M.totals();
    return `<div class="credit-positions"><div class="page-head"><div><span class="eyebrow">Credit / My positions</span><h1>Keep the position in view.</h1><p>Track loans and supplied liquidity, then choose a position to manage.</p></div></div>
      <nav class="tabs" aria-label="Credit views"><a class="tab" href="#borrow">Borrow</a><a class="tab active" href="#positions" aria-current="page">My positions <span class="mono">${M.positions.length}</span></a></nav>
      <div class="cp-summary">${[['Collateral',totals.collateral,'Loan backing'],['Supplied',totals.supplied,'Supplied liquidity'],['Outstanding debt',totals.debt,'Borrowed USDC'],['Net position value',totals.net,'Supply + collateral − debt']].map(([label,value,note])=>`<article class="panel"><span>${label}</span><strong>${usd(value)}</strong><small>${note} · fixture</small></article>`).join('')}</div>
      <section class="panel cp-position-table"><div class="panel-head"><h2>Open positions</h2><span class="badge">Demo wallet · Mainnet</span></div><div class="table-wrap" tabindex="0" role="region" aria-label="Open credit positions, scroll horizontally for all columns"><table class="data-table"><thead><tr><th>Venue / market</th><th class="table-num">Collateral / supplied</th><th class="table-num">Debt</th><th class="table-num">APR · borrow / lend</th><th>LTV / HF</th><th>Action</th></tr></thead><tbody>${rows(s.position)}</tbody></table></div><p class="cp-table-note">Illustrative balances and variable APRs. Health factor is shown only when reported by the position’s native risk model.</p></section>
      <div class="cp-selected-layout" id="cp-selected-position"><section class="panel cp-manager" id="credit-management" data-position-management tabindex="-1" aria-label="Selected position management">${manager(position,s)}</section></div></div>`;
  };
  window.NestBinders.positions=root=>{
    const s=state();if(!s)return;const managerEl=root.querySelector('#credit-management');
    function refresh() {
      const position=M.find(s.position);managerEl.innerHTML=manager(position,s);
      root.querySelectorAll('[data-position-row]').forEach(row=>row.setAttribute('aria-selected',String(row.dataset.positionRow===s.position)));
      root.querySelectorAll('[data-position-select]').forEach(button=>{const active=button.dataset.positionSelect===s.position;button.classList.toggle('btn-primary',active);button.setAttribute('aria-pressed',String(active));});
    }
    function select(id) {if(!M.find(id)||id===s.position)return;const position=M.find(id);s.position=id;s.action=M.actions(position)[0][0];s.amount=M.defaults(position,s.action);refresh();}
    root.addEventListener('click',event=>{
      const row=event.target.closest('[data-position-select],[data-position-row]'),action=event.target.closest('[data-position-action]');
      if(row)select(row.dataset.positionSelect||row.dataset.positionRow);
      if(action){const position=M.find(s.position);if(!M.actions(position).some(([key])=>key===action.dataset.positionAction))return;s.action=action.dataset.positionAction;s.amount=M.defaults(position,s.action);refresh();managerEl.querySelector(`[data-position-action="${s.action}"]`).focus({preventScroll:true});}
    });
    root.addEventListener('keydown',event=>{if(event.target.matches('[data-position-row]')&&['Enter',' '].includes(event.key)){event.preventDefault();select(event.target.dataset.positionRow);}});
    root.addEventListener('input',event=>{
      if(event.target.id!=='position-amount')return;s.amount=event.target.value;const position=M.find(s.position),preview=M.project(position,s.action,s.amount);
      root.querySelector('#position-impact').innerHTML=impact(position,preview);
      const error=root.querySelector('#position-validation');error.textContent=preview.errors.join(' ');error.hidden=!preview.errors.length;event.target.setAttribute('aria-invalid',String(!!preview.errors.length));
      const review=root.querySelector('#position-review');review.disabled=!!preview.errors.length;review.dataset.amount=s.amount+' '+preview.asset;
    });
  };
})();
