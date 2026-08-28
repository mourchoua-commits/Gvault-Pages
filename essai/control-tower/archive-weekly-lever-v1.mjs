const KEY='gvault.controlTower.archiveWeekly.v1';
const WEEK_MS=7*24*60*60*1000;
const CHECK_MS=15*60*1000;
const RUN_LOCK_MS=2*60*1000;
const $=s=>document.querySelector(s);
const iso=t=>t?new Date(t).toISOString():null;
const now=()=>Date.now();
const activeSession=()=>!!window.GVAULT_PRIVATE_TOOL_SESSION_V1?.getState?.().active;
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function write(patch){const next={schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_STATE_V1',version:2,periodMs:WEEK_MS,...read(),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(next));return next}
function dueAt(s=read()){const base=Date.parse(s.lastCompletedAt||s.armedAt||0);return Number.isFinite(base)&&base>0?base+WEEK_MS:0}
function isDue(t=now(),s=read()){const d=dueAt(s);return !d||t>=d}
function runLocked(t=now(),s=read()){if(s.status!=='RUNNING'||!s.runStartedAt)return false;const started=Date.parse(s.runStartedAt);return Number.isFinite(started)&&t-started<RUN_LOCK_MS}
function runId(){return `ctawl:${Date.now()}:${Math.random().toString(36).slice(2,10)}`}
function waiting(reason,force){const at=new Date().toISOString();const state=write({status:'WAITING_FOR_SAS',lastAttemptAt:at,lastReason:reason,lastWaitingForSasAt:at,lastError:null});const detail={schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WAITING_FOR_SAS_V1',reason,forced:force,at,nextDueAt:iso(dueAt(state))};window.dispatchEvent(new CustomEvent('gvault:control-tower-archive-waiting-for-sas',{detail}));render();return {status:state.status,detail,state}}
async function run(reason='SCHEDULED',force=false){
 const previous=read();
 if(!force&&!isDue(Date.now(),previous))return {status:'NOT_DUE',nextDueAt:iso(dueAt(previous))};
 if(runLocked(Date.now(),previous))return {status:'ALREADY_RUNNING',runId:previous.runId||null,startedAt:previous.runStartedAt||null};
 if(!activeSession())return waiting(reason,force);
 const id=runId(),startedAt=new Date().toISOString();
 write({status:'RUNNING',runId:id,runStartedAt:startedAt,lastAttemptAt:startedAt,lastReason:reason,lastError:null});
 let replay={status:'NO_LOCAL_QRSPRITE'};
 try{
  const api=window.GVAULT_CONTROL_TOWER_SOURCE_UPLOAD_V1;
  const local=api?.getState?.()||null;
  if(local?.qrspriteKey&&typeof api.replay==='function')replay={status:'REPLAYED',result:await api.replay()};
  else if(local?.qrspriteKey)replay={status:'LOCAL_QRSPRITE_PRESENT_REPLAY_UNAVAILABLE',qrspriteKey:local.qrspriteKey,archiveKey:local.archiveKey||null};
  const completedAt=new Date().toISOString();
  const detail={schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_DUE_V2',runId:id,reason,forced:force,at:completedAt,sasActive:true,localReplay:replay,preferredDeliverable:'control-tower-source-drop.json',authority:'PRIVATE_SOURCES_REMAIN_AUTHORITY'};
  window.dispatchEvent(new CustomEvent('gvault:control-tower-archive-weekly-due',{detail}));
  const state=write({status:'CHECKPOINT_OK_REFRESH_REQUESTED',runId:id,runStartedAt:startedAt,lastCompletedAt:completedAt,lastSuccessfulCheckAt:completedAt,lastReplayStatus:replay.status,lastReplayAt:replay.status==='REPLAYED'?completedAt:(previous.lastReplayAt||null),lastRefreshRequestAt:completedAt,lastError:null});
  render();
  return {status:state.status,detail,state};
 }catch(e){
  const message=String(e?.message||e),at=new Date().toISOString();
  window.dispatchEvent(new CustomEvent('gvault:control-tower-archive-weekly-failed',{detail:{schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_FAILED_V2',runId:id,reason,at,error:message}}));
  const state=write({status:'FAILED',runId:id,lastError:message,lastFailureAt:at});render();return {status:'FAILED',error:message,state};
 }
}
function arm(){const s=read();if(!s.armedAt)write({armedAt:new Date().toISOString(),status:'ARMED'});render();return read()}
function forceTest(){return run('FORCED_TEST_NOW',true)}
function render(){
 ensureUi();const s=read(),d=dueAt(s),due=isDue(Date.now(),s),sas=activeSession(),el=$('#ctawlState'),meta=$('#ctawlMeta');
 if(el){
  if(s.status==='WAITING_FOR_SAS'){el.textContent='DÛ · ATTENTE SAS';el.className='ctawlState warn'}
  else if(s.status==='RUNNING'){el.textContent='EN COURS';el.className='ctawlState warn'}
  else {el.textContent=due?(sas?'DÛ · SAS PRÊT':'DÛ / RATTRAPAGE'):'ARMÉ';el.className='ctawlState '+(due?'warn':'ok')}
 }
 if(meta)meta.textContent=`hebdo · SAS ${sas?'ACTIF':'FERMÉ'} · dernier complet ${s.lastCompletedAt?new Date(s.lastCompletedAt).toLocaleString():'jamais'} · prochain ${d?new Date(d).toLocaleString():'maintenant'} · replay ${s.lastReplayStatus||'—'} · ${s.status||'INIT'}`;
}
function ensureUi(){
 if($('#ctArchiveWeeklyLever'))return;
 const anchor=$('#ctSourceUpload')||$('#ctSourcePromptGenerator')||$('#ctPulse')||document.querySelector('.kpis')||document.body;
 const n=document.createElement('section');n.id='ctArchiveWeeklyLever';
 n.innerHTML=`<style>#ctArchiveWeeklyLever{margin:0 10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);font:9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden}.ctawlHead{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:9px}.ctawlHead b{color:var(--accent);margin-right:auto}.ctawlHead button{min-height:44px}.ctawlState{color:var(--muted)}.ctawlState.ok{color:var(--ok)}.ctawlState.warn{color:var(--warn)}.ctawlMeta{padding:0 9px 9px;color:var(--muted);line-height:1.45}@media(max-width:620px){.ctawlHead button{flex:1;min-width:140px}}</style><div class="ctawlHead"><b>LEVIER ARCHIVE HEBDO</b><span id="ctawlState" class="ctawlState">INIT</span><button id="ctawlCheck">CHECK NOW</button><button id="ctawlTest">TEST NOW</button></div><div id="ctawlMeta" class="ctawlMeta"></div>`;
 anchor.insertAdjacentElement('afterend',n);
 $('#ctawlCheck').onclick=()=>run('MANUAL_CHECK',false);
 $('#ctawlTest').onclick=()=>forceTest();
}
function catchup(reason='OPEN_OR_VISIBLE_CATCHUP'){if(document.visibilityState!=='hidden'&&isDue())return run(reason,false);render();return Promise.resolve({status:'NOT_DUE'})}
function onSasActive(){write({lastSasObservedAt:new Date().toISOString()});if(isDue())return run('SAS_ACTIVE_CATCHUP',false);render();return Promise.resolve({status:'NOT_DUE'})}
arm();
catchup();
setInterval(()=>catchup('INTERVAL_CATCHUP'),CHECK_MS);
window.addEventListener('focus',()=>catchup('FOCUS_CATCHUP'));
document.addEventListener('visibilitychange',()=>catchup('VISIBILITY_CATCHUP'));
window.addEventListener('online',()=>catchup('ONLINE_CATCHUP'));
window.addEventListener('gvault:private-tool-session-active',onSasActive);
window.addEventListener('gvault:private-tool-session-expired',render);
window.GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_V2',periodMs:WEEK_MS,run,forceTest,isDue,onSasActive,getState:()=>({...read(),sasActive:activeSession(),nextDueAt:iso(dueAt(read()))})});
