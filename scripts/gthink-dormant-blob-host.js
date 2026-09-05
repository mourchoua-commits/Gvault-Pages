(()=>{'use strict';
const SCHEMA='GTHINK_DORMANT_BLOB_HOST_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const STORAGE_KEY='gvault.gthink.dormant.blob.host.v1';
const BASE=new URL('.',document.currentScript?.src||location.href);
const SW_URL=new URL('../gthink/gthink-dormant-blob-sw.js?v=1',BASE).href;
const SW_SCOPE=new URL('../gthink/',BASE).href;
let mode='BOOT',lastSleep=null,lastWake=null,lastCheckpoint=null,wakePromise=null,serviceWorkerState='UNPROVEN';
function api(){return window.GVAULT_AGENT_LIVE_BLOB||null}
function clean(v){return String(v??'').trim()}
function now(){return new Date().toISOString()}
function emit(kind,payload={}){const a=api();if(!a?.speak)return null;try{return a.speak({schema:BLOB_SCHEMA,kind,role:'dormant-host',from:'GThinkDormantBlobHost',to:'public.bus',intent:'hibernate_and_resume_blob_runtime',language:'fr',surface:'Gvault-Pages',payload:{schema:SCHEMA,...payload},understoodBy:['GThink','blob-runtime','relaunch-orchestrator','routing-fabric','service-worker'],silent:true,muted:false})}catch{return null}}
function parseCheckpoint(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function scriptUrls(){const set=new Set([location.href]);for(const s of document.scripts){try{const u=new URL(s.src,location.href);if(u.origin===location.origin&&u.src)set.add(u.href)}catch{}}return [...set]}
async function persist(reason,state=mode){
  const relaunch=window.GTHINK_BLOB_RELAUNCH?.status?.()||null;
  const checkpoint={schema:SCHEMA,state,reason:String(reason||'unspecified'),at:now(),page:{href:location.href,visibility:document.visibilityState,online:navigator.onLine},runtime:{relaunchRunning:!!relaunch?.running,privateWorkerReady:relaunch?.privateWorkerReady===true,moduleIds:Array.isArray(relaunch?.modules)?relaunch.modules:[],lastRunSummary:relaunch?.lastRun?{startedAt:relaunch.lastRun.startedAt||null,completedAt:relaunch.lastRun.completedAt||null,requested:relaunch.lastRun.requested??null,active:relaunch.lastRun.active??null,failed:relaunch.lastRun.failed??null,unproven:relaunch.lastRun.unproven??null}:null},resumeIntent:{relaunchAll:true,restartPingPong:true,reprobeResponder:true},backgroundExecutionWhileSuspendedClaimed:false,persistentHostClaimed:false};
  lastCheckpoint=checkpoint;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(checkpoint))}catch{}
  try{await window.GVAULT_PRE_SAS_VFS?.appendJson?.('runtime/dormant-blob-host/checkpoints.jsonl',checkpoint,{source:SCHEMA,appendOnly:true})}catch{}
  return checkpoint;
}
async function warmDormantCache(){
  if(!('serviceWorker' in navigator)){serviceWorkerState='UNAVAILABLE';return {state:serviceWorkerState}}
  try{
    const reg=await navigator.serviceWorker.register(SW_URL,{scope:SW_SCOPE});
    const ready=await navigator.serviceWorker.ready;
    const worker=ready.active||reg.active||reg.waiting||reg.installing;
    if(worker){worker.postMessage({type:'gvault.dormant.warm',urls:scriptUrls(),at:now()});serviceWorkerState='READY'}else serviceWorkerState='REGISTERED_UNPROVEN';
    return {state:serviceWorkerState,scope:ready.scope||reg.scope||SW_SCOPE}
  }catch(e){serviceWorkerState='ERROR';return {state:serviceWorkerState,error:clean(e?.message||e)}}
}
async function waitRelaunch(timeout=8000){const started=Date.now();while(Date.now()-started<timeout){if(window.GTHINK_BLOB_RELAUNCH?.relaunchAll)return window.GTHINK_BLOB_RELAUNCH;await new Promise(r=>setTimeout(r,40))}return null}
async function sleep(reason='visibility-hidden'){
  if(mode==='DORMANT')return lastCheckpoint||parseCheckpoint();
  mode='DORMANT';lastSleep=now();
  try{window.GTHINK_PING_PONG_ALTER_EGO?.stop?.()}catch{}
  try{window.GTHINK_BLOB_RELAUNCH?.stopPrivateWorker?.()}catch{}
  const checkpoint=await persist(reason,'DORMANT');
  emit('gthink.dormant.enter',{reason,lastSleep,checkpointAt:checkpoint.at,willRelaunchOnResume:true});
  void warmDormantCache();
  return checkpoint;
}
async function wake(reason='resume'){
  if(wakePromise)return wakePromise;
  wakePromise=(async()=>{
    mode='WAKING';const prior=parseCheckpoint();
    emit('gthink.dormant.wake.start',{reason,priorState:prior?.state||null,priorAt:prior?.at||null});
    const relaunch=await waitRelaunch();
    let relaunchResult=null,error=null;
    try{if(!relaunch?.relaunchAll)throw new Error('relaunch_orchestrator_unavailable');relaunchResult=await relaunch.relaunchAll()}catch(e){error=clean(e?.message||e)}
    if(!error){mode='ACTIVE';lastWake=now()}else mode='WAKE_ERROR';
    const checkpoint=await persist(reason,mode);
    void warmDormantCache();
    emit(error?'gthink.dormant.wake.error':'gthink.dormant.wake.complete',{reason,lastWake,error,relaunch:relaunchResult?{requested:relaunchResult.requested??null,active:relaunchResult.active??null,failed:relaunchResult.failed??null,unproven:relaunchResult.unproven??null}:null,checkpointAt:checkpoint.at});
    return {schema:SCHEMA,state:mode,error,relaunch:relaunchResult,checkpoint};
  })().finally(()=>{wakePromise=null});
  return wakePromise;
}
function status(){return {schema:SCHEMA,mode,lastSleep,lastWake,lastCheckpoint:lastCheckpoint||parseCheckpoint(),serviceWorkerState,visibility:document.visibilityState,online:navigator.onLine,backgroundExecutionWhileSuspendedClaimed:false,persistentHostClaimed:false}}
function bind(){
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void sleep('visibility-hidden');else void wake('visibility-visible')});
  window.addEventListener('pagehide',()=>void sleep('pagehide'));
  window.addEventListener('pageshow',()=>void wake('pageshow'));
  window.addEventListener('focus',()=>void wake('focus'));
  window.addEventListener('online',()=>void wake('online'));
  window.addEventListener('freeze',()=>void sleep('freeze'));
  window.addEventListener('resume',()=>void wake('resume'));
}
window.GTHINK_DORMANT_BLOB_HOST=Object.freeze({schema:SCHEMA,sleep,wake,status,warmDormantCache,checkpoint:()=>persist('manual-checkpoint',mode)});
bind();
queueMicrotask(()=>{void warmDormantCache();void wake('boot')});
})();
