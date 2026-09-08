(()=>{'use strict';
const SCHEMA='GTHINK_MODEL_RUNTIME_V0';
const VERSION='0.1.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const CORE_URL=new URL('gthink-model-conductor-v0.js?v=1',SCRIPT_BASE).href;
const TOOLBUS_URL=new URL('gthink-universal-tool-bus.js?v=1',SCRIPT_BASE).href;
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=2',SCRIPT_BASE).href;
const TRACE_KEY='gvault.gthink.model.trace.v0';
const TRACE_LIMIT=24;
let readyPromise=null,conductor=null;
function clean(v){return String(v??'').trim()}
function loadGlobal(url,attr,test){return new Promise(resolve=>{if(test())return resolve(test());const existing=document.querySelector(`script[${attr}]`);if(existing){const started=Date.now(),tick=()=>test()?resolve(test()):Date.now()-started>10000?resolve(null):setTimeout(tick,40);tick();return}const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.onload=()=>resolve(test()||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)})}
function readTraces(){try{const x=JSON.parse(sessionStorage.getItem(TRACE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function safeTrace(trace){if(!trace||typeof trace!=='object')return null;return{schema:trace.schema,taskId:trace.taskId,startedAt:trace.startedAt,completedAt:trace.completedAt,classification:trace.classification,route:trace.route,workforce:trace.workforce,toolCalls:trace.toolCalls,specialistRuns:Array.isArray(trace.specialistRuns)?trace.specialistRuns.map(x=>({specialist:x.specialist,ok:x.ok,provider:x.provider,model:x.model,webGrounded:x.webGrounded,toolCalls:x.toolCalls,error:x.error,sources:x.sources})):[],synthesis:trace.synthesis||null,counterproof:trace.counterproof||null,riskFlags:trace.riskFlags||[],provenanceRefs:trace.provenanceRefs||[],status:trace.status}}
function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`gthink-model-${crypto.randomUUID?.()||Date.now()}`,parentBlobId:null,conversationId:'gthink-model-v0',kind,role:'model',from:'GThinkModelRuntimeV0',to:'public.bus',intent:'compound_agentic_model',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,version:VERSION,...payload,containsSecret:false},understoodBy:['GThink','MethodRouter','ToolBus','ProviderFederation','Navigator'],silent:true,muted:false})}catch{}}
const persistence={append:async trace=>{const safe=safeTrace(trace);if(!safe)return;const arr=readTraces();arr.push(safe);if(arr.length>TRACE_LIMIT)arr.splice(0,arr.length-TRACE_LIMIT);try{sessionStorage.setItem(TRACE_KEY,JSON.stringify(arr))}catch{}emit('gthink.model.trace',{taskId:safe.taskId,status:safe.status,workforce:safe.workforce,riskFlags:safe.riskFlags,provenanceRefs:safe.provenanceRefs})}};
async function ready(){
 if(conductor)return conductor;if(readyPromise)return readyPromise;
 readyPromise=(async()=>{
  const [core,bus,fed]=await Promise.all([
   loadGlobal(CORE_URL,'data-gthink-model-core-v0',()=>window.GThinkModelConductorCore||null),
   loadGlobal(TOOLBUS_URL,'data-gthink-model-toolbus-v1',()=>window.GTHINK_UNIVERSAL_TOOL_BUS||null),
   loadGlobal(FEDERATION_URL,'data-gthink-model-federation-v2',()=>window.GTHINK_PROVIDER_FEDERATION||null)
  ]);
  if(!core?.GThinkModelConductor)return null;
  conductor=new core.GThinkModelConductor({toolBus:bus,provider:fed,persistence,maxFanout:4});
  emit('gthink.model.ready',{core:core.VERSION||null,toolBus:!!bus?.execute,provider:!!fed?.ask});
  return conductor;
 })().finally(()=>{readyPromise=null});
 return readyPromise;
}
async function ask(message,history=[],context={}){
 const c=await ready();if(!c)return{ok:false,error:'gthink_model_core_unavailable',schema:SCHEMA,version:VERSION};
 const q=clean(message);if(!q)return{ok:false,error:'empty_message',schema:SCHEMA,version:VERSION};
 emit('gthink.model.request',{messageLength:q.length,historyItems:Array.isArray(history)?history.length:0});
 const result=await c.run({message:q,history:Array.isArray(history)?history.slice(-14):[],context:{publicOnly:true,...context}});
 emit('gthink.model.response',{taskId:result?.taskId||null,ok:result?.ok===true,status:result?.safeState?.status||result?.error||null,confidence:result?.safeState?.confidence??null,workforce:result?.safeState?.workforce||[]});
 return result;
}
async function inspect(message,context={}){const c=await ready();return c?c.inspect(clean(message),{publicOnly:true,...context}):null}
async function status(){const c=await ready();let provider=null,toolBus=null;try{provider=await window.GTHINK_PROVIDER_FEDERATION?.status?.()}catch{}try{toolBus=await window.GTHINK_UNIVERSAL_TOOL_BUS?.status?.()}catch{}return{schema:SCHEMA,version:VERSION,ready:!!c,provider,toolBus,traces:readTraces().length,lastTrace:readTraces().slice(-1)[0]||null,containsSecret:false}}
async function shouldHandle(message,context={}){const plan=await inspect(message,context);if(!plan)return false;if(plan.classification?.simpleConversation)return false;return true}
function traces(){return readTraces()}
function lastTrace(){return readTraces().slice(-1)[0]||null}
function clearSessionTraces(){try{sessionStorage.removeItem(TRACE_KEY)}catch{}return true}
window.GTHINK_MODEL_RUNTIME_V0=Object.freeze({schema:SCHEMA,version:VERSION,ready,ask,inspect,status,shouldHandle,traces,lastTrace,clearSessionTraces,policy:Object.freeze({explicitUserIntentFirst:true,methodRouterCanonical:true,publicOnly:true,privateActionsRequireSecureRelay:true,hiddenReasoningExposed:false})});
void ready();
})();
