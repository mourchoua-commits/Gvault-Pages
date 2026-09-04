(()=>{'use strict';
const view=document.getElementById('view');
const stateEl=document.getElementById('state');
const blobInfo=document.getElementById('blobInfo');
if(!view||!stateEl)return;
const LINK_URL='../blob/public/ga/link.json';
const DEFAULT_STATE_URL='../blob/public/ga/state.json';
const DEFAULT_DATA_URL='../blob/public/ga/data.json';
const RUNTIME_KEY='gvault.ga.runtime.blob.v1';
const REV_KEY='gvault.ga.runtime.revision.v1';
let link=null,remoteState=null,visualData=null,applyingRemote=false,observer=null,pollTimer=0,rev=Number(localStorage.getItem(REV_KEY)||0)||0;
let channel=null;
function now(){return new Date().toISOString()}
function safeText(v,n=600){return String(v??'').slice(0,n)}
function currentRoute(){try{const u=new URL(view.src,location.href);return u.pathname+u.search}catch{return''}}
function valueAt(root,path){if(!path)return root;return String(path).split('.').reduce((v,k)=>v==null?undefined:v[k],root)}
function briefValue(value){
  if(value==null)return'';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return safeText(value,700);
  try{return safeText(JSON.stringify(value),700)}catch{return''}
}
function bindNode(el,key,kind,value){
  if(!el||!key)return false;
  el.setAttribute('data-ga-key',safeText(key,220));
  el.setAttribute('data-ga-kind',safeText(kind||'data',80));
  el.setAttribute('data-ga-source','blob:public:ga:visual-data:v1');
  el.setAttribute('data-ga-value',briefValue(value));
  el.setAttribute('data-ga-bound','true');
  return true;
}
function bindVisualData(d,graph){
  if(!d?.documentElement||!graph||graph.schema!=='GVAULT_GA_VISUAL_DATA_GRAPH_V1')return 0;
  const root=graph.data||{},rules=Array.isArray(graph.bindings)?graph.bindings:[],used=new Map();
  let bound=0;
  for(const rule of rules.slice(0,128)){
    let nodes=[];try{nodes=[...d.querySelectorAll(safeText(rule.selector,240))]}catch{continue}
    if(rule.key){
      const value=valueAt(root,rule.key);
      for(const el of nodes)if(bindNode(el,rule.key,rule.kind,value))bound++;
      continue;
    }
    if(!rule.arrayKey)continue;
    const raw=valueAt(root,rule.arrayKey);
    let items=[],objectMode=false;
    if(Array.isArray(raw))items=raw.map((value,index)=>({key:String(index),value,index}));
    else if(rule.objectEntries&&raw&&typeof raw==='object'){objectMode=true;items=Object.entries(raw).map(([key,value],index)=>({key,value,index}))}
    else continue;
    const taken=used.get(rule.arrayKey)||new Set();
    for(let ni=0;ni<nodes.length;ni++){
      const el=nodes[ni];
      const labelEl=rule.labelSelector?el.querySelector(safeText(rule.labelSelector,120)):el;
      const label=safeText(labelEl?.textContent?.replace(/\s+/g,' ').trim(),240);
      let chosen=null;
      if(rule.match==='text'||rule.labelField){
        for(const item of items){
          if(taken.has(item.index))continue;
          const candidate=rule.labelField&&item.value&&typeof item.value==='object'?item.value[rule.labelField]:item.value;
          if(safeText(candidate,240)===label){chosen=item;break}
        }
      }
      if(!chosen){
        const candidate=items.find(item=>!taken.has(item.index))||items[ni]||null;
        chosen=candidate;
      }
      if(!chosen)continue;
      taken.add(chosen.index);
      const key=objectMode?`${rule.arrayKey}.${chosen.key}`:`${rule.arrayKey}.${chosen.index}`;
      if(bindNode(el,key,rule.kind,chosen.value))bound++;
    }
    used.set(rule.arrayKey,taken);
  }
  d.documentElement.setAttribute('data-ga-data-blob',graph.blobId||'blob:public:ga:visual-data:v1');
  d.documentElement.setAttribute('data-ga-data-revision',String(graph.revision??'?'));
  d.documentElement.setAttribute('data-ga-bound-elements',String(bound));
  window.GVAULT_GA_VISUAL_DATA=graph;
  window.dispatchEvent(new CustomEvent('gvault:ga-visual-data',{detail:{revision:graph.revision,bound,blobId:graph.blobId}}));
  return bound;
}
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
    const statusLines=[...d.querySelectorAll('.statusline')].slice(0,24).map(row=>({label:safeText(row.querySelector('span')?.textContent?.trim(),100),value:safeText(row.querySelector('b')?.textContent?.trim(),180),key:row.dataset.gaKey||null}));
    const metrics=[...d.querySelectorAll('.metric')].slice(0,24).map(row=>({label:safeText(row.querySelector('span')?.textContent?.trim(),100),value:safeText(row.querySelector('b')?.textContent?.trim(),180),key:row.dataset.gaKey||null}));
    const events=[...d.querySelectorAll('.events')].slice(0,4).map(el=>safeText(el.textContent?.replace(/\s+/g,' ').trim(),1200));
    const boundKeys=[...d.querySelectorAll('[data-ga-key]')].slice(0,160).map(el=>el.getAttribute('data-ga-key'));
    return{route:currentRoute(),available:true,title:safeText(d.title,180),bodyClass:safeText(d.body?.className,240),dataRevision:visualData?.revision??null,boundElements:boundKeys.length,boundKeys,statusLines,metrics,events};
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
  if(p.type==='metric'){
    const label=safeText(p.label,100);for(const row of d.querySelectorAll('.metric')){if(row.querySelector('span')?.textContent?.trim()===label){const b=row.querySelector('b');if(b)b.textContent=safeText(p.value,180)}}return;
  }
  const selector=safeText(p.selector,220);if(!selector)return;
  let nodes=[];try{nodes=[...d.querySelectorAll(selector)].slice(0,64)}catch{return}
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
  try{const d=view.contentDocument;if(!d)return false;applyingRemote=true;for(const p of patches.slice(0,96))applyPatch(d,p);if(visualData)bindVisualData(d,visualData);requestAnimationFrame(()=>{applyingRemote=false;scheduleSnapshot('blob-apply')});return true}catch{applyingRemote=false;return false}
}
function openChannel(name){
  if(!('BroadcastChannel'in window))return;
  try{channel?.close();channel=new BroadcastChannel(name||'gvault-ga-blob-v1');channel.onmessage=e=>{const data=e.data;if(!data||data.source==='GA')return;if(data.targetBlobId&&data.targetBlobId!=='blob:public:ga:v1')return;if(applyEnvelope(data))stateEl.textContent='BLOB ↔ GA · LIVE'}}catch{}
}
async function loadLink(){
  const r=await fetch(LINK_URL+'?rt='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('link_'+r.status);const x=await r.json();if(x?.schema!=='GVAULT_GA_LIVE_BLOB_LINK_V1')throw new Error('link_schema');link=x;openChannel(x.sync?.broadcastChannel||'gvault-ga-blob-v1');window.GVAULT_GA_BLOB_LINK_V2=x;return x;
}
async function loadVisualData(){
  if(!link)await loadLink();
  const url=link.sync?.dataUrl||DEFAULT_DATA_URL;
  const r=await fetch(url+(url.includes('?')?'&':'?')+'rt='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('data_'+r.status);
  const x=await r.json();if(x?.schema!=='GVAULT_GA_VISUAL_DATA_GRAPH_V1')throw new Error('data_schema');
  const changed=!visualData||x.revision!==visualData.revision||x.updatedAt!==visualData.updatedAt;visualData=x;
  const d=view.contentDocument;const bound=d?bindVisualData(d,x):0;
  if(changed)publish('visual-data-seen',{revision:x.revision,updatedAt:x.updatedAt,bound},'bridge');
  return{graph:x,bound};
}
async function pollState(){
  try{
    if(!link)await loadLink();
    let dataBound=0;try{dataBound=(await loadVisualData()).bound}catch(e){console.warn('GA visual data degraded',e)}
    const url=link.sync?.stateUrl||DEFAULT_STATE_URL;
    const r=await fetch(url+(url.includes('?')?'&':'?')+'rt='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('state_'+r.status);
    const x=await r.json();if(x?.schema!=='GVAULT_GA_EVOLUTION_STATE_V1')throw new Error('state_schema');
    const changed=!remoteState||x.revision!==remoteState.revision||x.updatedAt!==remoteState.updatedAt;remoteState=x;
    if(changed){applyEnvelope(x);window.GVAULT_GA_REMOTE_EVOLUTION=x;window.dispatchEvent(new CustomEvent('gvault:ga-remote-evolution',{detail:x}));publish('blob-state-seen',{revision:x.revision,updatedAt:x.updatedAt},'bridge')}
    if(visualData&&view.contentDocument)dataBound=bindVisualData(view.contentDocument,visualData);
    stateEl.classList.remove('error');stateEl.textContent='DATA ↔ GA · R'+String(visualData?.revision??'?')+' · '+String(dataBound)+' LIENS';
    if(blobInfo)blobInfo.innerHTML='Blob : <code>'+safeText(link.blobId,120)+'</code><br>Données : <code>'+safeText(visualData?.blobId||'indisponible',160)+'</code><br>Mode : <code>'+safeText(link.mode,120)+'</code><br>Éléments liés : <code>'+String(dataBound)+'</code><br>État : <code>R'+safeText(x.revision,40)+'</code> · Données : <code>R'+safeText(visualData?.revision??'?',40)+'</code>';
  }catch(e){stateEl.classList.add('error');stateEl.textContent='BLOB ↔ GA · DÉGRADÉ';stateEl.title=String(e?.message||e)}
  clearTimeout(pollTimer);pollTimer=setTimeout(pollState,Math.max(1000,Number(link?.sync?.pollMs)||2000));
}
window.addEventListener('gvault:ga-blob-sync',()=>{if(visualData&&view.contentDocument)bindVisualData(view.contentDocument,visualData);scheduleSnapshot('head-sync')});
window.addEventListener('storage',e=>{if(e.key===RUNTIME_KEY&&e.newValue){try{const data=JSON.parse(e.newValue);if(data.source!=='GA')applyEnvelope(data)}catch{}}});
view.addEventListener('load',()=>{attachObserver();if(visualData)bindVisualData(view.contentDocument,visualData);if(remoteState)applyEnvelope(remoteState)});
window.GVAULT_GA_BLOB_BUS=Object.freeze({
  snapshot,
  publish:(kind='manual',payload={})=>publish(kind,payload),
  push:(patches,source='external-blob')=>{const envelope={schema:'GVAULT_GA_BLOB_COMMAND_V1',targetBlobId:'blob:public:ga:v1',source,updatedAt:now(),patches:Array.isArray(patches)?patches:[]};const applied=applyEnvelope(envelope);if(applied)publish('blob-command-applied',{source,patchCount:envelope.patches.length},'bridge');return applied},
  rebind:()=>visualData&&view.contentDocument?bindVisualData(view.contentDocument,visualData):0,
  get remote(){return remoteState},
  get data(){return visualData},
  get link(){return link}
});
attachObserver();void pollState();
})();
