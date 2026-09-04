(()=>{'use strict';
const view=document.getElementById('view');
const stateEl=document.getElementById('state');
const blobInfo=document.getElementById('blobInfo');
if(!view||!stateEl)return;
const LINK_URL='../blob/public/ga/link.json';
const DEFAULT_STATE_URL='../blob/public/ga/state.json';
const RUNTIME_KEY='gvault.ga.runtime.blob.v1';
const REV_KEY='gvault.ga.runtime.revision.v1';
let link=null,remoteState=null,applyingRemote=false,observer=null,pollTimer=0,rev=Number(localStorage.getItem(REV_KEY)||0)||0;
let channel=null;
function now(){return new Date().toISOString()}
function safeText(v,n=600){return String(v??'').slice(0,n)}
function currentRoute(){try{const u=new URL(view.src,location.href);return u.pathname+u.search}catch{return''}}
function publish(kind,payload,source='GA'){
  rev+=1;localStorage.setItem(REV_KEY,String(rev));
  const envelope={schema:'GVAULT_GA_RUNTIME_BLOB_V1',blobId:'blob:public:ga:runtime:v1',targetBlobId:'blob:public:ga:v1',revision:rev,updatedAt:now(),source,kind,payload};
  localStorage.setItem(RUNTIME_KEY,JSON.stringify(envelope));
  window.GVAULT_GA_RUNTIME_BLOB=envelope;
  window.dispatchEvent(new CustomEvent('gvault:ga-runtime-blob',{detail:envelope}));
  try{channel?.postMessage(envelope)}catch{}
  return envelope;
}
function snapshot(){
  try{
    const d=view.contentDocument;if(!d)return{route:currentRoute(),available:false};
    const statusLines=[...d.querySelectorAll('.statusline')].slice(0,24).map(row=>({label:safeText(row.querySelector('span')?.textContent?.trim(),100),value:safeText(row.querySelector('b')?.textContent?.trim(),180)}));
    const events=[...d.querySelectorAll('.events')].slice(0,4).map(el=>safeText(el.textContent?.replace(/\s+/g,' ').trim(),1200));
    return{route:currentRoute(),available:true,title:safeText(d.title,180),bodyClass:safeText(d.body?.className,240),statusLines,events};
  }catch{return{route:currentRoute(),available:false}}
}
function scheduleSnapshot(reason='mutation'){
  clearTimeout(scheduleSnapshot.t);scheduleSnapshot.t=setTimeout(()=>{if(!applyingRemote)publish('ga-snapshot',{reason,state:snapshot()})},120);
}
function attachObserver(){
  try{observer?.disconnect();const d=view.contentDocument;if(!d?.documentElement)return;observer=new MutationObserver(()=>scheduleSnapshot('dom-mutation'));observer.observe(d.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-state','aria-pressed']});scheduleSnapshot('view-load')}catch{}
}
function applyPatch(d,p){
  if(!p||typeof p!=='object')return;
  if(p.type==='statusline'){
    const label=safeText(p.label,100);for(const row of d.querySelectorAll('.statusline')){if(row.querySelector('span')?.textContent?.trim()===label){const b=row.querySelector('b');if(b)b.textContent=safeText(p.value,180)}}return;
  }
  const selector=safeText(p.selector,220);if(!selector)return;
  let nodes=[];try{nodes=[...d.querySelectorAll(selector)].slice(0,32)}catch{return}
  for(const el of nodes){
    if(p.type==='text')el.textContent=safeText(p.value,2000);
    else if(p.type==='class-toggle'&&p.name)el.classList.toggle(safeText(p.name,80),Boolean(p.enabled));
    else if(p.type==='attribute'&&p.name&&String(p.name).startsWith('data-'))el.setAttribute(safeText(p.name,100),safeText(p.value,500));
    else if(p.type==='css-var'&&String(p.name).startsWith('--'))el.style.setProperty(safeText(p.name,100),safeText(p.value,180));
  }
}
function applyEnvelope(envelope){
  if(!envelope||typeof envelope!=='object')return false;
  const patches=Array.isArray(envelope.patches)?envelope.patches:Array.isArray(envelope.payload?.patches)?envelope.payload.patches:null;
  if(!patches?.length)return false;
  try{const d=view.contentDocument;if(!d)return false;applyingRemote=true;for(const p of patches.slice(0,64))applyPatch(d,p);requestAnimationFrame(()=>{applyingRemote=false;scheduleSnapshot('blob-apply')});return true}catch{applyingRemote=false;return false}
}
function openChannel(name){
  if(!('BroadcastChannel'in window))return;
  try{channel?.close();channel=new BroadcastChannel(name||'gvault-ga-blob-v1');channel.onmessage=e=>{const data=e.data;if(!data||data.source==='GA')return;if(data.targetBlobId&&data.targetBlobId!=='blob:public:ga:v1')return;if(applyEnvelope(data))stateEl.textContent='BLOB ↔ GA · LIVE'}}catch{}
}
async function loadLink(){
  const r=await fetch(LINK_URL+'?rt='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('link_'+r.status);const x=await r.json();if(x?.schema!=='GVAULT_GA_LIVE_BLOB_LINK_V1')throw new Error('link_schema');link=x;openChannel(x.sync?.broadcastChannel||'gvault-ga-blob-v1');window.GVAULT_GA_BLOB_LINK_V2=x;return x;
}
async function pollState(){
  try{
    if(!link)await loadLink();
    const url=link.sync?.stateUrl||DEFAULT_STATE_URL;
    const r=await fetch(url+(url.includes('?')?'&':'?')+'rt='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('state_'+r.status);
    const x=await r.json();if(x?.schema!=='GVAULT_GA_EVOLUTION_STATE_V1')throw new Error('state_schema');
    const changed=!remoteState||x.revision!==remoteState.revision||x.updatedAt!==remoteState.updatedAt;remoteState=x;
    if(changed){applyEnvelope(x);window.GVAULT_GA_REMOTE_EVOLUTION=x;window.dispatchEvent(new CustomEvent('gvault:ga-remote-evolution',{detail:x}));publish('blob-state-seen',{revision:x.revision,updatedAt:x.updatedAt},'bridge')}
    stateEl.classList.remove('error');stateEl.textContent='BLOB ↔ GA · R'+String(x.revision??'?');
    if(blobInfo)blobInfo.innerHTML='Blob : <code>'+safeText(link.blobId,120)+'</code><br>Mode : <code>'+safeText(link.mode,120)+'</code><br>Évolution : <code>bidirectionnelle runtime</code><br>Révision : <code>'+safeText(x.revision,40)+'</code>';
  }catch(e){stateEl.classList.add('error');stateEl.textContent='BLOB ↔ GA · DÉGRADÉ';stateEl.title=String(e?.message||e)}
  clearTimeout(pollTimer);pollTimer=setTimeout(pollState,Math.max(1000,Number(link?.sync?.pollMs)||2000));
}
window.addEventListener('gvault:ga-blob-sync',()=>{scheduleSnapshot('head-sync')});
window.addEventListener('storage',e=>{if(e.key===RUNTIME_KEY&&e.newValue){try{const data=JSON.parse(e.newValue);if(data.source!=='GA')applyEnvelope(data)}catch{}}});
view.addEventListener('load',()=>{attachObserver();if(remoteState)applyEnvelope(remoteState)});
window.GVAULT_GA_BLOB_BUS=Object.freeze({
  snapshot,
  publish:(kind='manual',payload={})=>publish(kind,payload),
  push:(patches,source='external-blob')=>{const envelope={schema:'GVAULT_GA_BLOB_COMMAND_V1',targetBlobId:'blob:public:ga:v1',source,updatedAt:now(),patches:Array.isArray(patches)?patches:[]};const applied=applyEnvelope(envelope);if(applied)publish('blob-command-applied',{source,patchCount:envelope.patches.length},'bridge');return applied},
  get remote(){return remoteState},
  get link(){return link}
});
attachObserver();void pollState();
})();
