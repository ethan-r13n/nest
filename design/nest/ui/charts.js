(function(){
const U=window.NestUI;
function draw(config,width){
 const {title='History',series=[],unit='USD',labels=['01 Sep','15 Sep','30 Sep']}=config;
 const w=Math.max(240,Math.floor(width)),h=Math.max(210,config.height||230),l=w<430?58:66,r=18,t=22,b=34;
 const nums=series.flatMap(s=>(s.values||[]).map(v=>typeof v==='number'?v:Number(v.value??v.y))).filter(Number.isFinite);
 if(!nums.length)return '<div class="empty-state"><h3>History unavailable</h3><p>No verified observations are available for this series.</p></div>';
 const lo=Math.min(...nums),hi=Math.max(...nums),pad=(hi-lo||Math.abs(hi)||1)*.1,min=lo-pad,max=hi+pad;
 const y=n=>t+(max-n)/(max-min)*(h-t-b);
 function format(n){const abs=Math.abs(n);let s=abs>=1e9?(n/1e9).toFixed(1)+'b':abs>=1e6?(n/1e6).toFixed(0)+'m':abs>=1e3?(n/1e3).toFixed(1)+'k':abs<1?n.toFixed(4):abs<10?n.toFixed(3):n.toFixed(0);return unit==='%'?s+'%':unit==='USD'?'$'+s:s;}
 const colors=['#eef0e2','#94bce7','#e7c66c','#b4a2cf'];let svg=`<svg class="history-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${U.escape(title)}"><title>${U.escape(title)}</title><desc>${U.escape(unit)}. Source and fixture scope are described next to this chart.</desc><text x="${l}" y="12">${U.escape(unit)}</text>`;
 for(let i=0;i<4;i++){const v=min+(max-min)*i/3;svg+=`<path d="M${l} ${y(v)}H${w-r}" stroke="currentColor" opacity=".08"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end">${format(v)}</text>`;}
 series.forEach((s,i)=>{const values=(s.values||[]).map(v=>typeof v==='number'?v:Number(v.value??v.y));const p=values.map((v,j)=>`${l+j/Math.max(1,values.length-1)*(w-l-r)},${y(v)}`).join(' ');svg+=`<polyline points="${p}" fill="none" stroke="${s.color||colors[i%colors.length]}" stroke-width="2" ${i?'stroke-dasharray="5 3"':''}/>`;});
 const shown=w<360&&labels.length>2?[labels[0],labels.at(-1)]:labels;shown.forEach((s,i)=>svg+=`<text x="${l+i/Math.max(1,shown.length-1)*(w-l-r)}" y="${h-8}" text-anchor="${i===0?'start':i===shown.length-1?'end':'middle'}">${U.escape(s)}</text>`);svg+='</svg>';
 return svg+`<div class="chart-legend">${series.map((s,i)=>`<span><i style="background:${s.color||colors[i%colors.length]}"></i>${U.escape(s.name||title)}</span>`).join('')}</div>`;
}
U.chart=function(config){return `<div class="chart-container" data-nest-chart data-chart-config="${U.escape(JSON.stringify(config))}">${draw(config,640)}</div>`;};
U.initCharts=function(root){root?.querySelectorAll('[data-nest-chart]').forEach(el=>{if(el._nestChartObserver)return;let lastWidth=0;const render=()=>{const width=el.getBoundingClientRect().width;if(width<1||Math.round(width)===lastWidth)return;lastWidth=Math.round(width);el.innerHTML=draw(JSON.parse(el.dataset.chartConfig),width);};el._nestChartObserver=new ResizeObserver(render);el._nestChartObserver.observe(el);render();});};
U.disposeCharts=function(root){root?.querySelectorAll('[data-nest-chart]').forEach(el=>el._nestChartObserver?.disconnect());};
})();
