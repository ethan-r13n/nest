(() => {
  const U=window.NestUI,e=U.escape;
  let snapshot,pending;
  const money=n=>n==null?'':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(n);
  const pct=n=>n==null?'':n>0&&n<.01?'<0.01%':n.toLocaleString('en-US',{maximumFractionDigits:2})+'%';
  const pair=p=>p.tokens.map(t=>t.symbol).join(' / ');
  const fact=(label,value)=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;
  const panel=(title,body)=>`<section class="panel vd-section"><div class="panel-head"><h2>${e(title)}</h2></div><div class="panel-body">${body}</div></section>`;
  async function load() {
    if(snapshot)return snapshot;
    if(!pending)pending=(async()=>{const response=await fetch('aquarius-pools.json');if(!response.ok)throw Error();const data=await response.json();if(data.schemaVersion!=='nest.aquarius.pools.v1'||!Array.isArray(data.pools))throw Error();snapshot=data;return data;})().finally(()=>{pending=null;});
    return pending;
  }
  function detail() {
    const id=new URLSearchParams(location.hash.split('?')[1]||'').get('pool');
    const p=snapshot.pools.find(p=>p.id===id);
    if(!p)return '<div class="panel empty-state"><h2>Pool unavailable</h2><a href="#vaults">All opportunities</a></div>';
    const rewards=p.aquaAprPct==null||p.incentiveAprPct==null?null:p.aquaAprPct+p.incentiveAprPct;
    const metrics=[['Reported TVL',money(p.tvlUsd)],['Reported APR',pct(p.totalAprPct)],['Fee APR',pct(p.feeAprPct)],['Rewards APR',pct(rewards)]].filter(x=>x[1]);
    const contract=(label,address)=>`<div class="vd-contract"><span>${e(label)}</span><a href="https://stellar.expert/explorer/public/contract/${e(address)}" target="_blank" rel="noreferrer"><code>${e(address)}</code> ↗</a></div>`;
    return (window.NestMarketStyle||'') + `<div class="mkt-page vd-page" data-lp-id="${e(p.id)}"><div class="mkt-topline"><a class="mkt-link" href="#vaults">← Earn</a><span class="badge">Liquidity · ${e(p.type)}</span></div><div class="mkt-vault-layout"><div class="mkt-vault-main"><span class="eyebrow">Aquarius / Liquidity</span><div class="mkt-vault-title">${U.logo('Aquarius')}<h1 data-preserve-case>${e(pair(p))}</h1></div><p class="vd-description">Provide ${e(p.tokens[0].symbol)} and ${e(p.tokens[1].symbol)} to an Aquarius ${p.type==='stable'?'stable-swap':'constant-product'} pool. Trading fees accrue in pool value; AQUA and other incentives are separate.</p><div class="vd-metrics">${metrics.map(([label,value])=>U.stat(label,value)).join('')}</div>
      ${panel('Overview',`<dl class="vd-facts">${fact('Deposit assets',pair(p))}${fact('Pool type',p.type==='stable'?'Stable-swap':'Constant product')}${p.volume24hUsd==null?'':fact('24h volume',money(p.volume24hUsd))}${p.aquaAprPct==null?'':fact('AQUA rewards APR',pct(p.aquaAprPct))}${p.incentiveAprPct==null?'':fact('Other incentives APR',pct(p.incentiveAprPct))}</dl>`)}
      <section class="vd-section"><h2>Risk overview</h2><div class="vd-risks"><article class="panel"><h3>Market risks</h3><ul><li>Token price changes can reduce the value of deposited assets.</li></ul></article><article class="panel"><h3>System risks</h3><ul><li>Pool token addresses are fixed. A token migration can require withdrawing and moving to a new pool.</li></ul></article></div></section>
      ${panel('Contract addresses',contract('Pool contract',p.contractId)+contract('Router',p.routerContractId)+p.tokens.map(t=>contract(t.symbol+' token',t.contractId)).join('')+(p.shareContractId?contract('LP share token',p.shareContractId):'')+`<div class="vd-contract"><span>Pool index</span><code>${e(p.poolHash)}</code></div>`)}
      <footer class="vd-sources"><span>Aquarius · Mainnet snapshot · retrieved ${e(new Date(p.retrievedAt).toLocaleString('en-GB',{timeZone:'UTC'}))} UTC</span><p>APR excludes account-specific boosts. The source observation time and measurement window are not supplied.</p><div><a href="https://amm-api.aqua.network/pools/${p.contractId}/" target="_blank" rel="noreferrer">Pool data ↗</a><a href="https://aqua.network/terms/" target="_blank" rel="noreferrer">Aquarius risks ↗</a><a href="https://docs.aqua.network/amm-and-pools/system-limitations/aquarius-amm-token-address-migration-limitations-and-mitigation-strategy" target="_blank" rel="noreferrer">Token migrations ↗</a></div></footer>
      </div><aside class="mkt-vault-sidebar"><section class="panel mkt-ticket vd-ticket" data-position-management tabindex="-1" aria-label="Liquidity position management"><h2>Manage position</h2><div class="mkt-ticket-mode" role="group" aria-label="Liquidity action"><button class="active" data-lp-mode="add" aria-pressed="true">Add</button><button data-lp-mode="remove" aria-pressed="false">Remove</button></div><div data-lp-add>${p.tokens.map((t,i)=>`<div class="mkt-amount"><label for="lp-amount-${i}">Maximum ${e(t.symbol)} contribution</label><div class="mkt-amount-line"><input id="lp-amount-${i}" inputmode="decimal" placeholder="0.00"><span>${e(t.symbol)}</span></div></div>`).join('')}</div><div data-lp-remove hidden><div class="mkt-amount"><label for="lp-shares">LP shares to remove</label><div class="mkt-amount-line"><input id="lp-shares" inputmode="decimal" placeholder="0.00"><span>LP shares</span></div></div><p class="vd-status">Review a separate minimum for each token. Withdrawal does not claim rewards.</p></div><div class="mkt-exit-disclosure"><strong>Withdrawal timing</strong><p>Unverified. Pool state, liquidity and token transfer restrictions must be checked before review.</p></div><button class="btn btn-primary" disabled data-lp-review>Review addition</button><p class="vd-status">Pool verification, balances, simulation and wallet approval are required.</p></section>
      ${panel('Counterparties',`<div class="mkt-counterparty">${U.logo('Aquarius')}<div><b>Aquarius</b><small>AMM venue</small></div></div>`)}
      ${panel('Published fees',`<dl class="vd-facts">${fact('Swap fee tier',pct(p.feeBps/100))}</dl>`)}
      </aside></div></div>`;
  }
  async function bind(root) {
    try { await load();if(!root.isConnected)return;root.innerHTML=detail();root.querySelectorAll('[data-lp-mode]').forEach(button=>button.onclick=()=>{const add=button.dataset.lpMode==='add';root.querySelector('[data-lp-add]').hidden=!add;root.querySelector('[data-lp-remove]').hidden=add;root.querySelectorAll('[data-lp-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});root.querySelector('[data-lp-review]').textContent=add?'Review addition':'Review removal';}); }
    catch {if(root.isConnected)root.innerHTML='<div class="panel empty-state ux-recovery" role="alert"><h2>Pool data unavailable</h2><p>The pool source could not be loaded. Your entered amounts stay in this session. Try again or return to the opportunity list.</p><div class="ux-recovery-actions"><button class="btn btn-primary" data-reset-state>Try again</button><a class="btn" href="#vaults">All opportunities</a></div></div>';}
  }
  window.NestLiquidity={load,get snapshot(){return snapshot;}};
  window.NestScreens={...window.NestScreens,liquidity:window.NestScreens.vaults,'liquidity-detail':()=>'<p role="status">Loading pool…</p>'};
  window.NestBinders={...window.NestBinders,liquidity:window.NestBinders.vaults,'liquidity-detail':root=>void bind(root)};
})();
