/* Alpha-only splash. The uploaded 15-second MP4 is served directly from /assets.
   iOS Safari/PWA: don't issue a HEAD request before media playback; allow tap-to-play
   when the browser blocks autoplay. All failures are skippable and never block OT. */
(function(){
"use strict";
const splash=document.getElementById("alphaSplash");
const video=document.getElementById("alphaSplashVideo");
const skip=document.getElementById("alphaSplashSkip");
const progress=document.getElementById("alphaSplashProgress");
if(!splash||!video||!skip||!progress)return;
const MAX_DURATION=15000;
let finished=false,started=false,frame=null,timeout=null,begin=0;
let readyTimeout=null;
function clear(){
 if(frame!==null)cancelAnimationFrame(frame);
 if(timeout!==null)clearTimeout(timeout);
 if(readyTimeout!==null)clearTimeout(readyTimeout);
}
function finish(){
 if(finished)return;
 finished=true;clear();
 try{video.pause();}catch(_){}
 splash.classList.add("alpha-splash-exit");
 setTimeout(()=>{splash.remove();document.body.classList.remove("alpha-splash-active");},220);
}
function tick(){
 if(finished||!started)return;
 progress.style.width=Math.min(100,100*(performance.now()-begin)/MAX_DURATION)+"%";
 frame=requestAnimationFrame(tick);
}
function startTimer(){
 if(started||finished)return;
 started=true;begin=performance.now();
 timeout=setTimeout(finish,MAX_DURATION);
 frame=requestAnimationFrame(tick);
}
function promptForTap(){
 if(finished)return;
 const label=document.getElementById("alphaSplashLabel");
 if(label)label.textContent="Tap video to play";
 video.controls=true;
 video.style.cursor="pointer";
}
function attemptPlay(){
 if(finished)return;
 video.muted=true;video.defaultMuted=true;
 video.setAttribute("muted","");
 video.setAttribute("playsinline","");
 let promise;
 try{promise=video.play();}catch(_){promptForTap();return;}
 if(promise&&typeof promise.then==="function"){
  promise.then(()=>{if(!finished)startTimer();}).catch(()=>{promptForTap();});
 }else startTimer();
}
skip.addEventListener("click",finish);
video.addEventListener("click",()=>{if(!started)attemptPlay();});
video.addEventListener("playing",startTimer);
video.addEventListener("ended",finish);
video.addEventListener("error",()=>{
 const label=document.getElementById("alphaSplashLabel");
 if(label)label.textContent="Video could not load";
 setTimeout(finish,1000);
});
video.addEventListener("loadedmetadata",()=>{if(!started)attemptPlay();},{once:true});
splash.hidden=false;
document.body.classList.add("alpha-splash-active");
readyTimeout=setTimeout(()=>{if(!started&&video.readyState===0)promptForTap();},4000);
try{video.load();attemptPlay();}catch(_){promptForTap();}
})();