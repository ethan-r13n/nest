/* Shared capitalization preserves identities and descriptive copy inside rich controls. */
(() => {
  const acronyms=new Set(['AI','API','APIs','APR','APY','AQUA','BTC','DEX','DEXs','EMA','ETFs','EURC','EUTBL','FAQ','HF','HTTP','ID','IDs','KYC','LP','LTV','MCP','NFT','NFTs','OHLC','P&L','PYUSD','RPC','RWA','RWAs','SDK','SDKs','SEC','SEP','SEPs','SDF','TVL','UI','URL','URLs','USD','USDC','USDT','USDT0','UTC','XLM','XRP','BENJI','RLUSD','BLND','XOXNO','AMM','EU','US','JSON','SQL','NFTs']);
  const names={defi:'DeFi',defindex:'DeFindex',soroswap:'Soroswap',solvbtc:'SolvBTC',xsolvbtc:'xSolvBTC',rwas:'RWAs',rwa:'RWA',mcp:'MCP',csv:'CSV',tsv:'TSV',pdf:'PDF',html:'HTML',xdr:'XDR'};
  function titleCase(value){
    return value.replace(/RWA\.xyz|[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu,word=>{
      if(word==='RWA.xyz'||acronyms.has(word)||/\d/.test(word)||word.length>30)return word;
      if(names[word.toLowerCase()])return names[word.toLowerCase()];
      if(/[a-z].*[A-Z]/.test(word))return word;
      const normalized=word===word.toUpperCase()?word.toLowerCase():word;
      return normalized[0].toLocaleUpperCase('en')+normalized.slice(1);
    });
  }
  const actionSelector='button,.btn,.button,.chip,[role=button],summary,input[type=button],input[type=submit],input[type=reset]';
  const selector='h1,h2,h3,h4,h5,h6,[role=heading],[data-title-case],.tab,[role=tab],.primary-nav a,.mobile-nav a,th,.mkt-op-name,'+actionSelector;
  function apply(host=document){
    const headings=[...(host.matches?.(selector)?[host]:[]),...host.querySelectorAll(selector)];
    headings.forEach(heading=>{
      if(heading.closest?.('[data-preserve-case]'))return;
      const action=heading.matches(actionSelector);
      if(action){
        const label=heading.getAttribute('aria-label');
        if(label&&titleCase(label)!==label)heading.setAttribute('aria-label',titleCase(label));
        if(heading.matches('input')){heading.value=titleCase(heading.value);return;}
      }
      const walk=node=>{
        for(const child of node.childNodes){
          if(child.nodeType===3){const text=titleCase(child.nodeValue);if(text!==child.nodeValue)child.nodeValue=text;}
          else if(child.nodeType===1&&!child.matches('script,style,code,pre,textarea,input,svg,[data-preserve-case]')&&!(action&&child.matches('p,small,.data-note,.subtle,[data-action-description]')))walk(child);
        }
      };walk(heading);
    });
    const title=titleCase(document.title);if(title!==document.title)document.title=title;
  }
  let frame;
  const observer=new MutationObserver(records=>{
    if(records.every(record=>record.target.closest?.('svg,canvas,.ux-tooltip,.ux-help')))return;
    cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>apply());
  });
  apply();observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.NestTypography={apply,titleCase};
})();
