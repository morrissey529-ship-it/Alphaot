/* Monthly OT charts. Read-only: receives the exact calendar OT history data. */
(function(){
  'use strict';
  const panel=document.getElementById('alphaStatsPanel');
  if(!panel)return;
  const bars=panel.querySelector('#alphaStatsSpotsChart');
  const line=panel.querySelector('#alphaStatsAverageChart');
  const status=panel.querySelector('#alphaStatsChartsStatus');
  const refresh=panel.querySelector('#alphaStatsRefresh');
  if(!bars||!line||!status)return;
  const dateFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
  const monthFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long'});
  const chicagoFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit'});
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentKey=()=>{
    const p=Object.fromEntries(chicagoFormatter.formatToParts(new Date()).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month;
  };
  function monthDate(key){return new Date(key+'-01T12:00:00Z');}
  function monthLabel(key){return dateFormatter.format(monthDate(key));}
  function monthShortParts(key){
    const date=monthDate(key);
    return [monthFormatter.format(date),String(date.getUTCFullYear())];
  }
  function totals(dates){
    let days=0,spots=0,calledOff=0;
    for(const items of Object.values(dates||{})){
      if(!Array.isArray(items))continue;
      let count=0;
      for(const item of items){
        if(!item || !['assigned','called_off'].includes(item.status))continue;
        count++;if(item.status==='called_off')calledOff++;
      }
      if(count){days++;spots+=count;}
    }
    return {days,spots,calledOff,average:days?spots/days:0};
  }
  function buildRows(grouped){
    return Object.keys(grouped||{}).sort().map(key=>({key,...totals(grouped[key])}));
  }
  function spotsChart(rows){
    if(!rows.length)return '<p class="otstats-empty">No OT months are available yet.</p>';
    const maximum=Math.max(1,...rows.map(r=>r.spots));
    const current=currentKey();
    return '<div class="otstats-bar-grid" role="img" aria-label="'+esc(rows.map(r=>monthLabel(r.key)+': '+r.spots+' OT spots').join('; '))+'">'+
      rows.map(r=>{
        const [name,year]=monthShortParts(r.key);
        const height=Math.max(0,Math.min(100,r.spots/maximum*100)).toFixed(2);
        return '<div class="otstats-bar-column '+(r.key===current?'otstats-bar-current':'')+'" title="'+esc(monthLabel(r.key)+': '+r.spots+' OT spots')+'">'+
          '<span class="otstats-bar-value">'+r.spots+'</span>'+
          '<span class="otstats-bar-track"><span class="otstats-bar-fill" style="height:'+height+'%;'+(r.spots?'min-height:2px;':'')+'"></span></span>'+
          '<span class="otstats-chart-month">'+esc(name)+'<small>'+esc(year)+'</small></span>'+
        '</div>';
      }).join('')+'</div>';
  }
  function averageChart(rows){
    if(!rows.length)return '<p class="otstats-empty">No OT months are available yet.</p>';
    const each=124,left=56,right=32,top=28,bottom=176;
    const width=Math.max(370,left+right+each*Math.max(1,rows.length));
    const maxAverage=Math.max(1,Math.ceil(Math.max(...rows.map(r=>r.average))/0.5)*0.5);
    const plotHeight=bottom-top;
    const xAt=index=>left+each*(index+0.5);
    const yAt=value=>bottom-(value/maxAverage)*plotHeight;
    const points=rows.map((r,i)=>({x:xAt(i),y:yAt(r.average),value:r.average,key:r.key}));
    const path=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
    const grids=[0,1,2,3,4].map(n=>{
      const y=bottom-n*(plotHeight/4),value=maxAverage*n/4;
      return '<line x1="'+left+'" y1="'+y.toFixed(1)+'" x2="'+(width-right)+'" y2="'+y.toFixed(1)+'" stroke="#344457" stroke-width="1" stroke-dasharray="'+(n===0?'':'3 4')+'"/>'+
        '<text x="'+(left-10)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" fill="#9fafc1" font-size="11">'+value.toFixed(1)+'</text>';
    }).join('');
    const linePath=points.length>1?'<path d="'+path+'" fill="none" stroke="#8fd8c2" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>':'';
    const pointsHTML=points.map(p=>{
      const [name,year]=monthShortParts(p.key);
      const labelY=Math.max(top-8,p.y-12);
      return '<circle cx="'+p.x+'" cy="'+p.y.toFixed(1)+'" r="5" fill="#8fd8c2" stroke="#182838" stroke-width="2"/>'+
        '<text x="'+p.x+'" y="'+labelY.toFixed(1)+'" text-anchor="middle" font-size="12" font-weight="750" fill="#daeee8">'+p.value.toFixed(2)+'</text>'+
        '<text x="'+p.x+'" y="201" text-anchor="middle" fill="#a8b7c9" font-size="11">'+esc(name)+'</text>'+
        '<text x="'+p.x+'" y="217" text-anchor="middle" fill="#869bb4" font-size="10">'+esc(year)+'</text>';
    }).join('');
    const caption=rows.map(r=>monthLabel(r.key)+': '+r.average.toFixed(2)+' spots per OT day').join('; ');
    return '<svg class="otstats-line-svg" style="width:'+width+'px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 234" role="img" aria-label="'+esc(caption)+'">'+
      '<title>Average scheduled overtime spots per OT day, by month</title>'+
      '<desc>'+esc(caption)+'</desc>'+
      grids+linePath+pointsHTML+'</svg>';
  }
  function render(grouped){
    const rows=buildRows(grouped);
    bars.innerHTML=spotsChart(rows);
    line.innerHTML=averageChart(rows);
    const earliest=rows.length?monthLabel(rows[0].key):'';
    const latest=rows.length?monthLabel(rows[rows.length-1].key):'';
    status.textContent=rows.length?rows.length+' '+(rows.length===1?'month':'months')+' · '+earliest+(earliest!==latest?' through '+latest:''):'No recorded OT yet';
  }
  window.alphaOTStatsRender=render;
  window.alphaOTStatsError=message=>{
    if(!bars.querySelector('.otstats-bar-grid'))bars.innerHTML='<p class="otstats-empty">'+esc(message)+'</p>';
    if(!line.querySelector('.otstats-line-svg'))line.innerHTML='<p class="otstats-empty">'+esc(message)+'</p>';
    status.textContent=message;
  };
  refresh?.addEventListener('click',()=>{
    if(typeof window.alphaOTStatsRefresh==='function')window.alphaOTStatsRefresh();
  });
})();
