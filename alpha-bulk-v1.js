/* Alpha OT Bulk Assign: controls shared by production and separate Beta.
   One request per batch; the backend commits all selected officers together. */
(function(){
  'use strict';
  if(!document.getElementById('addBtn')||typeof api!=='function'||typeof loadAll!=='function')return;
  const mount=document.getElementById('addBtn');
  const openButton=document.createElement('button');
  openButton.type='button';
  openButton.id='alphaBulkOpen';
  openButton.className='dark hidden';
  openButton.textContent='Bulk Assign';
  mount.after(openButton);

  const style=document.createElement('style');
  style.textContent=`
    #alphaBulkDialog .modal{width:min(95vw,540px);max-width:540px}
    #alphaBulkDialog .bulk-intro{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.5}
    #alphaBulkDialog .bulk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    #alphaBulkDialog .bulk-grid label{display:block;margin-bottom:4px;font-weight:700;font-size:12px}
    #alphaBulkDialog .bulk-grid input,#alphaBulkDialog .bulk-grid select{width:100%;min-height:43px}
    #alphaBulkDialog .bulk-roster{max-height:min(45vh,390px);overflow:auto;border:1px solid var(--line);border-radius:9px;margin:9px 0 13px;background:var(--surface)}
    #alphaBulkDialog .bulk-person{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer}
    #alphaBulkDialog .bulk-person:last-child{border-bottom:0}
    #alphaBulkDialog .bulk-person:has(input:checked){background:var(--blue-soft)}
    #alphaBulkDialog .bulk-person input{flex:0 0 auto;width:19px;height:19px;margin:0;accent-color:var(--blue)}
    #alphaBulkDialog .bulk-person span{flex:1;min-width:0;font-size:14px;color:var(--text)}
    #alphaBulkDialog .bulk-person small{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
    #alphaBulkDialog .bulk-buttons{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
    #alphaBulkDialog .bulk-buttons button{min-height:44px}
    #alphaBulkDialog .bulk-tools{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:14px}
    #alphaBulkDialog .bulk-tools strong{font-size:13px}
    #alphaBulkDialog .bulk-tools button{min-height:36px}
    #alphaBulkDialog .bulk-error{font-size:12px;color:var(--red);min-height:18px}
    @media(max-width:420px){#alphaBulkDialog .bulk-grid{grid-template-columns:1fr}#alphaBulkDialog .bulk-roster{max-height:33vh}}
  `;
  document.head.appendChild(style);

  const dialog=document.createElement('dialog');
  dialog.id='alphaBulkDialog';
  dialog.setAttribute('aria-labelledby','alphaBulkTitle');
  dialog.innerHTML=`
    <div class="modal">
      <h2 id="alphaBulkTitle">Bulk Assign</h2>
      <p class="bulk-intro">Select the officers, choose one assignment type and work date, then save. All selected officers are processed together in the order they held on the OT list before this batch.</p>
      <div class="bulk-grid">
        <div><label for="alphaBulkType">Assignment</label><select id="alphaBulkType">
          <option value="Training">Training</option>
          <option value="Volunteer OT">Volunteer OT</option>
          <option value="Required OT">Required OT</option>
        </select></div>
        <div><label for="alphaBulkDate">Assignment date</label><input type="date" id="alphaBulkDate" required></div>
      </div>
      <div class="bulk-tools"><strong id="alphaBulkCount">0 officers selected</strong><button type="button" class="dark" id="alphaBulkClear">Clear selections</button></div>
      <div class="bulk-roster" id="alphaBulkRoster" role="group" aria-label="Select officers in current OT rotation order"></div>
      <p class="bulk-intro">Only Active officers are shown. An unavailable or duplicate assignment stops the entire batch; no partial changes are saved. Volunteer and Required OT retain their existing block rules.</p>
      <p class="bulk-error" id="alphaBulkError" role="alert"></p>
      <div class="bulk-buttons"><button type="button" class="dark" id="alphaBulkCancel">Cancel</button><button type="button" class="blue" id="alphaBulkSave" disabled>Save assignments</button></div>
    </div>`;
  document.body.appendChild(dialog);
  const roster=dialog.querySelector('#alphaBulkRoster');
  const count=dialog.querySelector('#alphaBulkCount');
  const save=dialog.querySelector('#alphaBulkSave');
  const error=dialog.querySelector('#alphaBulkError');
  const dateField=dialog.querySelector('#alphaBulkDate');
  const actionField=dialog.querySelector('#alphaBulkType');
  let busy=false;
  let openedRevision=null;
  const allowed=()=>role==='admin'||role==='editor';
  const refreshAccess=()=>openButton.classList.toggle('hidden',!allowed());
  const previousRefreshMode=refreshMode;
  refreshMode=function(){previousRefreshMode();refreshAccess();};
  refreshAccess();

  function chosenIds(){
    return Array.from(roster.querySelectorAll('input[data-bulk-id]:checked')).map(x=>x.dataset.bulkId);
  }
  function updateSelection(){
    const howMany=chosenIds().length;
    count.textContent=howMany+' officer'+(howMany===1?'':'s')+' selected';
    save.textContent=busy?'Saving…':howMany?'Save '+howMany+' assignment'+(howMany===1?'':'s'):'Save assignments';
    save.disabled=busy||howMany===0||!dateField.value||!allowed();
  }
  function open(){
    if(!allowed()||busy)return;
    openedRevision=officers[0]?.revision??null;
    error.textContent='';
    dateField.value=today();
    actionField.value='Training';
    roster.innerHTML='';
    let number=0;
    for(const officer of officers){
      if(officer.status!=='Active')continue;
      number++;
      const label=document.createElement('label');
      label.className='bulk-person';
      const input=document.createElement('input');
      input.type='checkbox';
      input.dataset.bulkId=officer.id;
      const name=document.createElement('span');
      name.textContent=officer.name;
      const rank=document.createElement('small');
      rank.textContent='#'+number;
      label.append(input,name,rank);
      roster.appendChild(label);
    }
    if(!number)roster.textContent='No Active officers are available for selection.';
    updateSelection();
    dialog.showModal();
  }
  openButton.addEventListener('click',open);
  roster.addEventListener('change',updateSelection);
  dateField.addEventListener('change',updateSelection);
  dialog.querySelector('#alphaBulkClear').addEventListener('click',()=>{
    if(busy)return;
    roster.querySelectorAll('input:checked').forEach(x=>{x.checked=false;});
    updateSelection();
  });
  dialog.querySelector('#alphaBulkCancel').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  save.addEventListener('click',async()=>{
    if(busy||!allowed())return;
    const ids=chosenIds(),action=actionField.value,assignmentDate=dateField.value;
    if(!ids.length||!assignmentDate)return;
    busy=true;
    error.textContent='';
    updateSelection();
    try{
      const result=await api('/rest/v1/rpc/alpha_bulk_assign',{
        method:'POST',
        body:JSON.stringify({
          p_officer_ids:ids,p_action:action,p_event_date:assignmentDate,
          p_expected_revision:openedRevision
        })
      });
      dialog.close();
      toast('Saved '+result.count+' '+action+' assignment'+(result.count===1?'':'s'));
      await loadAll();
    }catch(e){
      error.textContent=e.message||'Could not save. No batch changes were kept.';
    }finally{
      busy=false;
      updateSelection();
    }
  });
})();