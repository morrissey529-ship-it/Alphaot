/* Alpha OT — Undo the most recent saved change (single or batch). */
(function(){
  'use strict';
  if(!document.getElementById('addBtn')||typeof api!=='function'||typeof loadAll!=='function')return;
  const afterButton=document.getElementById('alphaBulkOpen')||document.getElementById('addBtn');
  const undoButton=document.createElement('button');
  undoButton.id='alphaUndoOpen';
  undoButton.type='button';
  undoButton.className='dark hidden';
  undoButton.textContent='Undo Last Change';
  afterButton.after(undoButton);

  const bulkDialog=document.getElementById('alphaBulkDialog');
  if(bulkDialog){
    const footer=bulkDialog.querySelector('.bulk-buttons');
    if(footer){
      const bulkUndo=document.createElement('button');
      bulkUndo.id='alphaBulkUndoOpen';
      bulkUndo.className='dark';
      bulkUndo.type='button';
      bulkUndo.textContent='Undo Last Change';
      footer.prepend(bulkUndo);
      bulkUndo.addEventListener('click',()=>{
        bulkDialog.close();
        openUndo();
      });
    }
  }

  const dialog=document.createElement('dialog');
  dialog.id='alphaUndoDialog';
  dialog.setAttribute('aria-labelledby','alphaUndoTitle');
  dialog.innerHTML=`
    <div class="modal" style="max-width:460px">
      <h2 id="alphaUndoTitle">Undo Last Change</h2>
      <p class="help" id="alphaUndoDetails" style="line-height:1.55">
        Checking the most recent saved action…
      </p>
      <p class="help" id="alphaUndoSafety" style="line-height:1.55">
        Undo reverses the entire last saved action, including every officer in a batch.
        Previous changes and unrelated officers are retained. A record of the reversal is kept.
      </p>
      <div id="alphaUndoError" class="error" role="alert" style="min-height:19px"></div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button type="button" class="dark" id="alphaUndoCancel">Cancel</button>
        <button type="button" class="blue" id="alphaUndoConfirm" disabled>Confirm Undo</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  const message=dialog.querySelector('#alphaUndoDetails');
  const error=dialog.querySelector('#alphaUndoError');
  const confirm=dialog.querySelector('#alphaUndoConfirm');
  const cancel=dialog.querySelector('#alphaUndoCancel');
  let transactionId=null;
  let busy=false;
  const allowed=()=>role==='admin'||role==='editor';
  const oldRefreshMode=refreshMode;
  refreshMode=function(){
    oldRefreshMode();
    undoButton.classList.toggle('hidden',!allowed());
  };
  undoButton.classList.toggle('hidden',!allowed());

  async function openUndo(){
    if(!allowed()||busy)return;
    transactionId=null;
    confirm.disabled=true;
    confirm.textContent='Confirm Undo';
    error.textContent='';
    message.textContent='Checking the most recent saved action…';
    if(!dialog.open)dialog.showModal();
    try{
      const preview=await api('/rest/v1/rpc/alpha_undo_preview',{
        method:'POST',body:'{}'
      });
      if(!dialog.open)return;
      if(!preview?.available){
        message.textContent=preview?.reason||'There is no recorded change available to undo.';
        return;
      }
      transactionId=preview.transaction_id;
      const count=Number(preview.officers)||Number(preview.changes)||1;
      const actorText=preview.is_own_action?'Your last saved change':'Latest saved change';
      const date=preview.date&&typeof fmt==='function'?' · '+fmt(preview.date):'';
      message.textContent=actorText+': '+(preview.action||'List update')
        +date+' — '+count+' officer'+(count===1?'':'s')
        +'. Saved '+new Date(preview.saved_at).toLocaleString()+'.';
      confirm.disabled=false;
    }catch(e){
      error.textContent=e.message||'Could not check the last saved action.';
    }
  }

  undoButton.addEventListener('click',openUndo);
  cancel.addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});

  confirm.addEventListener('click',async()=>{
    if(busy||!allowed()||transactionId===null)return;
    busy=true;
    error.textContent='';
    confirm.disabled=true;
    cancel.disabled=true;
    confirm.textContent='Undoing…';
    try{
      const result=await api('/rest/v1/rpc/alpha_undo_last_change',{
        method:'POST',
        body:JSON.stringify({p_transaction_id:transactionId})
      });
      dialog.close();
      transactionId=null;
      await loadAll();
      const calendarPanel=document.getElementById('alphaCalendarPanel');
      if(calendarPanel&&!calendarPanel.hidden){
        document.getElementById('alphaCalendarTab')?.click();
      }
      toast('Last action reversed'+(result?.changes_reversed?' · '+result.changes_reversed+' changes':''));
    }catch(e){
      error.textContent=e.message||'Unable to undo. The current list was not changed.';
    }finally{
      busy=false;
      cancel.disabled=false;
      confirm.textContent='Confirm Undo';
      confirm.disabled=transactionId===null;
    }
  });
})();
