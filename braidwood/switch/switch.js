/* Braidwood Security Overtime - Admin-reviewed crew switch */
(function(){
'use strict';
const API="https://hvihhsrhoqbbhkobayhx.supabase.co",KEY="sb_publishable_XrolNcWigiHLyj_96h7TmA_306hd00Y",labels={alpha:'Alpha',bravo:'Bravo',charlie:'Charlie',delta:'Delta'};
const root='https://morrissey529-ship-it.github.io/Alphaot/';
const p=new URLSearchParams(window.location.search),source=p.get('crew'),officer=p.get('officer');
const el=id=>document.getElementById(id);
const ui={details:el('officerDetails'),fields:el('formFields'),dest:el('destination'),
 placement:el('placementFields'),guess:el('suggested'),anchor:el('anchor'),side:el('position'),
 rules:el('rules'),ieasPreview:el('ieasSuggested'),feedback:el('feedback'),success:el('success'),confirm:el('confirm'),
 returnCrew:el('returnCrew'),openNewCrew:el('openNewCrew')};
let current=null,destinationRevision=null,ieasPreviewLoaded=false,inFlight=false,seq=0;
const session=()=>{try{return JSON.parse(localStorage.getItem('alpha_session')||'null')}catch{return null}};
const message=s=>{ui.feedback.textContent=String(s||'')};
const title=s=>{ui.details.textContent=String(s||'')};
function setBusy(v){
 inFlight=v;ui.dest.disabled=v;ui.anchor.disabled=v;ui.side.disabled=v;
 ui.confirm.disabled=v||!current||current.blocked||destinationRevision===null||!ieasPreviewLoaded;
}
async function api(path,body){
 const active=session();
 const token=active?.access_token;
 if(!token)throw Error('Sign in as an Admin on your crew page first, then reopen Switch Crews.');
 const response=await fetch(API+path,{
  method:body===undefined?'GET':'POST',
  headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const raw=await response.text();let data;
 try{data=raw?JSON.parse(raw):null}catch{data=raw}
 if(!response.ok)throw Error(data?.message||data?.msg||data?.error_description||data?.hint||('HTTP '+response.status));
 return data;
}
async function confirmAdmin(){
 const active=session();
 if(!active?.user?.id)throw Error('Sign in as an Admin on your current crew page first.');
 const roles=await api('/rest/v1/profiles?select=role&id=eq.'+encodeURIComponent(active.user.id));
 if(roles?.[0]?.role!=='admin')throw Error('Only approved Admins can switch crews.');
}
function blockers(p){
 const reasons=[];
 if(p.status==='Vacation')reasons.push('Officer is on Vacation');
 if(p.future_ot_or_training)reasons.push(p.future_ot_or_training+' future OT/Training assignment(s)');
 if(p.future_ieas)reasons.push(p.future_ieas+' scheduled IE/AS assignment(s)');
 if(p.future_vacation_days)reasons.push(p.future_vacation_days+' future vacation workday(s)');
 if(p.future_training_calendar)reasons.push(p.future_training_calendar+' future training calendar assignment(s)');
 if(p.future_vacation_periods)reasons.push(p.future_vacation_periods+' active vacation period(s)');
 return reasons;
}
function makeOptions(rows){
 if(!rows.length||rows[0].revision==null)throw Error('Destination list revision unavailable');
 destinationRevision=Number(rows[0].revision);
 const peers=rows.filter(o=>o.crew===labels[ui.dest.value]&&o.status===current.status);
 ui.anchor.replaceChildren();
 for(const o of peers){
  const opt=document.createElement('option');opt.value=o.id;
  opt.textContent=o.name+' • '+(o.display_event_type||'No activity')+
   (o.display_event_date?' • '+o.display_event_date:'');
  ui.anchor.appendChild(opt);
 }
 const initial=current.last_event_type==='Initial';
 ui.placement.hidden=initial||peers.length===0;
 if(initial)ui.guess.textContent='No qualifying previous event was found. Officer will enter as Initial at the bottom of the new crew.';
 else if(!peers.length)ui.guess.textContent='No matching destination status. Officer will join at the bottom of that status group.';
 else{
  const after=peers.find(o=>o.display_event_date&&o.display_event_date>current.last_event_date);
  const anchor=after||peers[peers.length-1];
  ui.anchor.value=anchor.id;ui.side.value=after?'before':'after';
  ui.guess.textContent='Suggested: '+(after?'above ':'below ')+anchor.name+
   '. Last qualifying event: '+current.last_event_type+' on '+current.last_event_date+
   '. Manual movements, training and grouped OT can change the rotation, so adjust this proposed position if needed.';
 }
 const issues=blockers(current);
 ui.rules.textContent=issues.length?'Transfer blocked until resolved: '+issues.join('; ')+'.':
  'The original officer record stays archived with history. No additional OT/Training event is created. '+
  'IE/AS uses its own qualifying activity date for placement, separately from OT. '+
  'Transfers cannot be reversed using the normal single-crew Undo Last Change.';
}
function showIEASPlan(plan){
 const activity=plan.source_activity||{};
 const previous=activity.event_date
   ? 'Last qualifying IE/AS activity: '+(activity.activity_label||activity.event_date)+
     (activity.from_worked?' (worked)':' (historical baseline)')
   : 'No dated IE/AS activity; officer enters at the bottom';
 const target=plan.anchor_name
   ? 'Suggested: '+(plan.side==='before'?'above ':'below ')+plan.anchor_name
   : 'Suggested: first officer on the new crew';
 ui.ieasPreview.textContent=previous+'. '+target+
  '. IE/AS is calculated independently of OT. No new IE/AS assignment will be recorded.';
}
async function reviewDestination(){
 if(!current)return;
 const req=++seq;destinationRevision=null;ieasPreviewLoaded=false;
 ui.ieasPreview.textContent='Checking IE/AS history and destination dates…';
 message('');setBusy(true);
 try{
  const crew=ui.dest.value;
  const [rows,plan]=await Promise.all([
   api('/rest/v1/rpc/'+crew+'_list_summary_for_block',{p_target_date:null}),
   api('/rest/v1/rpc/braidwood_switch_ieas_preview',{
    p_source_crew:source,p_officer_id:officer,p_destination_crew:crew
   })
  ]);
  if(req!==seq)return;
  if(!Array.isArray(rows))throw Error('Destination OT list did not load');
  if(!plan||!plan.source_activity)throw Error('Destination IE/AS placement did not load');
  makeOptions(rows);showIEASPlan(plan);ieasPreviewLoaded=true;
 }catch(e){
  if(req===seq){
   ui.ieasPreview.textContent='IE/AS review could not be completed.';
   message('Could not review destination: '+String(e.message||e));
  }
 }
 finally{if(req===seq)setBusy(false)}
}
async function start(){
 if(!Object.prototype.hasOwnProperty.call(labels,source)||!officer||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(officer)){
  title('Invalid crew transfer link. Return to your crew and use Switch Crews.');
  return;
 }
 ui.returnCrew.href=root+(source==='alpha'?'':source+'/');
 try{
  await confirmAdmin();
  const x=await api('/rest/v1/rpc/braidwood_switch_preview',{p_source_crew:source,p_officer_id:officer});
  current=x;
  title(x.name+' · '+labels[source]+' Crew · '+x.status+'\nCall #'+(x.call_number??'not assigned')+
   '\nLast qualifying activity: '+x.last_event_type+' · '+x.last_event_date);
  for(const c of Object.keys(labels).filter(c=>c!==source)){
   const option=document.createElement('option');option.value=c;
   option.textContent=labels[c]+' Crew';ui.dest.appendChild(option);
  }
  ui.fields.hidden=false;
  await reviewDestination();
 }catch(e){title('Unable to open crew switch.');message(String(e.message||e))}
}
async function save(){
 if(inFlight||!current||current.blocked||destinationRevision===null)return;
 const dest=ui.dest.value;
 const selectedPeer=ui.anchor.value||null;
 const anchor=selectedPeer||null;
 const placement=ui.placement.hidden?'after':ui.side.value;
 if(!window.confirm('Move '+current.name+' from '+labels[source]+' to '+labels[dest]+
  ' Crew?\n\nThis moves the officer into both rotations and preserves former crew history. '+
  'OT position was reviewed; IE/AS position uses the most recent qualifying IE/AS date.'))return;
 setBusy(true);message('');
 try{
  const result=await api('/rest/v1/rpc/braidwood_switch_crew',{
   p_source_crew:source,p_officer_id:officer,p_destination_crew:dest,
   p_anchor_id:anchor,p_placement:placement,
   p_expected_source_revision:Number(current.source_revision),
   p_expected_destination_revision:destinationRevision
  });
  ui.fields.hidden=true;ui.success.hidden=false;ui.confirm.hidden=true;
  ui.success.textContent=current.name+' was transferred to '+labels[dest]+
   ' Crew. OT position: '+result.destination_ot_position+
   '. IE/AS position: '+result.destination_ieas_position+
   (result.ieas_carry_date?' (IE/AS date: '+result.ieas_carry_date+')':' (no prior dated IE/AS activity)')+
   '. Previous crew history and permanent call number remain linked. Open both destination rotations to verify.';
  ui.openNewCrew.hidden=false;
  ui.openNewCrew.href=root+(dest==='alpha'?'':dest+'/');
 }catch(e){message('Transfer was not saved: '+String(e.message||e))}
 finally{setBusy(false)}
}
ui.dest.addEventListener('change',reviewDestination);
ui.confirm.addEventListener('click',save);
start();
})();