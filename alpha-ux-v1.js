/* Alpha OT compact mobile shell, sticky tabs, card search and personal shortcut.
   Presentation only: never renumber, reorder, or save OT events. */
(function(){
  'use strict';
  const app=document.querySelector('.app'),header=app?.querySelector('header');
  const tabs=header?.querySelector('.alpha-tabs');
  const hub=header?.querySelector('.infoHub');
  const listPanel=document.getElementById('alphaListPanel');
  const list=document.getElementById('list');
  if(!app||!header||!tabs||!hub||!listPanel||!list)return;

  // Keep the four navigation tabs visible independently of the tall header.
  const sticky=document.createElement('div');
  sticky.className='alpha-sticky-shell';
  sticky.setAttribute('aria-label','Alpha OT navigation and sync status');
  header.insertAdjacentElement('afterend',sticky);
  sticky.appendChild(tabs);
  const status=document.createElement('div');
  status.id='alphaStickyStatus';
  status.className='alpha-sticky-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent=document.getElementById('alphaRosterStatus')?.textContent||'Loading roster…';
  sticky.appendChild(status);

  // All existing buttons, stat cards and phone links remain inside this panel.
  const hubDetails=document.createElement('details');
  hubDetails.className='alpha-hub-collapse';
  hubDetails.id='alphaHubDetails';
  hubDetails.innerHTML='<summary><span>Crew information &amp; actions</span><span class="alpha-expand-hint">Show / hide</span></summary>';
  header.appendChild(hubDetails);
  hubDetails.appendChild(hub);
  hubDetails.open=window.matchMedia?window.matchMedia('(min-width: 720px)').matches:true;

  const toolbar=document.createElement('div');
  toolbar.id='alphaRosterTools';
  toolbar.className='alpha-roster-tools';
  toolbar.innerHTML=
    '<div class="alpha-search-fields">'+
      '<label class="alpha-search-label" for="alphaNameSearch">Search OT list</label>'+
      '<input id="alphaNameSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Officer name" aria-describedby="alphaSearchResult"/>'+
    '</div>'+
    '<div class="alpha-find-row">'+
      '<label for="alphaMyNameSelect">My name</label>'+
      '<select id="alphaMyNameSelect" aria-label="Choose your name on the overtime list"><option value="">Choose officer</option></select>'+
      '<button type="button" id="alphaFindMyName" class="dark">Find my name</button>'+
    '</div>'+
    '<p id="alphaSearchResult" class="alpha-search-result" aria-live="polite">Numbers reflect the original rotation and never change with search.</p>';
  listPanel.insertBefore(toolbar,listPanel.firstChild);
  const search=toolbar.querySelector('#alphaNameSearch');
  const ownSelect=toolbar.querySelector('#alphaMyNameSelect');
  const find=toolbar.querySelector('#alphaFindMyName');
  const result=toolbar.querySelector('#alphaSearchResult');
  const prefKey='alpha_preferred_name_v1';
  const getPreference=()=>{
    try{return localStorage.getItem(prefKey)||''}catch{return ''}
  };
  const setPreference=value=>{
    try{if(value)localStorage.setItem(prefKey,value);else localStorage.removeItem(prefKey)}catch{}
    window.dispatchEvent(new CustomEvent('alpha-preferred-name-change',{detail:{name:value}}));
  };
  window.alphaGetPreferredName=getPreference;
  window.alphaSetPreferredName=setPreference;

  function listed(){
    return Array.from(list.querySelectorAll('.card')).map(card=>({
      card,name:card.querySelector('.name')?.textContent?.trim()||''
    })).filter(item=>item.name);
  }
  function populateNames(){
    const names=listed().map(x=>x.name);
    const previous=ownSelect.value||getPreference();
    ownSelect.replaceChildren(new Option('Choose officer',''));
    names.forEach(name=>ownSelect.add(new Option(name,name)));
    if(names.includes(previous)){ownSelect.value=previous;}
    else if(names.length){ownSelect.value='';}
  }
  function applySearch(){
    const query=search.value.trim().toLocaleLowerCase();
    const all=listed();
    let visible=0;
    for(const item of all){
      const match=!query||item.name.toLocaleLowerCase().includes(query);
      item.card.hidden=!match;
      if(match)visible++;
    }
    result.textContent=all.length
      ?'Showing '+visible+' of '+all.length+' officers · Rotation numbers are unchanged'
      :'Loading roster · Rotation numbers are unchanged';
  }
  function findPreferred(){
    const name=ownSelect.value||getPreference();
    if(!name){ownSelect.focus();return;}
    setPreference(name);
    search.value=name;
    applySearch();
    const item=listed().find(x=>x.name===name);
    if(item){
      const focusTarget=item.card.querySelector('.name')||item.card;
      focusTarget.tabIndex=-1;
      focusTarget.focus({preventScroll:true});
      item.card.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }
  search.addEventListener('input',applySearch);
  ownSelect.addEventListener('change',()=>{
    if(ownSelect.value)setPreference(ownSelect.value);
  });
  find.addEventListener('click',findPreferred);
  window.alphaFindMyName=findPreferred;

  const stats=header.querySelector('.stats');
  function syncViewPrivacy(){
    if(!stats||typeof role==='undefined'||!Array.isArray(officers))return;
    const isViewer=role!=='admin'&&role!=='editor';
    stats.classList.toggle('alpha-public-summary',isViewer);
    const activeLabel=stats.querySelector('.stat:has(#ac) span');
    if(activeLabel)activeLabel.textContent=isViewer?'Available':'Active';
    const ua=stats.querySelector('#uc');
    if(ua){
      const card=ua.closest('.stat');
      card?.querySelector('span')?.replaceChildren(document.createTextNode('Unavailable'));
      if(isViewer&&officers.length){
        // Generic unavailable includes all reasons; no leave category leaked.
        const number=officers.filter(o=>typeof eligible==='function'
          ?eligible(o)&&o.blocked_next_ot!==true
          :o.status==='Active'&&o.blocked_next_ot!==true).length;
        stats.querySelector('#ac').textContent=String(number);
        ua.textContent=String(officers.length-number);
      }
    }
    for(const card of Array.from(stats.querySelectorAll('.stat'))){
      const isGeneric=!!card.querySelector('#ac,#uc');
      card.hidden=isViewer&&!isGeneric;
    }
  }
  const oldRender=render;
  render=function(){
    oldRender();
    populateNames();
    applySearch();
    syncViewPrivacy();
  };
  // The list rerenders after every authenticated refresh; keep search state.
  const observer=new MutationObserver(()=>{
    populateNames();applySearch();
  });
  observer.observe(list,{childList:true});
  if(list.children.length){populateNames();applySearch();syncViewPrivacy();}
})();
