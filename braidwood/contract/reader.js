(function(){
"use strict";
const sections=(window.CBA_SECTIONS||[]).map(x=>({id:x[0],title:x[1],page:x[2],group:x[3]}));
const pages=(window.CBA_PAGES||[]).map(p=>({...p,plain:String(p.text).replace(new RegExp("^\\s*"+p.number+"\\s*\\n"),"").trim()}));
const byId=new Map(sections.map(x=>[x.id,x]));
const toc=document.getElementById("tocList");
const content=document.getElementById("contractPages");
const input=document.getElementById("searchInput");
const clear=document.getElementById("clearSearch");
const status=document.getElementById("searchStatus");
const results=document.getElementById("searchResults");
const resultList=document.getElementById("resultList");
const resultsHeading=document.getElementById("resultsHeading");
const more=document.getElementById("resultMore");
const details=document.getElementById("tocDetails");
if(!pages.length||!sections.length){content.textContent="The contract data is unavailable. Reload the page.";return;}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s).replace(/-\s*\n\s*/g,"-").replace(/\s+/g," ").trim();
const tokens=q=>q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,8);
function highlight(s,terms){
 if(!terms.length)return esc(s);
 const patterns=[...new Set(terms)].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[^\w\s]/g,c=>"\\"+c));
 return String(s).split(new RegExp("("+patterns.join("|")+")","gi")).map((part,i)=>i%2?"<mark>"+esc(part)+"</mark>":esc(part)).join("");
}
function labelGroup(s){return s.group==="article"?"Articles":s.group==="appendix"?"Appendices":s.group==="letter"?"Letters and side agreements":"Introduction";}
let lastGroup="";
sections.forEach(s=>{
 const grp=labelGroup(s);
 if(grp!==lastGroup){const d=document.createElement("div");d.className="toc-title";d.textContent=grp;toc.appendChild(d);lastGroup=grp;}
 const a=document.createElement("a");a.className="toc-link";a.href="#"+s.id;
 a.innerHTML='<span class="name">'+esc(s.title)+'</span><span class="pg">'+s.page+'</span>';
 a.addEventListener("click",()=>{if(window.innerWidth<=900)details.open=false});
 toc.appendChild(a);
});
if(window.innerWidth<=900)details.open=false;
const pageTitles=new Map();
pages.forEach(p=>{
 const starting=sections.filter(s=>s.page===p.number);
 const ongoing=[...sections].reverse().find(s=>s.page<=p.number);
 pageTitles.set(p.number,starting.length?starting.map(s=>s.title).join(" · "):(ongoing?.title||"Agreement"));
});
function wageTable(terms){
 const rows=[
 ["GWI","3.0%","2.5%","2.5%"],["Trainee","$24.12","$24.72","$25.34"],
 ["Security Officer I","$25.59","$26.23","$26.89"],["Security Officer II","$26.20","$26.86","$27.53"],
 ["Security Officer III","$27.58","$28.27","$28.98"],["Sr. Security Officer","$32.83","$33.65","$34.49"]];
 return '<h3 id="appA">Appendix A · Wages</h3><table class="wages"><thead><tr><th>Classification</th><th>Apr 26, 2024</th><th>Apr 26, 2025</th><th>Apr 26, 2026</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+highlight(c,terms)+'</td>').join("")+'</tr>').join("")+'</tbody></table><p class="wages-note">The wage schedule is transcribed from Appendix A of the signed agreement.</p><p>*All officers newly hired or coming from another site are “New Hires” and enter employment at Braidwood CNS as new hires in accordance with the terms and conditions of the CBA.</p>';
}
function pageMarkup(p,terms){
 if(p.number===72)return '<p class="signature-note" id="signature">This is the graphical signature page in the signed agreement. Its image cannot be reproduced in a text-only transcription. The signed source document remains authoritative.</p>';
 if(p.number===70)return wageTable(terms);
 const text=p.plain.replace(/-\s*\n\s*/g,"-").replace(/\n\s*(?=(?:ARTICLE\s+\d+|Section\s+\d+\.\d+|STEP\s+\d+|APPENDIX\s+[A-Z]|PREAMBLE)\b)/gi,"\n\n");
 const blocks=text.split(/\n\s*\n/).map(norm).filter(Boolean);
 const already=new Set(),html=[];
 for(const b of blocks){
  const art=b.match(/^ARTICLE\s+(\d{1,2})\b/i);
  if(art){
   const s=byId.get("a"+art[1]);const id=s?.id||"a"+art[1];already.add(id);
   html.push('<h3 id="'+id+'">'+highlight(s?.title||b,terms)+'</h3>');
   // Preserve any clause prose on the same extracted paragraph as an article title.
   let rest=b.replace(/^ARTICLE\s+\d{1,2}\b/i,"").trim();
   const titleTokens=(s?.title?.split("·").slice(1).join("·")||"").match(/[a-z0-9]+/gi)||[];
   if(titleTokens.length){
    const flexTitle=new RegExp("^"+titleTokens.map(x=>x.toLowerCase()).join("[^a-z0-9]+")+"\\b","i");
    rest=rest.replace(flexTitle,"").trim();
   }
   if(rest)html.push('<p>'+highlight(rest,terms)+'</p>');
   continue;
  }
  if(/^PREAMBLE\b/i.test(b)){
   already.add("intro");html.push('<h3 id="intro">Preamble</h3>');
   const t=b.replace(/^PREAMBLE\b/i,"").trim();if(t)html.push('<p>'+highlight(t,terms)+'</p>');
   continue;
  }
  const sec=b.match(/^Section\s+(\d+)\.(\d+)\b/i);
  if(sec){const title=sec[0];html.push('<p id="section-'+sec[1]+'-'+sec[2]+'"><strong class="section-id">'+esc(title)+'</strong>'+highlight(b.slice(title.length),terms)+'</p>');continue;}
  const step=b.match(/^STEP\s+\d+/i);
  if(step){html.push('<p><strong class="section-id">'+esc(step[0])+'</strong>'+highlight(b.slice(step[0].length),terms)+'</p>');continue;}
  html.push('<p>'+highlight(b,terms)+'</p>');
 }
 const anchors=sections.filter(s=>s.page===p.number&&!already.has(s.id)).map(s=>'<span id="'+s.id+'" aria-label="'+esc(s.title)+'"></span>');
 return anchors.join("")+html.join("\n");
}
function render(terms){
 const frag=document.createDocumentFragment();
 for(const p of pages){
  const el=document.createElement("section");el.id="page-"+p.number;el.className="doc-page";el.setAttribute("aria-label","Printed page "+p.number);
  el.innerHTML='<div class="page-top"><span class="page-number">Printed page '+p.number+' of 77</span><span class="page-section">'+esc(pageTitles.get(p.number))+'</span></div><div class="page-body">'+pageMarkup(p,terms)+'</div>';
  frag.appendChild(el);
 }
 content.replaceChildren(frag);
}
function snippet(p,words,phrase){
 const t=norm(p.plain),lower=t.toLocaleLowerCase();
 let ix=lower.indexOf(phrase);
 if(ix<0){const occurrences=words.map(w=>lower.indexOf(w)).filter(n=>n>=0);ix=occurrences.length?Math.min(...occurrences):0;}
 const a=Math.max(0,ix-85),b=Math.min(t.length,ix+150);
 return (a>0?"…":"")+t.slice(a,b)+(b<t.length?"…":"");
}
function search(){
 const q=input.value.trim(),words=tokens(q);clear.hidden=!words.length;
 if(!words.length){results.hidden=true;status.textContent="Search the signed 2024–2027 agreement across all 77 numbered pages.";render([]);return;}
 const matches=pages.filter(p=>{const txt=(norm(p.plain)+" "+pageTitles.get(p.number)).toLocaleLowerCase();return words.every(w=>txt.includes(w))});
 matches.sort((a,b)=>{
  const phrase=q.toLocaleLowerCase(),x=norm(a.plain).toLocaleLowerCase().includes(phrase)?1:0,y=norm(b.plain).toLocaleLowerCase().includes(phrase)?1:0;
  return y-x||a.number-b.number;
 });
 results.hidden=false;resultsHeading.textContent="Search results";
 status.textContent=matches.length?matches.length+" printed page"+(matches.length===1?"":"s")+" matching “"+q+"”":"No matches. Try another term or a shorter phrase.";
 resultList.innerHTML=matches.length?matches.slice(0,40).map(p=>'<a class="result" href="#page-'+p.number+'" data-page="'+p.number+'"><strong>Page '+p.number+'</strong><small>'+esc(pageTitles.get(p.number))+'</small><p>'+highlight(snippet(p,words,q.toLocaleLowerCase()),words)+'</p></a>').join(""):'<p>No results in the contract text.</p>';
 more.textContent=matches.length>40?"Showing the first 40 of "+matches.length+" matches. Narrow your search for more precise results.":"";
 render(words);
}
let timer;
input.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(search,85);});
clear.addEventListener("click",()=>{input.value="";search();input.focus();});
resultList.addEventListener("click",e=>{
 const a=e.target.closest("[data-page]");if(!a)return;
 const pg=document.getElementById("page-"+a.dataset.page);
 requestAnimationFrame(()=>{const target=pg?.querySelector("mark")||pg;target?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth",block:"center"});});
});
document.addEventListener("keydown",e=>{
 if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)&&!e.metaKey&&!e.ctrlKey){e.preventDefault();input.focus();}
 if(e.key==="Escape"&&document.activeElement===input){input.value="";search();}
});
window.addEventListener("hashchange",()=>{
 const target=location.hash;
 toc.querySelectorAll(".current").forEach(a=>a.classList.remove("current"));
 const a=Array.from(toc.querySelectorAll("a")).find(x=>x.getAttribute("href")===target);
 if(a)a.classList.add("current");
});
render([]);
if(location.hash)requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
})();