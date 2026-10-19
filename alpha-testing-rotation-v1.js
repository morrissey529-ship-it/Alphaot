/* Alpha OT daily testing rotation, anchored October 19 2026 in America/Chicago.
   Calendar-day cycle: EWS 1, EWS 2, Ingress, PIDS 1, PIDS 2. */
(function(){
  'use strict';
  const target=document.getElementById('alphaTestingType');
  if(!target)return;
  const tests=['EWS 1','EWS 2','Ingress','PIDS 1','PIDS 2'];
  const anchor=Date.UTC(2026,9,19);
  const dateTarget=document.getElementById('alphaHubDate');
  const nextTarget=document.getElementById('alphaTestingNext');
  const dateFormatter=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'
  });
  const formatter=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
  });
  function update(){
    const now=new Date();
    const parts=formatter.formatToParts(now);
    const part=type=>parts.find(p=>p.type===type)?.value;
    const year=Number(part('year')),month=Number(part('month')),day=Number(part('day'));
    if(!year||!month||!day)return;
    const dayIndex=Math.round((Date.UTC(year,month-1,day)-anchor)/86400000);
    const index=((dayIndex%5)+5)%5;
    const label='Testing — '+tests[index];
    if(target.textContent!==label)target.textContent=label;
    if(dateTarget)dateTarget.textContent=dateFormatter.format(now)+' · Central Time';
    if(nextTarget)nextTarget.textContent='Next: '+tests[(index+1)%5]+' · Rotates daily';
  }
  update();
  setInterval(update,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
})();
