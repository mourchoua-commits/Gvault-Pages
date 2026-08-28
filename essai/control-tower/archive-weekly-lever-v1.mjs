const KEY='gvault.controlTower.archiveWeekly.v1';
const WEEK_MS=7*24*60*60*1000;
const CHECK_MS=15*60*1000;
const $=s=>document.querySelector(s);
const iso=t=>t?new Date(t).toISOString():null;
function now(){return Date.now()}
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function write(patch){const next={schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_STATE_V1',version:1,periodMs:WEEK_MS,...read(),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(next));return next}
function dueAt(s=read()){const base=Date.parse(s.lastSuccessfulCheckAt||s.armedAt||0);return Number.isFinite(base)&&base>0?base+WEEK_MS:0}
function isDue(t=now(),s=read()){const d=dueAt(s);return !d||t>=d}
async function run(reason='SCHEDULED',force=false){
 const startedAt=new Date().toISOString(),previous=read();
 if(!force&&!isDue(Date.now(),previous))return {status:'NOT_DUE',nextDueAt:iso(dueAt(previous))};
 write({status:'RUNNING',lastAttemptAt:startedAt,lastReason:reason});
 let replay={status:'NO_LOCAL_QRSPRITE'};
 try{
  const api=window.GVAULT_CONTROL_TOWER_SOURCE_UPLOAD_V1;
  const session=!!window.GVAULT_PRIVATE_TOOL_SESSION_V1?.getState?.().active;
  const local=api?.getState?.()||null;
  if(local?.qrspriteKey){
   if(session&&typeof api.replay==='function')replay={status:'REPLAYED',result:await api.replay()};
   else replay={status:'LOCAL_QRSPRITE_PRESENT_SAS_INACTIVE',qrspriteKey:local.qrspriteKey,archiveKey:local.archiveKey||null};
  }
  const detail={schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_DUE_V1',reason,forced:force,at:new Date().toISOString(),localReplay:replay,preferredDeliverable:'control-tower-source-drop.json',authority:'PRIVATE_SOURCES_REMAIN_AUTHORITY'};
  window.dispatchEvent(new CustomEvent('gvault:control-tower-archive-weekly-due',{detail}));
  const state=write({status:'CHECKPOINT_OK_REFRESH_REQUESTED',lastSuccessfulCheckAt:detail.at,lastReplayStatus:replay.status,lastReplayAt:replay.status==='REPLAYED'?detail.at:(previous.lastReplayAt||null),lastRefreshRequestAt:detail.at,lastError:null});
  render();
  return {status:state.status,detail,state};
 }catch(e){
  const message=String(e?.message||e),at=new Date().toISOString();
  window.dispatchEvent(new CustomEvent('gvault:control-tower-archive-weekly-failed',{detail:{schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_FAILED_V1',reason,at,error:message}}));
  const state=write({status:'FAILED',lastError:message,lastFailureAt:at});render();return {status:'FAILED',error:message,state};
 }
}
function arm(){const s=read();if(!s.armedAt)write({armedAt:new Date().toISOString(),status:'ARMED'});render();return read()}
function forceTest(){return run('FORCED_TEST_NOW',true)}
function render(){
 ensureUi();const s=read(),d=dueAt(s),due=isDue(Date.now(),s),el=$('#ctawlState'),meta=$('#ctawlMeta');
 if(el){el.textContent=due?'DÛ / RATTRAPAGE':'ARMÉ';el.className='ctawlState '+(due?'warn':'ok')}
 if(meta)meta.textContent=`hebdo · dernier check ${s.lastSuccessfulCheckAt?new Date(s.lastSuccessfulCheckAt).toLocaleString():'jamais'} · prochain ${d?new Date(d).toLocaleString():'maintenant'} · replay ${s.lastReplayStatus||'—'} · ${s.status||'INIT'}`;
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
function catchup(){if(document.visibilityState!=='hidden'&&isDue())run('OPEN_OR_VISIBLE_CATCHUP',false)}
arm();
catchup();
setInterval(catchup,CHECK_MS);
window.addEventListener('focus',catchup);
document.addEventListener('visibilitychange',catchup);
window.addEventListener('online',catchup);
window.GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_V1',periodMs:WEEK_MS,run,forceTest,isDue,getState:()=>({...read(),nextDueAt:iso(dueAt(read()))})});
