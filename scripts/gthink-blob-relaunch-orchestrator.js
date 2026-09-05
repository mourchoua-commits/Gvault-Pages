(()=>{'use strict';
const SCHEMA='GTHINK_BLOB_RELAUNCH_ORCHESTRATOR_V1_ALL_COMPATIBLE';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const BASE=new URL('.',document.currentScript?.src||location.href);
const TIMEOUT_MS=6500;
const PROBE_MS=1800;
let running=null,lastRun=null,privateWorker=null,privateWorkerReady=false;

const modules=Object.freeze([
  ['gvault-agent-live-blob','gvault-agent-live-blob.js?v=7','GVAULT_AGENT_LIVE_BLOB'],
  ['gvault-blob-uri','gvault-blob-uri.js?v=1','GVAULT_BLOB_URI'],
  ['gvault-pre-sas-vfs','gvault-pre-sas-vfs.js?v=1','GVAULT_PRE_SAS_VFS'],
  ['gvault-routing-fabric','gvault-routing-fabric.js?v=1','GVAULT_ROUTING_FABRIC'],
  ['gvault-stream-listener-blobs','gvault-stream-listener-blobs.js?v=1','GVAULT_STREAM_LISTENER_BLOBS'],
  ['gthink-literal-blob-layer','gthink-literal-blob-layer.js?v=1','GTHINK_LITERAL_BLOB_LAYER'],
  ['gthink-mini-listener-swarm','gthink-mini-listener-swarm.js?v=2','GTHINK_MINI_LISTENER_SWARM'],
  ['gthink-page-prelistener-mesh','gthink-page-prelistener-mesh.js?v=1','GTHINK_PAGE_PRELISTENER_MESH'],
  ['gthink-prelistener-stream-blob','gthink-prelistener-stream-blob.js?v=6','GTHINK_PRELISTENER_STREAM_BLOB'],
  ['gthink-chat-hold-before-prelistener','gthink-chat-hold-before-prelistener.js?v=1','GTHINK_CHAT_HOLD_BEFORE_PRELISTENER'],
  ['gthink-page-transport-core','gthink-page-transport-core.js?v=3','GVAULT_PUBLIC_PAGE_TRANSPORT_CORE'],
  ['gthink-page-transport-organ','gthink-page-transport-organ.js?v=1','GVAULT_PUBLIC_PAGE_TRANSPORT_ORGAN'],
  ['gthink-public-native-engine-core','gthink-public-native-engine-core.js?v=1','GTHINK_PUBLIC_NATIVE_ENGINE_CORE'],
  ['gthink-public-native-engine','gthink-public-native-engine.js?v=2','GTHINK_PUBLIC_NATIVE_ENGINE'],
  ['gthink-secondary-conversation-bridge','gthink-secondary-conversation-bridge.js?v=1','GTHINK_SECONDARY_CONVERSATION_BRIDGE'],
  ['gthink-dual-kernel-router-v4','gthink-dual-kernel-router-v4.js?v=4','GTHINK_DUAL_KERNEL_ROUTER'],
  ['gthink-public-responder','gthink-public-responder.js?v=17','GTHINK_PUBLIC_RESPONDER'],
  ['gthink-public-full-method-router','gthink-public-full-method-router.js?v=1','GTHINK_PUBLIC_FULL_METHOD_ROUTER'],
  ['gthink-public-test-intent-router','gthink-public-test-intent-router.js?v=1','GTHINK_PUBLIC_TEST_INTENT_ROUTER'],
  ['gthink-dual-heart-probe','gthink-dual-heart-probe.js?v=2','GTHINK_DUAL_HEART_PROBE'],
  ['gthink-tri-heart-tether','gthink-tri-heart-tether.js?v=1','GTHINK_TRI_HEART_TETHER'],
  ['gthink-throughput-guard','gthink-throughput-guard.js?v=2','GTHINK_THROUGHPUT_GUARD'],
  ['gthink-turn-relay','gthink-turn-relay.js?v=1','GTHINK_TURN_RELAY'],
  ['gthink-response-word-flow','gthink-response-word-flow.js?v=2','GTHINK_RESPONSE_WORD_FLOW'],
  ['gthink-ui-blob-dissector','gthink-ui-blob-dissector.js?v=1','GTHINK_UI_BLOB_DISSECTOR'],
  ['gthink-blob-dynamics','gthink-blob-dynamics.js?v=2','GTHINK_BLOB_DYNAMICS'],
  ['gthink-blob-runtime','gthink-blob-runtime.js?v=1','GTHINK_BLOB_RUNTIME'],
  ['gthink-blob-image-pipe','gthink-blob-image-pipe.js?v=1','GTHINK_BLOB_IMAGE_PIPE'],
  ['gthink-blob-image-adapter','gthink-blob-image-adapter.js?v=1','GTHINK_BLOB_IMAGE_ADAPTER'],
  ['gthink-local-image-renderer','gthink-local-image-renderer.js?v=1','GTHINK_LOCAL_IMAGE_RENDERER'],
  ['gthink-five-blob-burst','gthink-five-blob-burst.js?v=1',null],
  ['gthink-blob-turrets','gthink-blob-turrets.js?v=1','GTHINK_BLOB_TURRETS'],
  ['gthink-provider-blob','gthink-provider-blob.js?v=1','GTHINK_PROVIDER_BLOB'],
  ['gthink-ping-pong-alter-ego-loop','gthink-ping-pong-alter-ego-loop.js?v=3','GTHINK_PING_PONG_ALTER_EGO'],
  ['gvault-person-blob','gvault-person-blob.js?v=3','GVAULT_PERSON_BLOB'],
  ['gvault-input-relay','gvault-input-relay.js?v=1','GVAULT_INPUT_RELAY'],
  ['gvault-private-ubiquity','gvault-private-ubiquity.js?v=1','GVAULT_PRIVATE_UBIQUITY'],
  ['gvault-public-agent-conversation','gvault-public-agent-conversation.js?v=1','GVAULT_PUBLIC_AGENT_CONVERSATION'],
  ['gvault-public-image-bridge','gvault-public-image-bridge.js?v=1','GVAULT_PUBLIC_IMAGE_BRIDGE'],
  ['gvault-public-page-blob','gvault-public-page-blob.js?v=1','GVAULT_PUBLIC_PAGE_BLOB'],
  ['gvault-public-triple-geyser','gvault-public-triple-geyser.js?v=1','GVAULT_PUBLIC_TRIPLE_GEYSER'],
  ['gthink-gvault-theme-selector','gthink-gvault-theme-selector.js?v=2','GTHINK_GVAULT_THEME_SELECTOR']
].map(([id,src,global])=>Object.freeze({id,src,global})));

const notParallel=Object.freeze([
  {id:'gthink-dual-kernel-router-legacy',src:'gthink-dual-kernel-router.js',state:'SUPERSEDED',reason:'v4 is the active compatible router'},
  {id:'gthink-client-private-worker',src:'gthink-client-private-worker.js?v=2',state:'WORKER',reason:'started as Worker, never as a DOM script'},
  {id:'gthink-public-conversation-sim.test',src:'gthink-public-conversation-sim.test.cjs',state:'TEST_ONLY'},
  {id:'gthink-public-test-intent-sim.test',src:'gthink-public-test-intent-sim.test.cjs',state:'TEST_ONLY'},
  {id:'build-control-tower-commit-capsule',src:'build-control-tower-commit-capsule.mjs',state:'BUILD_ONLY'},
  {id:'gforge-public-profile-source-build',src:'gforge-public-profile-source-build.mjs',state:'BUILD_ONLY'},
  {id:'gforge-source-tour',src:'gforge-source-tour.mjs',state:'BUILD_ONLY'},
  {id:'gvault-unify-git-changelog',src:'gvault-unify-git-changelog.mjs',state:'BUILD_ONLY'}
]);

function api(){return window.GVAULT_AGENT_LIVE_BLOB||null}
function clean(v){return String(v??'').trim()}
function now(){return new Date().toISOString()}
function hasGlobal(name){return !!name&&typeof window[name]!=='undefined'}
function scriptPath(src){try{return new URL(src,BASE).pathname}catch{return src}}
function existingScript(src){const path=scriptPath(src);return [...document.scripts].find(s=>{try{return new URL(s.src,location.href).pathname===path}catch{return false}})||null}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function emit(kind,payload={}){const a=api();if(!a?.speak)return null;try{return a.speak({schema:BLOB_SCHEMA,kind,role:'orchestrator',from:'GThinkBlobRelaunch',to:'public.bus',intent:'relaunch_all_compatible_blobs',language:'fr',surface:'Gvault-Pages',payload:{schema:SCHEMA,...payload},understoodBy:['GThink','public-kernel','blob-runtime','routing-fabric','qa'],silent:true,muted:false})}catch{return null}}
async function waitProbe(entry,ms=PROBE_MS){if(!entry.global)return true;const started=Date.now();while(Date.now()-started<ms){if(hasGlobal(entry.global))return true;await sleep(25)}return hasGlobal(entry.global)}
async function loadModule(entry){
  const started=performance.now();
  if(entry.global&&hasGlobal(entry.global))return {id:entry.id,state:'ACTIVE_ALREADY',global:entry.global,elapsedMs:0};
  const old=existingScript(entry.src);
  if(old){if(!entry.global)return {id:entry.id,state:'LOADED_EXISTING_SELF_EXECUTING',global:null,elapsedMs:Number((performance.now()-started).toFixed(1))};const probed=await waitProbe(entry);return {id:entry.id,state:probed?'ACTIVE_EXISTING':'LOADED_EXISTING_UNPROVEN',global:entry.global,elapsedMs:Number((performance.now()-started).toFixed(1))};}
  const result=await new Promise(resolve=>{
    const s=document.createElement('script');let settled=false;
    const finish=(state,error=null)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({state,error})};
    const timer=setTimeout(()=>finish('LOAD_TIMEOUT','timeout'),TIMEOUT_MS);
    s.src=new URL(entry.src,BASE).href;s.async=false;s.dataset.gthinkRelaunch=entry.id;
    s.onload=()=>finish('LOADED');s.onerror=()=>finish('LOAD_ERROR','script_error');
    (document.head||document.documentElement).appendChild(s);
  });
  const probed=result.state==='LOADED'&&entry.global?await waitProbe(entry):false;
  const state=result.state==='LOADED'?(!entry.global?'LOADED_SELF_EXECUTING':probed?'ACTIVE':'LOADED_UNPROBED'):result.state;
  return {id:entry.id,state,global:entry.global,error:result.error||null,elapsedMs:Number((performance.now()-started).toFixed(1))};
}
async function launchPrivateWorker(){
  const started=performance.now();
  try{
    if(!privateWorker)privateWorker=new Worker(new URL('gthink-client-private-worker.js?v=2',BASE),{name:'GThinkClientPrivateWorker'});
    if(privateWorkerReady)return {id:'gthink-client-private-worker',state:'ACTIVE_ALREADY',elapsedMs:0};
    const id='relaunch-ping-'+Date.now().toString(36);
    const pong=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(new Error('worker_ping_timeout'))},4000);
      const onMessage=e=>{if(e.data?.type==='pong'&&e.data?.id===id){cleanup();resolve(e.data)}};
      const onError=e=>{cleanup();reject(new Error(clean(e?.message)||'worker_error'))};
      const cleanup=()=>{clearTimeout(timer);privateWorker?.removeEventListener('message',onMessage);privateWorker?.removeEventListener('error',onError)};
      privateWorker.addEventListener('message',onMessage);privateWorker.addEventListener('error',onError);privateWorker.postMessage({type:'ping',id});
    });
    privateWorkerReady=pong?.ready===true;
    return {id:'gthink-client-private-worker',state:privateWorkerReady?'ACTIVE':'UNPROVEN',schema:pong?.schema||null,elapsedMs:Number((performance.now()-started).toFixed(1))};
  }catch(e){return {id:'gthink-client-private-worker',state:'LOAD_ERROR',error:clean(e?.message||e),elapsedMs:Number((performance.now()-started).toFixed(1))}}
}
async function wakeExposedApis(){
  const actions=[];
  const call=async(id,fn)=>{try{const value=await fn();actions.push({id,state:'CALLED',value:value&&typeof value==='object'?{schema:value.schema||null,ready:value.ready??null,active:value.active??null,configured:value.configured??null}:null})}catch(e){actions.push({id,state:'CALL_ERROR',error:clean(e?.message||e)})}};
  if(window.GTHINK_PING_PONG_ALTER_EGO?.start)await call('gthink-ping-pong-alter-ego.start',()=>window.GTHINK_PING_PONG_ALTER_EGO.start());
  if(window.GTHINK_PUBLIC_RESPONDER?.syncConnection)await call('gthink-public-responder.syncConnection',()=>window.GTHINK_PUBLIC_RESPONDER.syncConnection());
  if(window.GVAULT_AGENT_LIVE_BLOB?.reloadKernel)await call('gvault-agent-live-blob.reloadKernel',()=>window.GVAULT_AGENT_LIVE_BLOB.reloadKernel());
  if(window.GVAULT_AGENT_LIVE_BLOB?.reloadConfig)await call('gvault-agent-live-blob.reloadConfig',()=>window.GVAULT_AGENT_LIVE_BLOB.reloadConfig());
  if(window.GVAULT_AGENT_LIVE_BLOB?.probeResponder)await call('gvault-agent-live-blob.probeResponder',()=>window.GVAULT_AGENT_LIVE_BLOB.probeResponder());
  if(window.GTHINK_DUAL_HEART_PROBE?.status)await call('gthink-dual-heart-probe.status',()=>window.GTHINK_DUAL_HEART_PROBE.status());
  return actions;
}
async function relaunchAll(){
  if(running)return running;
  running=(async()=>{
    const startedAt=now(),t0=performance.now(),results=[];
    emit('gthink.relaunch.start',{startedAt,moduleCount:modules.length,workerCount:1,policy:'ALL_COMPATIBLE_NO_LEGACY_DUPLICATE'});
    for(const entry of modules){const r=await loadModule(entry);results.push(r);emit('gthink.relaunch.module',{...r});}
    const worker=await launchPrivateWorker();results.push(worker);emit('gthink.relaunch.module',{...worker});
    const actions=await wakeExposedApis();
    const failed=results.filter(x=>/ERROR|TIMEOUT/.test(x.state));
    const unproven=results.filter(x=>/UNPROVEN/.test(x.state));
    const active=results.filter(x=>/^ACTIVE/.test(x.state)||/SELF_EXECUTING$/.test(x.state)).length;
    const summary={schema:SCHEMA,startedAt,completedAt:now(),elapsedMs:Number((performance.now()-t0).toFixed(1)),requested:modules.length+1,active,failed:failed.length,unproven:unproven.length,results,actions,notParallel,legacyDuplicatesStarted:false,testFilesStarted:false,buildFilesStarted:false,scope:'Gvault-Pages browser runtime while the page is open'};
    lastRun=Object.freeze(summary);
    emit('gthink.relaunch.complete',{requested:summary.requested,active,failed:failed.length,unproven:unproven.length,completedAt:summary.completedAt});
    try{window.dispatchEvent(new CustomEvent('gthink:blob-relaunch-complete',{detail:lastRun}))}catch{}
    return lastRun;
  })().finally(()=>{running=null});
  return running;
}
function status(){return {schema:SCHEMA,running:!!running,lastRun,modules:modules.map(x=>x.id),notParallel,privateWorkerReady}}
function stopPrivateWorker(){try{privateWorker?.terminate()}catch{}privateWorker=null;privateWorkerReady=false;return status()}
window.GTHINK_BLOB_RELAUNCH=Object.freeze({schema:SCHEMA,relaunchAll,status,stopPrivateWorker,get lastRun(){return lastRun}});
queueMicrotask(()=>void relaunchAll());
})();
