/* Alpha OT Executive presentation enhancements.
   Only reads existing calendar RPC data, adds a factual upcoming agenda, and
   decorates the officer-list heading. No writes, no rotation modifications. */
(function(){
  'use strict';
  const theme=document.querySelector('link[data-alpha-executive-theme]');
  if(theme)document.head.appendChild(theme); // after legacy dynamically injected styles
  if(document.documentElement.dataset.alphaExecutive==='ready')return;
  document.documentElement.dataset.alphaExecutive='ready';

  // Clarify that the four existing tab controls switch sections.
  // Their labels, tab identities, ARIA selection and keyboard handlers stay unchanged.
  const tabBar=document.querySelector('.app>header .alpha-tabs');
  if(tabBar&&!document.getElementById('alphaViewHint')){
    const hint=document.createElement('div');
    hint.id='alphaViewHint';
    hint.className='exec-tab-heading';
    hint.innerHTML='<strong>Select a view</strong><span>Tap to switch sections</span>';
    tabBar.insertAdjacentElement('beforebegin',hint);
    tabBar.setAttribute('aria-label','Choose an Alpha OT section');
    tabBar.querySelectorAll('[role="tab"]').forEach(tab=>{
      tab.classList.add('exec-navigation-tab');
    });
  }

  const note=document.getElementById('viewerNote');
  if(note)note.textContent=note.textContent.replace(/\boffical\b/gi,'official');

  // Existing officer cards and numbers are not rebuilt or reordered.
  const list=document.getElementById('list');
  const header=list?.previousElementSibling;
  if(list&&header?.classList?.contains('section')){
    const count=document.createElement('span');
    count.className='exec-roster-count';
    count.setAttribute('aria-label','Officer count');
    count.textContent='';
    header.appendChild(count);
    let previous=-1;
    const update=()=>{
      const total=list.querySelectorAll('.card').length;
      if(total===previous)return;
      previous=total;
      count.textContent=total ? total+' officers' : '';
    };
    new MutationObserver(update).observe(list,{childList:true});
    update();
  }

  const panel=document.getElementById('alphaCalendarPanel');
  const calendar=panel?.querySelector('.alpha-calendar');
  if(!panel||!calendar)return;

  // Create a layout wrapper without recreating any original calendar nodes;
  // all existing calendar event handlers and Admin controls remain attached.
  const layout=document.createElement('div');
  layout.className='exec-calendar-layout';
  panel.insertBefore(layout,calendar);
  layout.appendChild(calendar);

  const agenda=document.createElement('aside');
  agenda.className='exec-agenda';
  agenda.setAttribute('aria-label','Upcoming OT and Training assignments');
  agenda.innerHTML=
    '<h3>Upcoming OT &amp; Training</h3>'+
    '<p>Next 30 days · Scheduled records · Central Time</p>'+
    '<div class="exec-agenda-items" id="alphaExecUpcoming" aria-live="polite">'+
      '<div class="exec-agenda-empty">Open Calendar/Training to load upcoming records.</div>'+
    '</div>'+
    '<p id="alphaExecAgendaUpdated" role="status" aria-live="polite"></p>';
  layout.appendChild(agenda);
  const items=agenda.querySelector('#alphaExecUpcoming');
  const updated=agenda.querySelector('#alphaExecAgendaUpdated');
  const dateFormat=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',weekday:'short'});
  const centralParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function centralToday(){
    const parts=Object.fromEntries(centralParts.formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }
  function plusDays(iso,n){
    const date=new Date(iso+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+n);
    return date.toISOString().slice(0,10);
  }
  const groups=new Map();
  let loading=false,lastLoaded=null,lastRange=null;

  function add(date,type,name){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!name)return;
    const key=date+'|'+type;
    if(!groups.has(key))groups.set(key,{date,type,names:new Set()});
    groups.get(key).names.add(name);
  }
  function formatDate(iso){
    return dateFormat.format(new Date(iso+'T12:00:00Z'));
  }
  function render(){
    const visible=Array.from(groups.values()).sort((a,b)=>
      a.date.localeCompare(b.date)||a.type.localeCompare(b.type)).slice(0,9);
    items.innerHTML=visible.length?visible.map(entry=>{
      const training=entry.type==='Training';
      const count=entry.names.size;
      const secondary=count+' scheduled '+(count===1?'officer':'officers');
      return '<div class="exec-agenda-item '+(training?'exec-agenda-training':'exec-agenda-overtime')+'">'+
        '<time class="exec-agenda-day" datetime="'+escapeHTML(entry.date)+'">'+escapeHTML(formatDate(entry.date))+'</time>'+
        '<span class="exec-agenda-line" aria-hidden="true"></span>'+
        '<div class="exec-agenda-content"><strong>'+escapeHTML(entry.type)+'</strong><span>'+secondary+'</span></div>'+
      '</div>';
    }).join(''):'<div class="exec-agenda-empty">No upcoming OT or Training assignments recorded for this period.</div>';
  }
  async function load(){
    if(loading)return;
    const today=centralToday();
    if(lastLoaded&&lastRange===today&&Date.now()-lastLoaded.getTime()<60000)return;
    if(typeof api!=='function'){
      updated.textContent='Upcoming schedule unavailable.';
      return;
    }
    loading=true;
    if(!lastLoaded)items.innerHTML='<div class="exec-agenda-empty">Loading scheduled assignments…</div>';
    updated.textContent='';
    try{
      const until=plusDays(today,30);
      const [ot,training]=await Promise.all([
        api('/rest/v1/rpc/alpha_calendar_ot',{
          method:'POST',auth:false,body:JSON.stringify({p_from:today,p_through:until})
        }),
        api('/rest/v1/rpc/alpha_training_calendar',{method:'POST',auth:false,body:'{}'})
      ]);
      if(!Array.isArray(ot)||!Array.isArray(training))throw Error('Unexpected calendar response');
      groups.clear();
      for(const entry of ot){
        if(!entry||entry.date<today||entry.date>until||entry.status==='called_off')continue;
        if(!['V','R'].includes(entry.code)||typeof entry.name!=='string')continue;
        add(entry.date,entry.code==='R'?'Required OT':'Volunteer OT',entry.name);
      }
      for(const entry of training){
        if(!entry||entry.date<today||entry.date>until||typeof entry.name!=='string')continue;
        add(entry.date,'Training',entry.name);
      }
      render();
      lastRange=today;
      lastLoaded=new Date();
      updated.textContent='Updated '+lastLoaded.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    }catch(error){
      if(!lastLoaded){
        items.innerHTML='<div class="exec-agenda-empty" role="alert">Unable to load upcoming assignments.</div>';
      }
      updated.textContent='Connection error'+(lastLoaded?' · Last updated '+lastLoaded.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'');
      console.warn('Alpha OT upcoming schedule:',error);
    }finally{loading=false;}
  }

  const calendarTab=document.getElementById('alphaCalendarTab');
  calendarTab?.addEventListener('click',()=>void load());
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&!panel.hidden)void load();
  });
  setInterval(()=>{
    if(!panel.hidden&&document.visibilityState==='visible')void load();
  },60000);
  if(!panel.hidden)void load();
})();
