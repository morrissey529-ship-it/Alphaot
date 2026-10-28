/* Alpha OT: Year-to-date confirmed WORKED OT podium. Separate from scheduled OT. */
(function(){
  'use strict';
  const panel=document.getElementById('alphaStatsPanel');
  const monthCard=panel&&panel.querySelector('.alpha-monthly-summary');
  if(!panel||!monthCard)return;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLong=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const monthLong=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
  const centralMonth=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit'});
  function thisMonth(){
    const parts=Object.fromEntries(centralMonth.formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month;
  }
  const monthName=iso=>monthLong.format(new Date(iso+'-01T12:00:00Z'));
  const dayName=iso=>dateLong.format(new Date(iso+'T12:00:00Z'));
  const canEdit=()=>typeof role!=='undefined'&&(role==='admin'||role==='editor');

  const board=document.createElement('section');
  board.className='otworked-podium-card';
  board.setAttribute('aria-labelledby','alphaWorkedPodiumHeading');
  board.innerHTML=
    '<div class="otworked-podium-header">'+
      '<div><h3 id="alphaWorkedPodiumHeading">Top 3 OT Workers</h3>'+
      '<p id="alphaWorkedPodiumYear">Year to date · Confirmed worked OT</p></div>'+
    '</div>'+
    '<div class="otworked-stage" id="alphaWorkedPodium" aria-live="polite">'+
      '<p class="otworked-initial">Loading rankings…</p>'+
    '</div>'+
    '<details class="otworked-all" id="alphaWorkedAllDetails">'+
      '<summary id="alphaWorkedAllSummary">All officer totals</summary>'+
      '<div class="otworked-all-rows" id="alphaWorkedAllRows"></div>'+
    '</details>';
  monthCard.insertAdjacentElement('afterend',board);

  const recordCard=document.createElement('section');
  recordCard.className='otworked-record-card';
  recordCard.id='alphaWorkedRecordCard';
  recordCard.hidden=true;
  recordCard.innerHTML=
    '<details class="otworked-record-details" id="alphaWorkedRecordDetails">'+
      '<summary>Record Worked OT</summary>'+
      '<div class="otworked-record-content">'+
        '<p class="otworked-explainer">Confirm completed shifts to update the year-to-date rankings. Scheduling alone does not count.</p>'+
        '<div class="otworked-record-toolbar">'+
          '<label for="alphaWorkedMonth">Month</label>'+
          '<select id="alphaWorkedMonth" aria-label="Choose month for worked OT confirmations"></select>'+
        '</div>'+
        '<p class="otworked-record-count" id="alphaWorkedMonthCount"></p>'+
        '<div class="otworked-record-list" id="alphaWorkedEvents"></div>'+
        '<div id="alphaWorkedNotice" class="otworked-notice" role="status" aria-live="polite"></div>'+
      '</div>'+
    '</details>';
  board.insertAdjacentElement('afterend',recordCard);

  const podium=board.querySelector('#alphaWorkedPodium');
  const podiumYear=board.querySelector('#alphaWorkedPodiumYear');
  const allSummary=board.querySelector('#alphaWorkedAllSummary');
  const allRows=board.querySelector('#alphaWorkedAllRows');
  const recorder=recordCard.querySelector('#alphaWorkedRecordDetails');
  const monthPicker=recordCard.querySelector('#alphaWorkedMonth');
  const monthCount=recordCard.querySelector('#alphaWorkedMonthCount');
  const eventsList=recordCard.querySelector('#alphaWorkedEvents');
  const notice=recordCard.querySelector('#alphaWorkedNotice');
  let snapshot=null;
  let selectedMonth=thisMonth();
  let pickerStamp=null;
  let requestSequence=0;
  let saving=false;

  const podiumPlaces=[
    {number:1,place:'gold',medal:'🥇',medalName:'Gold medal',ordinal:'1ST'},
    {number:2,place:'silver',medal:'🥈',medalName:'Silver medal',ordinal:'2ND'},
    {number:3,place:'bronze',medal:'🥉',medalName:'Bronze medal',ordinal:'3RD'}
  ];
  function podiumSlot(place,person){
    const name=person?safeName(person.name):'—';
    const total=person?Number(person.worked):0;
    const accessible=person
      ?place.number+' place: '+person.name+', '+total+' confirmed OT '+(total===1?'shift':'shifts')+' worked'
      :place.number+' place: no confirmed overtime worker yet';
    return '<div class="otworked-place otworked-'+place.place+'" aria-label="'+esc(accessible)+'">'+
      '<div class="otworked-person">'+
        '<span class="otworked-medal" role="img" aria-label="'+place.medalName+'">'+place.medal+'</span>'+
        '<strong class="otworked-name">'+name+'</strong>'+
        '<span class="otworked-total">'+(person?total+' '+(total===1?'shift':'shifts'):'Not ranked')+'</span>'+
      '</div>'+
      '<div class="otworked-platform"><strong>'+place.number+'</strong><span>'+place.ordinal+'</span></div>'+
    '</div>';
  }
  function safeName(name){return esc(name)}
  function renderPodium(data){
    const all=Array.isArray(data.leaderboard)?data.leaderboard:[];
    const ranked=all.filter(item=>Number(item.worked)>0);
    podiumYear.textContent=String(data.year)+' year to date · Confirmed OT shifts worked';
    // CSS displays silver left, gold center, and bronze right; DOM keeps logical 1st / 2nd / 3rd order.
    podium.innerHTML=podiumPlaces.map(place=>podiumSlot(place,ranked[place.number-1])).join('');
    podium.classList.toggle('otworked-no-results',ranked.length===0);
    allSummary.textContent='All officers · '+all.length+' totals';
    allRows.innerHTML=all.map((officer,index)=>{
      const worked=Number(officer.worked)||0;
      const label=index+1;
      return '<div class="otworked-all-row">'+
        '<span class="otworked-all-rank">'+label+'</span>'+
        '<span class="otworked-all-name">'+esc(officer.name)+'</span>'+
        '<strong class="otworked-all-total">'+worked+'</strong>'+
      '</div>';
    }).join('')||'<p class="otworked-empty">No officers available.</p>';
    recordCard.hidden=!canEdit();
  }
  function monthOptions(data){
    const asOf=String(data.as_of||'');
    const maxMonth=Number(asOf.slice(5,7))||12;
    const year=Number(data.year);
    if(pickerStamp!==asOf.slice(0,7)){
      monthPicker.innerHTML='';
      for(let month=maxMonth;month>=1;month--){
        const key=String(year)+'-'+String(month).padStart(2,'0');
        const option=document.createElement('option');
        option.value=key;
        option.textContent=monthName(key);
        monthPicker.appendChild(option);
      }
      pickerStamp=asOf.slice(0,7);
      selectedMonth=asOf.slice(0,7)||thisMonth();
    }
    if(!Array.from(monthPicker.options).some(o=>o.value===selectedMonth)){
      selectedMonth=asOf.slice(0,7)||thisMonth();
    }
    monthPicker.value=selectedMonth;
  }
  function renderRecorder(data){
    recordCard.hidden=!canEdit();
    if(!canEdit())return;
    monthOptions(data);
    const candidates=(Array.isArray(data.assignments)?data.assignments:[])
      .filter(entry=>String(entry.date).slice(0,7)===selectedMonth);
    const confirmed=candidates.filter(entry=>entry.worked).length;
    monthCount.textContent=candidates.length
      ?confirmed+' confirmed worked · '+(candidates.length-confirmed)+' awaiting confirmation'
      :'No recorded overtime assignments for '+monthName(selectedMonth)+'.';
    const dayGroups=new Map();
    for(const item of candidates){
      if(!dayGroups.has(item.date))dayGroups.set(item.date,[]);
      dayGroups.get(item.date).push(item);
    }
    eventsList.innerHTML=candidates.length?Array.from(dayGroups.entries()).map(([date,entries])=>{
      return '<section class="otworked-day-group">'+
        '<h4>'+esc(dayName(date))+'</h4>'+
        entries.map(item=>{
          const worked=item.worked===true;
          const code=item.type==='Required OT'?'R':'V';
          return '<div class="otworked-event-row">'+
            '<div class="otworked-event-info">'+
              '<strong>'+esc(item.name)+'</strong>'+
              '<span class="otworked-event-code '+(code==='R'?'otworked-required':'otworked-volunteer')+'" aria-label="'+(code==='R'?'Required OT':'Volunteer OT')+'">'+code+'</span>'+
              '<span class="otworked-work-status '+(worked?'otworked-confirmed':'')+'">'+(worked?'Worked':'Unconfirmed')+'</span>'+
            '</div>'+
            '<button type="button" class="'+(worked?'dark':'blue')+' otworked-toggle" data-event-id="'+esc(item.event_id)+'" data-worked="'+(worked?'true':'false')+'" aria-label="'+(worked?'Undo worked confirmation for ':'Mark overtime worked for ')+esc(item.name)+' on '+esc(dayName(date))+'">'+(worked?'Undo Worked':'Mark Worked')+'</button>'+
          '</div>';
        }).join('')+'</section>';
    }).join(''):'';
  }
  function render(data){
    snapshot=data;
    renderPodium(data);
    renderRecorder(data);
  }
  async function load(){
    const thisRequest=++requestSequence;
    try{
      const data=await api('/rest/v1/rpc/alpha_ot_worked_overview',{
        method:'POST',auth:false,body:'{}'
      });
      if(thisRequest!==requestSequence)return;
      if(!data||typeof data.year!=='number'||!Array.isArray(data.leaderboard)||!Array.isArray(data.assignments)){
        throw Error('Invalid worked OT overview');
      }
      render(data);
    }catch(error){
      if(thisRequest!==requestSequence)return;
      if(!snapshot){
        podium.innerHTML='<p class="otworked-error">Unable to load worked OT rankings. Use Refresh to retry.</p>';
      }
      notice.textContent='Could not refresh worked OT: '+error.message;
    }
  }
  async function toggleWorked(button){
    if(saving)return;
    if(!canEdit())return void (notice.textContent='Admin or Editor sign-in required.');
    const eventId=button.dataset.eventId;
    const alreadyWorked=button.dataset.worked==='true';
    if(!eventId)return;
    if(alreadyWorked&&!window.confirm('Undo this worked OT confirmation? It will reduce the officer’s year-to-date total.'))return;
    saving=true;
    button.disabled=true;
    notice.textContent='';
    try{
      const data=await api('/rest/v1/rpc/alpha_ot_mark_worked',{
        method:'POST',
        body:JSON.stringify({p_event_id:eventId,p_worked:!alreadyWorked})
      });
      await load();
      notice.textContent=data.changed
        ?(alreadyWorked?'Worked confirmation removed. Rankings updated.':'Worked OT confirmed. Rankings updated.')
        :'No change; this assignment is already up to date.';
      if(typeof toast==='function')toast(data.changed?'Worked OT updated':'No changes needed');
    }catch(error){
      notice.textContent='Could not update worked OT: '+error.message;
      if(typeof toast==='function')toast(error.message);
    }finally{
      saving=false;
      button.disabled=false;
    }
  }
  monthPicker.addEventListener('change',()=>{
    selectedMonth=monthPicker.value;
    if(snapshot)renderRecorder(snapshot);
  });
  recordCard.addEventListener('click',event=>{
    const button=event.target.closest('button[data-event-id]');
    if(button)void toggleWorked(button);
  });
  document.getElementById('alphaStatsTab')?.addEventListener('click',()=>void load());
  document.getElementById('alphaStatsRefresh')?.addEventListener('click',()=>void load());
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&!panel.hidden)void load();
  });
  window.alphaOTWorkedUpdateAccess=()=>{
    if(snapshot){renderPodium(snapshot);renderRecorder(snapshot);}
    if(!panel.hidden)void load();
  };
  setInterval(()=>{
    if(!panel.hidden&&document.visibilityState==='visible'&&!saving)void load();
  },30000);
})();
