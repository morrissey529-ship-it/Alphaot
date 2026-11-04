/* Alpha OT — native-style floating phone navigation.
   Moves the EXISTING four-tab element; no new tab buttons, handlers, or rotation changes.
   Desktop retains the original navigation and full tab names. */
(function(){
  'use strict';

  const theme=document.querySelector('link[data-alpha-bottom-nav-theme]');
  if(theme)document.head.appendChild(theme);

  const tabs=document.querySelector('.app>header .alpha-tabs');
  if(!tabs||tabs.dataset.alphaBottomReady==='true')return;
  tabs.dataset.alphaBottomReady='true';

  const anchor=document.createComment('Original Alpha OT tab position');
  tabs.parentNode.insertBefore(anchor,tabs);

  // Keep original visible names on desktop and for assistive technology.
  // Mobile gets shorter labels so four destinations fit in one row.
  const mobileLabels={
    alphaListTab:'OT List',
    alphaIEASTab:'IE/AS',
    alphaCalendarTab:'Calendar',
    alphaStatsTab:'OT Stats'
  };
  for(const [id,label] of Object.entries(mobileLabels)){
    const button=document.getElementById(id);
    if(!button||!tabs.contains(button))continue;
    const fullName=button.textContent.replace(/\s+/g,' ').trim();
    button.setAttribute('aria-label',fullName);
    const mobile=document.createElement('span');
    mobile.className='alpha-mobile-tab-label';
    mobile.setAttribute('aria-hidden','true');
    mobile.textContent=label;
    button.appendChild(mobile);
  }

  const media=window.matchMedia('(max-width: 700px)');
  function alignNavigation(){
    const mobile=media.matches;
    if(mobile){
      // Put the original element directly under body so no header CSS or
      // ancestor clipping/stacking context can interfere with fixed positioning.
      if(tabs.parentNode!==document.body)document.body.appendChild(tabs);
      tabs.classList.add('alpha-bottom-navigation');
      document.documentElement.classList.add('alpha-has-bottom-tabs');
      tabs.setAttribute('aria-label','Bottom navigation: Alpha OT sections');
    }else{
      tabs.classList.remove('alpha-bottom-navigation');
      document.documentElement.classList.remove('alpha-has-bottom-tabs');
      if(anchor.parentNode)anchor.parentNode.insertBefore(tabs,anchor.nextSibling);
      tabs.setAttribute('aria-label','Choose an Alpha OT section');
    }
  }

  alignNavigation();
  if(typeof media.addEventListener==='function'){
    media.addEventListener('change',alignNavigation);
  }else if(typeof media.addListener==='function'){
    media.addListener(alignNavigation);
  }

  // Reuse each original tab's click handler. After selection, position the
  // chosen section at the top of the viewport, including after long scrolling.
  tabs.addEventListener('click',event=>{
    if(!media.matches)return;
    const button=event.target.closest('[role="tab"]');
    if(!button||!tabs.contains(button))return;
    window.requestAnimationFrame(()=>{
      const panel=document.getElementById(button.getAttribute('aria-controls'));
      if(!panel||panel.hidden)return;
      const top=Math.max(0,window.scrollY+panel.getBoundingClientRect().top-12);
      window.scrollTo({top,behavior:'auto'});
    });
  });
})();
