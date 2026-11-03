/* ALPHA COMMAND visual layer.
   Decoration and layout only. Never changes roster order, DB records, shift logic
   or privileged controls. All numbers remain sourced from existing officer data. */
(function(){
  'use strict';
  const app=document.querySelector('.app');
  const header=app?.querySelector('header');
  const head=header?.querySelector('.head');
  const brand=head?.querySelector('.brand');
  const tabs=header?.querySelector('.alpha-tabs');
  if(!app||!header||!head||!brand||!tabs)return;
  if(document.documentElement.dataset.alphaCommand==='on')return;
  document.documentElement.dataset.alphaCommand='on';

  // Keep the live date and its existing ID intact, centered immediately
  // beneath the ALPHA OT header rather than squeezed into the upper corner.
  const date=head.querySelector('.hubHeading')||header.querySelector('.infoHub .hubHeading');
  if(date){
    date.classList.add('alpha-command-centered-date');
    head.insertAdjacentElement('afterend',date);
  }

  const title=brand.querySelector('.brandTitle');
  const sub=brand.querySelector('.sub');
  if(title&&sub&&!brand.querySelector('.alpha-command-mark')){
    // Keep original full project name accessible and visibly described.
    title.setAttribute('aria-label','Alpha Crew Overtime');
    title.textContent='ALPHA OT';
    sub.textContent='NUCLEAR SECURITY OPERATIONS';
    const wordmark=document.createElement('div');
    wordmark.className='alpha-command-wordmark';
    brand.appendChild(wordmark);
    wordmark.append(title,sub);
    const descriptor=document.createElement('span');
    descriptor.className='alpha-command-descriptor';
    descriptor.textContent='Alpha Crew overtime rotation & scheduling';
    wordmark.appendChild(descriptor);

    const mark=document.createElement('span');
    mark.className='alpha-command-mark';
    mark.setAttribute('role','img');
    mark.setAttribute('aria-label','Alpha OT operations symbol');
    mark.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">'+
      '<defs><linearGradient id="ac-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2fcff"/><stop offset=".37" stop-color="#628da8"/><stop offset=".65" stop-color="#d0eaf9"/><stop offset="1" stop-color="#3c6b8d"/></linearGradient>'+
      '<radialGradient id="ac-center"><stop stop-color="#b7f7ff"/><stop offset=".8" stop-color="#66c1ea"/><stop offset="1" stop-color="#184768"/></radialGradient></defs>'+
      '<circle cx="50" cy="50" r="47" fill="#081726" stroke="url(#ac-metal)" stroke-width="4"/>'+
      '<circle cx="50" cy="50" r="40" fill="#0b2337" stroke="#6cbce8" stroke-width="1.8"/>'+
      '<circle cx="50" cy="50" r="34" fill="#081522" stroke="#224d67" stroke-width="2"/>'+
      '<g fill="url(#ac-metal)" stroke="#091e2d" stroke-width="1.7">'+
      '<path d="M44 44L21 25A37 37 0 0 1 79 25L56 44A10 10 0 0 0 44 44Z"/>'+
      '<path d="M61 51L86 38A37 37 0 0 1 59 83L56 57A10 10 0 0 0 61 51Z"/>'+
      '<path d="M44 57L41 83A37 37 0 0 1 14 38L39 51A10 10 0 0 0 44 57Z"/>'+
      '</g><circle cx="50" cy="50" r="10" fill="url(#ac-center)" stroke="#0a2438" stroke-width="3"/>'+
      '<circle cx="50" cy="50" r="47" fill="none" stroke="#6ce3ff" stroke-opacity=".18" stroke-width="1"/>'+
      '</svg>';
    brand.prepend(mark);
  }

  const paths={
    ac:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3z"/>',
    oc:'<path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10Z"/>',
    vc:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M3 13h18"/>',
    bc:'<path d="M20.8 4.9a5.3 5.3 0 0 0-7.5 0L12 6.2l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 21l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z"/>',
    mc:'<path d="m3 9 9-6 9 6M3 15l9-6 9 6M3 21l9-6 9 6"/>',
    bnc:'<circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/><path d="M2 5h4l2 9h11l3-7H8M6 3l3-2M14 7l4 3"/>',
    jc:'<path d="M2 9 12 3l10 6M4 10h16M5 10v9m5-9v9m5-9v9m4-9v9M2 21h20M8 8l4-2 4 2"/>',
    uc:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 4 6 5m0-5-6 5"/>'
  };
  function lineIcon(pathsHTML){
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+pathsHTML+'</svg>';
  }
  const phoneMark=document.querySelector('#calloffPhone span');
  if(phoneMark){
    phoneMark.classList.add('alpha-command-phone-icon');
    phoneMark.innerHTML=lineIcon('<path d="M8 3H5a2 2 0 0 0-2 2c0 9 7 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 3c-3-1-6-4-7-7l3-2-2-5Z"/>');
  }
  function decorateStatusCards(){
    for(const id of Object.keys(paths)){
      const value=document.getElementById(id);
      const stat=value?.closest('.stat');
      if(!stat||stat.querySelector('.alpha-command-stat-icon'))continue;
      const icon=document.createElement('span');
      icon.className='alpha-command-stat-icon';
      icon.setAttribute('aria-hidden','true');
      icon.innerHTML=lineIcon(paths[id]);
      stat.insertBefore(icon,value);
    }
  }
  decorateStatusCards();

  const tabSymbols={
    alphaListTab:'<rect x="4" y="3" width="16" height="19" rx="2"/><path d="M9 3v2h6V3M8 10h8M8 14h8M8 18h5"/>',
    alphaIEASTab:'<path d="M12 2 20 6v6c0 5-3 8-8 10C7 20 4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    alphaCalendarTab:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-11 4h4"/>',
    alphaStatsTab:'<path d="M4 21V13h4v8M10 21V8h4v13M16 21V3h4v18"/>'
  };
  for(const [id,shape] of Object.entries(tabSymbols)){
    const tab=document.getElementById(id);
    if(!tab||tab.querySelector('.alpha-command-tab-icon'))continue;
    const icon=document.createElement('span');
    icon.className='alpha-command-tab-icon';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML=lineIcon(shape);
    tab.prepend(icon);
  }

  // Never change officer/card ordering or the eligible rotation numbers.
  // Make the existing call number appear as a large right-side visual watermark.
  const statusSlug=s=>String(s||'Active').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  function decorateOfficerCard(officer){
    const card=document.getElementById('c-'+officer.id);
    if(!card)return;
    const unavailable=officer.status==='Active'&&officer.temporarily_unavailable&&
      typeof today==='function'&&officer.temporarily_unavailable_date===today();
    card.dataset.alphaCommandStatus=unavailable?'unavailable':statusSlug(officer.status);
    const badge=card.querySelector('.alpha-call-number');
    if(badge){
      const digits=badge.querySelector('strong')?.textContent.trim()||'';
      if(digits){
        badge.classList.remove('alpha-command-digits-1','alpha-command-digits-2','alpha-command-digits-3','alpha-command-digits-4');
        badge.classList.add('alpha-command-digits-'+Math.min(digits.length,4));
        badge.setAttribute('aria-label','Call number '+digits);
        // The badge's original "Call #" label remains in the DOM but is hidden visually.
        // The actual value remains bound to the officer's existing call number.
      }
    }
    const activity=Array.from(card.querySelectorAll('.main .activityLine'));
    if(activity.length>1&&!card.querySelector('.alpha-command-old-activity')){
      const details=document.createElement('details');
      details.className='alpha-command-old-activity';
      const summary=document.createElement('summary');
      summary.textContent='Earlier activity';
      details.appendChild(summary);
      const body=document.createElement('div');
      body.className='alpha-command-old-activity-rows';
      details.appendChild(body);
      for(const item of activity.slice(1))body.appendChild(item);
      activity[0].insertAdjacentElement('afterend',details);
    }
  }
  function decorateOfficers(){
    if(typeof officers!=='undefined'&&Array.isArray(officers)){
      officers.forEach(decorateOfficerCard);
    }
  }
  if(typeof render==='function'){
    const previousRender=render;
    render=function(){
      const result=previousRender.apply(this,arguments);
      decorateOfficers();
      return result;
    };
  }
  decorateOfficers();

  // IE/AS cards have their own independent call-number field. Keep the
  // existing value and context, but hide "Call #" in its visible label.
  const ieas=document.getElementById('alphaIEASPanel');
  function decorateIEAS(){
    if(!ieas)return;
    // The server roster does not always include call_number. Reuse the same
    // fallback officer-to-number mapping already used on the regular OT list.
    const fallback=window.alphaOTCallNumbers||{};
    ieas.querySelectorAll('.ieas-card').forEach(card=>{
      const officerName=card.querySelector('.ieas-name-line strong')?.textContent?.trim()||'';
      if(!officerName)return;
      let element=card.querySelector('.ieas-call');
      let digits=element?.textContent?.trim().match(/(\d{1,4})\s*$/)?.[1]||'';
      if(!digits){
        const mapped=Number(fallback[officerName]);
        if(Number.isInteger(mapped)&&mapped>0&&mapped<=9999)digits=String(mapped);
      }
      if(!digits)return;
      if(!element){
        const container=card.querySelector('.ieas-person');
        if(!container)return;
        element=document.createElement('div');
        element.className='ieas-call';
        container.appendChild(element);
      }
      if(element.dataset.alphaCommandDone==='true'&&element.textContent===digits)return;
      element.dataset.alphaCommandDone='true';
      element.setAttribute('aria-label','Call number '+digits);
      element.classList.add('alpha-command-ieas-digits-'+Math.min(digits.length,4));
      element.textContent=digits;
    });
  }
  if(ieas&&typeof MutationObserver!=='undefined'){
    new MutationObserver(decorateIEAS).observe(ieas,{subtree:true,childList:true});
    decorateIEAS();
  }

  // The original styles inject rules after DOM startup; relocate the new
  // theme stylesheet to the very end of <head> so visual rules win,
  // without editing the existing functionality scripts.
  const theme=document.querySelector('link[data-alpha-command-theme]');
  if(theme)document.head.appendChild(theme);
})();
