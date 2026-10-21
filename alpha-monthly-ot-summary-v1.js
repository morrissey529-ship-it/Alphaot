/* Read-only Alpha Crew month-to-date OT metrics. Includes called-off spots,
   excludes undone assignments. Calendar-day boundaries use America/Chicago. */
(function(){
  'use strict';
  const daysEl=document.getElementById('alphaMTDDays');
  const spotsEl=document.getElementById('alphaMTDSpots');
  const avgEl=document.getElementById('alphaMTDAverage');
  const labelEl=document.getElementById('alphaMTDMonth');
  if(!daysEl||!spotsEl||!avgEl||typeof api!=='function')return;
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  let loading=false,lastDate='',lastUpdated=0;
  const chicagoDate=()=>{
    const parts=formatter.formatToParts(new Date());
    const get=k=>parts.find(p=>p.type===k)?.value;
    return get('year')+'-'+get('month')+'-'+get('day');
  };
  async function refresh(force=false){
    const today=chicagoDate();
    const monthStart=today.slice(0,7)+'-01';
    const [year,month]=today.slice(0,7).split('-').map(Number);
    const monthEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    if(loading||(!force&&today===lastDate&&Date.now()-lastUpdated<60000))return;
    loading=true;
    try{
      const start=monthStart;
      const end=monthEnd;
      const rows=await api('/rest/v1/rpc/alpha_calendar_ot',{
        method:'POST',auth:false,body:JSON.stringify({p_from:start,p_through:end})
      });
      if(!Array.isArray(rows))throw new Error('Unexpected OT data');
      const days=new Set();
      let spots=0;
      for(const row of rows){
        if(!row||typeof row.date!=='string'||row.date<start||row.date>end||!['V','R'].includes(row.code))continue;
        if(row.status!=='assigned'&&row.status!=='called_off')continue;
        spots++;
        days.add(row.date);
      }
      daysEl.textContent=String(days.size);
      spotsEl.textContent=String(spots);
      avgEl.textContent=days.size?(spots/days.size).toFixed(2):'0.00';
      labelEl.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(start+'T12:00:00Z'))+' · Scheduled this month';
      lastDate=today;lastUpdated=Date.now();
    }catch(error){
      if(!lastUpdated)labelEl.textContent='Unable to load totals · Try Refresh';
    }finally{loading=false;}
  }
  refresh();
  setInterval(()=>refresh(),60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
  document.querySelector('header .tools button[onclick="loadAll()"]')?.addEventListener('click',()=>refresh(true));
})();