/* Nest discovery design with live assistant messages and separate action specimens. */
(()=>{
 const U=window.NestUI,e=x=>U.escape(x),badge=(x,t)=>U.badge(x,t),logo=x=>U.logo(x),params=()=>new URLSearchParams(location.hash.split('?')[1]||'');
 const link=(id,label,primary=false)=>`<a class="btn ${primary?'btn-primary':''}" href="#${id}">${label}</a>`;
 const head=(eyebrow,title,copy,actions='')=>`<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></div><div class="page-head-actions">${actions}</div></div>`;
 const panel=(title,body,aside='')=>`<section class="panel"><div class="panel-head"><h2>${title}</h2>${aside}</div><div class="panel-body">${body}</div></section>`;
 const facts=rows=>`<dl class="details-list">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
 const table=(heads,rows)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const identity=(name,sub='')=>`<span class="d-identity">${logo(name)}<span><b>${e(name)}</b>${sub?`<small>${e(sub)}</small>`:''}</span></span>`;
 const groups=[['research-defi','DeFi'],['research-rwa','RWAs'],['research-mcp','MCP Contents']];
 window.NestResearchTabs=active=>`<div class="d-research-nav"><nav class="tabs" aria-label="Research sections">${groups.map(([id,title])=>`<a class="tab ${active===id?'active':''}" ${active===id?'aria-current="page"':''} href="#${id}">${title}</a>`).join('')}</nav>${link('saved','Bookmarks ↗')}</div>`;
 const tabs=window.NestResearchTabs;
 const venues=[
 {id:'soroswap',name:'Soroswap',category:'Spot',type:'Aggregator',layer:'Soroban',assets:'XLM / USDC / USDT0',reads:['Eligible pairs & canonical token identity','Amount-specific route, fees and price impact','Minimum output, quote time and expiry'],actions:['Exact-input swap'],route:'trade',market:'xlm-usdc',website:'https://soroswap.finance',source:'Soroswap API + Stellar RPC',exit:'Swapped assets arrive in the wallet after confirmation.'},
 {id:'blend',name:'Blend',category:'Lending',type:'Lending market',layer:'Soroban',assets:'XLM / USDC',reads:['Pool reserves, rates, liquidity and utilization','Account collateral, debt and native health','Supply, repay and withdrawal capacity'],actions:['Supply','Withdraw','Borrow','Repay','Manage collateral'],route:'borrow',market:'blend-usdc',website:'https://blend.capital',source:'Blend SDK / contract + Stellar RPC',exit:'Withdrawal is limited by pool liquidity and collateral obligations.'},
 {id:'templar',name:'Templar',category:'Lending',type:'Lending market',layer:'Venue-specific',assets:'Registered market assets',reads:['Active markets and supported pairs','Rates, native risk and available capacity','Position, queue and settlement status'],actions:['Supply','Withdraw','Borrow','Repay','Manage collateral'],route:'borrow',market:'templar-usdc',website:'https://templarfi.org',source:'Templar market API + verified settlement adapter',exit:'A withdrawal may enter a queue and require an external settlement step. Availability is variable.'},
 {id:'xoxno',name:'XOXNO',category:'Lending',type:'Lending account',layer:'Soroban',assets:'XLM / USDC + registered spokes',reads:['Active assets, spokes and hubs','Rates, capacity and native risk','NFT-backed account positions and ownership'],actions:['Supply','Withdraw','Borrow','Repay','Manage collateral'],route:'borrow',market:'xoxno-usdc',website:'https://xoxno.com',source:'XOXNO API / contract + Stellar RPC',exit:'Market liquidity, account ownership and collateral safety constrain release.'},
 {id:'defindex',name:'DeFindex',category:'Vaults',type:'Strategy vault',layer:'Soroban',assets:'Verified vault assets',reads:['Vault identity and strategy allocation','Shares, underlying assets and product fees','User balance and withdrawal conditions'],actions:['Deposit','Withdraw'],route:'vault-detail',market:'defindex-usdc',website:'https://defindex.io',source:'DeFindex API / contract + Stellar RPC',exit:'Strategy liquidity, cooldowns and product rules must be verified before deposit.'},
 {id:'upshift',name:'Upshift',category:'Vaults',type:'Vault platform',layer:'Soroban',assets:'USDC / XLM by vault',reads:['Vault catalog and canonical deployment','Receipt balance, share price and allocation','Redemption requests, settlement and fees'],actions:['Deposit','Request redemption','Claim when supported'],route:'vault-detail',market:'gami-usdc',website:'https://app.upshift.finance',source:'Upshift Stellar adapter + Stellar RPC',exit:'Request redemption and track settlement before a supported claim. Product-specific timing applies.'},
 {id:'gami',name:'Gami Labs',category:'Vaults',type:'Curator',layer:'Via Upshift',assets:'earnUSDC / earnXLM',reads:['Curator and underlying protocol exposure','Product yield methodology and fees','Canonical Upshift vault and redemption model'],actions:['Deposit via Upshift','Redeem via Upshift'],route:'vault-detail',market:'gami-usdc',website:'https://app.upshift.finance',source:'Upshift deployment + curator metadata',exit:'Uses the underlying Upshift product’s redemption workflow. Curator is not a second position.'},
 {id:'sentora',name:'Sentora',category:'Vaults',type:'Curator / campaign',layer:'Soroban / provider route',assets:'USDC / XLM / PYUSD by product',reads:['Evergreen versus campaign product identity','Deposit lots, accrued and claimable rewards','Redemption timing and reward forfeiture'],actions:['Deposit','Withdraw','Claim when supported'],route:'vault-detail',market:'sentora-usdc',website:'https://app.upshift.finance/vaults/stellar/sentora-usdc',source:'Verified product adapter + campaign terms',exit:'Evergreen redemptions and campaign lot rules are separate. Verify release timing and forfeited rewards.'}
 ];
 window.NestVenueCatalog=venues;
 const chatStates=['Ready for review','Preparing','Blocked','Expired','Wallet mismatch','Awaiting signature','Submitted','Reconciling','Partially completed','Confirmed','Failed','Cancelled'];
 let chatState={messages:[],plan:null,status:'Ready for review',timer:null,busy:false,context:null,responseStopped:false,revision:0,connected:false};
 const liveChat=window.NestLiveChat?.createClient();

 function chatCard(){const plan=chatState.plan;if(!plan)return '';const s=chatState.status,ready=s==='Ready for review',inactive=['Blocked','Expired','Wallet mismatch','Failed','Cancelled'].includes(s),confirmed=s==='Confirmed';const titles={'Ready for review':'Ready for your review',Preparing:'Preparing your request',Blocked:'This action is blocked',Expired:'This preview has expired','Wallet mismatch':'Check wallet and network','Awaiting signature':'Waiting for your wallet',Submitted:'Submitted · confirmation pending',Reconciling:'Checking the existing transaction','Partially completed':'Some steps completed',Confirmed:'Confirmed effects · state specimen',Failed:'The action did not complete',Cancelled:'Plan dismissed'};const withdrawal=venues.find(v=>v.name===plan.venue)?.exit||'Verify exit conditions for the selected product.';const isSwap=plan.kind==='trade',received=(Number(plan.amount)*.17402).toFixed(4),min=(Number(received)*.995).toFixed(4);const available=ready&&!chatState.busy;return `<article class="d-intent-card ${inactive?'d-intent-inactive':''}" aria-label="Application action card"><header><span class="d-plan-symbol" aria-hidden="true">${confirmed?'✓':inactive?'!':'↗'}</span><div><h3>${titles[s]}</h3><p>${({trade:'Swap',deposit:'Deposit',withdraw:'Withdraw',repay:'Repay'})[plan.kind]} ${e(plan.amount)} ${e(plan.asset)}${isSwap?' → USDC':''}</p></div>${badge(s,confirmed?'success':inactive?'warning':'info')}</header><div class="d-intent-grid"><div><span>Spend / amount</span><strong class="mono">${e(plan.amount)} ${e(plan.asset)}</strong></div><div><span>${isSwap?'Expected receive':'Venue'}</span><strong class="mono">${chatState.busy?'Comparing routes…':isSwap?received+' USDC':e(plan.venue)}</strong></div><div><span>${isSwap?'Minimum receive':'Withdrawal'}</span><strong>${chatState.busy?'Checks pending':isSwap?min+' USDC':'Liquidity & position constraints'}</strong></div><div><span>Network fee maximum</span><strong class="mono">0.00001 XLM · fixture</strong></div></div><div class="d-card-context"><span>${identity(plan.venue)}</span><span>Mainnet · policy revision unconfirmed</span></div>${plan.kind==='deposit'?`<div class="disclosure"><b>When can I withdraw?</b><br>${e(withdrawal)}</div>`:''}${inactive?`<p class="d-card-note">${s==='Blocked'?'No eligible registered route satisfies this request. Keep the exact amount and show exclusions.':s==='Wallet mismatch'?'Expected reviewed account and Mainnet. Reconnect and prepare a fresh revision.':s==='Cancelled'?'No action was submitted. The conversation remains available.':'Prepare a fresh revision before continuing.'}</p>`:''}${s==='Reconciling'?'<p class="d-card-note">Resolve the existing hash before replacing this transaction. Closing chat does not cancel it.</p>':''}${s==='Partially completed'?'<p class="d-card-note">Show actual completed steps and remaining exposure. Recovery requires a separately reviewed plan.</p>':''}<footer>${available?`<button class="btn btn-primary" data-review="${plan.kind}" data-title="${isSwap?'Swap '+e(plan.asset)+' for USDC':'Review '+e(plan.kind)}" data-venue="${e(plan.venue)}" data-amount="${e(plan.amount)}${isSwap?'':' '+e(plan.asset)}" data-input-asset="${e(plan.asset)}" data-output-asset="USDC" data-expected-output="${received}" data-minimum-received="${min} USDC" data-withdrawal="${e(withdrawal)}">Review action</button><button class="btn btn-ghost" data-dismiss-chat-plan>Dismiss plan</button>`:inactive?'<button class="btn" data-refresh-chat-plan>Create fresh preview</button>':'<button class="btn" disabled>'+e(s)+'</button>'}${link('plan?state='+encodeURIComponent(s==='Ready for review'?'Awaiting review':s),'View plan details ↗')}<small>Local UI specimen · no signing or submission</small></footer></article>`;}
 const allocationAssets=['USDC','XLM','USDT0'],allocationHorizons=['30 days','90 days','1 year'];
 const allocationDraft={amount:'10,000',asset:'USDC',horizon:'30 days'};
 function allocationPrompt(){return `<form id="d-allocation-form" class="d-allocation-form" aria-label="Allocation comparison"><p>I want to allocate</p><div class="d-allocation-fields"><label class="field"><span class="field-label">Capital</span><input class="input mono" name="amount" id="d-allocation-amount" inputmode="decimal" maxlength="48" value="${e(allocationDraft.amount)}" aria-label="Allocation capital amount" aria-describedby="d-allocation-error" required></label><label class="field"><span class="field-label">Asset</span><select class="input" name="asset" aria-label="Allocation asset">${allocationAssets.map(asset=>`<option ${asset===allocationDraft.asset?'selected':''}>${asset}</option>`).join('')}</select></label><label class="field"><span class="field-label">Horizon</span><select class="input" name="horizon" aria-label="Allocation horizon">${allocationHorizons.map(horizon=>`<option ${horizon===allocationDraft.horizon?'selected':''}>${horizon}</option>`).join('')}</select></label><button class="btn btn-primary" type="submit">Compare with Nest ↗</button></div><p id="d-allocation-error" class="n-field-error" role="alert" hidden></p></form>`;}
 function drawChat(root){
  const transcript=root.querySelector('#d-transcript'),has=chatState.messages.length>0;
  const follow=chatState.follow!==false;
  root.classList.toggle('d-chat-has-messages',has);
  transcript.setAttribute('aria-busy',String(chatState.busy));
  if(!has){transcript.innerHTML=`<div class="d-chat-welcome"><div class="d-chat-start-heading"><img src="../assets/nest-symbol.svg" width="40" alt=""><h2>What would you like to do?</h2></div><p>Ask about a market, compare venues, or bring a specific action to review.</p><div class="d-prompt-grid">${[['Swap 1,000 XLM for USDC','Swap 1000 XLM for USDC using the best eligible route'],['Supply 1,000 USDC on Blend','Supply 1000 USDC on Blend']].map(([title,prompt])=>`<button data-prompt="${e(prompt)}"><b>${title}</b><span aria-hidden="true">↗</span></button>`).join('')}</div>${allocationPrompt()}</div>`;}
  else{
   transcript.querySelector('.d-chat-welcome')?.remove();
   chatState.messages.forEach((message,index)=>{
    let row=transcript.querySelector(`[data-message-index="${index}"]`);
    if(!row){
     row=document.createElement('div');row.dataset.messageIndex=String(index);
     row.className=message.role==='user'?'d-chat-user':'d-chat-answer';
     row.setAttribute('aria-label',message.role==='user'?'You':'Nest');
     row.innerHTML=message.role==='user'?`<p>${e(message.text)}</p>`:`<img src="../assets/nest-symbol.svg" width="28" alt=""><div><p data-message-text>${e(message.text||((chatState.busy&&!message.error)?'Thinking…':''))}</p>${message.sources?`<div class="d-chat-sources">${link('research-mcp','MCP Contents ↗')}${link('protocol-detail?slug='+window.NestProtocolForVenue(chatState.context||'soroswap'),'Protocol source ↗')}</div>`:''}</div>`;
     const anchor=transcript.querySelector('[data-intent-container]');if(anchor)anchor.before(row);else transcript.append(row);
    }else{row.querySelector('p').textContent=message.text||((chatState.busy&&!message.error&&!message.stopped)?'Thinking…':'');}
    if(message.role==='assistant'){
     let error=row.querySelector('[data-message-error]');
     if(message.error){if(!error){error=document.createElement('p');error.dataset.messageError='';error.setAttribute('role','alert');row.lastElementChild.append(error);}error.textContent=message.error;}else error?.remove();
     let note=row.querySelector('[data-message-note]');
     if(message.note||message.stopped){if(!note){note=document.createElement('p');note.dataset.messageNote='';note.className='data-note';row.lastElementChild.append(note);}note.textContent=message.note||(message.stopped?'Response stopped.':'');}else note?.remove();
    }
   });
   let action=transcript.querySelector('[data-intent-container]');
   if(chatState.plan){if(!action){action=document.createElement('div');action.dataset.intentContainer='true';transcript.append(action);}const html=chatCard();if(action.dataset.cardStatus!==chatState.status||action.dataset.amount!==chatState.plan.amount||action.dataset.venue!==chatState.plan.venue||action.dataset.kind!==chatState.plan.kind||action.dataset.asset!==chatState.plan.asset){action.innerHTML=html;Object.assign(action.dataset,{cardStatus:chatState.status,amount:chatState.plan.amount,venue:chatState.plan.venue,kind:chatState.plan.kind,asset:chatState.plan.asset});}}
   else action?.remove();
  }
  root.querySelector('#d-chat-status').textContent=chatState.busy?(chatState.activity||'Thinking…'):'Live answers · research dates and availability apply';
  root.querySelector('[data-chat-mode]').innerHTML=badge(chatState.connected?'Live assistant':'Assistant')+(chatState.network?badge(chatState.network==='testnet'?'Testnet':'Mainnet','info'):'')+badge('Guest');
  root.querySelector('#d-chat-state').disabled=chatState.busy;
  root.querySelector('[data-stop-chat]').hidden=!chatState.busy||chatState.responseStopped;
  root.querySelector('#d-chat-submit').disabled=chatState.busy;
  root.querySelector('#d-chat-state').value=chatState.status;
  const activity=root.querySelector('#d-plan-activity');activity.hidden=!chatState.plan;
  if(chatState.plan){
   const inactive=['Blocked','Expired','Wallet mismatch','Failed','Cancelled'].includes(chatState.status);
   const steps=[['Request parsed','Local input'],['Sample comparison',chatState.busy?'Preparing':'Fixture result'],['Application checks','Backend required'],['Owner review',inactive?'Unavailable':'Required']];
   root.querySelector('#d-activity-steps').innerHTML=steps.map(([name,detail],i)=>`<li class="${i===0||i===1&&!chatState.busy?'done':i===1&&chatState.busy?'running':''}"><span>${name}</span><small>${detail}</small></li>`).join('');
  }
  if(has&&follow)requestAnimationFrame(()=>{if(root.isConnected){window.scrollTo({top:document.documentElement.scrollHeight,behavior:'auto'});root.querySelector('[data-chat-latest]').hidden=true;}});
 }
 function chatScreen(){return `<section class="d-chat-workspace d-sidebar-collapsed"><aside class="d-chat-sidebar" id="d-chat-sidebar" aria-label="Conversation history"><div class="c-inline"><span class="eyebrow">Conversations</span><button class="icon-btn" data-new-nest-chat aria-label="New Nest conversation">+</button></div><button class="d-chat-history active" data-new-nest-chat title="Current conversation" aria-label="Current conversation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/></svg><span>Current conversation<small>Guest · transient</small></span></button><div class="d-chat-sidebar-links"><a class="btn" href="#lab-backtests" title="Strategy Lab" aria-label="Strategy Lab">${U.icon('info')}<span>Strategy Lab</span></a><a class="btn" href="#activity" title="Action history" aria-label="Action history">${U.icon('clock')}<span>Action history</span></a><a class="btn" href="#research-mcp" title="MCP Contents" aria-label="MCP Contents">${U.icon('search')}<span>MCP Contents</span></a></div><p class="data-note">Connect a verified wallet to save. Guest messages stay in this session.</p></aside><div class="d-chat-main"><header class="d-chat-title"><div><button class="icon-btn d-chat-toggle" data-toggle-chat-history aria-label="Toggle conversation history" aria-controls="d-chat-sidebar" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" width="18" height="18"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg></button><h1>Ask Nest</h1></div><span data-chat-mode>${badge('Assistant')}${badge('Guest')}</span></header><div class="d-transcript-shell"><div id="d-transcript" class="d-transcript" role="log" aria-label="Nest conversation" aria-live="polite" aria-relevant="additions" tabindex="0"></div><button class="btn d-chat-latest" data-chat-latest hidden>↓ Latest</button></div><details id="d-plan-activity" class="d-plan-activity" hidden><summary>Preparation activity</summary><ol id="d-activity-steps"></ol><p class="data-note">Local preview activity · backend checks remain required.</p></details><form id="d-chat-form" class="d-chat-composer"><label class="sr-only" for="d-chat-input">Message Nest</label><textarea id="d-chat-input" class="input" rows="2" placeholder="Ask Nest anything…" maxlength="4000" required></textarea><div class="d-composer-footer"><span id="d-chat-status" class="data-note"></span><div><button type="button" class="btn" data-stop-chat hidden>Stop response</button><button id="d-chat-submit" class="btn btn-primary" aria-label="Send message to Nest" type="submit">Send ↗</button></div></div></form><details class="d-state-lab"><summary>Design states</summary><label class="field"><span class="field-label">Action card specimen</span><select class="input" id="d-chat-state">${chatStates.map(s=>`<option>${s}</option>`).join('')}</select></label><p class="data-note">State specimens do not sign, submit, confirm a transaction or change a saved policy.</p></details></div></section>`;}
 window.NestScreens.chat=chatScreen;window.NestScreens.conversations=chatScreen;
 function bindChat(root){chatState.context=params().get('context')||chatState.context;const form=root.querySelector('#d-chat-form'),input=root.querySelector('#d-chat-input');chatState.render=()=>{if(root.isConnected)drawChat(root);};drawChat(root);liveChat?.network().then(network=>{chatState.network=network;chatState.render();});
 const workspace=root.querySelector('.d-chat-workspace'),toggle=root.querySelector('[data-toggle-chat-history]'),transcript=root.querySelector('#d-transcript');
 const sidebar=root.querySelector('#d-chat-sidebar');
 let historyHovered=false,historyFocused=false,historyPinned=false;
 const small=()=>workspace.getBoundingClientRect().width<=760;
 const updateHistory=()=>{const compact=small(),open=compact?workspace.classList.contains('d-history-open'):historyHovered||historyFocused||historyPinned;workspace.classList.toggle('d-sidebar-collapsed',!compact&&!open);toggle.setAttribute('aria-expanded',String(open));workspace.style.setProperty('--chat-composer-height',form.getBoundingClientRect().height+'px');};
 updateHistory();
 const resize=new ResizeObserver(updateHistory);resize.observe(workspace);resize.observe(form);window.NestChatResizeCleanup?.();window.NestChatResizeCleanup=()=>{resize.disconnect();window.removeEventListener('scroll',onPageScroll);};
 sidebar.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;historyHovered=true;updateHistory();});
 sidebar.addEventListener('pointerleave',()=>{historyHovered=false;updateHistory();});
 sidebar.addEventListener('focusin',()=>{historyFocused=true;updateHistory();});
 sidebar.addEventListener('focusout',event=>{historyFocused=sidebar.contains(event.relatedTarget);updateHistory();});
 toggle.onclick=()=>{if(small())workspace.classList.toggle('d-history-open');else historyPinned=!historyPinned;updateHistory();};
 const onPageScroll=()=>{if(!root.isConnected)return;const page=document.scrollingElement;chatState.follow=page.scrollHeight-page.scrollTop-page.clientHeight<80;root.querySelector('[data-chat-latest]').hidden=chatState.follow||!chatState.messages.length;};
 window.addEventListener('scroll',onPageScroll,{passive:true});
 root.querySelector('[data-chat-latest]').onclick=()=>{chatState.follow=true;window.scrollTo({top:document.documentElement.scrollHeight,behavior:'auto'});};
 if(window.NestChatDraft){input.value=window.NestChatDraft;window.NestChatDraft=null;input.focus();}
 const submit=async(text,allocation=null)=>{
  if(chatState.busy)return;
  const revision=chatState.revision,reply={role:'assistant',text:''};
  chatState.follow=true;chatState.busy=true;chatState.responseStopped=false;chatState.plan=null;chatState.activity='Thinking…';
  chatState.messages.push({role:'user',text},reply);chatState.render();
  try{
   if(!liveChat)throw new Error('Live chat is unavailable. Reload the page and try again.');
   await liveChat.send(text,event=>{
    if(revision!==chatState.revision)return;
    if(event.type==='text_delta'){reply.text+=event.delta;chatState.connected=true;chatState.activity='Answering…';}
    if(event.type==='tool_started'){chatState.connected=true;chatState.activity=({list_markets:'Reading research…',raven_search:'Searching sources…',raven_execute:'Reading sources…',compare_opportunities:'Comparing live lending rates…',propose_intent:'Preparing a proposal…'})[event.name]||'Checking sources…';}
    if(event.type==='tool_completed')chatState.activity='Writing the comparison…';
    if(event.type==='error')reply.error=event.message;
    if(event.type==='interrupted'){reply.stopped=event.reason==='stopped';if(!reply.stopped)reply.error='The answer was interrupted. Please send the message again.';}
    if(event.type==='proposal')reply.note='A proposal was prepared. Review financial actions in the live workspace; design specimens cannot sign or submit.';
    chatState.render();
   });
   if(revision===chatState.revision&&!reply.text&&!reply.error&&!reply.stopped&&!reply.note)reply.error='The assistant returned no answer. Please try again.';
  }catch(error){if(revision===chatState.revision)reply.error=error.message||'The message could not be sent. Please try again.';}
  finally{if(revision===chatState.revision){chatState.busy=false;chatState.activity='';chatState.render();}}
 };
 root.addEventListener('input',event=>{
  const allocation=event.target.closest('#d-allocation-form');if(!allocation)return;
  if(event.target.name==='amount')allocationDraft.amount=event.target.value;
  event.target.removeAttribute('aria-invalid');allocation.querySelector('#d-allocation-error').hidden=true;
 });
 root.addEventListener('change',event=>{
  if(!event.target.closest('#d-allocation-form'))return;
  if(event.target.name==='asset'&&allocationAssets.includes(event.target.value))allocationDraft.asset=event.target.value;
  if(event.target.name==='horizon'&&allocationHorizons.includes(event.target.value))allocationDraft.horizon=event.target.value;
 });
 root.addEventListener('submit',event=>{
  if(event.target.id!=='d-allocation-form')return;event.preventDefault();
  const fields=event.target.elements,raw=fields.amount.value.trim(),asset=fields.asset.value,horizon=fields.horizon.value;
  const valid=/^(?:\d+(?:\.\d+)?|\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(raw)&&/[1-9]/.test(raw)&&allocationAssets.includes(asset)&&allocationHorizons.includes(horizon);
  if(!valid){const error=event.target.querySelector('#d-allocation-error');error.hidden=false;error.textContent='Enter a positive decimal amount, such as 10,000 or 0.5.';fields.amount.setAttribute('aria-invalid','true');fields.amount.focus();return;}
  const amount=raw.replace(/,/g,'').replace(/^\./,'0.').replace(/^0+(?=\d)/,'');
  Object.assign(allocationDraft,{amount:raw,asset,horizon});input.value='';
  submit(`I want to allocate ${amount} ${asset} for ${horizon}. Compare eligible opportunities for these inputs.`,{amount,asset,horizon});input.focus();
 });
 form.onsubmit=ev=>{ev.preventDefault();const text=input.value.trim();if(text){input.value='';submit(text);}};input.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();if(input.value.trim())form.requestSubmit();}});root.querySelector('#d-chat-state').onchange=ev=>{liveChat?.reset();chatState.revision+=1;clearTimeout(chatState.timer);chatState.busy=false;if(!chatState.plan){chatState.plan={kind:'trade',amount:'1000',asset:'XLM',venue:'Soroswap'};chatState.messages=[{role:'user',text:'Swap 1000 XLM for USDC'},{role:'assistant',text:'Application-owned action card specimen. No transaction has been executed.'}];}chatState.status=ev.target.value;drawChat(root);};root.addEventListener('click',ev=>{const prompt=ev.target.closest('[data-prompt]');if(prompt){input.value=prompt.dataset.prompt;input.focus();}if(ev.target.closest('[data-new-nest-chat]')){liveChat?.reset();chatState.revision+=1;clearTimeout(chatState.timer);Object.assign(chatState,{messages:[],plan:null,busy:false,status:'Ready for review',responseStopped:false,follow:true});drawChat(root);input.value='';}if(ev.target.closest('[data-stop-chat]')){chatState.responseStopped=true;liveChat?.stop();drawChat(root);}if(ev.target.closest('[data-dismiss-chat-plan]')){chatState.status='Cancelled';drawChat(root);}if(ev.target.closest('[data-refresh-chat-plan]')){chatState.status='Ready for review';drawChat(root);}});}
 window.NestBinders.chat=bindChat;window.NestBinders.conversations=bindChat;
 document.addEventListener('click',ev=>{const draft=ev.target.closest('[data-chat-draft]');if(draft){window.NestChatDraft=draft.dataset.chatDraft;location.hash='chat';}});
})();
