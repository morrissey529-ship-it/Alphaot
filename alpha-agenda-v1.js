/* Alpha OT mobile agenda and personal scheduled OT/Training export.
   Read-only; no rotation/database changes. Calendar events are all-day because
   actual start/end times are not stored in the calendar sources. */
(function(){
  'use strict';
  const panel=document.getElementById('alphaCalendarPanel');
  const calendar=panel?.querySelector('.alpha-calendar');
  if(!panel||!calendar)return;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const chicago=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  const dateFmt=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'long',day:'numeric',year:'numeric'});
  const nowISO=()=>{
    const p=Object.fromEntries(chicago.formatToParts(new Date()).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day;
  };
  const addDays=(iso,n)=>{
    const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
  };
  const labelDate=iso=>dateFmt.format(new Date(iso+'T12:00:00Z'));
  const getPreferred=()=>{
    if(typeof window.alphaGetPreferredName==='function')return window.alphaGetPreferredName();
    try{return localStorage.getItem('alpha_preferred_name_v1')||''}catch{return ''}
  };
  const savePreferred=name=>{
    if(typeof window.alphaSetPreferredName==='function')return window.alphaSetPreferredName(name);
    try{localStorage.setItem('alpha_preferred_name_v1',name)}catch{}
  };

  const viewSwitch=document.createElement('div');
  viewSwitch.className='alpha-calendar-view-switch';
  viewSwitch.setAttribute('role','group');
  viewSwitch.setAttribute('aria-label','Calendar display');
  viewSwitch.innerHTML=
    '<button type="button" class="dark" id="alphaViewMonth" aria-pressed="true">Month</button>'+
    '<button type="button" class="dark" id="alphaViewAgenda" aria-pressed="false">Agenda</button>';
  const monthNav=calendar.querySelector('.alpha-calendar-nav');
  if(monthNav)monthNav.insertAdjacentElement('beforebegin',viewSwitch);
  const agenda=document.createElement('section');
  agenda.id='alphaAgendaView';
  agenda.className='alpha-agenda-view';
  agenda.hidden=true;
  agenda.innerHTML=
    '<h3>Upcoming OT &amp; Training</h3>'+
    '<p class="alpha-agenda-help">Next 60 days · Central Time · Scheduled assignments, not attendance records</p>'+
    '<div id="alphaAgendaStatus" role="status" aria-live="polite">Open Agenda to load upcoming dates.</div>'+
    '<div id="alphaAgendaRows" class="alpha-agenda-rows"></div>';
  calendar.appendChild(agenda);

  const personal=document.createElement('section');
  personal.className='alpha-personal-upcoming';
  personal.id='alphaPersonalUpcoming';
  personal.innerHTML=
    '<div class="alpha-personal-heading"><h3>My Upcoming OT &amp; Training</h3>'+
      '<p>Select your name to see assigned overtime and training for the next 60 days.</p></div>'+
    '<div class="alpha-personal-controls">'+
      '<label for="alphaPersonalName">Officer</label>'+
      '<select id="alphaPersonalName"><option value="">Choose your name</option></select>'+
      '<button type="button" class="dark" id="alphaExportCalendar" disabled>Export Calendar (.ics)</button>'+
    '</div>'+
    '<p class="alpha-personal-note">Calendar export uses all-day dates because assignment start and end times are not recorded here. Called-off OT is excluded.</p>'+
    '<div id="alphaPersonalStatus" class="alpha-agenda-help" role="status" aria-live="polite">Choose a name to view assignments.</div>'+
    '<div id="alphaPersonalEvents" class="alpha-personal-events"></div>';
  calendar.insertAdjacentElement('afterend',personal);

  const rowsEl=agenda.querySelector('#alphaAgendaRows');
  const agendaStatus=agenda.querySelector('#alphaAgendaStatus');
  const personalSelect=personal.querySelector('#alphaPersonalName');
  const personalRows=personal.querySelector('#alphaPersonalEvents');
  const personalStatus=personal.querySelector('#alphaPersonalStatus');
  const exportButton=personal.querySelector('#alphaExportCalendar');
  const monthButton=viewSwitch.querySelector('#alphaViewMonth');
  const agendaButton=viewSwitch.querySelector('#alphaViewAgenda');
  let events=[],lastUpdated=null,loading=false,renderedRange='';
  let agendaMode=false;

  function setMode(next){
    agendaMode=next;
    calendar.classList.toggle('alpha-calendar-agenda-mode',next);
    agenda.hidden=!next;
    monthButton.setAttribute('aria-pressed',String(!next));
    agendaButton.setAttribute('aria-pressed',String(next));
    if(next)void load();
  }
  monthButton.addEventListener('click',()=>setMode(false));
  agendaButton.addEventListener('click',()=>setMode(true));
  function getNames(){
    if(typeof officers!=='undefined'&&Array.isArray(officers)&&officers.length){
      return officers.map(o=>o.name).filter(Boolean);
    }
    return Array.from(document.querySelectorAll('#list .name')).map(x=>x.textContent.trim());
  }
  function updateSelect(){
    const names=Array.from(new Set(getNames())).sort((a,b)=>a.localeCompare(b));
    const previous=personalSelect.value||getPreferred();
    personalSelect.replaceChildren(new Option('Choose your name',''));
    for(const name of names)personalSelect.add(new Option(name,name));
    personalSelect.value=names.includes(previous)?previous:'';
  }

  function category(event){
    return event.kind==='training'?'Training':
      (event.code==='R'?'Required OT':'Volunteer OT');
  }
  function eventTag(event){
    const calledOff=event.status==='called_off';
    return '<div class="alpha-agenda-event'+(calledOff?' alpha-agenda-calledoff':'')+'">'+
      '<span class="alpha-agenda-kind '+(event.kind==='training'?'alpha-agenda-training':'alpha-agenda-overtime')+'">'+safe(category(event))+'</span>'+
      '<strong>'+safe(event.name)+'</strong>'+
      (calledOff?'<span class="alpha-agenda-flag">Called Off</span>':'')+
    '</div>';
  }
  function renderAgenda(){
    if(!events.length){
      rowsEl.innerHTML='<p class="alpha-agenda-empty">No scheduled OT or training in the next 60 days.</p>';return;
    }
    const days=new Map();
    for(const event of events){
      if(!days.has(event.date))days.set(event.date,[]);
      days.get(event.date).push(event);
    }
    rowsEl.innerHTML=Array.from(days).map(([date,entries],i)=>
      '<details class="alpha-agenda-day"'+(i<5?' open':'')+'>'+
        '<summary>'+safe(labelDate(date))+' <span>'+entries.length+' '+(entries.length===1?'entry':'entries')+'</span></summary>'+
        '<div class="alpha-agenda-day-events">'+entries.map(eventTag).join('')+'</div>'+
      '</details>'
    ).join('');
  }
  function personalEvents(){
    const name=personalSelect.value;
    return events.filter(e=>e.name===name&&e.status!=='called_off');
  }
  function renderPersonal(){
    const name=personalSelect.value;
    exportButton.disabled=!name||!lastUpdated;
    if(!name){
      personalStatus.textContent='Choose an officer to view upcoming assignments.';
      personalRows.innerHTML='';return;
    }
    if(!lastUpdated){
      personalStatus.textContent='Loading scheduled assignments…';
      personalRows.innerHTML='';return;
    }
    const mine=personalEvents();
    personalStatus.textContent=mine.length+' upcoming '+(mine.length===1?'item':'items')+' · Last updated '+
      lastUpdated.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    personalRows.innerHTML=mine.length?mine.map(e=>
      '<div class="alpha-personal-event"><time>'+safe(labelDate(e.date))+'</time>'+
      '<strong>'+safe(category(e))+'</strong></div>'
    ).join(''):'<p class="alpha-agenda-empty">No upcoming OT or training recorded for this officer.</p>';
  }
  function renderAll(){renderAgenda();renderPersonal();}
  async function load(){
    if(loading)return;
    const from=nowISO(),to=addDays(from,60);
    if(renderedRange===from&&lastUpdated&&Date.now()-lastUpdated.getTime()<60000)return;
    loading=true;
    agendaStatus.textContent=lastUpdated?'Updating agenda…':'Loading upcoming schedule…';
    try{
      const [ot,training]=await Promise.all([
        api('/rest/v1/rpc/alpha_calendar_ot',{
          method:'POST',auth:false,body:JSON.stringify({p_from:from,p_through:to})
        }),
        api('/rest/v1/rpc/alpha_training_calendar',{
          method:'POST',auth:false,body:'{}'
        })
      ]);
      if(!Array.isArray(ot)||!Array.isArray(training))throw Error('Unexpected calendar response');
      const merged=[];
      for(const item of ot){
        if(!item||typeof item.name!=='string'||!['V','R'].includes(item.code)
           ||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||item.date<from||item.date>to)continue;
        merged.push({date:item.date,name:item.name,kind:'ot',code:item.code,
          status:item.status==='called_off'?'called_off':'scheduled'});
      }
      for(const item of training){
        if(!item||typeof item.name!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)
           ||item.date<from||item.date>to)continue;
        merged.push({date:item.date,name:item.name,kind:'training',status:'scheduled'});
      }
      merged.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
      events=merged;
      lastUpdated=new Date();
      renderedRange=from;
      agendaStatus.textContent='Updated '+lastUpdated.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+
        ' · '+events.length+' scheduled entries';
      renderAll();
    }catch(error){
      const last=lastUpdated?' · Last updated '+lastUpdated.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):' · No data loaded';
      agendaStatus.textContent='Connection error'+last+': '+error.message;
      personalStatus.textContent='Calendar connection error'+last;
      if(!lastUpdated)rowsEl.innerHTML='<p class="alpha-agenda-empty" role="alert">Unable to load the agenda. Tap Agenda to retry.</p>';
    }finally{loading=false;}
  }
  personalSelect.addEventListener('change',()=>{
    if(personalSelect.value)savePreferred(personalSelect.value);
    renderPersonal();
  });
  window.addEventListener('alpha-preferred-name-change',e=>{
    const name=e.detail?.name;
    if(name&&Array.from(personalSelect.options).some(o=>o.value===name)){
      personalSelect.value=name;renderPersonal();
    }
  });
  function escapeICS(value){
    return String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  }
  function exportCalendar(){
    if(exportButton.disabled||!personalSelect.value)return;
    const own=personalEvents(),name=personalSelect.value;
    const lines=['BEGIN:VCALENDAR','VERSION:2.0',
      'PRODID:-//Alpha OT//Scheduled Calendar Export//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const entry of own){
      const start=entry.date.replaceAll('-',''),end=addDays(entry.date,1).replaceAll('-','');
      const title=category(entry);
      lines.push('BEGIN:VEVENT',
        'UID:alphaot-'+entry.kind+'-'+entry.date+'-'+encodeURIComponent(name).replaceAll('%','')+'@alphaot',
        'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
        'DTSTART;VALUE=DATE:'+start,'DTEND;VALUE=DATE:'+end,
        'SUMMARY:'+escapeICS(title+' - Alpha OT'),
        'DESCRIPTION:'+escapeICS('Scheduled for '+name+'. All-day placeholder; times and attendance are not verified.'),
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'});
    const filename='alpha-ot-'+name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.ics';
    const save=()=>{
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=filename;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    };
    if(typeof File==='function'&&navigator.share&&navigator.canShare){
      const file=new File([blob],filename,{type:'text/calendar'});
      if(navigator.canShare({files:[file]})){
        navigator.share({files:[file],title:'Alpha OT scheduled events'}).catch(e=>{
          if(e?.name!=='AbortError')save();
        });
        return;
      }
    }
    save();
  }
  exportButton.addEventListener('click',exportCalendar);
  document.getElementById('alphaCalendarTab')?.addEventListener('click',()=>{
    updateSelect();void load();
  });
  document.getElementById('alphaStatsTab')?.addEventListener('click',()=>{});
  const originalRender=typeof render==='function'?render:null;
  if(originalRender){
    render=function(){originalRender();updateSelect();};
  }
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&!panel.hidden){updateSelect();void load();}
  });
  setInterval(()=>{
    if(!panel.hidden&&document.visibilityState==='visible')void load();
  },60000);
  updateSelect();
  setMode(window.matchMedia?window.matchMedia('(max-width: 620px)').matches:false);
})();
