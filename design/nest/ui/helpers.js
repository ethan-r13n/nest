window.NestScreens=window.NestScreens||{};window.NestBinders=window.NestBinders||{};
window.NestUI={
  escape(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));},
  badge(text,tone='neutral'){return `<span class="badge badge-${tone}">${this.escape(text)}</span>`;},
  stat(label,value,detail=''){return `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value mono">${value}</strong>${detail?`<span class="metric-detail">${detail}</span>`:''}</div>`;},
  icon(name){const paths={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',chevron:'<path d="m8 5 7 7-7 7"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[name]||paths.info}</svg>`;},
  download(filename,text,type='text/plain'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);},
  toast(text){window.showToast?.(text);}
};
