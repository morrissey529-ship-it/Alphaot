/* Braidwood cross-crew navigation, shared by Alpha/Bravo/Charlie/Delta. */
(function(){
'use strict';
if(typeof render!=='function'||typeof OT_CREW==='undefined')return;
const names={alpha:'Alpha',bravo:'Bravo',charlie:'Charlie',delta:'Delta'};
const originalRender=render;
render=function(){
 originalRender();
 if(role!=='admin')return;
 for(const card of document.querySelectorAll('.card[data-id]')){
  const officer=officers.find(o=>o.id===card.dataset.id);
  if(!officer||officer.crew!==names[OT_CREW])continue;
  const actions=card.querySelector('.actions');
  const remove=actions?.querySelector('.removeOfficerBtn');
  if(!remove||actions.querySelector('.switchCrewButton'))continue;
  const btn=document.createElement('button');
  btn.type='button';btn.className='dark switchCrewButton';
  btn.textContent='Switch Crews';
  btn.style.cssText='border-color:#789db5;background:#244a66;color:#f0f8ff';
  btn.setAttribute('aria-label','Switch crews for '+officer.name);
  btn.addEventListener('click',()=>{
   const params=new URLSearchParams({crew:OT_CREW,officer:officer.id});
   window.location.href='https://morrissey529-ship-it.github.io/Alphaot/braidwood/switch/?'+params;
  });
  actions.insertBefore(btn,remove);
 }
};
if(typeof fetchHistory==='function'){
 fetchHistory=async function(id){
  const nonce=++historyNonce,token=session?.access_token;
  try{
   const data=await api('/rest/v1/rpc/braidwood_officer_history',{
    method:'POST',body:JSON.stringify({p_crew:OT_CREW,p_officer_id:id})
   });
   if(nonce!==historyNonce||role!=='admin'||session?.access_token!==token||
    historyOfficerId!==id||!historyDlg.open)return;
   historyData=data;historyTitle.textContent=data.name+' · 60-Day History';
   const previous=Array.isArray(data.crew_transfers)?data.crew_transfers.length:0;
   historyRange.textContent=data.crew+' Crew • '+fmt(data.from)+' – '+fmt(data.through)+
    (previous?' · Includes '+previous+' previous crew(s)':'');
   renderHistory();
  }catch(e){
   if(nonce!==historyNonce||!historyDlg.open)return;
   historyData=null;
   historyContent.textContent='Unable to load history: '+String(e.message||e);
  }
 };
 const priorLabel=eventLabel;
 eventLabel=function(e){
  return priorLabel(e)+(e.crew&&e.crew.toLowerCase()!==OT_CREW?' · '+esc(e.crew)+' Crew':'');
 };
}
render();
})();