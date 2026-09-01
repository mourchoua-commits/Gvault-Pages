(()=>{'use strict';
const SCHEMA='GTHINK_NIGHT_OPS_TEAM_RUNTIME_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const TEAM='gthink-night-listener-incidents-2026-09-01';
const CHANNELS=['gvault.public.blobs.v2','gvault.public.blobs.v1'];
const REQUEST_TIMEOUT_MS=3500;
const AUDIT_EVERY_MS=10000;
const ISSUE_COOLDOWN_MS=15000;
const startedAt=Date.now();
const pending=new Map();
const incidents=[];
const passes=[];
const recentIssueAt=new Map();
let lastListenerReadyAt=0,lastProbeAt=0,lastGatewayState=null,lastSnapshot=null,auditTimer=null;
function uid(prefix='opsblob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function now(){return new Date().toISOString()}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function emit(kind,payload={},severity='info',source='supervisor'){
  const a=api();
  const blob={schema:BLOB_SCHEMA,blobId:uid('gthink-ops'),parentBlobId:null,conversationId:TEAM,kind,role:'diagnostic',from:`gthink-ops:${source}`,to:'GThink',intent:'diagnose_public_gthink',language:'fr',at:now(),surface:'Gvault-Pages',streamUrl:a?.streamUrl||'gvault://blobs/public/gthink/stream',text:payload.message||kind,payload:{teamId:TEAM,severity,...payload},understoodBy:['GThink','gthink-ops-supervisor','public-ui'],silent:true,muted:false};
  try{a?.speak?.(blob)}catch{}
  try{window.dispatchEvent(new CustomEvent('gthink:ops',{detail:blob}))}catch{}
  return blob;
}
function recordIssue(code,message,evidence={},source='supervisor'){
  const key=code+':'+JSON.stringify(evidence);
  const t=Date.now(),prev=recentIssueAt.get(key)||0;
  if(t-prev<ISSUE_COOLDOWN_MS)return null;
  recentIssueAt.set(key,t);
  const rec={at:now(),code,message,evidence,source};
  incidents.push(rec);if(incidents.length>120)incidents.splice(0,incidents.length-120);
  emit('diagnostic.issue',rec,'warning',source);
  return rec;
}
function recordPass(check,evidence={},source='regression-runner'){
  const rec={at:now(),check,evidence,source};passes.push(rec);if(passes.length>80)passes.splice(0,passes.length-80);return rec;
}
function loadedScripts(){return [...document.scripts].map(s=>s.src).filter(Boolean)}
function scriptVersionCheck(){
  const srcs=loadedScripts();
  const expected=[
    {name:'bus',re:/\/gvault-agent-live-blob\.js\?v=6(?:&|$)/},
    {name:'responder',re:/\/gthink-public-responder\.js\?v=2(?:&|$)/},
    {name:'person',re:/\/gvault-person-blob\.js\?v=2(?:&|$)/}
  ];
  const missing=expected.filter(x=>!srcs.some(s=>x.re.test(s))).map(x=>x.name);
  if(missing.length)recordIssue('STALE_SCRIPT_CACHE','Les versions attendues des scripts GThink ne sont pas toutes chargées.',{missing,srcs:srcs.filter(s=>/gthink|gvault-agent|gvault-person/.test(s))},'cache-scout');
  else recordPass('SCRIPT_VERSIONS',{expected:'bus=v6,responder=v2,person=v2'},'cache-scout');
  return {ok:missing.length===0,missing,srcs};
}
async function channelLoopback(name){
  if(typeof BroadcastChannel!=='function')return {ok:false,error:'BroadcastChannel unavailable'};
  const token=uid('canary');
  return new Promise(resolve=>{
    let tx,rx,done=false;
    const finish=result=>{if(done)return;done=true;try{tx?.close()}catch{}try{rx?.close()}catch{}resolve(result)};
    try{
      tx=new BroadcastChannel(name);rx=new BroadcastChannel(name);
      rx.onmessage=e=>{if(e.data?.schema==='GTHINK_CHANNEL_CANARY_V1'&&e.data?.token===token)finish({ok:true,name})};
      tx.postMessage({schema:'GTHINK_CHANNEL_CANARY_V1',token,at:now()});
      setTimeout(()=>finish({ok:false,name,error:'loopback_timeout'}),900);
    }catch(e){finish({ok:false,name,error:String(e?.message||e)})}
  });
}
async function channelCheck(){
  const results=await Promise.all(CHANNELS.map(channelLoopback));
  const failed=results.filter(x=>!x.ok);
  if(failed.length)recordIssue('BROADCAST_CHANNEL_GAP','Au moins un canal blob ne boucle pas correctement dans ce navigateur.',{results},'channel-bridge');
  else recordPass('BROADCAST_CHANNEL_LOOPBACK',{channels:CHANNELS},'channel-bridge');
  return {ok:failed.length===0,results};
}
function uiStateCheck(status){
  const visible=String(document.getElementById('status')?.textContent||'');
  const state=document.body?.dataset?.state||'';
  const saysReady=/GThink écoute/i.test(visible)||state==='ready';
  const mismatch=!!status?.responderReady!==saysReady;
  if(mismatch)recordIssue('UI_RUNTIME_STATE_MISMATCH','L’état visible du listener contredit l’état réel du bus.',{visible,state,responderReady:!!status?.responderReady,transportReady:!!status?.transportReady},'ui-state-auditor');
  else recordPass('UI_RUNTIME_STATE',{visible,state,responderReady:!!status?.responderReady},'ui-state-auditor');
  return {ok:!mismatch,visible,state};
}
function pendingCheck(){
  const t=Date.now();
  const stuck=[];
  for(const [id,rec] of pending){
    const age=t-rec.at;
    if(age>REQUEST_TIMEOUT_MS){stuck.push({blobId:id,ageMs:age,message:rec.message});recordIssue('LOCAL_RESPONSE_NOT_RESOLVED','Une gateway.request reste sans gateway.response corrélée.',{requestBlobId:id,ageMs:age},'pending-loopback')}
  }
  return {ok:stuck.length===0,stuck,pending:pending.size};
}
async function listenerCheck(status){
  const ready=!!status?.responderReady;
  if(!ready){
    try{api()?.probeResponder?.();lastProbeAt=Date.now()}catch{}
    recordIssue('LISTENER_NOT_READY','Le bus ne considère pas GThink comme listener actif.',{lastListenerReadyAt:lastListenerReadyAt?new Date(lastListenerReadyAt).toISOString():null,lastProbeAt:lastProbeAt?new Date(lastProbeAt).toISOString():null},'listener-sentinel');
  }else recordPass('LISTENER_READY',{lastListenerReadyAt:lastListenerReadyAt?new Date(lastListenerReadyAt).toISOString():null},'listener-sentinel');
  return {ok:ready,lastListenerReadyAt,lastProbeAt};
}
async function snapshot(){
  let status=null,statusError=null;
  try{status=await api()?.status?.()}catch(e){statusError=String(e?.message||e)}
  const snap={schema:'GTHINK_NIGHT_OPS_SNAPSHOT_V1',teamId:TEAM,at:now(),uptimeMs:Date.now()-startedAt,status,statusError,lastListenerReadyAt:lastListenerReadyAt?new Date(lastListenerReadyAt).toISOString():null,lastGatewayState,pendingRequests:[...pending].map(([blobId,r])=>({blobId,ageMs:Date.now()-r.at,message:r.message})),incidentCount:incidents.length,lastIncidents:incidents.slice(-8),scriptVersions:scriptVersionCheck()};
  lastSnapshot=snap;emit('diagnostic.snapshot',snap,status?.responderReady?'info':'warning','supervisor');return snap;
}
async function runAudit({channels=false}={}){
  let status=null;
  try{status=await api()?.status?.()}catch(e){recordIssue('BUS_STATUS_UNAVAILABLE','Impossible de lire l’état du bus blob.',{error:String(e?.message||e)},'supervisor')}
  const listener=await listenerCheck(status||{});
  const ui=uiStateCheck(status||{});
  const waiting=pendingCheck();
  const scripts=scriptVersionCheck();
  const channel=channels?await channelCheck():null;
  const result={schema:'GTHINK_NIGHT_OPS_AUDIT_V1',at:now(),listener,ui,waiting,scripts,channel,ok:listener.ok&&ui.ok&&waiting.ok&&scripts.ok&&(channel?channel.ok:true)};
  emit(result.ok?'diagnostic.pass':'diagnostic.issue',{message:result.ok?'Audit GThink Night Ops PASS':'Audit GThink Night Ops a détecté un problème.',audit:result},result.ok?'info':'warning','regression-runner');
  return result;
}
async function runSelfTest(){return runAudit({channels:true})}
function onBlob(e){
  const b=e?.detail;
  if(!b||b.schema!==BLOB_SCHEMA||String(b.kind||'').startsWith('diagnostic.'))return;
  if(b.kind==='gthink.listener.ready')lastListenerReadyAt=Date.now();
  if(b.kind==='gateway.probe')lastProbeAt=Date.now();
  if(b.kind==='gateway.state')lastGatewayState={at:b.at,payload:b.payload};
  if(b.kind==='gateway.request')pending.set(b.blobId,{at:Date.now(),message:String(b.payload?.message||b.text||'').slice(0,180),conversationId:b.conversationId});
  if(b.kind==='gateway.response'||(b.kind==='utterance'&&b.role==='gthink')){
    const refs=[b.parentBlobId,b.payload?.requestBlobId].filter(Boolean);
    for(const ref of refs)pending.delete(ref);
  }
  if(b.kind==='error'){
    const ref=b.parentBlobId||b.payload?.requestBlobId;if(ref)pending.delete(ref);
    recordIssue('GTHINK_STREAM_ERROR','Le stream a émis un blob error.',{error:b.payload?.error||b.text||'unknown',parentBlobId:b.parentBlobId||null},'supervisor');
  }
}
function start(){
  if(window.GTHINK_NIGHT_OPS?.schema===SCHEMA)return;
  window.addEventListener('gvault:blob',onBlob);
  auditTimer=setInterval(()=>void runAudit(),AUDIT_EVERY_MS);
  window.GTHINK_NIGHT_OPS=Object.freeze({schema:SCHEMA,teamId:TEAM,get lastSnapshot(){return lastSnapshot},get incidents(){return incidents.slice()},get passes(){return passes.slice()},snapshot,runAudit,runSelfTest,stop:()=>{clearInterval(auditTimer);window.removeEventListener('gvault:blob',onBlob)}});
  emit('diagnostic.team.ready',{message:'Équipe de blobs GThink Night Ops active.',members:['listener-sentinel','pending-loopback','channel-bridge','cache-scout','ui-state-auditor','regression-runner','supervisor']},'info','supervisor');
  void runSelfTest();
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
