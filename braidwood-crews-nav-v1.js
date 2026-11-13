/* Braidwood Security Overtime — link to crew selector inside mobile dock.
   The four existing application tabs and their click handlers stay unchanged. */
(function(){
  'use strict';
  const tabs=document.querySelector('.alpha-tabs');
  const ieas=document.getElementById('alphaIEASTab');
  const home=document.querySelector('.app>header .crewHomeLink');
  if(!tabs||!ieas||!home||!tabs.contains(ieas)||tabs.querySelector('.alpha-crews-nav-link'))return;

  const link=document.createElement('a');
  link.className='alpha-crews-nav-link';
  link.href=home.getAttribute('href');
  link.setAttribute('aria-label','Back to Crews');
  link.title='Back to Crews';
  // This is a navigation link, not a fifth tab; it never switches app panels.
  link.innerHTML=
    '<span class="alpha-crews-nav-icon" aria-hidden="true">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '+
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-7h6v7"/>'+
    '</svg></span>'+
    '<span class="alpha-crews-nav-label" aria-hidden="true">Crews</span>';
  ieas.insertAdjacentElement('afterend',link);
})();