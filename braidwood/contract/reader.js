(function(){
"use strict";
const source=Array.isArray(window.CBA_CHAPTERS)?window.CBA_CHAPTERS:[];
const $=id=>document.getElementById(id);
const toc=$("tocList"),tocDetails=$("tocDetails"),reader=$("contractChapters");
const searchInput=$("searchInput"),clearBtn=$("clearSearch"),searchStatus=$("searchStatus");
const searchPanel=$("searchResults"),resultsList=$("resultList"),resultsCount=$("resultsCount"),showMore=$("showMore");
if(!source.length){reader.textContent="The agreement could not be loaded. Please reload the page.";return;}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const flat=s=>String(s||"").replace(/\s+/g," ").trim();
const fold=s=>flat(s).toLocaleLowerCase().replace(/[^a-z0-9]/g,"");
const wordsFor=q=>q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,8);
const regexQuote=s=>String(s).replace(/[^A-Za-z0-9]/g,c=>"\\"+c);
function highlight(text,words){
 if(!words.length)return esc(text);
 const re=new RegExp("("+[...new Set(words)].sort((a,b)=>b.length-a.length).map(regexQuote).join("|")+")","gi");
 return String(text).split(re).map((part,i)=>i%2?"<mark>"+esc(part)+"</mark>":esc(part)).join("");
}
function niceTitle(ch){return ch.kind==="article"?ch.label.replace(/^Article\s+\d+\s*·\s*/i,""):ch.label.replace(/^Appendix\s+[A-Z]\s*·\s*/i,"");}
const specials=new Set(["VACATIONS","SICK LEAVE AND PAID LEAVE","Compensation For Vacation","Approval of Vacation Time","Vacation Donation Program","Notice to Union of Benefit Changes.","Benefits Administration.","New Hires","Carryover and Buyback","Upon Termination"]);
function sourceLines(ch){
 let t=String(ch.text).replace(/\r/g,"").replace(/￾/g,"-");
 if(ch.id==="a17"){
  const start=t.indexOf("The following is the vacation schedule:");
  const last="Years 25+ 276 23.0";
  const end=t.indexOf(last,start);
  if(start>=0&&end>start)t=t.slice(0,start)+"\n[[VACATION_TABLE]]\n"+t.slice(end+last.length);
  const hire=/Hired January 1 through March 31 48 Hours\s*\nHired April 1 through June 30 40 Hours\s*\nHired July 1 through September 30 28 Hours\s*\nHired October 1 through December 31 16 Hours/;
  t=t.replace(hire,"\n[[NEW_HIRE_LEAVE_TABLE]]\n");
 }else if(ch.id==="a15"){
  const start=t.indexOf("The Company observes the following holidays");
  const last="Labor Day";
  const end=t.indexOf(last,start);
  if(start>=0&&end>start)t=t.slice(0,start)+"\n[[HOLIDAY_TABLE]]\n"+t.slice(end+last.length);
 }
 let lines=t.split("\n");
 if(ch.kind==="article"){
  const title=niceTitle(ch);
  let articleLine=(lines.shift()||"").trim();
  let headText=articleLine.replace(/^ARTICLE\s+\d{1,2}\b/i,"").trim();
  let n=0;
  while(fold(headText).length<fold(title).length&&lines.length&&n<3){
    const next=lines.shift().trim();
    if(next)headText+=" "+next;
    n++;
  }
 }else if(ch.id==="intro"&&/^\s*PREAMBLE/i.test(lines[0]||"")){
  lines.shift();
 }else if(ch.id==="appB"){
  if(/^APPENDIX\s+B\b/i.test(lines[0]||""))lines.shift();
  if(/^Shared Resource Agreement/i.test(lines[0]||""))lines.shift();
 }
 return lines;
}
function buildBlocks(ch){
 if(ch.id==="signature")return [{kind:"note",text:"The signed agreement includes a graphical signature page. The signatures are not part of this searchable text transcription; consult the signed original document for the signed page.",id:ch.id+"-signature"}];
 if(ch.id==="appA")return [{kind:"wages",text:ch.text,id:ch.id+"-schedule"}];
 if(ch.id==="bonuses")return [{kind:"bonuses",text:ch.text,id:ch.id+"-bonuses"}];
 const lines=sourceLines(ch);
 const out=[];
 let buffer="",bufferKind="paragraph",activeSection="",lastSourceLine="",blockNum=0;
 const emit=(kind,text,id)=>{
  const clean=flat(text);if(!clean)return;
  out.push({kind,text:clean,id:id||(ch.id+"-item-"+(++blockNum)),context:activeSection});
 };
 function flush(){
  if(buffer.trim())emit(bufferKind,buffer);
  buffer="";bufferKind="paragraph";lastSourceLine="";
 }
 function append(t){
  const next=t.trim();if(!next)return;
  if(buffer){buffer+=lastSourceLine.endsWith("-")?"":" ";buffer+=next;}
  else buffer=next;
  lastSourceLine=next;
  if(bufferKind==="paragraph"&&buffer.length>=310&&/[.!?]["”’)]?$/.test(next))flush();
 }
 for(const raw of lines){
  const s=raw.trim();
  if(!s){flush();continue;}
  if(s==="[[VACATION_TABLE]]"){
    flush();activeSection="Vacation schedule";emit("vacationTable","Vacation schedule: Service Vacation Hours Total Days at 12 Hour Shifts 0-12 Months 36 3.0 Year 1 144 12.0 Year 2 156 13.0 Years 3-4 168 14.0 Years 5-9 180 15.0 Years 10-14 192 16.0 Years 15-19 204 17.0 Years 20-24 228 19.0 Years 25+ 276 23.0",ch.id+"-vacation-schedule");
    continue;
  }
  if(s==="[[NEW_HIRE_LEAVE_TABLE]]"){
    flush();activeSection="Year-of-hire paid leave";emit("newHireLeaveTable","Hired January 1 through March 31 48 Hours Hired April 1 through June 30 40 Hours Hired July 1 through September 30 28 Hours Hired October 1 through December 31 16 Hours",ch.id+"-paid-leave-schedule");
    continue;
  }
  if(s==="[[HOLIDAY_TABLE]]"){
    flush();activeSection="Observed holidays";emit("holidayTable","The Company observes nine holidays annually: New Year’s Day (January 1), Martin Luther King Jr. Day, Memorial Day, Independence Day (July 4th), Labor Day, Thanksgiving Day, Day after Thanksgiving, Christmas Eve (December 24), Christmas (December 25)",ch.id+"-holiday-list");
    continue;
  }
  const section=s.match(/^Section\s+(\d{1,2})\.(\d{1,2})\b[.:]?\s*/i);
  if(section){
   flush();
   const sectionLabel="Section "+section[1]+"."+section[2];
   activeSection=sectionLabel;
   emit("section",sectionLabel,"section-"+section[1]+"-"+section[2]);
   append(s.slice(section[0].length));
   continue;
  }
  const step=s.match(/^STEP\s+(\d+)\b/i);
  if(step){
   flush();activeSection="Step "+step[1];
   emit("section",activeSection,ch.id+"-step-"+step[1]);
   append(s.slice(step[0].length));
   continue;
  }
  if(specials.has(s)){
   flush();activeSection=s.replace(/\.$/,"");
   emit("subhead",activeSection,ch.id+"-topic-"+(++blockNum));
   continue;
  }
  if(/^Re:\s*.+/i.test(s)){
   flush();activeSection=s;emit("subhead",s,ch.id+"-subject");continue;
  }
  if(/^Side Letter of Agreement\b/i.test(s)){
   flush();activeSection=s;emit("subhead",s,ch.id+"-letter");continue;
  }
  const bullet=s.match(/^(?:[A-Ea-e][).]|[1-9]\d*[).]|\([A-Ea-e]\))\s+/);
  if(bullet){
   flush();bufferKind="clause";append(s);
   continue;
  }
  if(bufferKind==="paragraph"&&buffer.length>=200&&/[.!?]["”’)]?$/.test(lastSourceLine)&&/^[A-Z]/.test(s))flush();
  append(s);
 }
 flush();
 return out;
}
const chapters=source.map(ch=>({...ch,title:niceTitle(ch),blocks:buildBlocks(ch)}));
const index=[];
for(const ch of chapters){
 index.push({chapter:ch,id:ch.id,text:ch.label,kind:"title",context:""});
 for(const b of ch.blocks)if(["paragraph","clause","section","subhead","wages","bonuses","vacationTable","newHireLeaveTable","holidayTable"].includes(b.kind)){
  index.push({chapter:ch,id:b.id,text:b.text,kind:b.kind,context:b.context});
 }
}
function tocGroup(ch){
 if(ch.id==="intro")return "Introduction";
 if(ch.kind==="article")return "Contract articles";
 if(["appA","bonuses","signature","appB"].includes(ch.id))return "Appendices and wages";
 return "Letters of agreement";
}
let lastGroup="";
chapters.forEach(ch=>{
 const grp=tocGroup(ch);
 if(lastGroup!==grp){
  const h=document.createElement("div");h.className="toc-category";h.textContent=grp;toc.appendChild(h);lastGroup=grp;
 }
 const a=document.createElement("a");a.href="#"+ch.id;a.className="toc-link";
 const label=ch.kind==="article"?"Article "+ch.number+" · "+ch.title:ch.label;
 a.innerHTML='<span>'+esc(label)+'</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
 a.addEventListener("click",()=>{if(window.matchMedia("(max-width:920px)").matches)tocDetails.open=false;});
 toc.appendChild(a);
});
if(window.matchMedia("(max-width:920px)").matches)tocDetails.open=false;
function wagesTable(words,id){
 const rows=[
 ["Annual GWI","3.0%","2.5%","2.5%"],
 ["Trainee","$24.12","$24.72","$25.34"],
 ["Security Officer I","$25.59","$26.23","$26.89"],
 ["Security Officer II","$26.20","$26.86","$27.53"],
 ["Security Officer III","$27.58","$28.27","$28.98"],
 ["Sr. Security Officer","$32.83","$33.65","$34.49"]
 ];
 const rowsHTML=rows.map(r=>'<tr>'+r.map((v,i)=>i?'<td>'+highlight(v,words)+'</td>':'<th scope="row">'+highlight(v,words)+'</th>').join("")+'</tr>').join("");
 return '<div class="table-scroll" id="'+id+'"><table class="wage-table"><thead><tr><th scope="col">Classification</th><th scope="col">Apr 26, 2024</th><th scope="col">Apr 26, 2025</th><th scope="col">Apr 26, 2026</th></tr></thead><tbody>'+rowsHTML+'</tbody></table></div>'+
 '<p class="chapter-paragraph">*All officers newly hired or coming from another site are “New Hires” and enter employment at Braidwood CNS as new hires in accordance with the terms and conditions of the CBA.</p>';
}

function bonusesTable(words,id){
 const rows=[["Year 2","$600.00","$300.00"],["Year 3","$600.00","$300.00"]];
 const entries=rows.map(r=>'<tr>'+r.map((v,i)=>i?'<td>'+highlight(v,words)+'</td>':'<th scope="row">'+highlight(v,words)+'</th>').join("")+'</tr>').join("");
 return '<div id="'+id+'"><div class="source-notice"><strong>Ratification bonus:</strong> '+highlight("$1,250.00",words)+'</div>'+
 '<h3 class="sub-heading">Retention bonuses</h3><div class="table-scroll"><table class="wage-table"><thead><tr><th>Year</th><th>Security I–Senior</th><th>Trainee</th></tr></thead><tbody>'+entries+'</tbody></table></div>'+
 '<p class="chapter-paragraph">*Retention Bonus to be paid to active employees no later than the first 1st pay period in December.</p></div>';
}
function vacationTable(words,id){
 const rows=[
 ["0-12 Months","36","3.0"],["Year 1","144","12.0"],["Year 2","156","13.0"],
 ["Years 3-4","168","14.0"],["Years 5-9","180","15.0"],["Years 10-14","192","16.0"],
 ["Years 15-19","204","17.0"],["Years 20-24","228","19.0"],["Years 25+","276","23.0"]
 ];
 const entries=rows.map(r=>'<tr>'+r.map((v,i)=>i?'<td>'+highlight(v,words)+'</td>':'<th scope="row">'+highlight(v,words)+'</th>').join("")+'</tr>').join("");
 return '<section id="'+id+'" class="data-table-block"><h3 class="sub-heading">Vacation schedule</h3><div class="table-scroll"><table class="wage-table"><thead><tr><th>Vacation service</th><th>Vacation hours</th><th>Days at 12-hour shifts</th></tr></thead><tbody>'+entries+'</tbody></table></div></section>';
}
function newHireLeaveTable(words,id){
 const rows=[["January 1 through March 31","48"],["April 1 through June 30","40"],["July 1 through September 30","28"],["October 1 through December 31","16"]];
 const entries=rows.map(r=>'<tr><th scope="row">'+highlight(r[0],words)+'</th><td>'+highlight(r[1],words)+' hours</td></tr>').join("");
 return '<section id="'+id+'" class="data-table-block"><h3 class="sub-heading">Paid leave during year of hire</h3><div class="table-scroll"><table class="wage-table"><thead><tr><th>Hire date</th><th>Paid leave</th></tr></thead><tbody>'+entries+'</tbody></table></div></section>';
}
function holidayTable(words,id){
 const dates=["New Year’s Day (January 1)","Martin Luther King Jr. Day","Memorial Day","Independence Day (July 4th)","Labor Day","Thanksgiving Day","Day after Thanksgiving","Christmas Eve (December 24)","Christmas (December 25)"];
 return '<section id="'+id+'" class="data-table-block"><h3 class="sub-heading">Observed holidays</h3><ul class="holiday-list">'+dates.map(d=>'<li>'+highlight(d,words)+'</li>').join("")+'</ul></section>';
}
function blockHTML(b,words){
 switch(b.kind){
  case "section":return '<h3 class="section-heading" id="'+b.id+'">'+highlight(b.text,words)+'</h3>';
  case "subhead":return '<h3 class="sub-heading" id="'+b.id+'">'+highlight(b.text,words)+'</h3>';
  case "clause":return '<p class="chapter-clause" id="'+b.id+'">'+highlight(b.text,words)+'</p>';
  case "note":return '<p class="source-notice" id="'+b.id+'">'+highlight(b.text,words)+'</p>';
  case "wages":return wagesTable(words,b.id);
  case "bonuses":return bonusesTable(words,b.id);
  case "vacationTable":return vacationTable(words,b.id);
  case "newHireLeaveTable":return newHireLeaveTable(words,b.id);
  case "holidayTable":return holidayTable(words,b.id);
  default:return '<p class="chapter-paragraph" id="'+b.id+'">'+highlight(b.text,words)+'</p>';
 }
}
function renderChapters(words){
 const frag=document.createDocumentFragment();
 for(const ch of chapters){
  const el=document.createElement("article");
  el.className="chapter";el.id=ch.id;el.setAttribute("aria-labelledby",ch.id+"-heading");
  const tag=ch.kind==="article"?"Article "+String(ch.number).padStart(2,"0"):ch.kind==="intro"?"Introduction":ch.kind==="letter"?"Side letter":"Reference";
  el.innerHTML='<header class="chapter-heading"><span class="chapter-tag">'+esc(tag)+'</span><h2 id="'+ch.id+'-heading">'+highlight(ch.title,words)+'</h2></header>'+
   '<div class="chapter-text">'+ch.blocks.map(b=>blockHTML(b,words)).join("")+'</div>'+
   '<footer class="chapter-footer"><a href="#tocDetails">↑ Table of contents</a><span>Signed agreement · 2024–2027</span></footer>';
  frag.appendChild(el);
 }
 reader.replaceChildren(frag);
}
function teaser(text,words){
 const t=flat(text),lower=t.toLocaleLowerCase();
 const pos=words.map(w=>lower.indexOf(w)).filter(i=>i>=0);
 const at=pos.length?Math.min(...pos):0;
 const a=Math.max(0,at-70),b=Math.min(t.length,at+150);
 return (a>0?"…":"")+t.slice(a,b)+(b<t.length?"…":"");
}
let lastMatches=[],shown=20;
function resultsHTML(matches,words){
 const frag=document.createDocumentFragment();
 for(const m of matches.slice(0,shown)){
  const a=document.createElement("a");a.className="search-hit";a.href="#"+m.id;
  const kicker=(m.chapter.kind==="article"?"Article "+m.chapter.number+" · ":"")+m.chapter.title+(m.context&&m.kind!=="section"?" / "+m.context:"");
  a.innerHTML='<span class="search-hit-kicker">'+esc(kicker)+'</span><p>'+highlight(teaser(m.text,words),words)+'</p><span class="search-hit-open">View passage →</span>';
  frag.appendChild(a);
 }
 resultsList.replaceChildren(frag);
 showMore.hidden=matches.length<=shown;
}
function searchNow(){
 const value=searchInput.value.trim(),words=wordsFor(value);
 clearBtn.hidden=!words.length;
 if(!words.length){
  searchPanel.hidden=true;searchStatus.textContent="Search articles, sections, wages and the letters of agreement.";
  lastMatches=[];renderChapters([]);return;
 }
 const q=value.toLocaleLowerCase();
 let matches=index.filter(item=>{
  const txt=item.text.toLocaleLowerCase();return words.every(w=>txt.includes(w));
 });
 const related=!matches.length&&words.length>1;
 if(related){
  matches=index.filter(item=>words.some(w=>item.text.toLocaleLowerCase().includes(w)));
 }
 matches.sort((a,b)=>{
  const av=a.text.toLocaleLowerCase().includes(q)?1:0,bv=b.text.toLocaleLowerCase().includes(q)?1:0;
  return bv-av||chapters.indexOf(a.chapter)-chapters.indexOf(b.chapter);
 });
 lastMatches=matches;shown=20;
 searchPanel.hidden=false;
 resultsCount.textContent=matches.length+" matching passage"+(matches.length===1?"":"s");
 searchStatus.textContent=matches.length?(related?"No single passage contains every word. Showing related matches; try fewer words for a narrower result.":"Tap a result to jump directly to its passage."):"No results found. Try fewer or different words.";
 resultsHTML(matches,words);
 renderChapters(words);
}
let debounce;
searchInput.addEventListener("input",()=>{clearTimeout(debounce);debounce=setTimeout(searchNow,110)});
clearBtn.addEventListener("click",()=>{searchInput.value="";searchNow();searchInput.focus();});
showMore.addEventListener("click",()=>{shown+=20;resultsHTML(lastMatches,wordsFor(searchInput.value));});
document.addEventListener("keydown",e=>{
 if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();searchInput.focus();}
 if(e.key==="Escape"&&document.activeElement===searchInput){searchInput.value="";searchNow();}
});
window.addEventListener("hashchange",()=>{
 const h=decodeURIComponent(location.hash.slice(1));
 const ch=chapters.find(c=>h===c.id||h.startsWith(c.id+"-")||c.blocks.some(b=>b.id===h));
 toc.querySelectorAll(".active").forEach(a=>a.classList.remove("active"));
 if(ch){const item=[...toc.querySelectorAll("a")].find(a=>a.hash==="#"+ch.id);item?.classList.add("active");}
});
renderChapters([]);
if(location.hash){requestAnimationFrame(()=>{const id=decodeURIComponent(location.hash.slice(1));document.getElementById(id)?.scrollIntoView({block:"start"});});}
})();