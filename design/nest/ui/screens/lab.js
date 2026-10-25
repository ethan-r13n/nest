/* Strategy drafts stay in the conversation and save their original inputs to history. */
(() => {
  'use strict';
  const M = window.NestLabModel, U = window.NestUI, e = value => U.escape(value);
  const storageKey = 'nest.lab.strategy.v2';
  let persisted = true;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { persisted = false; }
  const cleanMessages = rows => Array.isArray(rows) ? rows.filter(m => ['user','assistant'].includes(m?.role) && typeof m.text === 'string').map(m => ({role:m.role,text:m.text.slice(0,12000)})) : [];
  let draft = M.validDraft(stored.draft), messages = cleanMessages(stored.messages);
  let entries = Array.isArray(stored.entries) ? stored.entries.filter(r => r && ['backtest','automation'].includes(r.mode) && typeof r.id === 'string' && /^[a-zA-Z0-9-]+$/.test(r.id)).map(r => ({...r,draft:M.validDraft(r.draft),messages:cleanMessages(r.messages)})) : [];
  let confirmed = typeof stored.confirmed==='string'?stored.confirmed:'', activeMode = stored.activeMode==='automation'?'automation':'backtest', historyFilter = 'all', historyQuery = '', removedEntry = null;
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({draft,messages,entries,confirmed,activeMode})); persisted = true; }
    catch { persisted = false; }
  }
  const nav = active => `<nav class="tabs lab-tabs" aria-label="Lab views">
    <a class="tab ${active==='backtest'?'active':''}" href="#lab-backtests" ${active==='backtest'?'aria-current="page"':''}>Backtest</a>
    <a class="tab ${active==='automation'?'active':''}" href="#lab-automation" ${active==='automation'?'aria-current="page"':''}>Set automation</a>
    <a class="tab ${active==='history'?'active':''}" href="#lab-history" ${active==='history'?'aria-current="page"':''}>History <span class="lab-count">${entries.length}</span></a></nav>`;
  const header = active => `<div class="lab-workspace"><div class="page-head lab-page-head"><div><span class="eyebrow">Nest / Lab</span><h1>From thesis to strategy.</h1><p>Describe an idea. Test it against the past, or watch for it in the future.</p></div></div>${nav(active)}`;
  const examples = [
    { id:'divergence', icon:'↗', title:'Watch a pool divergence', detail:'Compare XLM prices on Soroswap and Aquarius', prompt:'Compare XLM/USDC on Soroswap and Aquarius. Notify me when the price divergence crosses above 1%. Estimate available size with max impact 0.5% per leg.' },
    { id:'btc-ema', icon:'⌁', title:'Follow BTC momentum', detail:'BTC closes above its 20-day EMA → review an XLM buy', prompt:'If the BTC/USD daily close crosses from below to above its 20-day EMA, propose to buy XLM for my review. Trigger once on the crossing, not on every close above the EMA.' },
    { id:'volume-breakout', icon:'↗', title:'Catch a volume breakout', detail:'XLM breaks its 30-day high with twice the usual volume', prompt:'Notify me if the XLM/USD daily close breaks its previous 30-day high and daily volume is above 2 times its previous 20-day average. Alert once on a new breakout; do not propose a trade.' },
    { id:'yield-gap', icon:'⇄', title:'Watch a better supply rate', detail:'A USDC rate beats the current venue by 2 percentage points', prompt:'Notify me if an eligible USDC supply rate exceeds my current venue by at least 2 percentage points for 24 hours, after fees, with enough withdrawal and deposit liquidity for my position. Alert only; do not move funds.' },
  ];
  function welcome(mode) {
    return `<div class="lab-welcome"><span class="lab-nest-mark"><img src="../assets/nest-symbol.svg" alt="" width="44" height="32"></span><h2>What’s your thesis?</h2>
      <p>${mode==='backtest'?'Tell Nest what you want to test, over what period, and what would make the strategy worth pursuing.':'Tell Nest what to watch and when to notify you. Keep the monitor on until you pause it, or choose an end date.'}</p>
      <div class="lab-examples">${examples.map(example=>`<button type="button" data-lab-example="${example.id}"><span aria-hidden="true">${example.icon}</span><b>${example.title}</b><small>${example.detail}</small></button>`).join('')}</div></div>`;
  }
  const messageHTML = m => `<div class="lab-message lab-message-${m.role}"><span class="lab-message-author">${m.role==='user'?'You':'Nest'}</span><p>${e(m.text)}</p></div>`;
  function transcript(mode) { return messages.length ? messages.map(messageHTML).join('') : welcome(mode); }
  function quickReplies(mode) {
    const next = M.missing(draft,mode)[0];
    const choices = {signalSource:['Add data source'],signalResponse:['Alert only','Propose to buy XLM'],signalSizing:['1,000 USDC'],pools:['Add pool links'],pair:['XLM/USDC','XLM/EURC'],threshold:['0.5%','1%','2%'],sizing:['1,000 '+(draft.pair.split('/')[1]||'USDC'),'Estimate available size'],impact:['0.5%','1%'],period:['Last 30 days','Last 90 days'],costs:['60 bps','100 bps'],cadence:['Every 1 minute','Every 5 minutes'],duration:['Until paused','For 90 days']}[next] || [];
    return choices.map(text=>`<button class="lab-quick-reply" data-lab-reply="${e(text)}">${e(text)}</button>`).join('');
  }
  function summaryHTML(mode, value=draft) {
    const s = M.summary(value,mode);
    return `<div class="lab-summary-chip"><span>${value.kind==='arbitrage'?'Compare':'Data source'}</span><b>${value.kind==='arbitrage'?e(value.venueA||'Pool A')+' / '+e(value.venueB||'Pool B'):e(value.source||'Source to be specified')}</b></div>
      <div class="lab-summary-chip"><span>Trigger</span><b>${e(s.trigger)}</b></div><div class="lab-summary-chip"><span>Sizing</span><b>${e(s.sizing)}</b></div>
      <div class="lab-summary-chip"><span>${mode==='backtest'?'Test window':'Monitoring'}</span><b>${e(s.window)}</b></div>`;
  }
  function workspace(mode) {
    if(activeMode!==mode&&messages.length)messages.push({role:'assistant',text:'Switched to '+(mode==='backtest'?'Backtest':'Set automation')+'. '+M.next(draft,mode)});
    activeMode=mode;
    save();
    const missing=M.missing(draft,mode);
    return header(mode)+`<section class="panel lab-chat" aria-label="Strategy conversation"><div class="lab-chat-header"><div><span class="lab-chat-dot"></span><b>Strategy chat</b><span class="data-note">${mode==='backtest'?'Backtest':'Set automation'}</span></div><button class="btn btn-ghost btn-sm" data-lab-new>New thesis</button></div>
      <div class="lab-transcript" id="lab-transcript" data-message-count="${messages.length}" role="log" aria-label="Strategy messages" aria-live="polite" aria-relevant="additions">${transcript(mode)}</div>
      <div class="lab-quick-replies" id="lab-quick-replies">${quickReplies(mode)}</div>
      <form class="lab-composer" id="lab-chat-form"><label for="lab-message" class="sr-only">Your strategy thesis or answer</label><textarea id="lab-message" rows="2" placeholder="${messages.length?'Answer Nest, paste pool links, or refine your thesis…':'Here’s my thesis: compare two XLM pools and alert me when the gap opens…'}" required></textarea>
      <div><span>Enter to send · Shift + Enter for a new line</span><button class="btn btn-primary" type="submit" aria-label="Send strategy message">Send <span aria-hidden="true">↑</span></button></div></form>
      <div class="lab-ready-review" id="lab-ready-review" ${missing.length?'hidden':''}><h3>Review your setup</h3><div class="lab-strategy-summary" id="lab-strategy-summary">${summaryHTML(mode)}</div><button class="btn btn-primary" id="lab-confirm">Save ${mode==='backtest'?'backtest request':'monitor setup'} ↗</button></div>
      <div id="lab-saved-feedback" role="status"></div><p class="lab-local-note">Drafts save on this device. Live monitoring and historical evaluation are not connected.</p></section></div>`;
  }
  function sync(root, mode, updateMessages=false) {
    if(updateMessages) {
      const log=root.querySelector('#lab-transcript');let count=Number(log.dataset.messageCount)||0;
      if(log.querySelector('.lab-welcome')||count>messages.length){log.replaceChildren();count=0;}
      log.insertAdjacentHTML('beforeend',messages.slice(count).map(messageHTML).join(''));
      log.dataset.messageCount=String(messages.length);log.scrollTop=log.scrollHeight;
    }
    root.querySelector('#lab-quick-replies').innerHTML=quickReplies(mode);
    root.querySelector('#lab-strategy-summary').innerHTML=summaryHTML(mode);
    const gaps=M.missing(draft,mode), wasSaved=confirmed===M.fingerprint(draft,mode);
    root.querySelector('#lab-ready-review').hidden=!!gaps.length||wasSaved;
    root.querySelector('#lab-confirm').disabled=!!gaps.length||wasSaved;
    root.querySelectorAll('.lab-count').forEach(el=>el.textContent=entries.length);
  }
  function bindWorkspace(root, mode) {
    root.labEventController?.abort();
    root.labEventController=new AbortController();
    const form=root.querySelector('#lab-chat-form'),input=root.querySelector('#lab-message');
    const send=text=>{
      if(!text.trim())return;
      const previousFingerprint=M.fingerprint(draft,mode);
      draft=M.parse(text,draft,mode);if(M.fingerprint(draft,mode)!==previousFingerprint)confirmed='';
      messages.push({role:'user',text:text.trim()},{role:'assistant',text:M.next(draft,mode)});
      save();input.value='';root.querySelector('#lab-saved-feedback').innerHTML='';sync(root,mode,true);input.focus();
    };
    form.addEventListener('submit',event=>{event.preventDefault();send(input.value);});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send(input.value);}});
    root.addEventListener('click',event=>{
      const example=event.target.closest('[data-lab-example]'),reply=event.target.closest('[data-lab-reply]');
      if(example){input.value=examples.find(row=>row.id===example.dataset.labExample)?.prompt||'';input.focus();}
      if(reply){if(reply.dataset.labReply==='Add pool links'){input.value='Pool A: ; Pool B: ';input.focus();input.setSelectionRange(8,8);}else if(reply.dataset.labReply==='Add data source'){input.value='Source: ';input.focus();}else send(reply.dataset.labReply);}
      if(event.target.closest('[data-lab-new]')) {draft=M.blank();messages=[];confirmed='';save();root.innerHTML=workspace(mode);bindWorkspace(root,mode);root.querySelector('#lab-message').focus();}
    },{signal:root.labEventController.signal});
    root.querySelector('#lab-confirm').addEventListener('click',()=>{
      if(M.missing(draft,mode).length||confirmed===M.fingerprint(draft,mode))return;
      const id=crypto.randomUUID();
      entries.unshift({id,mode,createdAt:new Date().toISOString(),draft:{...draft},messages:messages.map(m=>({...m})),status:mode==='backtest'?'Awaiting historical data':'Not scheduled'});
      confirmed=M.fingerprint(draft,mode);save();sync(root,mode);
      root.querySelector('#lab-saved-feedback').innerHTML=`<div class="lab-saved-card"><span aria-hidden="true">✓</span><div><b>${mode==='backtest'?'Backtest request':'Monitor setup'} saved ${persisted?'to History':'in this session'}</b><p>${mode==='backtest'?'Historical prices, liquidity and execution costs must be loaded before any profitability result.':'Continuous polling has not started. A connected monitoring service is required.'}</p></div><a class="btn btn-sm" href="#lab-history">View History ↗</a></div>`;
    });
    sync(root,mode);
    const log=root.querySelector('#lab-transcript');log.scrollTop=log.scrollHeight;
  }
  const displayDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Saved date unavailable';};
  function historyCards() {
    const rows=entries.filter(r=>(historyFilter==='all'||r.mode===historyFilter)&&(r.draft.thesis+' '+r.draft.pair+' '+r.draft.venueA+' '+r.draft.venueB+' '+r.draft.source).toLowerCase().includes(historyQuery));
    if(!rows.length)return `<div class="lab-history-empty"><span class="lab-empty-symbol">↺</span><h2>${entries.length?'No matching strategies':'Your strategies, kept together.'}</h2><p>${entries.length?'Try another search or history filter.':'Every confirmed backtest and automation setup is saved here with its thesis, source inputs and assumptions.'}</p><div class="lab-history-start-actions"><a class="btn" href="#lab-backtests">Build A Backtest ↗</a><a class="btn" href="#lab-automation">Build An Automation ↗</a></div></div>`;
    return rows.map(r=>{const s=M.summary(r.draft,r.mode);return `<article class="panel lab-history-card"><div class="lab-history-card-header"><div><span class="eyebrow">${r.mode==='backtest'?'Backtest':'Automation'} · ${e(displayDate(r.createdAt))}</span><h2>${e(s.title)}</h2><p>${r.draft.kind==='arbitrage'?e(r.draft.venueA)+' / '+e(r.draft.venueB):e(r.draft.source)}</p></div><span class="badge">${r.mode==='backtest'?'Awaiting historical data':'Not scheduled'}</span></div><p class="lab-history-thesis">${e(r.draft.thesis)}</p>
      <div class="lab-strategy-summary">${summaryHTML(r.mode,r.draft)}</div><details class="lab-history-details"><summary>View setup & conversation</summary><div class="lab-history-detail-body">${r.draft.kind==='arbitrage'?`<div class="lab-history-pools"><div><span>Pool A</span><code>${e(r.draft.poolA)}</code></div><div><span>Pool B</span><code>${e(r.draft.poolB)}</code></div></div>`:''}
      <p class="data-note">${r.mode==='backtest'?'Round-trip fee assumption: '+e(r.draft.costBps)+' bps. No historical replay or profitability result exists yet.':'Notification: In Nest. Polling has not started in this design preview.'}</p>
      <details class="lab-history-conversation"><summary>Original conversation</summary>${r.messages.map(messageHTML).join('')}</details><div class="lab-history-actions"><button class="btn" data-lab-reuse="${r.id}">Use as a new strategy ↗</button><button class="btn btn-ghost" data-lab-remove="${r.id}" aria-label="Remove saved strategy">Remove</button></div></div></details></article>`;}).join('');
  }
  function historyPage() {
    return header('history')+`<div class="lab-history-heading"><div><h2>Strategy history</h2><p>Backtests and automation setups, with the exact thesis behind each.</p></div><span class="data-note">${persisted?'Saved on this device':'Saved for this session'}</span></div><div class="lab-history-toolbar"><div role="group" aria-label="Filter strategy history">${[['all','All'],['backtest','Backtests'],['automation','Automations']].map(([key,text])=>`<button class="btn btn-sm ${historyFilter===key?'btn-primary':''}" data-lab-filter="${key}" aria-pressed="${historyFilter===key}">${text}</button>`).join('')}</div><input class="input" id="lab-history-search" type="search" aria-label="Search strategy history" placeholder="Search thesis, pair or venue…" value="${e(historyQuery)}"></div><div id="lab-history-feedback" role="status"></div><div class="lab-history-list" id="lab-history-list">${historyCards()}</div></div>`;
  }
  function bindHistory(root) {
    root.querySelector('#lab-history-search').addEventListener('input',event=>{historyQuery=event.target.value.toLowerCase();root.querySelector('#lab-history-list').innerHTML=historyCards();});
    root.addEventListener('click',event=>{
      const filter=event.target.closest('[data-lab-filter]'),reuse=event.target.closest('[data-lab-reuse]');
      if(filter){historyFilter=filter.dataset.labFilter;root.querySelectorAll('[data-lab-filter]').forEach(el=>{const active=el.dataset.labFilter===historyFilter;el.classList.toggle('btn-primary',active);el.setAttribute('aria-pressed',String(active));});root.querySelector('#lab-history-list').innerHTML=historyCards();}
      if(reuse){const row=entries.find(r=>r.id===reuse.dataset.labReuse);if(!row)return;draft={...row.draft};messages=row.messages.map(m=>({...m}));confirmed='';save();location.hash=row.mode==='backtest'?'lab-backtests':'lab-automation';}
      const remove=event.target.closest('[data-lab-remove]');
      if(remove){removedEntry=entries.find(r=>r.id===remove.dataset.labRemove);if(removedEntry&&confirmed===M.fingerprint(removedEntry.draft,removedEntry.mode))confirmed='';entries=entries.filter(r=>r.id!==remove.dataset.labRemove);save();root.querySelector('#lab-history-list').innerHTML=historyCards();root.querySelector('.lab-count').textContent=entries.length;root.querySelector('#lab-history-feedback').innerHTML='<p class="lab-undo-note">Removed from this device. <button class="lab-quick-reply" data-lab-undo>Undo</button></p>';}
      if(event.target.closest('[data-lab-undo]')&&removedEntry){entries.unshift(removedEntry);removedEntry=null;save();root.querySelector('#lab-history-list').innerHTML=historyCards();root.querySelector('.lab-count').textContent=entries.length;root.querySelector('#lab-history-feedback').textContent='';}
    });
  }
  window.NestScreens['lab-backtests']=()=>workspace('backtest');
  window.NestScreens['lab-automation']=()=>workspace('automation');
  window.NestScreens['lab-history']=historyPage;
  window.NestBinders['lab-backtests']=root=>bindWorkspace(root,'backtest');
  window.NestBinders['lab-automation']=root=>bindWorkspace(root,'automation');
  window.NestBinders['lab-history']=bindHistory;
})();
