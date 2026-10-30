/* Alpha OT — automatic year-to-date OT days from regular overtime list.
   No manual confirmation. Call-offs and undone OT are excluded server-side.
   Full officer totals remain Admin-only; everyone sees the top three. */
(function(){
  'use strict';
  const panel=document.getElementById('alphaStatsPanel');
  const monthCard=panel&&panel.querySelector('.alpha-monthly-summary');
  if(!panel||!monthCard)return;

  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const board=document.createElement('section');
  board.className='otworked-podium-card';
  board.setAttribute('aria-labelledby','alphaWorkedPodiumHeading');
  board.innerHTML=
    '<div class="otworked-podium-header">'+
      '<div><h3 id="alphaWorkedPodiumHeading">Top 3 OT Workers</h3>'+
      '<p id="alphaWorkedPodiumYear">Year-to-date OT days · Automatic</p></div>'+
    '</div>'+
    '<div class="otworked-stage" id="alphaWorkedPodium" aria-live="polite">'+
      '<p class="otworked-initial">Loading rankings…</p>'+
    '</div>'+
    '<details class="otworked-all" id="alphaWorkedAllDetails" hidden>'+
      '<summary id="alphaWorkedAllSummary">All officer totals</summary>'+
      '<div class="otworked-all-rows" id="alphaWorkedAllRows"></div>'+
    '</details>';
  monthCard.insertAdjacentElement('afterend',board);

  const podium=board.querySelector('#alphaWorkedPodium');
  const yearLabel=board.querySelector('#alphaWorkedPodiumYear');
  const allDetails=board.querySelector('#alphaWorkedAllDetails');
  const allSummary=board.querySelector('#alphaWorkedAllSummary');
  const allRows=board.querySelector('#alphaWorkedAllRows');
  const places=[
    {number:1,place:'gold',medal:'🥇',medalName:'Gold medal',ordinal:'1ST'},
    {number:2,place:'silver',medal:'🥈',medalName:'Silver medal',ordinal:'2ND'},
    {number:3,place:'bronze',medal:'🥉',medalName:'Bronze medal',ordinal:'3RD'}
  ];
  let requestSequence=0;
  let snapshot=null;

  function slot(position,officer){
    const count=officer?Number(officer.worked)||0:0;
    const description=officer
      ?position.number+' place: '+officer.name+', '+count+' OT '+(count===1?'day':'days')
      :position.number+' place: no qualifying OT days';
    return '<div class="otworked-place otworked-'+position.place+'" aria-label="'+escapeHTML(description)+'">'+
      '<div class="otworked-person">'+
        '<span class="otworked-medal" role="img" aria-label="'+position.medalName+'">'+position.medal+'</span>'+
        '<strong class="otworked-name">'+(officer?escapeHTML(officer.name):'—')+'</strong>'+
        '<span class="otworked-total">'+(officer?count+' OT '+(count===1?'day':'days'):'Not ranked')+'</span>'+
      '</div>'+
      '<div class="otworked-platform"><strong>'+position.number+'</strong><span>'+position.ordinal+'</span></div>'+
    '</div>';
  }

  function hidePrivate(){
    allDetails.hidden=true;
    allDetails.open=false;
    allRows.textContent='';
    allSummary.textContent='';
  }

  function render(data){
    snapshot=data;
    const officers=Array.isArray(data.leaderboard)?data.leaderboard:[];
    const ranked=officers.filter(officer=>Number(officer.worked)>0);
    yearLabel.textContent=data.year+' year to date · From OT List · Resets January 1';
    // DOM order is ranking order; CSS places silver left, gold center, bronze right.
    podium.innerHTML=places.map(place=>slot(place,ranked[place.number-1])).join('');
    podium.classList.toggle('otworked-no-results',ranked.length===0);

    // Never expose individual totals to non-Admins; the RPC also restricts them.
    if(typeof role!=='undefined'&&role==='admin'&&data.can_view_all===true){
      allDetails.hidden=false;
      allSummary.textContent='View all '+officers.length+' officer totals';
      allRows.innerHTML=officers.map((officer,index)=>{
        const days=Number(officer.worked)||0;
        return '<div class="otworked-all-row">'+
          '<span class="otworked-all-rank">'+(days>0?index+1:'—')+'</span>'+
          '<span class="otworked-all-name">'+escapeHTML(officer.name)+'</span>'+
          '<strong class="otworked-all-total">'+days+'</strong>'+
        '</div>';
      }).join('')||'<p class="otworked-empty">No officers available.</p>';
    }else{
      hidePrivate();
    }
  }

  async function load(){
    const request=++requestSequence;
    try{
      const data=await api('/rest/v1/rpc/alpha_ot_worked_overview',{
        method:'POST',body:'{}'
      });
      if(request!==requestSequence)return;
      if(!data||typeof data.year!=='number'||!Array.isArray(data.leaderboard)){
        throw Error('Unexpected OT statistics response');
      }
      render(data);
    }catch(error){
      if(request!==requestSequence)return;
      if(!snapshot){
        podium.innerHTML='<p class="otworked-error">Unable to load OT rankings. Tap Refresh to retry.</p>';
      }
      console.error('OT YTD statistics:',error);
    }
  }

  document.getElementById('alphaStatsTab')?.addEventListener('click',()=>void load());
  document.getElementById('alphaStatsRefresh')?.addEventListener('click',()=>void load());
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&!panel.hidden)void load();
  });
  window.alphaOTWorkedUpdateAccess=()=>{
    if(typeof role==='undefined'||role!=='admin')hidePrivate();
    if(!panel.hidden)void load();
  };
  const authMode=document.getElementById('topMode');
  if(authMode&&typeof MutationObserver==='function'){
    new MutationObserver(()=>window.alphaOTWorkedUpdateAccess())
      .observe(authMode,{childList:true,subtree:true,characterData:true});
  }
  setInterval(()=>{
    if(!panel.hidden&&document.visibilityState==='visible')void load();
  },30000);
})();
