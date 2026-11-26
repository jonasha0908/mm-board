// MM weekly board - app logic.
// Data lives in a Google Sheet behind an Apps Script web app (see Code.gs and GEMINI.md).
(() => {
"use strict";
// ===== Paste your Apps Script Web app URL here (it ends with /exec) =====
const API_URL = "https://script.google.com/macros/s/AKfycbzK3f5M_jvD1zMH0PEYAuzX3d4Yr2M5zVDi4C6LrFhXcv2sROkUQSXmGdAMMKnG7zDH/exec";
// ========================================================================

const LOGO="logo.webp", OMETZ="ometz.webp", HOSS="hoss.webp";
const DAY=86400000;
const POLL_MS=20000;
let SEASON_START=new Date(2026,8,13); // Sunday of Week 1 (overridden by settings.season_start)
let TEAMS=[], TEAM={};
function setTeams(list){TEAMS=list;TEAM=Object.fromEntries(list.map(t=>[t.id,t]))}
setTeams([
  {id:"mech",name:"מכניקה ושרטוט",alias:["מכניקה","שרטוט","מכני"]},
  {id:"elec",name:"אלקטרוניקה",alias:["אלקטרוניקה","חשמל"]},
  {id:"soft",name:"תוכנה",alias:["תוכנה","תכנות","קוד","בקרה"]},
  {id:"log",name:"לוגיסטיקה ורכש",alias:["לוגיסטיקה","רכש"]},
  {id:"mkt",name:"שיווק ומיתוג",alias:["שיווק","מיתוג","מדיה"]},
  {id:"comm",name:"קהילה ויח\"צ",alias:["קהילה","יח\"צ","יחצ"]},
  {id:"pmo",name:"PMO וקפטן",alias:["pmo","קפטן","הנהלה"]}
]);
let EVENTS=[];
function stageFor(d){
  const m=d.getMonth();
  if(m===8||m===9) return {n:1,name:"Stage 1: The Sprint",kpi:"0-20%"};
  if(m===10||m===11) return {n:2,name:"Stage 2: The Pivot",kpi:"20-60%"};
  if(m===0||m===1) return {n:3,name:"Stage 3: The Test Point",kpi:"60-80%"};
  if(m===2) return {n:4,name:"Stage 4: Peak Performance",kpi:"80-100%"};
  return {n:5,name:"אליפות העולם / עונה חדשה",kpi:"—"};
}

/* ---------- dates ---------- */
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseIso=s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
const isIso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
const dm=d=>d.getDate()+"."+(d.getMonth()+1);
const today=()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())};
function weekOf(d){return Math.floor(Math.round((d-SEASON_START)/DAY)/7)+1}
function weekStart(w){return new Date(SEASON_START.getFullYear(),SEASON_START.getMonth(),SEASON_START.getDate()+(w-1)*7)}
function weekEnd(w){const s=weekStart(w);return new Date(s.getFullYear(),s.getMonth(),s.getDate()+4)}
const curWeek=()=>Math.max(1,weekOf(today()));
const HEB_DAYS=["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

/* ---------- helpers ---------- */
function el(tag,attrs,...kids){
  const e=document.createElement(tag);
  if(attrs) for(const [k,v] of Object.entries(attrs)){
    if(v==null||v===false) continue;
    if(k==="class") e.className=v; else if(k==="text") e.textContent=v;
    else if(k.startsWith("on")) e.addEventListener(k.slice(2),v);
    else e.setAttribute(k,v===true?"":v);
  }
  for(const k of kids.flat()){ if(k==null||k===false) continue; e.append(k instanceof Node?k:document.createTextNode(String(k))); }
  return e;
}
const $=id=>document.getElementById(id);
function toast(msg){const t=el("div",{class:"toast",role:"status",text:msg});document.body.append(t);setTimeout(()=>t.remove(),2800)}
const norm=s=>String(s||"").toLowerCase().replace(/["'״׳.,:;!?()\-–—*•]/g," ").replace(/\s+/g," ").trim();
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const CHECK_SVG='<svg viewBox="0 0 16 16" fill="none" stroke="#06202b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

/* ---------- api ---------- */
const CONFIGURED=/^https:\/\/script\.google(usercontent)?\.com\//.test(API_URL);
async function api(action,payload={}){
  const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,code:S.code||"",...payload})});
  if(!res.ok) throw {code:"network"};
  let j; try{j=await res.json()}catch(e){throw {code:"network"}}
  if(j&&j.error) throw {code:j.error,message:j.message};
  return j;
}
const batch=ops=>api("batch",{ops});
async function ai(prompt){const r=await api("ai",{prompt});return r.result}

/* ---------- normalizers ---------- */
const toBool=v=>v===true||v==="TRUE"||v==="true"||v===1;
const okImg=x=>typeof x==="string"&&/^[\w-]{10,200}$/.test(x);
function parseImgs(v){if(Array.isArray(v))return v.filter(okImg);if(typeof v==="string"&&v.trim().startsWith("[")){try{const a=JSON.parse(v);return Array.isArray(a)?a.filter(okImg):[]}catch(e){}}return[]}
function parseUpdates(v){let a=v;if(typeof v==="string"&&v.trim().startsWith("[")){try{a=JSON.parse(v)}catch(e){a=[]}}return Array.isArray(a)?a.filter(u=>u&&typeof u.t==="string"&&u.t.trim()).map(u=>u.k==="rename"?{d:isIso(u.d)?u.d:"",t:String(u.t).slice(0,300),by:String(u.by||""),k:"rename"}:{d:isIso(u.d)?u.d:"",t:String(u.t).slice(0,300),by:String(u.by||"")}):[]}
const parseOwners=v=>{let a=v;if(typeof v==="string"){const s=v.trim();if(s.startsWith("[")){try{a=JSON.parse(s)}catch(e){a=[]}}else a=s.split(/[,،]/)}return Array.isArray(a)?[...new Set(a.map(x=>String(x).trim().slice(0,30)).filter(Boolean))].slice(0,6):[]};
const ownersStr=a=>(a||[]).join(", ");
const lastUpd=t=>{const u=(t.updates||[]).filter(x=>x.k!=="rename");return u.length?u[u.length-1]:null};
const imgUrl=(id,w)=>"https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w"+(w||1600);
function normTask(r){return{id:String(r.id),week:Number(r.week),team:String(r.team||""),title:String(r.title??""),done:toBool(r.done),source:String(r.source||"manual"),
  addedOn:isIso(r.addedOn)?r.addedOn:null,doneOn:isIso(r.doneOn)?r.doneOn:null,carried:toBool(r.carried),carriedFrom:r.carriedFrom?String(r.carriedFrom):"",createdAt:Number(r.createdAt)||0,images:parseImgs(r.images),note:String(r.note??""),createdBy:String(r.createdBy||""),doneBy:String(r.doneBy||""),editedBy:String(r.editedBy||""),updates:parseUpdates(r.updates),owners:parseOwners(r.owners)}}
function normLog(r){return{id:String(r.id),week:Number(r.week),date:isIso(r.date)?r.date:iso(today()),kind:r.kind==="open"?"open":"close",team:r.team?String(r.team):"",text:String(r.text??""),createdAt:Number(r.createdAt)||0,images:parseImgs(r.images),createdBy:String(r.createdBy||""),editedBy:String(r.editedBy||"")}}

/* ---------- state ---------- */
const S={week:1,team:"all",tab:"tasks",tasks:[],logs:[],summary:null,ai:false,needsCode:false,code:lsGet("mm_team_code")||"",ready:false,panel:null,sig:"",busy:0,editTask:null,editLog:null,editSum:null,updTask:null,me:(lsGet("mm_name")||"").slice(0,30),askName:false,nameLater:false};
function readHash(){const m=/^#w(\d{1,2})$/.exec(location.hash);return m?Math.max(1,Number(m[1])):null}
const canEdit=()=>S.ready&&(!S.needsCode||!!S.code);

/* ---------- header & rail ---------- */
function renderRail(){
  const rail=$("rail"); rail.textContent="";
  const CUR=curWeek(), max=Math.max(CUR+1,S.week);
  for(let w=1;w<=max;w++){
    rail.append(el("button",{class:"wk"+(w===CUR?" cur":"")+(w>CUR?" future":""),"aria-current":w===S.week?"true":"false",onclick:()=>{location.hash="w"+w}},
      el("b",{text:"Week "+w}),el("small",{text:dm(weekStart(w))+"–"+dm(weekEnd(w))})));
  }
  const sel=rail.querySelector('[aria-current="true"]');
  if(sel) sel.scrollIntoView({block:"nearest",inline:"center"});
}
function renderHead(){
  const s=weekStart(S.week), e=weekEnd(S.week), st=stageFor(e);
  $("stagePill").textContent=st.name;
  $("weekTitle").textContent="שבוע "+S.week+(S.week===curWeek()?" · השבוע":"");
  $("weekDates").textContent="ראשון "+dm(s)+" – חמישי "+dm(e)+"."+e.getFullYear()+"  ·  יעד KPI בשלב: ⁦"+st.kpi.replace("-","\u2011")+"⁩";
  const evBox=$("weekEvents"); evBox.textContent="";
  const sat=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6);
  for(const ev of EVENTS){const dd=parseIso(ev.date); if(dd>=s&&dd<=sat) evBox.append(el("span",{class:"ev",text:dm(dd)+" · "+ev.title}))}
  const done=S.tasks.filter(t=>t.done).length, total=S.tasks.length;
  $("doneN").textContent=done; $("totalN").textContent=total;
  $("barFill").style.width=(total?Math.round(done/total*100):0)+"%";
  $("openDaily").hidden=!!S.panel||!S.ready;
  const mb=$("meBtn"); mb.hidden=!S.ready||!canEdit(); mb.textContent="👤 "+(S.me||"מי אני?"); mb.title="שינוי השם";
}
function renderCodeBar(){
  const box=$("codeBar"); box.textContent="";
  if(S.ready&&canEdit()&&(S.askName||(!S.me&&!S.nameLater))){
    const ni=el("input",{type:"text",id:"meName",placeholder:"השם שלך",maxlength:"30","aria-label":"השם שלך",autocomplete:"name"}); ni.value=S.me;
    const save=()=>{const v=ni.value.trim().slice(0,30);if(!v){ni.focus();return}S.me=v;lsSet("mm_name",v);S.askName=false;renderAll();toast("שלום "+v+"! מעכשיו העדכונים שלך יירשמו בשמך")};
    ni.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();save()}if(e.key==="Escape"&&S.me){S.askName=false;renderCodeBar()}});
    box.append(el("div",{class:"notice codebar"},el("span",null,S.me?"שינוי השם שיופיע ליד העדכונים שלך:":"כדי שיהיה רשום מי עדכן מה, ",S.me?null:el("b",{text:"איך קוראים לך?"})),
      el("div",{class:"addrow"},ni,el("button",{onclick:save},"שמור"),
        el("button",{onclick:()=>{if(S.me)S.askName=false;else S.nameLater=true;renderCodeBar()}},S.me?"ביטול":"אחר כך"))));
    return;
  }
  if(!S.ready||!S.needsCode||S.code) return;
  const inp=el("input",{type:"password",id:"teamCode",placeholder:"קוד הקבוצה","aria-label":"קוד הקבוצה",autocomplete:"off"});
  const go=async()=>{
    const v=inp.value.trim(); if(!v) return;
    S.code=v;
    try{await api("checkCode");lsSet("mm_team_code",v);toast("אפשר לערוך");renderAll()}
    catch(e){S.code="";toast(e.code==="bad_code"?"הקוד שגוי":"לא הצלחתי לבדוק את הקוד, נסו שוב")}
  };
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go()}});
  box.append(el("div",{class:"notice codebar"},el("span",null,"כדי לסמן משימות ולהוסיף סיכומים, הכניסו את ",el("b",{text:"קוד הקבוצה"}),"."),
    el("div",{class:"addrow"},inp,el("button",{onclick:go},"כניסה"))));
}

/* ---------- images ---------- */
function openLightbox(src){
  const lb=el("div",{class:"lightbox",role:"dialog","aria-label":"תמונה"},el("img",{src,alt:"",referrerpolicy:"no-referrer"}));
  const close=()=>{lb.remove();removeEventListener("keydown",onKey)};
  const onKey=e=>{if(e.key==="Escape")close()};
  lb.addEventListener("click",close); addEventListener("keydown",onKey);
  document.body.append(lb);
}
function thumbEl(src,full,onRemove,pending){
  const b=el("button",{class:"thumb"+(pending?" pending":""),type:"button","aria-label":"הגדל תמונה",onclick:()=>openLightbox(full||src)},el("img",{src,alt:"",loading:"lazy",referrerpolicy:"no-referrer"}));
  if(onRemove){const x=el("span",{class:"x",role:"button","aria-label":"הסר תמונה",title:"הסר"},"×");x.addEventListener("click",e=>{e.stopPropagation();onRemove()});b.append(x)}
  return b;
}
function driveThumbs(ids,onRemove){
  if(!ids||!ids.length) return null;
  return el("div",{class:"thumbs"},ids.map(id=>thumbEl(imgUrl(id,400),imgUrl(id,1600),onRemove?()=>onRemove(id):null)));
}
async function shrink(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const max=1600, k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.naturalWidth*k)); c.height=Math.max(1,Math.round(img.naturalHeight*k));
    const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height);
    const dataUrl=c.toDataURL("image/jpeg",0.82);
    return {preview:dataUrl,data:dataUrl.split(",")[1],mime:"image/jpeg",name:(file.name||"image").replace(/\.[^.]+$/,"").slice(0,60)+".jpg"};
  }finally{URL.revokeObjectURL(url)}
}
async function uploadImg(it){const r=await api("upload",{name:it.name,mime:it.mime,data:it.data});return r.id}
function pickFiles(cb){
  const inp=el("input",{type:"file",accept:"image/*",multiple:true,hidden:true});
  inp.addEventListener("change",()=>{const f=[...inp.files].filter(x=>/^image\//.test(x.type));inp.remove();if(f.length)cb(f)});
  document.body.append(inp); inp.click();
}
async function attachToTask(t){
  if(!guard()) return;
  pickFiles(async files=>{
    toast("מעלה "+files.length+" תמונות…");
    try{
      const ids=[];
      for(const f of files){ids.push(await run(async()=>uploadImg(await shrink(f))))}
      const images=[...(t.images||[]),...ids];
      await run(()=>batch([{op:"update",sheet:"tasks",id:t.id,fields:{images}}]));
      t.images=images; renderData(); toast("התמונות נוספו"); refresh();
    }catch(e){imgErr(e)}
  });
}
async function removeFromTask(t,id){
  if(!guard()) return;
  const images=(t.images||[]).filter(x=>x!==id);
  try{await run(()=>batch([{op:"update",sheet:"tasks",id:t.id,fields:{images}}]));t.images=images;renderData();refresh()}catch(e){writeErr(e)}
}
function imgErr(e){
  if(e&&e.code==="bad_code") return writeErr(e);
  if(e&&e.code==="unknown_action") return toast("צריך לעדכן את הקוד בצד של גוגל כדי להעלות תמונות");
  if(e&&e.code==="bad_file") return toast("הקובץ גדול מדי או שאינו תמונה");
  toast("העלאת התמונה נכשלה, נסו שוב");
}

/* ---------- tasks view ---------- */
function renderChips(){
  const box=$("teamChips"); box.textContent="";
  const mk=(id,name)=>el("button",{class:"chip","aria-pressed":S.team===id?"true":"false",onclick:()=>{S.team=id;renderChips();renderTasks()}},name);
  box.append(mk("all","כל הצוותים"),...TEAMS.map(t=>mk(t.id,t.name)));
  if(S.me) box.append(el("button",{class:"chip mine","aria-pressed":S.mine?"true":"false",onclick:()=>{S.mine=!S.mine;renderChips();renderTasks()}},"👤 המשימות שלי"));
}
function taskTags(t){
  const tags=[], ws=iso(weekStart(S.week));
  if(t.source==="carried") tags.push(el("span",{class:"tag carried",text:"הועבר משבוע "+(t.week-1)}));
  else if(t.source!=="opening"&&t.addedOn&&t.addedOn>ws) tags.push(el("span",{class:"tag added",text:"נוסף ב-"+dm(parseIso(t.addedOn))+(t.createdBy?" · "+t.createdBy:"")}));
  else if(t.createdBy) tags.push(el("span",{class:"tag",text:"נוסף ע״י "+t.createdBy}));
  if(t.done&&t.doneOn) tags.push(el("span",{class:"tag",text:"בוצע ב-"+dm(parseIso(t.doneOn))+(t.doneBy?" · "+t.doneBy:"")}));
  if(!t.done&&lastUpd(t)) tags.unshift(el("span",{class:"tag prog",text:"🔄 בתהליך"}));
  if(t.owners&&t.owners.length) tags.unshift(el("span",{class:"tag owner",text:"👤 "+ownersStr(t.owners)}));
  if(t.editedBy) tags.push(el("span",{class:"tag",text:"נערך ע״י "+t.editedBy}));
  if(!t.done&&t.carried) tags.push(el("span",{class:"tag carried",text:"הועבר לשבוע "+(t.week+1)}));
  return tags;
}
function renderTasks(){
  const box=$("teams");
  // keep what people are typing across live refreshes
  const drafts={}; box.querySelectorAll("input[id^='add-']").forEach(i=>{if(i.value)drafts[i.id]=i.value});
  const focused=document.activeElement&&document.activeElement.id&&document.activeElement.id.startsWith("add-")?document.activeElement.id:null;
  box.textContent="";
  const edit=canEdit();
  const teams=S.team==="all"?TEAMS:[TEAM[S.team]].filter(Boolean);
  for(const tm of teams){
    const list=S.tasks.filter(t=>t.team===tm.id&&(!S.mine||(t.owners||[]).some(o=>norm(o)===norm(S.me)))).sort((a,b)=>(a.done-b.done)||(a.createdAt-b.createdAt));
    if(S.team==="all"&&!list.length&&!edit) continue;
    const done=list.filter(t=>t.done).length;
    const card=el("article",{class:"team"},el("header",null,el("h3",{text:tm.name}),el("span",{text:list.length?done+"/"+list.length+" בוצעו":""})));
    if(!list.length) card.append(el("div",{class:"empty-team",text:"אין משימות לשבוע הזה עדיין."}));
    for(const t of list){
      const chk=el("button",{class:"check","aria-label":t.done?"בטל סימון":"סמן כבוצע",disabled:!edit,onclick:()=>toggleTask(t)});
      chk.innerHTML=CHECK_SVG;
      const del=el("button",{class:"del","aria-label":"מחק משימה",title:"מחק",hidden:!edit},"×");
      del.addEventListener("click",()=>{
        if(del.classList.contains("arm")){deleteTask(t);return}
        del.classList.add("arm");del.textContent="מחק?";setTimeout(()=>{del.classList.remove("arm");del.textContent="×"},2500);
      });
      const cam=el("button",{class:"camera","aria-label":"צרף תמונה",title:"צרף תמונה",hidden:!edit,onclick:()=>attachToTask(t)},"📷");
      const prog=el("button",{class:"icon","aria-label":"עדכון התקדמות",title:"עדכון התקדמות",hidden:!edit||t.done,onclick:()=>{S.updTask={id:t.id,text:""};renderTasks();const i=$("ut-text");if(i)i.focus()}},"🔄");
      const pen=el("button",{class:"icon","aria-label":"ערוך משימה",title:"ערוך",hidden:!edit,onclick:()=>{S.editTask={id:t.id,title:t.title,note:t.note||"",owners:ownersStr(t.owners)};renderTasks();const i=$("et-title");if(i)i.focus()}},"✏️");
      let body;
      if(S.editTask&&S.editTask.id===t.id){
        const D=S.editTask;
        const ti=el("input",{type:"text",id:"et-title","aria-label":"כותרת המשימה"}); ti.value=D.title; ti.oninput=()=>D.title=ti.value;
        const no=el("textarea",{id:"et-note",placeholder:"הערה (לא חובה)","aria-label":"הערה"}); no.value=D.note; no.oninput=()=>D.note=no.value;
        const ow=el("input",{type:"text",id:"et-owners",list:"people",placeholder:"👤 אחראים (שמות, מופרד בפסיק)","aria-label":"אחראים"}); ow.value=D.owners; ow.oninput=()=>D.owners=ow.value;
        ti.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveTaskEdit(t)}if(e.key==="Escape"){S.editTask=null;renderTasks()}});
        body=el("div",{class:"t"},el("div",{class:"editbox"},ti,ow,no,el("div",{class:"editbtns"},
          el("button",{class:"btn primary sm",onclick:()=>saveTaskEdit(t)},"שמור"),
          el("button",{class:"btn ghost sm",onclick:()=>{S.editTask=null;renderTasks()}},"ביטול"))));
      }else{
        const lu=lastUpd(t), older=t.updates.filter(u=>t.done||u!==lu);
        let updBox=null;
        if(S.updTask&&S.updTask.id===t.id){
          const U=S.updTask, ui=el("input",{type:"text",id:"ut-text",placeholder:"מה התקדם? למשל: נבנה הציר, חסרה הרכבה","aria-label":"עדכון התקדמות"}); ui.value=U.text; ui.oninput=()=>U.text=ui.value;
          ui.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveProgress(t)}if(e.key==="Escape"){S.updTask=null;renderTasks()}});
          updBox=el("div",{class:"editbox"},ui,el("div",{class:"editbtns"},el("button",{class:"btn primary sm",onclick:()=>saveProgress(t)},"שמור עדכון"),el("button",{class:"btn ghost sm",onclick:()=>{S.updTask=null;renderTasks()}},"ביטול")));
        }
        body=el("div",{class:"t"},el("div",{class:"title",text:t.title}),t.note?el("div",{class:"note",text:t.note}):null,
          lu&&!t.done?el("div",{class:"upd"},"🔄 "+(lu.d?dm(parseIso(lu.d))+" · ":"")+lu.t,lu.by?el("span",{class:"by",text:" · "+lu.by}):null):null,
          older.length?el("details",{class:"hist"},el("summary",{text:(t.done?"היסטוריית ביצוע":"היסטוריה")+" ("+older.length+")"}),el("ul",null,older.map(u=>el("li",{text:(u.d?dm(parseIso(u.d))+" · ":"")+(u.k==="rename"?"✏️ שם קודם: ":"")+u.t+(u.by?" · "+u.by:"")})))):null,
          updBox,el("div",{class:"tags"},taskTags(t)),driveThumbs(t.images,edit?(id=>removeFromTask(t,id)):null));
      }
      card.append(el("div",{class:"task"+(t.done?" done":"")},chk,body,el("div",{class:"tact"},prog,cam,pen,del)));
    }
    if(edit){
      const inp=el("input",{type:"text",placeholder:"משימה חדשה ל"+tm.name,id:"add-"+tm.id,"aria-label":"משימה חדשה ל"+tm.name});
      if(drafts[inp.id]) inp.value=drafts[inp.id];
      const add=async()=>{const v=inp.value.trim();if(!v)return;inp.value="";await addTask(tm.id,v)};
      inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();add()}});
      card.append(el("div",{class:"addrow"},inp,el("button",{onclick:add},"הוסף")));
    }
    box.append(card);
  }
  if(!box.children.length) box.append(el("div",{class:"notice",text:S.ready?"אין משימות לשבוע הזה.":"טוען…"}));
  if(focused&&$(focused)){const f=$(focused);f.focus();f.setSelectionRange(f.value.length,f.value.length)}
}

async function saveProgress(t){
  const U=S.updTask; if(!U||!guard()) return;
  const txt=U.text.trim().slice(0,300); if(!txt){toast("כתבו מה התקדם");return}
  const updates=[...t.updates,{d:iso(today()),t:txt,by:S.me}], prev=t.updates;
  t.updates=updates; S.updTask=null; renderData();
  try{await run(()=>batch([{op:"update",sheet:"tasks",id:t.id,fields:{updates}}]));toast("העדכון נשמר")}
  catch(e){t.updates=prev;renderData();writeErr(e)}
  refresh();
}
async function saveTaskEdit(t){
  const D=S.editTask; if(!D||!guard()) return;
  const title=D.title.trim().slice(0,300), note=D.note.trim().slice(0,2000), owners=parseOwners(D.owners);
  if(!title){toast("הכותרת לא יכולה להיות ריקה");return}
  const prev={title:t.title,note:t.note,owners:t.owners};
  t.title=title; t.note=note; t.owners=owners; S.editTask=null; renderData();
  try{await run(()=>batch([{op:"update",sheet:"tasks",id:t.id,fields:{title,note,owners,editedBy:S.me}}]));t.editedBy=S.me;toast("המשימה עודכנה")}
  catch(e){Object.assign(t,prev);renderData();writeErr(e)}
  refresh();
}

/* ---------- logs view ---------- */
function renderLogs(){
  const box=$("logs"); box.textContent="";
  const list=[...S.logs].sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt-a.createdAt));
  if(!list.length){box.append(el("div",{class:"notice"},"עוד לא נוספו סיכומים יומיים לשבוע הזה. לחצו על ",el("b",{text:"+ סיכום יומי"})," כדי להוסיף סיכום פתיחה או סגירה."));return}
  for(const l of list) box.append(renderLogItem(l));
}
function renderLogItem(l){
  const edit=canEdit();
  if(S.editLog&&S.editLog.id===l.id) return renderLogEditor(l);
  const d=parseIso(l.date);
  const del=el("button",{class:"icon","aria-label":"מחק סיכום",title:"מחק",hidden:!edit},"🗑");
  del.addEventListener("click",()=>{
    if(del.classList.contains("arm")){deleteLog(l);return}
    del.classList.add("arm");del.textContent="למחוק?";setTimeout(()=>{del.classList.remove("arm");del.textContent="🗑"},3000);
  });
  return el("div",{class:"log"+(l.kind==="open"?" open":"")},
    el("div",{class:"meta"},el("b",{text:l.kind==="open"?"פתיחה":"סגירה"}),el("span",{text:"יום "+HEB_DAYS[d.getDay()]+" "+dm(d)}),el("span",{text:l.team&&TEAM[l.team]?TEAM[l.team].name:"כמה צוותים"}),
      l.createdBy?el("span",{text:"✍️ "+l.createdBy}):null,l.editedBy?el("span",{text:"נערך ע״י "+l.editedBy}):null,
      el("span",{class:"grow"}),
      el("button",{class:"icon","aria-label":"ערוך סיכום",title:"ערוך",hidden:!edit,onclick:()=>{S.editLog={id:l.id,date:l.date,kind:l.kind,team:l.team||"",text:l.text,images:[...l.images],add:[],saving:false};renderLogs()}},"✏️"),del),
    el("pre",{text:l.text}),driveThumbs(l.images));
}
function renderLogEditor(l){
  const D=S.editLog;
  const date=el("input",{type:"date",id:"el-date",value:D.date}); date.onchange=()=>D.date=date.value;
  const kind=el("select",{id:"el-kind"},el("option",{value:"open",text:"פתיחה"}),el("option",{value:"close",text:"סגירה"})); kind.value=D.kind; kind.onchange=()=>D.kind=kind.value;
  const team=el("select",{id:"el-team"},el("option",{value:"",text:"כמה צוותים"}),...TEAMS.map(t=>el("option",{value:t.id,text:t.name}))); team.value=D.team; team.onchange=()=>D.team=team.value;
  const ta=el("textarea",{id:"el-text",style:"min-height:150px","aria-label":"טקסט הסיכום"}); ta.value=D.text; ta.oninput=()=>D.text=ta.value;
  ta.addEventListener("paste",async e=>{const f=[...(e.clipboardData&&e.clipboardData.files||[])].filter(x=>/^image\//.test(x.type));if(f.length){e.preventDefault();for(const x of f){try{D.add.push(await shrink(x))}catch(err){}}renderLogs()}});
  const thumbs=[...D.images.map(id=>thumbEl(imgUrl(id,400),imgUrl(id,1600),()=>{D.images=D.images.filter(x=>x!==id);renderLogs()})),
    ...D.add.map((im,i)=>thumbEl(im.preview,im.preview,()=>{D.add.splice(i,1);renderLogs()}))];
  return el("div",{class:"log"+(D.kind==="open"?" open":"")},el("div",{class:"editbox"},
    el("div",{class:"editrow"},el("label",null,"תאריך",date),el("label",null,"סוג",kind),el("label",null,"צוות",team)),
    ta,
    el("div",{class:"attach",style:"margin-top:0"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>pickFiles(async fs=>{for(const x of fs){try{D.add.push(await shrink(x))}catch(err){}}renderLogs()})},"📷 הוסף תמונות"),
      thumbs.length?el("div",{class:"thumbs",style:"margin:0"},thumbs):null),
    el("div",{class:"editbtns"},
      el("button",{class:"btn primary sm",disabled:D.saving,onclick:()=>saveLogEdit(l)},D.saving?(D.progress||"שומר…"):"שמור שינויים"),
      el("button",{class:"btn ghost sm",onclick:()=>{S.editLog=null;renderLogs()}},"ביטול"),
      el("span",{class:"hint",text:"שינוי הטקסט לא משנה משימות שכבר נוצרו. אותן עורכים בלשונית משימות."}))));
}
async function saveLogEdit(l){
  const D=S.editLog; if(!D||!guard()) return;
  if(!isIso(D.date)){toast("בחרו תאריך");return}
  D.saving=true; renderLogs();
  try{
    const ids=[...D.images];
    for(let i=0;i<D.add.length;i++){D.progress="מעלה תמונות "+(i+1)+"/"+D.add.length+"…";renderLogs();ids.push(await run(()=>uploadImg(D.add[i])))}
    const w=weekOf(parseIso(D.date));
    await run(()=>batch([{op:"update",sheet:"logs",id:l.id,fields:{date:D.date,week:w,kind:D.kind,team:D.team,text:D.text.slice(0,20000),images:ids,editedBy:S.me}}]));
    S.editLog=null; toast(w!==S.week?"הסיכום עודכן והועבר לשבוע "+w:"הסיכום עודכן"); refresh();
  }catch(e){D.saving=false;D.progress="";renderLogs();imgErr(e)}
}
async function deleteLog(l){
  if(!guard()) return;
  const keep=S.logs; S.logs=S.logs.filter(x=>x.id!==l.id); renderLogs();
  try{await run(()=>batch([{op:"delete",sheet:"logs",id:l.id}]));toast("הסיכום נמחק")}catch(e){S.logs=keep;renderLogs();writeErr(e)}
  refresh();
}

/* ---------- loading ---------- */
function setStatus(msg){const b=$("status");b.textContent="";if(msg)b.append(el("div",{class:"notice",text:msg}))}
async function loadWeek(silent){
  if(!CONFIGURED||!S.ready) return;
  if(silent&&(S.editTask||S.editLog||S.editSum||S.updTask)) return;
  const w=S.week;
  try{
    const [t,l,s]=await Promise.all([api("query",{sheet:"tasks",where:{week:w}}),api("query",{sheet:"logs",where:{week:w}}),api("query",{sheet:"summaries",where:{id:"w"+w}})]);
    if(w!==S.week) return;
    const sig=JSON.stringify([t.rows,l.rows,s.rows]);
    if(sig===S.sig&&silent) return;
    S.sig=sig;
    S.tasks=t.rows.map(normTask); S.logs=l.rows.map(normLog);
    S.summary=null;
    if(s.rows[0]){try{S.summary={ai:JSON.parse(s.rows[0].json),generatedAt:Number(s.rows[0].generatedAt)||0,editedAt:Number(s.rows[0].editedAt)||0,generatedBy:String(s.rows[0].generatedBy||""),editedBy:String(s.rows[0].editedBy||"")}}catch(e){}}
    setStatus("");
    renderData();
  }catch(e){ if(!silent) setStatus("לא הצלחתי לטעון את הנתונים. בדקו את החיבור ורעננו את הדף."); }
}
const refresh=()=>{S.sig="";return loadWeek(true)};
function refreshPeople(){
  let dl=$("people"); if(!dl){dl=el("datalist",{id:"people"});document.body.append(dl)}
  const names=new Set(); if(S.me) names.add(S.me);
  for(const t of S.tasks){(t.owners||[]).forEach(n=>names.add(n)); if(t.createdBy) names.add(t.createdBy); if(t.doneBy) names.add(t.doneBy)}
  for(const l of S.logs) if(l.createdBy) names.add(l.createdBy);
  dl.textContent=""; [...names].sort().forEach(n=>dl.append(el("option",{value:n})));
}
function renderData(){refreshPeople();renderHead(); if(S.tab==="tasks")renderTasks(); if(S.tab==="logs")renderLogs(); if(S.tab==="summary")renderDeck()}

/* ---------- writes ---------- */
function guard(){
  if(canEdit()){
    if(S.me) return true;
    S.askName=true; renderCodeBar(); const n=$("meName"); if(n) n.focus();
    toast("כתבו קודם את השם שלכם"); return false;
  }
  renderCodeBar(); const i=$("teamCode"); if(i) i.focus();
  toast("צריך להכניס את קוד הקבוצה"); return false;
}
function writeErr(e){
  if(e&&e.code==="bad_code"){S.code="";lsSet("mm_team_code",null);renderAll();toast("קוד הקבוצה השתנה. הכניסו אותו שוב");return}
  toast("השמירה נכשלה, נסו שוב");
}
async function run(fn){S.busy++;try{return await fn()}finally{S.busy--}}
async function addTask(team,title){
  if(!guard()) return;
  const row={id:uid("t"),week:S.week,team,title:title.slice(0,300),done:false,source:"manual",addedOn:iso(today()),doneOn:"",carried:false,carriedFrom:"",createdAt:Date.now(),createdBy:S.me};
  S.tasks.push(normTask(row)); renderData();
  try{await run(()=>batch([{op:"insert",sheet:"tasks",row}]))}catch(e){S.tasks=S.tasks.filter(t=>t.id!==row.id);renderData();writeErr(e)}
  refresh();
}
async function toggleTask(t){
  if(!guard()) return;
  const prev={done:t.done,doneOn:t.doneOn,doneBy:t.doneBy};
  t.done=!t.done; t.doneOn=t.done?iso(today()):null; t.doneBy=t.done?S.me:""; renderData();
  try{await run(()=>batch([{op:"update",sheet:"tasks",id:t.id,fields:{done:t.done,doneOn:t.doneOn||"",doneBy:t.doneBy}}]))}catch(e){Object.assign(t,prev);renderData();writeErr(e)}
  refresh();
}
async function deleteTask(t){
  if(!guard()) return;
  const keep=S.tasks; S.tasks=S.tasks.filter(x=>x.id!==t.id); renderData();
  try{await run(()=>batch([{op:"delete",sheet:"tasks",id:t.id}]))}catch(e){S.tasks=keep;renderData();writeErr(e)}
  refresh();
}

/* ---------- daily summary panel ---------- */
function openPanel(){
  if(!guard()) return;
  const t=today(), inWeek=weekOf(t)===S.week;
  S.panel={team:"auto",date:iso(inWeek?t:weekStart(S.week)),kind:new Date().getHours()<14?"open":"close",mode:"paste",text:"",done:"",todo:"",images:[],proposal:null,error:"",working:false,progress:""};
  renderPanel(); renderHead();
}
function closePanel(){S.panel=null;renderPanel();renderHead()}
function renderPanel(){
  const box=$("dailyPanel"); box.textContent="";
  if(!S.panel){box.hidden=true;return}
  box.hidden=false;
  const P=S.panel;
  const teamSel=el("select",{id:"p-team"},el("option",{value:"auto",text:"זיהוי אוטומטי מהטקסט"}),...TEAMS.map(t=>el("option",{value:t.id,text:t.name})));
  teamSel.value=P.team; teamSel.onchange=()=>P.team=teamSel.value;
  const date=el("input",{type:"date",id:"p-date",value:P.date}); date.onchange=()=>{P.date=date.value;renderPanel()};
  const kind=el("select",{id:"p-kind"},el("option",{value:"open",text:"פתיחה (תחילת יום / שבוע)"}),el("option",{value:"close",text:"סגירה (סוף מפגש)"}));
  kind.value=P.kind; kind.onchange=()=>P.kind=kind.value;
  const seg=el("div",{class:"seg",role:"group","aria-label":"אופן הזנה"},
    el("button",{"aria-pressed":P.mode==="paste"?"true":"false",onclick:()=>{P.mode="paste";renderPanel()}},"הדבקת טקסט"),
    el("button",{"aria-pressed":P.mode==="form"?"true":"false",onclick:()=>{P.mode="form";renderPanel()}},"טופס"));
  let input;
  if(P.mode==="paste"){
    const ta=el("textarea",{class:"big",id:"p-text",placeholder:"הדביקו כאן את הסיכום מהוואטסאפ, למשל:\n\nצוות מכניקה\nנעשה:\n- הרכבת שלדה\n- תיקון סרוו בזרוע\nצריך לעשות:\n- שרטוט מנגנון איסוף\n- הזמנת ברגים"});
    ta.value=P.text; ta.oninput=()=>P.text=ta.value; input=ta;
  }else{
    const a=el("textarea",{class:"big",id:"p-done",placeholder:"נעשה, שורה לכל משימה"}); a.value=P.done; a.oninput=()=>P.done=a.value;
    const b=el("textarea",{class:"big",id:"p-todo",placeholder:"צריך לעשות, שורה לכל משימה"}); b.value=P.todo; b.oninput=()=>P.todo=b.value;
    input=el("div",{class:"two"},el("label",{class:"f"},"נעשה",a),el("label",{class:"f"},"צריך לעשות",b));
  }
  const addFiles=async files=>{for(const f of files){try{P.images.push(await shrink(f))}catch(e){}}renderPanel()};
  const tgt=P.mode==="paste"?input:input.querySelector("textarea");
  if(tgt) tgt.addEventListener("paste",e=>{const f=[...(e.clipboardData&&e.clipboardData.files||[])].filter(x=>/^image\//.test(x.type));if(f.length){e.preventDefault();addFiles(f)}});
  const attach=el("div",{class:"attach"},
    el("button",{class:"btn ghost",type:"button",onclick:()=>pickFiles(addFiles)},"📷 צרף תמונות"),
    P.images.length?el("div",{class:"thumbs",style:"margin:0"},P.images.map((im,i)=>thumbEl(im.preview,im.preview,()=>{P.images.splice(i,1);renderPanel()}))):el("span",{class:"hint",text:"צילומים, שרטוטים או צילומי מסך. אפשר גם להדביק עם Ctrl+V."}));
  const wk=isIso(P.date)?weekOf(parseIso(P.date)):S.week;
  box.append(el("div",{class:"panel"},
    el("h3",{text:"סיכום יומי חדש · שבוע "+wk}),
    el("div",{class:"grid3"},el("label",{class:"f"},"צוות",teamSel),el("label",{class:"f"},"תאריך",date),el("label",{class:"f"},"סוג",kind)),
    seg,input,attach,
    el("div",{class:"actions"},
      el("button",{class:"btn primary",disabled:P.working,onclick:runAnalyze},P.working&&!P.proposal?"מנתח…":"נתח והצע עדכונים"),
      P.proposal?null:el("button",{class:"btn",disabled:P.working,onclick:saveSummaryOnly},"שמור רק סיכום"),
      el("button",{class:"btn ghost",onclick:closePanel},"ביטול"),
      el("span",{class:"hint",text:S.ai?"Gemini מפרק את הסיכום למשימות ומזהה מה מהמשימות הקיימות בוצע. אתם מאשרים לפני שמירה.":"ה-AI לא מחובר, הניתוח ייעשה לפי הכותרות \"נעשה\" ו\"צריך לעשות\"."})),
    P.error?el("div",{class:"err",text:P.error}):null,
    P.proposal?renderProposal():null));
}
const PKINDS={complete:"סמן ✓ בוצע",update:"עדכון משימה",new_done:"בוצע",new_progress:"בתהליך",new_todo:"משימה חדשה"};
// tasks a proposal row can be linked to: open tasks of this week + open (not carried) tasks of the previous week
function linkCands(P){return [...(P.existing||[]).filter(t=>!t.done),...(P.prevOpen||[])]}
function findCand(P,id){return linkCands(P).find(t=>t.id===id)||(P.existing||[]).find(t=>t.id===id)||null}
function linkItem(it,t){
  if(t){
    it.taskId=t.id; it.team=t.team; it.text=t.title; it.origTitle=t.title;
    if(!it.owners||!it.owners.length) it.owners=[...(t.owners||[])];
    if(it.kind==="new_done") it.kind="complete"; else if(it.kind!=="complete"&&it.kind!=="update") it.kind="update";
  }else{
    it.taskId=null; it.origTitle="";
    if(it.kind==="complete") it.kind="new_done"; else if(it.kind==="update") it.kind="new_progress";
  }
}
function renderProposal(){
  const P=S.panel, wrap=el("div",{class:"prop"});
  const cands=linkCands(P), w=weekOf(parseIso(P.date));
  if(P.proposal.length){
    const n=P.proposal.filter(x=>x.include).length;
    const all=el("input",{type:"checkbox",id:"p-all"});
    all.checked=n===P.proposal.length; all.indeterminate=n>0&&n<P.proposal.length;
    all.onchange=()=>{P.proposal.forEach(x=>x.include=all.checked);renderPanel()};
    wrap.append(el("label",{class:"pall"},all,el("span",{text:"בחר הכל ("+n+"/"+P.proposal.length+" נבחרו)"})));
  }else wrap.append(el("div",{class:"hint",text:"לא נמצאו משימות בטקסט. אפשר לשמור רק את הסיכום."}));
  P.proposal.forEach(it=>{
    const cb=el("input",{type:"checkbox","aria-label":"כלול"}); cb.checked=it.include; cb.onchange=()=>{it.include=cb.checked;renderPanel()};
    const sel=el("select",{"aria-label":"צוות"},...TEAMS.map(t=>el("option",{value:t.id,text:t.name}))); sel.value=it.team; sel.onchange=()=>it.team=sel.value;
    if(it.taskId) sel.disabled=true;
    const txt=el("input",{type:"text",value:it.text,"aria-label":"שם המשימה"});
    txt.onchange=()=>{it.text=txt.value;renderPanel()}; txt.oninput=()=>it.text=txt.value;
    const opts=it.taskId?["complete","update"]:["new_done","new_progress","new_todo"];
    const kindEl=el("select",{class:"kind-sel "+it.kind,"aria-label":"סטטוס"},opts.map(k=>el("option",{value:k,text:PKINDS[k]})));
    kindEl.value=it.kind; kindEl.onchange=()=>{it.kind=kindEl.value;renderPanel()};
    const cam=el("button",{class:"camera",type:"button","aria-label":"צרף תמונה למשימה",title:"צרף תמונה למשימה",
      onclick:()=>pickFiles(async fs=>{it.images=it.images||[];for(const f of fs){try{it.images.push(await shrink(f))}catch(e){}}renderPanel()})},"📷");
    wrap.append(el("div",{class:"prow"+(it.include?"":" off")},cb,kindEl,sel,txt,cam));
    // second line: link to an existing task, owners, progress note
    const link=el("select",{class:"plink","aria-label":"קשר למשימה קיימת"},el("option",{value:"",text:"➕ משימה חדשה (לא מקושרת)"}),
      TEAMS.map(tm=>{const ts=cands.filter(t=>t.team===tm.id);return ts.length?el("optgroup",{label:tm.name},ts.map(t=>el("option",{value:t.id,text:"🔗 "+t.title+(t.week!==w?" · משבוע "+t.week:"")}))):null}).filter(Boolean));
    link.value=it.taskId||""; link.onchange=()=>{linkItem(it,link.value?findCand(P,link.value):null);renderPanel()};
    const own=el("input",{type:"text",list:"people",placeholder:"👤 אחראים (מופרד בפסיק)","aria-label":"אחראים"}); own.value=ownersStr(it.owners); own.oninput=()=>it.owners=parseOwners(own.value);
    const meta=[el("span"),link,own];
    if(it.kind==="update"||it.kind==="new_progress"){
      const ni=el("input",{type:"text",placeholder:"מה המצב? למשל: נבנה הציר, חסרה הרכבה","aria-label":"מצב המשימה"}); ni.value=it.note||""; ni.oninput=()=>it.note=ni.value;
      meta.push(ni);
    }
    wrap.append(el("div",{class:"pmeta"},meta));
    if(it.taskId&&it.origTitle&&norm(it.text)!==norm(it.origTitle))
      wrap.append(el("div",{class:"pmeta"},el("span"),el("div",{class:"hint renamed",text:"✏️ שם המשימה ישתנה. השם הקודם יישמר בהיסטוריה: "+it.origTitle})));
    else if(it.taskId){const t=findCand(P,it.taskId); if(t&&t.week!==w) wrap.append(el("div",{class:"pmeta"},el("span"),el("div",{class:"hint",text:"↩ המשימה משבוע "+t.week+" תועבר לשבוע "+w+" עם כל ההיסטוריה שלה."})))}
    if(it.images&&it.images.length) wrap.append(el("div",{class:"pnote"},el("div",{class:"thumbs",style:"grid-column:2;margin:0"},
      it.images.map((im,i)=>thumbEl(im.preview,im.preview,()=>{it.images.splice(i,1);renderPanel()})))));
  });
  wrap.append(el("div",{class:"actions"},
    el("button",{class:"btn primary",onclick:applyProposal,disabled:P.working},P.working?(P.progress||"שומר…"):"שמור סיכום ועדכן משימות"),
    el("button",{class:"btn ghost",onclick:saveSummaryOnly,disabled:P.working},"שמור רק את הסיכום"),
    el("span",{class:"hint",text:"המשימות יישמרו בשבוע "+w+"."})));
  return wrap;
}
function saveSummaryOnly(){
  const P=S.panel; if(!P) return;
  if(!P.proposal) P.proposal=[];
  P.proposal.forEach(x=>x.include=false);
  applyProposal();
}
function composedText(P){
  if(P.mode==="paste") return P.text.trim();
  const t=[]; if(P.done.trim()) t.push("נעשה:\n"+P.done.trim()); if(P.todo.trim()) t.push("צריך לעשות:\n"+P.todo.trim());
  return t.join("\n\n");
}
const lines=s=>String(s||"").split(/\n/).map(x=>x.replace(/^\s*([-*•●▪✅☑✔⬜◻]️?|\d+[.)])\s*/u,"").trim()).filter(Boolean);
function detectTeam(text){
  const n=norm(text);
  for(const t of TEAMS) for(const a of (t.alias||[])) if(a&&n.includes(norm(a))) return t.id;
  return null;
}
function heuristicParse(P,existing){
  const fallbackTeam=P.team!=="auto"?P.team:(detectTeam(composedText(P))||TEAMS[0].id);
  let done=[],todo=[];
  if(P.mode==="form"){done=lines(P.done);todo=lines(P.todo)}
  else{
    let mode=null;
    for(const raw of P.text.split(/\n/)){
      const l=raw.trim(); if(!l) continue;
      const n=norm(l);
      const rest=()=>l.split(/[:：]/).slice(1).join(":").trim();
      if(/^(נעשה|בוצע|מה עשינו|הושלם)/.test(n)){mode="done";if(rest())done.push(rest());continue}
      if(/^(צריך לעשות|לעשות|משימות|מה נשאר|נשאר|לא נעשה|המשך)/.test(n)){mode="todo";if(rest())todo.push(rest());continue}
      if(/^צוות/.test(n)) continue;
      const item=lines(l)[0]; if(!item) continue;
      (mode==="done"?done:todo).push(item);
    }
  }
  const out=[], open=existing.filter(t=>!t.done);
  for(const d of done){
    const m=open.find(t=>norm(t.title)===norm(d)||norm(t.title).includes(norm(d))||norm(d).includes(norm(t.title)));
    if(m) out.push({kind:"complete",taskId:m.id,team:m.team,text:m.title,origTitle:m.title,owners:[...(m.owners||[])],include:true});
    else out.push({kind:"new_done",team:fallbackTeam,text:d,owners:[],include:true});
  }
  for(const d of todo){ if(!existing.some(t=>norm(t.title)===norm(d))) out.push({kind:"new_todo",team:fallbackTeam,text:d,owners:[],include:true}) }
  return out;
}
async function tasksOfWeek(w){
  if(w===S.week) return S.tasks;
  const r=await api("query",{sheet:"tasks",where:{week:w}}); return r.rows.map(normTask);
}
function parsePrompt(P,w,text,existing,prevOpen){
  const teamsTxt=TEAMS.map(t=>t.id+": "+t.name).join("\n");
  const row=(t,prev)=>{const u=lastUpd(t);return t.id+" | "+t.team+" | "+(t.done?"בוצע":(u?"בתהליך":"פתוח"))+" | "+t.title+(u&&!t.done?" (מצב אחרון: "+u.t+")":"")+(t.owners&&t.owners.length?" (אחראים: "+ownersStr(t.owners)+")":"")+(prev?" (משבוע קודם)":"")};
  const all=[...existing.map(t=>row(t,false)),...prevOpen.map(t=>row(t,true))];
  return `אתה עוזר לנהל משימות של קבוצת רובוטיקה FTC (קבוצת MM).
קיבלת סיכום ${P.kind==="open"?"פתיחה":"סגירה"} מיום ${P.date} (שבוע ${w} בעונה).
צוותים (id: שם):
${teamsTxt}
${P.team!=="auto"?"הסיכום שייך לצוות: "+P.team+" (אלא אם הטקסט אומר במפורש צוות אחר).":"זהה לכל פריט את הצוות לפי הטקסט (למשל כותרת \"צוות מכניקה\"). אם לא ברור, השתמש ב-"+TEAMS[0].id+"."}

משימות קיימות (id | צוות | סטטוס | כותרת):
${all.length?all.join("\n"):"(אין)"}

הסיכום:
"""
${text.slice(0,12000)}
"""

החזר רק JSON בצורה:
{"items":[{"action":"complete","taskId":"<id>","team":"<team id>","text":"<כותרת>","newTitle":"<רק אם צריך לשנות שם>","owners":["<שם>"]},{"action":"update","taskId":"<id>","team":"<team id>","text":"<כותרת>","newTitle":"<רק אם צריך>","note":"<מה נעשה ומה חסר>","owners":["<שם>"]},{"action":"new_done","team":"<team id>","text":"...","owners":[]},{"action":"new_progress","team":"<team id>","text":"<שם המשימה>","note":"<מה נעשה ומה חסר>","owners":[]},{"action":"new_todo","team":"<team id>","text":"...","owners":[]}]}
כללים:
- חשוב מאוד: לפני שאתה יוצר פריט חדש, בדוק אם הוא בעצם המשך של משימה קיימת ברשימה (כולל משימות "משבוע קודם"), גם אם הניסוח שונה או שהמשימה עברה לשלב הבא. אם כן, השתמש ב-complete או update עם ה-taskId שלה. אל תיצור כפילויות.
- complete: משימה קיימת ופתוחה שהסיכום מדווח שהושלמה.
- update: משימה קיימת ופתוחה שהתקדמו בה אבל היא עוד לא הושלמה. ב-note כתוב בקצרה מה נעשה ומה חסר (למשל "נבנה הציר, חסרה הרכבה").
- newTitle: רק ב-complete או update, כשהסיכום מראה שהמשימה עברה לשלב אחר ושם המשימה הנוכחי כבר לא מתאר אותה (למשל "בניית גיאומטריה דו-ממדית" ← "תחילת גיאומטריה תלת-ממדית"). אחרת השמט.
- new_done: דבר שהושלם ואין לו משימה קיימת.
- new_progress: עבודה שהתחילו ולא סיימו ואין לה משימה קיימת. text = שם המשימה הכללי, note = מה נעשה ומה חסר.
- new_todo: משהו שעוד צריך לעשות, לא התחילו בו, ואין לו משימה קיימת.
- complete או new_done רק כשהטקסט אומר שהדבר הושלם לגמרי. "התחלנו", "בתהליך", "חלקית", "חסר" = update או new_progress.
- owners: שמות האנשים שהטקסט אומר שעבדו על הפריט או אחראים עליו. אם אין שמות, השאר ריק.
- נסח כל פריט כמשימה קצרה וברורה בעברית (עד כ-8 מילים), שמור מונחים טכניים ושמות רכיבים.
- אל תמציא פריטים שלא מופיעים בטקסט, ואל תחזיר פריטים כפולים.`;
}
async function runAnalyze(){
  const P=S.panel; P.error="";
  const text=composedText(P);
  if(!text){P.error="כתבו או הדביקו את הסיכום קודם.";renderPanel();return}
  if(!isIso(P.date)){P.error="בחרו תאריך.";renderPanel();return}
  P.working=true; P.proposal=null; renderPanel();
  const w=weekOf(parseIso(P.date));
  let existing=[], prevOpen=[];
  try{existing=await tasksOfWeek(w)}catch(e){}
  if(w>1){try{prevOpen=(await tasksOfWeek(w-1)).filter(t=>!t.done&&!t.carried)}catch(e){}}
  P.existing=existing; P.prevOpen=prevOpen;
  let proposal=null;
  if(S.ai){
    try{
      const res=await run(()=>ai(parsePrompt(P,w,text,existing,prevOpen)));
      const items=Array.isArray(res&&res.items)?res.items:[];
      const open=new Map(linkCands(P).map(t=>[t.id,t]));
      const def=P.team!=="auto"?P.team:TEAMS[0].id;
      const used=new Set();
      proposal=[];
      for(const it of items){
        const team=TEAM[it.team]?it.team:def, txt=String(it.text||"").trim();
        const note=String(it.note||"").trim().slice(0,300), owners=parseOwners(it.owners);
        if((it.action==="complete"||it.action==="update")&&open.has(String(it.taskId))&&!used.has(String(it.taskId))){
          const t=open.get(String(it.taskId)); used.add(t.id);
          const nt=String(it.newTitle||"").trim().slice(0,300);
          proposal.push({kind:it.action,taskId:t.id,team:t.team,text:nt||t.title,origTitle:t.title,note,owners:owners.length?owners:[...(t.owners||[])],include:true});
        }
        else if((it.action==="new_done"||it.action==="new_todo"||it.action==="new_progress")&&txt) proposal.push({kind:it.action,team,text:txt.slice(0,300),note,owners,include:true});
      }
    }catch(e){
      if(e&&e.code==="bad_code"){P.working=false;closePanel();writeErr(e);return}
      P.error=e&&e.code==="ai_rate_limited"?"Gemini עמוס כרגע, נעשה ניתוח פשוט במקום.":"Gemini לא הצליח לנתח, נעשה ניתוח פשוט במקום.";
      proposal=null;
    }
  }
  if(!proposal) proposal=heuristicParse(P,[...existing,...prevOpen]);
  P.proposal=proposal; P.working=false; refreshPeople(); renderPanel();
}
async function applyProposal(){
  const P=S.panel; if(!P||!guard()) return;
  if(!P.proposal) P.proposal=[];
  if(!composedText(P)&&!P.images.length&&!P.proposal.some(x=>x.include)){toast("אין מה לשמור. כתבו סיכום או צרפו תמונה.");return}
  P.working=true; P.progress=""; renderPanel();
  const imgIds=[];
  const rowImgs=P.proposal.filter(it=>it.include&&it.images&&it.images.length);
  const total=P.images.length+rowImgs.reduce((n,it)=>n+it.images.length,0); let k=0;
  const step=()=>{k++;P.progress="מעלה תמונות "+k+"/"+total+"…";renderPanel()};
  try{
    for(const im of P.images){step();imgIds.push(await run(()=>uploadImg(im)))}
    for(const it of rowImgs){it.imgIds=[];for(const im of it.images){step();it.imgIds.push(await run(()=>uploadImg(im)))}}
  }catch(e){P.working=false;P.progress="";renderPanel();imgErr(e);return}
  P.progress="שומר…"; renderPanel();
  const w=weekOf(parseIso(P.date)), src=P.kind==="open"?"opening":"daily", now=Date.now();
  const ops=[{op:"insert",sheet:"logs",row:{id:uid("l"),week:w,date:P.date,kind:P.kind,team:P.team==="auto"?"":P.team,text:composedText(P).slice(0,20000),createdAt:now,images:imgIds,createdBy:S.me}}];
  const touched=new Set();
  P.proposal.forEach((it,i)=>{
    if(!it.include||!String(it.text).trim()) return;
    const upd=String(it.note||"").trim().slice(0,300), ri=it.imgIds||[], owners=parseOwners(it.owners);
    if(it.taskId){
      const ex=findCand(P,it.taskId); if(!ex||touched.has(ex.id)) return; touched.add(ex.id);
      const title=String(it.text).trim().slice(0,300), renamed=norm(title)!==norm(ex.title);
      const updates=[...ex.updates];
      if(renamed) updates.push({d:P.date,t:ex.title,by:S.me,k:"rename"});
      if(it.kind==="update"&&upd) updates.push({d:P.date,t:upd,by:S.me});
      const f={};
      if(renamed) f.title=title;
      if(updates.length!==ex.updates.length) f.updates=updates;
      if(ri.length) f.images=[...ex.images,...ri];
      if(owners.length&&ownersStr(owners)!==ownersStr(ex.owners)) f.owners=owners;
      if(it.kind==="complete") Object.assign(f,{done:true,doneOn:P.date,doneBy:S.me});
      if(ex.week!==w){
        // linked to an open task from an earlier week: carry it into this week with its history
        ops.push({op:"insert",sheet:"tasks",row:{id:uid("t"),week:w,team:ex.team,title:f.title||ex.title,note:ex.note||"",done:!!f.done,source:"carried",
          addedOn:iso(weekStart(w)),doneOn:f.doneOn||"",doneBy:f.doneBy||"",carried:false,carriedFrom:ex.id,createdAt:now+i,createdBy:ex.createdBy||S.me,
          updates:f.updates||ex.updates,images:f.images||ex.images,owners:f.owners||ex.owners}});
        ops.push({op:"update",sheet:"tasks",id:ex.id,fields:{carried:true}});
      }else if(Object.keys(f).length) ops.push({op:"update",sheet:"tasks",id:ex.id,fields:f});
      return;
    }
    ops.push({op:"insert",sheet:"tasks",row:{id:uid("t"),week:w,team:it.team,title:String(it.text).trim().slice(0,300),done:it.kind==="new_done",
      source:it.kind==="new_done"?"daily":src,addedOn:P.date,doneOn:it.kind==="new_done"?P.date:"",carried:false,carriedFrom:"",createdAt:now+i,createdBy:S.me,doneBy:it.kind==="new_done"?S.me:"",
      updates:it.kind==="new_progress"&&upd?[{d:P.date,t:upd,by:S.me}]:[],images:ri,owners}});
  });
  try{
    await run(()=>batch(ops));
    const n=P.proposal.filter(x=>x.include).length;
    closePanel(); toast(n?"הסיכום נשמר · "+n+" עדכונים":"הסיכום נשמר");
    if(w!==S.week) location.hash="w"+w; else refresh();
  }catch(e){P.working=false;renderPanel();writeErr(e)}
}

/* ---------- weekly summary (slides) ---------- */
function teamStats(teamId){
  const list=S.tasks.filter(t=>t.team===teamId), ws=iso(weekStart(S.week));
  return {list,done:list.filter(t=>t.done),open:list.filter(t=>!t.done),
    added:list.filter(t=>t.source!=="opening"&&t.source!=="carried"&&t.addedOn&&t.addedOn>ws),
    progress:list.filter(t=>!t.done&&lastUpd(t))};
}
function slideShell(...kids){
  return el("div",{class:"slide"},el("img",{class:"s-logo",src:LOGO,alt:""}),el("div",{class:"s-body"},kids),
    el("div",{class:"s-foot"},el("img",{src:OMETZ,alt:""}),el("img",{src:HOSS,alt:""})));
}
function renderDeck(){
  const deck=$("deck"); deck.textContent="";
  const s=weekStart(S.week), e=weekEnd(S.week), st=stageFor(e);
  const ai=S.summary&&S.summary.ai||null;
  const g=$("genSummary"); g.hidden=!S.ai||!S.ready; g.textContent=ai?"הפק מחדש עם Gemini":"הפק סיכום שבוע עם Gemini";
  $("genInfo").textContent=S.summary&&S.summary.generatedAt?"נוצר "+new Date(S.summary.generatedAt).toLocaleString("he-IL",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}):(S.ai?"":"רשימות הבוצע/פתוח מתעדכנות לבד. כתיבת הסיכום המילולי דורשת חיבור ל-Gemini.");
  if(S.summary&&S.summary.generatedAt&&S.summary.generatedBy) $("genInfo").textContent+=" ע״י "+S.summary.generatedBy;
  if(S.summary&&S.summary.editedAt) $("genInfo").textContent="נערך "+new Date(S.summary.editedAt).toLocaleString("he-IL",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})+(S.summary.editedBy?" ע״י "+S.summary.editedBy:"");
  $("editSummary").hidden=!S.ready||!!S.editSum;
  renderSumEdit();
  const openAll=S.tasks.filter(t=>!t.done&&!t.carried);
  const cb=$("carryOver"); cb.hidden=!openAll.length||!S.ready; cb.textContent="העבר "+openAll.length+" משימות פתוחות לשבוע "+(S.week+1);

  deck.append(slideShell(el("div",{class:"hexframe"},el("div",null,
    el("img",{class:"big-logo",src:LOGO,alt:""}),
    el("h3",{class:"s-title",text:"סיכום שבוע "+S.week}),
    el("div",{class:"s-sub",text:dm(s)+" – "+dm(e)+"."+e.getFullYear()+"  ·  "+st.name})))));

  const active=TEAMS.filter(t=>teamStats(t.id).list.length);
  const tbl=el("table",{class:"s-table"},el("thead",null,el("tr",null,el("th",{text:"צוות"}),el("th",{text:"בוצעו"}),el("th",{text:"פתוחות"}),el("th",{text:"בתהליך"}),el("th",{text:"נוספו במהלך השבוע"}),el("th",{text:"התקדמות"}))));
  const tb=el("tbody");
  for(const t of active){
    const x=teamStats(t.id), pct=Math.round(x.done.length/x.list.length*100);
    tb.append(el("tr",null,el("td",{text:t.name}),el("td",{text:x.done.length}),el("td",{text:x.open.length}),el("td",{text:x.progress.length}),el("td",{text:x.added.length}),
      el("td",null,el("div",{class:"mini"},el("i",{style:"width:"+pct+"%"})))));
  }
  if(!active.length) tb.append(el("tr",null,el("td",{colspan:"5",text:"אין עדיין משימות בשבוע הזה"})));
  tbl.append(tb);
  deck.append(slideShell(el("h3",{class:"s-title",text:ai&&ai.headline?ai.headline:"תמונת מצב שבועית"}),ai&&ai.overview?el("p",{class:"s-lead",text:ai.overview}):null,tbl));

  for(const t of active){
    const x=teamStats(t.id);
    const tai=ai&&Array.isArray(ai.teams)?ai.teams.find(z=>z.teamId===t.id):null;
    const addedIds=new Set(x.added.map(a=>a.id));
    const li=task=>{const u=!task.done&&lastUpd(task);return el("li",null,task.title,task.owners&&task.owners.length?el("small",{class:"o",text:"  · "+ownersStr(task.owners)}):null,u?el("small",{class:"p",text:"  · 🔄 "+u.t}):null,addedIds.has(task.id)?el("small",{text:"  · נוסף במהלך השבוע"}):null)};
    const right=el("div",{class:"box"},el("h4",{text:"בוצע ✓"}),el("ul",null,x.done.length?x.done.map(li):el("li",{text:"—"})));
    const leftKids=[el("h4",{text:"נשאר פתוח"}),el("ul",null,x.open.length?x.open.map(li):el("li",{text:"הכל בוצע"}))];
    if(tai&&Array.isArray(tai.nextWeek)&&tai.nextWeek.length) leftKids.push(el("h4",{text:"פוקוס לשבוע הבא",style:"margin-top:1.2cqw"}),el("ul",null,tai.nextWeek.slice(0,4).map(v=>el("li",{text:String(v)}))));
    deck.append(slideShell(el("h3",{class:"s-title",text:"צוות "+t.name}),tai&&tai.summary?el("p",{class:"s-lead",text:String(tai.summary)}):null,
      el("div",{class:"s-cols"},right,el("div",{class:"box"},leftKids))));
  }
  const gal=[];
  for(const l of [...S.logs].sort((a,b)=>a.date.localeCompare(b.date))) for(const id of l.images) gal.push({id,cap:(l.team&&TEAM[l.team]?TEAM[l.team].name+" · ":"")+dm(parseIso(l.date))});
  for(const t of S.tasks) for(const id of t.images) gal.push({id,cap:(TEAM[t.team]?TEAM[t.team].name+" · ":"")+t.title});
  for(let i=0;i<gal.length;i+=6){
    const chunk=gal.slice(i,i+6);
    deck.append(slideShell(el("h3",{class:"s-title",text:"תמונות מהשבוע"+(gal.length>6?" ("+(i/6+1)+")":"")}),
      el("div",{class:"s-gallery"},chunk.map(g=>el("figure",{onclick:()=>openLightbox(imgUrl(g.id,1600))},el("img",{src:imgUrl(g.id,800),alt:"",loading:"lazy",referrerpolicy:"no-referrer"}),el("figcaption",{text:g.cap.slice(0,70)}))))));
  }
  if(ai&&Array.isArray(ai.focusNextWeek)&&ai.focusNextWeek.length){
    deck.append(slideShell(el("h3",{class:"s-title",text:"פוקוס לשבוע "+(S.week+1)}),
      el("div",{class:"box",style:"margin:2cqw auto 0;width:70%"},el("ul",{style:"font-size:2cqw"},ai.focusNextWeek.slice(0,7).map(v=>el("li",{text:String(v)}))))));
  }
}
async function generateSummary(){
  if(!S.ai||!guard()) return;
  const btn=$("genSummary"); btn.disabled=true; btn.textContent="כותב סיכום… (עד דקה)";
  const s=weekStart(S.week), e=weekEnd(S.week), st=stageFor(e);
  const sat=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6);
  const evs=EVENTS.filter(ev=>{const dd=parseIso(ev.date);return dd>=s&&dd<=sat}).map(ev=>ev.date+" "+ev.title);
  const teamsTxt=TEAMS.map(t=>{
    const x=teamStats(t.id); if(!x.list.length) return null;
    const addedIds=new Set(x.added.map(a=>a.id));
    return "## "+t.id+" ("+t.name+")\nבוצע:\n"+(x.done.map(z=>"- "+z.title+(z.owners&&z.owners.length?" (אחראים: "+ownersStr(z.owners)+")":"")+(addedIds.has(z.id)?" [נוסף במהלך השבוע]":"")).join("\n")||"- אין")+"\nפתוח:\n"+(x.open.map(z=>{const u=lastUpd(z);return "- "+z.title+(z.owners&&z.owners.length?" (אחראים: "+ownersStr(z.owners)+")":"")+(u?" [בתהליך: "+u.t+"]":"")}).join("\n")||"- אין");
  }).filter(Boolean).join("\n\n");
  const logsTxt=[...S.logs].sort((a,b)=>a.date.localeCompare(b.date)).map(l=>"["+l.date+" "+(l.kind==="open"?"פתיחה":"סגירה")+(l.team?" "+l.team:"")+"]\n"+l.text.slice(0,1500)).join("\n\n").slice(0,30000);
  const prompt=`אתה כותב את סיכום השבוע של קבוצת הרובוטיקה FTC "MM" (מרכז חוסידמן, אוניברסיטת בן-גוריון). הסיכום יוצג בשקפים בעברית.
שבוע ${S.week} בעונה, ${iso(s)} עד ${iso(e)}. שלב בעונה: ${st.name} (יעד ביצוע מתוך ה-KPI: ${st.kpi}).
${evs.length?"אירועים השבוע: "+evs.join("; "):""}

משימות לפי צוות:
${teamsTxt||"(אין משימות)"}

סיכומים יומיים שנכתבו השבוע:
${logsTxt||"(אין)"}

החזר רק JSON בצורה:
{"headline":"כותרת קצרה לשבוע (עד 7 מילים)","overview":"2-3 משפטים על השבוע כולו","teams":[{"teamId":"<id>","summary":"משפט אחד או שניים על הצוות","nextWeek":["עד 3 פריטים קצרים"]}],"focusNextWeek":["3-5 פריטים קצרים לכל הקבוצה"]}
כללים: כתוב בעברית תקנית וקצרה, בסגנון מצגת. התבסס רק על המידע למעלה, אל תמציא הישגים. כלול ב-teams רק צוותים שמופיעים ברשימה.`;
  try{
    const r=await run(()=>ai(prompt));
    if(!r||typeof r!=="object") throw {code:"ai_bad_json"};
    const clean={headline:String(r.headline||"").slice(0,120),overview:String(r.overview||"").slice(0,800),
      teams:(Array.isArray(r.teams)?r.teams:[]).filter(t=>t&&TEAM[t.teamId]).map(t=>({teamId:t.teamId,summary:String(t.summary||"").slice(0,400),nextWeek:(Array.isArray(t.nextWeek)?t.nextWeek:[]).slice(0,4).map(x=>String(x).slice(0,140))})),
      focusNextWeek:(Array.isArray(r.focusNextWeek)?r.focusNextWeek:[]).slice(0,7).map(x=>String(x).slice(0,160))};
    const now=Date.now();
    await run(()=>batch([{op:"upsert",sheet:"summaries",row:{id:"w"+S.week,week:S.week,json:JSON.stringify(clean),generatedAt:now,editedAt:"",generatedBy:S.me,editedBy:""}}]));
    S.summary={ai:clean,generatedAt:now,editedAt:0,generatedBy:S.me,editedBy:""};
    toast("סיכום השבוע נוצר");
  }catch(err){
    if(err&&err.code==="bad_code") writeErr(err);
    else if(err&&err.code==="ai_rate_limited") toast("Gemini עמוס כרגע, נסו שוב בעוד דקה");
    else toast("יצירת הסיכום נכשלה, נסו שוב");
  }finally{btn.disabled=false;renderDeck()}
}
function startSumEdit(){
  if(!guard()) return;
  const ai=S.summary&&S.summary.ai||{}, aiTeams=Array.isArray(ai.teams)?ai.teams:[];
  const active=TEAMS.filter(t=>teamStats(t.id).list.length||aiTeams.some(z=>z.teamId===t.id));
  S.editSum={headline:ai.headline||"",overview:ai.overview||"",focus:(ai.focusNextWeek||[]).join("\n"),saving:false,
    teams:active.map(t=>{const z=aiTeams.find(x=>x.teamId===t.id)||{};return{teamId:t.id,summary:z.summary||"",next:(z.nextWeek||[]).join("\n")}})};
  renderDeck(); const f=$("se-headline"); if(f) f.focus();
}
function renderSumEdit(){
  const box=$("sumEdit"); box.textContent="";
  const D=S.editSum; if(!D) return;
  const inp=(id,val,set,ph)=>{const i=el("input",{type:"text",id,placeholder:ph||""});i.value=val;i.oninput=()=>set(i.value);return i};
  const area=(id,val,set,ph,h)=>{const a=el("textarea",{id,placeholder:ph||"",style:h?"min-height:"+h+"px":null});a.value=val;a.oninput=()=>set(a.value);return a};
  const teamsEls=D.teams.map((z,i)=>el("div",{class:"team-ed"},el("h4",{text:"צוות "+(TEAM[z.teamId]?TEAM[z.teamId].name:z.teamId)}),
    el("label",null,"משפט סיכום",area("se-t"+i,z.summary,v=>z.summary=v,"מה הצוות עשה השבוע",60)),
    el("label",null,"פוקוס לשבוע הבא (שורה לכל פריט)",area("se-n"+i,z.next,v=>z.next=v,"",60))));
  box.append(el("div",{class:"panel sumedit"},el("h3",{text:"עריכת סיכום שבוע "+S.week}),el("div",{class:"editbox"},
    el("label",null,"כותרת השבוע",inp("se-headline",D.headline,v=>D.headline=v,"למשל: השלדה עומדת, האיסוף בדרך")),
    el("label",null,"סיכום כללי",area("se-overview",D.overview,v=>D.overview=v,"2-3 משפטים על השבוע",80)),
    teamsEls,
    el("label",{style:"margin-top:6px"},"פוקוס לשבוע הבא לכל הקבוצה (שורה לכל פריט)",area("se-focus",D.focus,v=>D.focus=v,"",80)),
    el("div",{class:"hint",text:"רשימות \"בוצע\" ו\"נשאר פתוח\" בשקפים מגיעות מהמשימות עצמן. כדי לשנות אותן, ערכו את המשימות בלשונית משימות."}),
    el("div",{class:"editbtns"},
      el("button",{class:"btn primary sm",disabled:D.saving,onclick:saveSumEdit},D.saving?"שומר…":"שמור סיכום"),
      el("button",{class:"btn ghost sm",onclick:()=>{S.editSum=null;renderDeck()}},"ביטול"),
      el("button",{class:"btn ghost sm",onclick:()=>{S.editSum=null;setTab("tasks")}},"לעריכת המשימות")))));
}
async function saveSumEdit(){
  const D=S.editSum; if(!D||!guard()) return;
  D.saving=true; renderSumEdit();
  const clean={headline:D.headline.trim().slice(0,120),overview:D.overview.trim().slice(0,800),
    teams:D.teams.map(z=>({teamId:z.teamId,summary:z.summary.trim().slice(0,400),nextWeek:lines(z.next).slice(0,4).map(x=>x.slice(0,140))})).filter(z=>z.summary||z.nextWeek.length),
    focusNextWeek:lines(D.focus).slice(0,7).map(x=>x.slice(0,160))};
  const now=Date.now(), gen=S.summary&&S.summary.generatedAt||now;
  try{
    await run(()=>batch([{op:"upsert",sheet:"summaries",row:{id:"w"+S.week,week:S.week,json:JSON.stringify(clean),generatedAt:gen,editedAt:now,editedBy:S.me}}]));
    S.summary={ai:clean,generatedAt:gen,editedAt:now,generatedBy:S.summary&&S.summary.generatedBy||"",editedBy:S.me}; S.editSum=null; toast("סיכום השבוע נשמר"); renderDeck();
  }catch(e){D.saving=false;renderSumEdit();writeErr(e)}
}
function summaryText(){
  const s=weekStart(S.week), e=weekEnd(S.week), ai=S.summary&&S.summary.ai;
  const out=["*סיכום שבוע "+S.week+" · "+dm(s)+"–"+dm(e)+"*"];
  if(ai&&ai.overview) out.push(ai.overview);
  for(const t of TEAMS){
    const x=teamStats(t.id); if(!x.list.length) continue;
    out.push("","*"+t.name+"* ("+x.done.length+"/"+x.list.length+")");
    const tai=ai&&ai.teams?ai.teams.find(z=>z.teamId===t.id):null;
    if(tai&&tai.summary) out.push(tai.summary);
    const ow=z=>z.owners&&z.owners.length?" ("+ownersStr(z.owners)+")":"";
    x.done.forEach(z=>out.push("✅ "+z.title+ow(z))); x.open.forEach(z=>{const u=lastUpd(z);out.push((u?"🔄 ":"⬜ ")+z.title+ow(z)+(u?" — "+u.t:""))});
  }
  if(ai&&ai.focusNextWeek&&ai.focusNextWeek.length){out.push("","*פוקוס לשבוע הבא*");ai.focusNextWeek.forEach(f=>out.push("• "+f))}
  return out.join("\n");
}
async function copySummary(){
  const txt=summaryText(), box=$("copyBox"); box.textContent="";
  try{await navigator.clipboard.writeText(txt);toast("הועתק. אפשר להדביק בוואטסאפ")}
  catch(e){const ta=el("textarea",{class:"copyfallback",readonly:true,"aria-label":"טקסט להעתקה"});ta.value=txt;box.append(ta);ta.focus();ta.select();toast("סמנו והעתיקו את הטקסט")}
}
async function carryOver(){
  if(!guard()) return;
  const btn=$("carryOver"); btn.disabled=true;
  const open=S.tasks.filter(t=>!t.done&&!t.carried), now=Date.now();
  const ops=[];
  open.forEach((t,i)=>{
    ops.push({op:"insert",sheet:"tasks",row:{id:uid("t"),week:S.week+1,team:t.team,title:t.title,done:false,source:"carried",addedOn:iso(weekStart(S.week+1)),doneOn:"",carried:false,carriedFrom:t.id,createdAt:now+i,createdBy:S.me,updates:t.updates,owners:t.owners,note:t.note||""}});
    ops.push({op:"update",sheet:"tasks",id:t.id,fields:{carried:true}});
  });
  try{await run(()=>batch(ops));toast(open.length+" משימות הועברו לשבוע "+(S.week+1));refresh()}
  catch(e){writeErr(e)}finally{btn.disabled=false}
}

/* ---------- tabs, wiring, boot ---------- */
function setTab(t){
  S.tab=t;
  for(const k of ["tasks","logs","summary"]){$("tab-"+k).setAttribute("aria-selected",k===t?"true":"false");$("view-"+k).hidden=k!==t}
  if(t==="tasks")renderTasks(); if(t==="logs")renderLogs(); if(t==="summary")renderDeck();
}
function renderAll(){renderRail();renderHead();renderCodeBar();renderChips();renderPanel();setTab(S.tab)}
$("tab-tasks").onclick=()=>setTab("tasks");
$("tab-logs").onclick=()=>setTab("logs");
$("tab-summary").onclick=()=>setTab("summary");
$("openDaily").onclick=openPanel;
$("genSummary").onclick=generateSummary;
$("copySummary").onclick=copySummary;
$("carryOver").onclick=carryOver;
$("editSummary").onclick=startSumEdit;
$("meBtn").onclick=()=>{S.askName=true;renderCodeBar();const n=$("meName");if(n){n.focus();n.select()}};
addEventListener("hashchange",()=>{const w=readHash();if(w&&w!==S.week){S.week=w;S.updTask=null;S.editTask=null;S.editLog=null;S.editSum=null;S.tasks=[];S.logs=[];S.summary=null;S.sig="";renderAll();loadWeek(false)}});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!S.busy)loadWeek(true)});
setInterval(()=>{if(document.visibilityState==="visible"&&!S.busy&&!(S.panel&&S.panel.working))loadWeek(true)},POLL_MS);

/* ---------- install as app ---------- */
if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
let installEvt=null;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;$("installBtn").hidden=false});
$("installBtn").onclick=async()=>{if(!installEvt)return;installEvt.prompt();try{await installEvt.userChoice}catch(e){}installEvt=null;$("installBtn").hidden=true};
addEventListener("appinstalled",()=>{$("installBtn").hidden=true});
(function iosHint(){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent), standalone=navigator.standalone===true||matchMedia("(display-mode: standalone)").matches;
  if(!ios||standalone||lsGet("mm_ios_hint")) return;
  const box=$("iosHint");
  box.append(el("div",{class:"notice ioshint"},el("span",null,"להתקנה כאפליקציה: לחצו על ",el("b",{text:"שיתוף"})," ואז ",el("b",{text:"הוספה למסך הבית"}),"."),
    el("button",{"aria-label":"סגור",onclick:()=>{lsSet("mm_ios_hint","1");box.textContent=""}},"×")));
})();

S.week=readHash()||curWeek();
renderAll();

(async()=>{
  if(!CONFIGURED){setStatus("האתר עוד לא מחובר ל-Google Sheet. הדביקו את כתובת ה-Web app בראש הקוד (ראו README).");return}
  setStatus("טוען…");
  try{
    const c=await api("config");
    if(c.settings&&isIso(c.settings.season_start)) SEASON_START=parseIso(c.settings.season_start);
    if(Array.isArray(c.teams)&&c.teams.length) setTeams(c.teams.filter(t=>t&&t.id).map(t=>({id:String(t.id),name:String(t.name||t.id),alias:[String(t.name||"")].concat(String(t.aliases||"").split(",")).map(x=>x.trim()).filter(Boolean)})));
    if(Array.isArray(c.events)) EVENTS=c.events.filter(e=>e&&isIso(e.date)).map(e=>({date:e.date,title:String(e.title||"")}));
    S.ai=!!c.ai; S.needsCode=!!c.needsCode; S.ready=true;
    if(!readHash()) S.week=curWeek();
    renderAll(); await loadWeek(false);
  }catch(e){setStatus("לא הצלחתי להתחבר ל-Google Sheet. בדקו שהכתובת נכונה ושהפריסה פתוחה ל-Anyone.")}
})();
})();
