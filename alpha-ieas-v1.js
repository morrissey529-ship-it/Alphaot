/* Alpha OT separate In Early / Aftershift view. Uses independent IEAS RPCs only. */
(function(){
  'use strict';
  const panel=document.getElementById('alphaIEASPanel');
  if(!panel)return;
  const fullDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
  const centralParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  const safe=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canEdit=()=>typeof role!=='undefined'&&(role==='admin'||role==='editor');
  const today=()=>{
    const parts=Object.fromEntries(centralParts.formatToParts(new Date()).map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  };
  const prettyDate=s=>!s?'':fullDate.format(new Date(s+'T12:00:00Z'));
  const shiftLabel=s=>s==='IE'?'In Early':'After Shift';
  const titleCase=s=>s==='worked'?'Worked':s==='cancelled'?'Cancelled':'Scheduled';
  const notify=message=>{
    const node=document.getElementById('ieasFeedback');
    if(node){node.textContent=message;node.hidden=!message;}
    if(typeof toast==='function')toast(message);
  };
  function baselineLabel(raw){
    if(!raw||raw==='Initial')return 'Excel starting reference: Initial';
    const match=raw.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(!match)return 'Excel starting reference: '+raw;
    const type=match[1].replace(/\bR\b/,'Required').replace(/\bV\b/,'Volunteer')
      .replace(/\bIE\b/,'In Early').replace(/\bAS\b/,'After Shift');
    const year=match[4].length===2?'20'+match[4]:match[4];
    const iso=year+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
    return 'Excel starting reference: '+type+' · '+prettyDate(iso);
  }
  function activityText(a){
    return titleCase(a.status)+' · '+safe(a.assignment_kind)+' '+shiftLabel(a.shift_type)+' · '+prettyDate(a.date);
  }
  panel.innerHTML=[
    '<div class="ieas-shell">',
      '<section class="ieas-head">',
        '<h2>In Early / Aftershift</h2>',
        '<p>Independent Alpha Crew rotation. Scheduling does not change a position. An officer drops only when the work is recorded as completed.</p>',
        '<div class="ieas-summary" id="ieasSummary"></div>',
      '</section>',
      '<div class="ieas-toolbar"><h3>Current IE/AS List</h3><button type="button" class="dark" data-ieas-action="refresh">Refresh</button></div>',
      '<div class="ieas-feedback" id="ieasFeedback" role="status" aria-live="polite" hidden></div>',
      '<div class="ieas-cards" id="ieasCards" aria-live="polite">Loading In Early / Aftershift list…</div>',
    '</div>'
  ].join('');
  const cards=document.getElementById('ieasCards');
  const dialog=document.createElement('dialog');
  dialog.id='ieasHistoryDialog';
  dialog.innerHTML='<div class="modal ieas-history-modal"><div class="ieas-history-head"><h2 id="ieasHistoryTitle">IE/AS history</h2><button type="button" class="dark" data-ieas-action="close-history">Close</button></div><p class="ieas-small" id="ieasHistoryRange"></p><div id="ieasHistoryRows"></div></div>';
  document.body.appendChild(dialog);
  let roster=[],busy=false,historyOfficerId=null,lastRole=null;
  function available(o){return o.available===true;}
  function statusText(o){
    if(o.status==='Vacation')return 'Vacation';
    if(o.status==='Off Shift')return 'Off Shift';
    if(o.status==='Military')return 'Military';
    if(o.status==='Bonding')return 'Bonding';
    if(o.status==='Jury Duty')return 'Jury Duty';
    if(o.status==='Bereavement'||(o.bereavement_start_date&&o.bereavement_return_date&&today()>=o.bereavement_start_date&&today()<o.bereavement_return_date))return 'Bereavement';
    if(!available(o))return 'Unavailable Today';
    return 'Active';
  }
  function recentSummary(o){
    const recent=Array.isArray(o.recent_activity)?o.recent_activity:[];
    const last=recent.find(a=>a.status!=='cancelled');
    return last?'Recent: '+activityText(last):safe(baselineLabel(o.baseline_activity));
  }
  function activityHTML(a,officerId){
    const permitted=canEdit();
    const action=a.status==='scheduled'
      ?'<button type="button" class="dark ieas-small-btn" data-ieas-action="mark-worked" data-assignment-id="'+safe(a.id)+'">Mark worked</button><button type="button" class="dark ieas-small-btn" data-ieas-action="cancel" data-assignment-id="'+safe(a.id)+'">Cancel</button>'
      :a.status==='worked'
        ?'<button type="button" class="dark ieas-small-btn" data-ieas-action="undo" data-assignment-id="'+safe(a.id)+'">Undo worked</button>'
        :'';
    return '<div class="ieas-history-item '+(a.status==='cancelled'?'ieas-cancelled':'')+'"><span>'+activityText(a)+'</span>'+(permitted?action:'')+'</div>';
  }
  function render(){
    lastRole=typeof role==='undefined'?'viewer':role;
    if(!Array.isArray(roster))return;
    const active=roster.filter(available).length;
    const vacation=roster.filter(o=>o.status==='Vacation').length;
    const unavailable=roster.length-active;
    document.getElementById('ieasSummary').innerHTML=
      '<span><strong>'+active+'</strong> Available</span><span><strong>'+unavailable+'</strong> Unavailable</span><span><strong>'+vacation+'</strong> Vacation</span>';
    let count=0;
    cards.innerHTML=roster.map(o=>{
      const isAvailable=available(o);
      const rank=isAvailable?++count:'–';
      const currentStatus=statusText(o);
      const editable=canEdit()&&isAvailable;
      const badge='<span class="ieas-badge '+(isAvailable?'ieas-active':'ieas-unavailable')+'">'+safe(currentStatus)+'</span>';
      const note=o.status==='Vacation'&&o.vacation_return_date?' · Returns '+prettyDate(o.vacation_return_date):'';
      const last=recentSummary(o);
      const history='<button type="button" class="dark ieas-utility" data-ieas-action="history" data-officer-id="'+safe(o.id)+'">History</button>';
      const assign=editable?'<button type="button" class="dark ieas-utility" data-ieas-action="toggle" data-officer-id="'+safe(o.id)+'">Assign</button>':'';
      const entryForm=editable?[
        '<div class="ieas-entry" hidden>',
          '<div class="ieas-entry-grid">',
            '<label>Shift<select name="ieasShift"><option value="IE">In Early</option><option value="AS">After Shift</option></select></label>',
            '<label>Assignment type<select name="ieasKind"><option value="Volunteer">Volunteer</option><option value="Required">Required</option></select></label>',
            '<label>Work date<input name="ieasDate" type="date" min="2026-10-28" value="'+today()+'"></label>',
          '</div>',
          '<div class="ieas-form-actions"><button type="button" class="dark" data-ieas-action="schedule" data-officer-id="'+safe(o.id)+'">Schedule (no drop)</button><button type="button" class="blue" data-ieas-action="record" data-officer-id="'+safe(o.id)+'">Record worked (drop)</button></div>',
          '<p class="ieas-small">Required and Volunteer move exactly the same here, but only completed work drops an officer. On the same day, In Early goes below After Shift.</p>',
        '</div>'
      ].join(''):'';
      return [
        '<article class="ieas-card" data-officer-id="'+safe(o.id)+'">',
          '<div class="ieas-card-main">',
            '<div class="ieas-number '+(isAvailable?'':'ieas-number-off')+'">'+rank+'</div>',
            '<div class="ieas-person">',
              '<div class="ieas-name-line"><strong>'+safe(o.name)+'</strong>'+badge+'</div>',
              '<div class="ieas-last">'+last+safe(note)+'</div>',
              (o.call_number?'<div class="ieas-call">Call # '+safe(o.call_number)+'</div>':''),
            '</div>',
          '</div>',
          '<div class="ieas-card-tools">'+assign+history+'</div>',
          entryForm,
        '</article>'
      ].join('');
    }).join('')||'<p>No Alpha Crew officers were returned.</p>';
  }
  async function load(force){
    if(busy)return;
    if(!force&&(panel.querySelector('.ieas-entry:not([hidden])')||dialog.open))return;
    busy=true;
    try{
      // This is the same existing availability/vacation return refresh used by OT List.
      if(typeof loadAll==='function')await loadAll();
      const data=await api('/rest/v1/rpc/ieas_list_summary',{method:'POST',auth:false,body:'{}'});
      if(!Array.isArray(data))throw Error('Invalid IE/AS list response');
      roster=data;
      render();
    }catch(error){notify('Unable to load IE/AS list: '+error.message)}
    finally{busy=false}
  }
  async function save(officerId,mode,button){
    if(!canEdit())return notify('Admin or Editor sign-in required.');
    const officer=roster.find(o=>o.id===officerId);
    if(!officer||!available(officer))return notify('Officer is unavailable.');
    const card=button.closest('.ieas-card');
    const shift=card.querySelector('[name="ieasShift"]').value;
    const kind=card.querySelector('[name="ieasKind"]').value;
    const date=card.querySelector('[name="ieasDate"]').value;
    if(!date||date<'2026-10-28')return notify('Choose a date on or after October 28, 2026.');
    if(mode==='worked'&&date>today())return notify('Future work cannot be marked worked.');
    button.disabled=true;
    try{
      const result=await api('/rest/v1/rpc/ieas_save_assignment',{
        method:'POST',
        body:JSON.stringify({p_officer_id:officerId,p_shift_type:shift,p_assignment_kind:kind,p_work_date:date,p_status:mode})
      });
      await load(true);
      notify(result.unchanged?'Assignment already recorded.':mode==='worked'?'Worked assignment recorded. Rotation updated.':'Scheduled. Rotation unchanged until worked.');
    }catch(error){notify(error.message)}
    finally{button.disabled=false}
  }
  async function change(assignmentId,nextStatus,button){
    if(!canEdit())return notify('Admin or Editor sign-in required.');
    if(nextStatus==='cancelled'&&!window.confirm('Cancel this IE/AS assignment? A completed shift will be removed from the rotation replay, while other valid work remains.'))return;
    button.disabled=true;
    try{
      await api('/rest/v1/rpc/ieas_change_assignment_status',{
        method:'POST',body:JSON.stringify({p_assignment_id:assignmentId,p_status:nextStatus})
      });
      await load(true);
      if(dialog.open&&historyOfficerId)await showHistory(historyOfficerId);
      notify(nextStatus==='worked'?'Worked assignment recorded. Rotation updated.':'Assignment cancelled. Rotation recalculated.');
    }catch(error){notify(error.message)}
    finally{button.disabled=false}
  }
  async function showHistory(officerId){
    historyOfficerId=officerId;
    const officer=roster.find(o=>o.id===officerId);
    if(!officer)return;
    document.getElementById('ieasHistoryTitle').textContent=officer.name+' · IE/AS history';
    document.getElementById('ieasHistoryRange').textContent=(canEdit()?'Last 60 days':'Last 2 days')+' · Excel starting reference: '+baselineLabel(officer.baseline_activity).replace('Excel starting reference: ','');
    document.getElementById('ieasHistoryRows').textContent='Loading history…';
    if(!dialog.open)dialog.showModal();
    try{
      const rows=await api('/rest/v1/rpc/ieas_officer_history',{method:'POST',body:JSON.stringify({p_officer_id:officerId})});
      if(historyOfficerId!==officerId)return;
      document.getElementById('ieasHistoryRows').innerHTML=Array.isArray(rows)&&rows.length
        ? rows.map(a=>activityHTML(a,officerId)).join('')
        : '<p class="ieas-small">No new IE/AS assignments recorded in this period. The Excel starting position is preserved.</p>';
    }catch(error){document.getElementById('ieasHistoryRows').textContent='Unable to load history: '+error.message}
  }
  function onClick(event){
    const button=event.target.closest('button[data-ieas-action]');
    if(!button)return;
    const action=button.dataset.ieasAction;
    if(action==='refresh')return void load(true);
    if(action==='close-history'){dialog.close();historyOfficerId=null;return}
    if(action==='toggle'){
      const card=button.closest('.ieas-card');
      const form=card&&card.querySelector('.ieas-entry');
      if(form){const next=form.hidden;panel.querySelectorAll('.ieas-entry').forEach(x=>x.hidden=true);form.hidden=!next;button.textContent=next?'Close':'Assign'}
      return;
    }
    if(action==='history')return void showHistory(button.dataset.officerId);
    if(action==='schedule'||action==='record')return void save(button.dataset.officerId,action==='record'?'worked':'scheduled',button);
    if(action==='mark-worked')return void change(button.dataset.assignmentId,'worked',button);
    if(action==='cancel'||action==='undo')return void change(button.dataset.assignmentId,'cancelled',button);
  }
  panel.addEventListener('click',onClick);
  dialog.addEventListener('click',onClick);
  window.alphaIEASLoad=()=>load(true);
  window.alphaIEASRefreshAccess=()=>{if(!panel.hidden&&roster.length)render()};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)load(false)});
  setInterval(()=>{
    if(!panel.hidden&&document.visibilityState==='visible'){
      if(lastRole!==(typeof role==='undefined'?'viewer':role)&&roster.length)render();
      load(false);
    }
  },30000);
})();
