/* Alpha-only 15-second splash. Video asset: assets/alpha-splash-15s.mp4.
   Never block OT access if the asset is unavailable or playback fails. */
(function(){
"use strict";
const splash=document.getElementById("alphaSplash");
if(!splash)return;
const video=document.getElementById("alphaSplashVideo");
const skip=document.getElementById("alphaSplashSkip");
const progress=document.getElementById("alphaSplashProgress");
const DURATION=15000;
let timer=null,started=0,done=false,animation=null;
function finish(){
 if(done)return;
 done=true;
 if(timer!==null)clearTimeout(timer);
 if(animation!==null)cancelAnimationFrame(animation);
 video.pause();
 splash.classList.add("alpha-splash-exit");
 setTimeout(()=>{splash.remove();document.body.classList.remove("alpha-splash-active");},220);
}
function tick(){
 if(done)return;
 const elapsed=performance.now()-started;
 progress.style.width=Math.min(100,elapsed/DURATION*100)+"%";
 if(elapsed>=DURATION){finish();return;}
 animation=requestAnimationFrame(tick);
}
skip.addEventListener("click",finish);
video.addEventListener("error",finish);
video.addEventListener("ended",finish);
const activate=()=>{
 if(done)return;
 started=performance.now();
 splash.hidden=false;
 document.body.classList.add("alpha-splash-active");
 timer=setTimeout(finish,DURATION);
 animation=requestAnimationFrame(tick);
 const p=video.play();
 if(p&&typeof p.catch==="function")p.catch(finish);
};
fetch(video.currentSrc||video.querySelector("source")?.src,{method:"HEAD",cache:"force-cache"}).then(r=>{
 if(!r.ok)throw new Error("Splash asset unavailable");
 activate();
}).catch(finish);
})();