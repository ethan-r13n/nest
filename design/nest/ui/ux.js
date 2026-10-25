/* Shared contextual help, input feedback and transient draft recovery. */
(() => {
  const guides = {
    chat: 'Ask a question or compare an allocation by amount, asset and horizon. A chat proposal still needs a separate action review and wallet approval.',
    'research-defi': 'Explore Stellar protocols and their source data. TVL is scoped to Stellar; other protocol metrics may cover multiple chains. Research values are not executable quotes.',
    'research-rwa': 'Compare tokenized assets on Stellar. Access badges describe KYC, issuer mint/redemption and DEX availability separately; check the linked source for eligibility.',
    'research-mcp': 'Browse what connected tools can read. A readable market or venue does not imply trading or signing support.',
    'protocol-detail': 'Inspect the selected protocol, its source scope and supported markets. Unavailable data stays unknown rather than being treated as zero.',
    'asset-detail': 'Inspect asset identity, issuer and access conditions before using it. A ticker alone does not identify a token.',
    saved: 'Bookmarks link to sources, not live quotes. Refresh source data before acting on an item.',
    vaults: 'Filter opportunities by asset, risk profile and exit conditions. Reported yield can change and does not guarantee a return.',
    liquidity: 'Compare vaults and liquidity pools using the same filters. Liquidity pools expose you to both assets and changes in their relative prices.',
    'vault-detail': 'Check the strategy, costs, withdrawal conditions and source time before depositing. An estimated yield is not a promised return.',
    'liquidity-detail': 'Set maximum token contributions or the shares to remove. Review exact token amounts, minimum outputs and transfer restrictions before signing.',
    trade: 'Enter the amount you want to spend, then refresh the quote. Changing the amount or pair invalidates the previous review. Chart prices are illustrative, not executable quotes.',
    borrow: 'Set collateral, debt, horizon, maximum rate and venue. Compare identical terms; risk limits and health metrics depend on the selected venue.',
    supply: 'Compare the same amount and horizon across lending venues. The horizon is an estimate window, not a guaranteed maturity or withdrawal date.',
    positions: 'Inspect a position before adding or releasing collateral, repaying or closing. Review the before-and-after debt and the venue’s own risk metric.',
    'lab-backtests': 'Describe a testable strategy and resolve the missing inputs. Historical results depend on the data window, fees and assumptions; they do not predict future returns.',
    'lab-automation': 'Define the signal, threshold and cadence before confirming a rule. Monitoring does not grant wallet authority or automatically approve a financial action.',
    'lab-history': 'Inspect saved runs and their inputs, assumptions and results. Failed or incomplete runs should be corrected and rerun before comparing performance.',
    portfolio: 'Inspect balances and positions, then choose an action in context. Watched accounts are read-only and unverified asset identity blocks financial review.',
    activity: 'Track actions through submission and confirmation. Submission alone does not prove a transaction succeeded; inspect the receipt for final effects.',
    plan: 'Inspect each action step and its receipt. Refresh failed or expired preparations before reviewing again; never resubmit a confirmed step.',
    connections: 'Connection permissions describe data access. An expired or disconnected source needs reconnection; it never gains wallet signing authority.',
    alerts: 'Read the alert, inspect the affected item, and resolve the underlying condition. Marking an alert as read does not fix that condition.',
    conversations: 'Conversation history can contain research and proposed actions. A proposal requires the same action review as a form or position.',
    'policy-states': 'Guardrails apply to a wallet and network. A draft or conflicting revision must be resolved before saved preferences can be used.',
    'wallet-access': 'Explore publicly, watch an account read-only, or verify ownership. A connected address is not an ownership-verified session.'
  };
  const glossary = {
    'tvl': 'Total value locked: the reported USD value held in a protocol or pool. Check the source time and whether the value is chain-specific.',
    'reported tvl': 'Pool value reported by the source. A USD valuation does not guarantee that all funds are available to withdraw.',
    'apr': 'Annual percentage rate without compounding. A variable rate can change during your selected horizon.',
    'reported apr': 'Annualized rate reported by the source. It may include rewards and does not guarantee a realized return.',
    'apy': 'Annual percentage yield includes an assumed compounding schedule. Actual returns depend on rates, fees and compounding.',
    'net apy': 'Estimated annual yield after the costs included by the source. Check which fees and incentives the estimate includes.',
    'base apr / incentives': 'Base lending yield and additional rewards are separate. Incentives can change, expire or be paid in another asset.',
    'horizon return¹': 'An estimate using the entered amount, initial rate and horizon. It is not a guaranteed payout and excludes unknown costs.',
    'comparison horizon · days': 'The number of days used to compare returns at identical inputs. It is not a maturity date or a withdrawal guarantee.',
    'horizon': 'The period used for comparison or testing. Product lockups and withdrawal timing are separate conditions.',
    'ltv': 'Loan-to-value: debt divided by collateral value. Supported limits and liquidation thresholds are venue-specific.',
    'health factor': 'A venue-native measure of collateral safety. Use the venue’s own threshold; values are not comparable across all lending protocols.',
    'minimum received': 'The minimum output permitted by the reviewed swap bounds. A worse result should fail rather than silently accept less.',
    'max slippage': 'The allowed movement between the quoted result and execution. It is separate from the price impact caused by your order.',
    'max slippage · %': 'Your proposed slippage limit as a percentage. Saving a preference does not approve a swap.',
    'price impact': 'The estimated change in price caused by this order’s size relative to available liquidity.',
    'impact warning · %': 'The price-impact level at which a warning appears. A warning threshold is separate from a blocking execution limit.',
    'network fee maximum': 'The maximum network fee allowed by the reviewed preparation, in its stated asset. The confirmed receipt shows the actual fee.',
    'quote age / validity': 'Quote age and provider expiry both matter. Refresh an expired quote before reviewing; changing inputs also invalidates it.',
    'max quote age · seconds': 'The oldest quote you propose accepting. A venue or provider may impose a shorter validity window.',
    'swap fee tier': 'The pool’s published swap fee. Other network or routing costs may apply and belong in the action review.',
    'fee apr': 'Annualized trading fees reported for this pool. Past trading activity does not guarantee future fees.',
    'rewards apr': 'Annualized reward estimate, separate from trading fees. Reward price, eligibility and emissions can change.',
    'risk profile': 'A relative strategy classification, not a guarantee against loss. Inspect the strategy’s market, execution and contract risks.',
    'exit availability': 'The conditions for accessing deposited funds, including liquidity, queues, cooldowns and collateral obligations.',
    'usd notional': 'Quantity multiplied by the current reference price. This is an estimate before execution costs.',
    'p&l': 'Profit or loss relative to the recorded cost basis. Reference-price P&L may differ from the result after fees and execution.',
    'cost basis': 'The recorded acquisition cost used to estimate profit or loss. It may not include all external trades or fees.',
    'source tolerance': 'Maximum acceptable source age measured from observation time. This cannot extend chain or oracle validity.',
    'custom fee ceiling · optional': 'An optional maximum fee with an explicit fee asset. Review every prepared fee maximum before signing.',
    'venue-native warning / minimum': 'Choose a risk measure supported by the venue. Warning levels and hard minimums are separate settings.',
    'capacity': 'The amount a venue can support under the current quote. An unsupported amount should be excluded rather than silently reduced.',
    'minimum received / max spend': 'Exact output and spending bounds from the prepared revision. Review again if any amount, fee or receiver changes.'
  };
  Object.assign(glossary,{
    'borrow apr':glossary.apr, 'apr · borrow / lend':glossary.apr,
    'ltv / hf':glossary.ltv+' '+glossary['health factor'],
    'native risk / initial ltv':glossary.ltv+' '+glossary['health factor'],
    'unrealized p&l':glossary['p&l'], 'fee tier':glossary['swap fee tier'],
    'stellar tvl':glossary.tvl, 'total value locked':glossary.tvl,
    'aqua rewards apr':glossary['rewards apr'], 'other incentives apr':glossary['rewards apr'],
    'source total value':'Value reported by the asset source. Issuance value does not establish secondary-market liquidity or an executable price.',
    'holders':'Number of holders reported by the source. It does not measure available liquidity or eligibility to buy.',
    'tokenization':'The source’s tokenization classification. Transferability and investor eligibility are separate conditions.'
  });
  const drafts = new Map();
  let root, route, observer, scheduled, tooltip, anchor, helpTimer, serial = 0;
  const editable = 'input:not([type=hidden]):not([type=password]):not([type=file]):not([type=range]):not([type=submit]):not([type=button]),textarea,select';
  const key = () => location.hash || '#research-defi';
  const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[↓↑⌄]/g, '').trim();
  const fieldKey = (el, index) => el.id ? `id:${el.id}` : `${el.tagName}:${el.name || ''}:${index}`;
  const controls = host => [...host.querySelectorAll(editable)].filter(el => !el.disabled && !el.readOnly && !el.closest('[data-ux-transient]'));
  function capture(host) {
    if (!host?.dataset.uxDraftKey || host.dataset.uxState !== 'default') return;
    const fields = controls(host);
    if (!fields.length) return;
    drafts.set(host.dataset.uxDraftKey, fields.map((el, i) => ({key:fieldKey(el,i), value:el.value, checked:el.checked})));
  }
  function restore(host,subset) {
    const saved = subset||drafts.get(host.dataset.uxDraftKey);
    if (!saved || host.dataset.uxState !== 'default') return [];
    const changed = [];
    controls(host).forEach((el,i) => {
      const draft = saved.find(item => item.key === fieldKey(el,i));
      if (!draft) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== draft.checked) {el.checked=draft.checked;changed.push(el);}
      } else if (el.value !== draft.value && (el.tagName !== 'SELECT' || [...el.options].some(o=>o.value===draft.value))) {
        el.value=draft.value;changed.push(el);
      }
    });
    return changed;
  }
  function hideHelp() {
    clearTimeout(helpTimer);
    if (anchor) {anchor.setAttribute('aria-expanded','false');anchor.removeAttribute('aria-describedby');}
    try {tooltip?.hidePopover();} catch {}
    tooltip?.remove(); tooltip=null;anchor=null;
  }
  function positionHelp() {
    if (!anchor?.isConnected || !tooltip) return hideHelp();
    const r=anchor.getBoundingClientRect(), margin=12, width=Math.min(320,innerWidth-margin*2);
    tooltip.style.width=width+'px';
    const height=tooltip.getBoundingClientRect().height;
    tooltip.style.left=Math.max(margin,Math.min(innerWidth-width-margin,r.left+r.width/2-width/2))+'px';
    tooltip.style.top=Math.max(margin,r.bottom+8+height<innerHeight-margin?r.bottom+8:r.top-height-8)+'px';
  }
  function showHelp(button) {
    clearTimeout(helpTimer);if (anchor===button) return;
    hideHelp();anchor=button;
    tooltip=document.createElement('div');tooltip.id='nest-context-tooltip';tooltip.className='ux-tooltip';tooltip.setAttribute('role','tooltip');tooltip.textContent=button.dataset.uxHelp;
    tooltip.setAttribute('popover','manual');(button.closest('dialog[open]')||document.body).append(tooltip);
    tooltip.addEventListener('mouseenter',()=>clearTimeout(helpTimer));tooltip.addEventListener('mouseleave',()=>{if(document.activeElement!==anchor)hideHelp();});
    button.setAttribute('aria-describedby',tooltip.id);button.setAttribute('aria-expanded','true');
    try {tooltip.showPopover();} catch {tooltip.removeAttribute('popover');}
    positionHelp();
  }
  function help(host, text, label) {
    if (host.querySelector(':scope > .ux-help')) return;
    const b=document.createElement('button');b.type='button';b.className='ux-help';b.dataset.uxHelp=text;b.setAttribute('aria-label',`About ${label}`);b.setAttribute('aria-expanded','false');
    b.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor"/><path d="M10 9v5M10 6v1" stroke="currentColor" stroke-width="1.6"/></svg>';
    b.addEventListener('mouseenter',()=>showHelp(b));b.addEventListener('mouseleave',event=>{if(!tooltip?.contains(event.relatedTarget)&&document.activeElement!==b)helpTimer=setTimeout(hideHelp,180);});
    b.addEventListener('focus',()=>showHelp(b));b.addEventListener('blur',hideHelp);
    b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();showHelp(b);});
    host.append(b);
  }
  function enhance(host, currentRoute) {
    if (!host) return;
    host.querySelectorAll('input,select,textarea').forEach(el=>{if(!el.hasAttribute('aria-label')&&!el.hasAttribute('aria-labelledby')&&el.labels?.length){const label=[...el.labels].map(l=>(l.querySelector('.field-label,.eyebrow')?.textContent||l.textContent).trim()).join(' ');if(label)el.setAttribute('aria-label',label);}});
    const heading=host.querySelector('h1')||host.querySelector('h2');
    if (heading && guides[currentRoute]) help(heading,guides[currentRoute],`${heading.childNodes[0]?.textContent?.trim()||'this page'}`);
    host.querySelectorAll('.field-label,.metric-label,dt,th,.eyebrow,.mkt-filter-group>span,.r-side-metrics>div>span').forEach(label=>{
      if(label.closest('.r-metric-help,.ux-help,[data-ux-ignore]')||label.querySelector('button,a,input,select')||label.parentElement?.querySelector(':scope > .r-metric-help')||label.closest('button,a,summary'))return;
      const title=normalize(label.textContent),text=glossary[title];if(text)help(label,text,label.textContent.trim());
    });
    host.querySelectorAll('textarea').forEach(el=>{
      if(!el.labels?.length&&!el.hasAttribute('aria-label')&&!el.hasAttribute('aria-labelledby'))el.setAttribute('aria-label','Message Nest');
    });
    host.querySelectorAll('#trade-input,#vault-amount,#lp-amount-0,#lp-amount-1,#lp-shares,#c-supply-form [name=amount]').forEach(el=>el.dataset.uxPositive='true');
    host.querySelectorAll('#guardrails-form input[inputmode=decimal]').forEach(el=>{el.dataset.uxPercent='true';});
    host.querySelectorAll('#guardrails-form input[inputmode=numeric]').forEach(el=>{el.dataset.uxInteger='true';});
  }
  function errorNode(el) {
    let node=el.dataset.uxField&&document.getElementById(`${el.dataset.uxField}-error`);
    if (!node) {
      el.dataset.uxField ||= `ux-field-${++serial}`;
      node=document.createElement('span');node.id=`${el.dataset.uxField}-error`;node.className='ux-field-error';node.dataset.uxErrorFor=el.dataset.uxField;node.setAttribute('aria-live','polite');
      const group=el.closest('.mkt-amount,.lp-input-label,.field')||el.parentElement;group.append(node);
      const ids=new Set((el.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));ids.add(node.id);el.setAttribute('aria-describedby',[...ids].join(' '));
    }
    return node;
  }
  function message(el) {
    if (el.disabled||el.readOnly||el.closest('[hidden]'))return '';
    const value=el.value.trim();
    if (el.required&&!value) return el.tagName==='TEXTAREA'?'Enter a message before sending.':'Complete this field.';
    if(el.closest('#c-watch')&&el.name==='account'&&value&&!/^G[A-Z2-7]{55}$/.test(value))return 'Enter a complete public Stellar account starting with G. Network and checksum verification follow in the connected app.';
    if(el.dataset.uxPositive&&!value)return 'Enter an amount greater than 0.';
    if(el.dataset.uxPositive&&value&&!(/^\d+(\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)>0))return 'Enter an amount greater than 0, using digits and a decimal point.';
    if(el.dataset.uxPercent&&value&&!(/^\d+(\.\d+)?$/.test(value)&&Number(value)>=0&&Number(value)<=100))return 'Enter a percentage from 0 to 100.';
    if(el.dataset.uxInteger&&value&&!(/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0))return 'Enter a whole number of seconds greater than 0.';
    if(el.validity?.rangeUnderflow)return `Enter ${el.min} or more.`;
    if(el.validity?.rangeOverflow)return `Enter ${el.max} or less.`;
    if(el.validity?.stepMismatch)return 'Enter a value in the supported increment.';
    if(el.validity?.patternMismatch)return 'Use the requested format, such as 1000 or 0.5 for an amount.';
    if(el.validity?.typeMismatch)return 'Enter a valid value in the requested format.';
    if(el.validity?.badInput)return 'Enter a valid number.';
    return '';
  }
  function validate(el, force=false) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement))return true;
    if(el.closest('#credit-form')||el.id==='position-amount')return true;
    const text=message(el),existing=el.dataset.uxField&&document.getElementById(`${el.dataset.uxField}-error`);
    if (text&&(force||el.dataset.uxTouched)) {
      errorNode(el).textContent=text;el.setAttribute('aria-invalid','true');el.dataset.uxInvalid='true';return false;
    }
    if(!text&&el.dataset.uxInvalid){el.removeAttribute('aria-invalid');delete el.dataset.uxInvalid;if(existing)existing.remove();el.removeAttribute('data-ux-field');const ids=(el.getAttribute('aria-describedby')||'').split(' ').filter(id=>!id.startsWith('ux-field-'));ids.length?el.setAttribute('aria-describedby',ids.join(' ')):el.removeAttribute('aria-describedby');}
    return !text;
  }
  document.addEventListener('invalid',event=>{event.preventDefault();validate(event.target,true);const form=event.target.form;if(form){const first=[...form.elements].find(el=>el.willValidate&&!el.validity.valid);if(first===event.target)first.focus();}},true);
  document.addEventListener('focusout',event=>{const el=event.target;if(!el.matches?.('input,textarea,select'))return;el.dataset.uxTouched='true';validate(el);});
  document.addEventListener('input',event=>{if(event.target.dataset?.uxInvalid)validate(event.target,true);});
  document.addEventListener('submit',event=>{
    const fields=[...event.target.querySelectorAll('input,textarea,select')],invalid=fields.filter(el=>!validate(el,true));
    if(invalid.length){event.preventDefault();event.stopImmediatePropagation();invalid[0].focus();}
  },true);
  document.addEventListener('click',event=>{
    if(!event.target.closest('.ux-help,.ux-tooltip'))hideHelp();
    if(event.target.closest('[data-refresh-quote]')){const el=document.getElementById('trade-input');if(el)validate(el,true);}
  },true);
  document.addEventListener('click',event=>{if(event.target.closest('[data-amount],[data-vault-action],[data-lp-mode]'))document.querySelectorAll('[data-ux-invalid=true]').forEach(el=>validate(el,true));});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideHelp();});
  window.addEventListener('resize',positionHelp);document.addEventListener('scroll',positionHelp,true);
  const dialogObserver=new MutationObserver(records=>{
    const hosts=new Set(records.map(r=>r.target.closest?.('dialog,#agent-dock')).filter(Boolean));hosts.forEach(host=>enhance(host,route));
  });
  document.querySelectorAll('dialog,#agent-dock').forEach(dialog=>dialogObserver.observe(dialog,{childList:true,subtree:true}));
  window.NestUX={
    capture,
    prepare(host,currentRoute,state){host.dataset.uxDraftKey=key();host.dataset.uxState=state;return restore(host);},
    mount(host,currentRoute,changed=[]){
      root=host;route=currentRoute;enhance(root,route);
      changed.forEach(el=>{if(el.isConnected){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}});
      const waiting=(drafts.get(host.dataset.uxDraftKey)||[]).filter(item=>!controls(host).some((el,i)=>fieldKey(el,i)===item.key));
      observer=new MutationObserver(records=>{
        if(records.every(record=>record.target.closest?.('svg,canvas,.ux-help,.ux-tooltip,.ux-field-error')))return;
        cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(()=>{
          if(!root?.isConnected)return;enhance(root,route);
          if(waiting.length){const available=waiting.filter(item=>controls(root).some((el,i)=>fieldKey(el,i)===item.key));const restored=restore(root,available);available.forEach(item=>waiting.splice(waiting.indexOf(item),1));restored.forEach(el=>{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
        });
      });observer.observe(root,{childList:true,subtree:true});
    },
    dispose(){hideHelp();observer?.disconnect();cancelAnimationFrame(scheduled);root=null;},
    guides,glossary
  };
})();
