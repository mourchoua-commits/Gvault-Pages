(()=>{'use strict';
const SCHEMA='GVAULT_ROUTING_FABRIC_V1';
const VERSION=8;
const PRIVATE_POLICY='EXPLICIT_DECLASSIFICATION_V1';
const PUBLIC_STREAM='gvault://blobs/public/gthink/stream';
const FLOW_POLICY=Object.freeze({startupQueue:'DRAIN_ON_GEYSER_READY',startupHardCap:null,applicationRateLimit:null,overflowStrategy:'BLOB_FRAGMENTATION',legacyCapsBlobified:true});
const flowBacklog=[];
function clean(v){return String(v??'').trim()}
function words(v){return clean(v).toLowerCase()}
function classify(input={}){
 const kind=words(input.kind||input.type),intent=words(input.intent||input.payload?.intent),surface=words(input.surface),role=words(input.role),destination=words(input.destination||input.to),hint=words(input.routeHint||input.payload?.routeHint);
 const meta=[kind,intent,surface,role,destination,hint].join(' ');
 if(kind==='gateway.response'||(kind==='utterance'&&role==='gthink')||destination==='public-ui'||intent==='reply'||intent.startsWith('reply_'))return 'public.ui';
 if(/\b(gadmin|admin|administration)\b/.test([hint,intent,surface,destination].join(' ')))return 'private.gadmin';
 if(/\b(control[- ]?tower|diagnostic|debug|maintenance|checkpoint|build|rapport-technique)\b/.test([hint,intent,surface,destination].join(' ')))return 'private.control-tower';
 if(/\b(capture|archive|input[- ]?relay|public[- ]?input|datapassiv)\b/.test([hint,intent,surface,destination].join(' ')))return 'private.capture';
 if(kind==='gateway.request'||intent==='interpret_and_reply'||role==='user'||destination==='gthink'||destination==='private.gthink'||hint==='gthink'||hint==='conversation')return 'private.gthink';
 if(/\b(render|public-ui|display)\b/.test(meta))return 'public.ui';
 if(/\b(blob|stream|bus|relay|signal)\b/.test(meta))return 'public.blob-stream';
 if(/\b(project|projet|navigation|page|module|app)\b/.test(meta))return 'public.local';
 return 'public.bus';
}
function privateHint(v=''){return /gadmin|control[-_ ]?tower|private-tool|private-catalog|\/private\/|sas/i.test(String(v))}
function sourceFor(url){return /(^|\.)github\.com$|(^|\.)githubusercontent\.com$|(^|\.)githubapis\.com$|^api\.github\.com$/i.test(url.hostname)?'github-public':url.origin===location.origin?'same-origin-public':'external-public'}
function deliverFlow(detail){
 try{
  if(window.GVAULT_PUBLIC_TRIPLE_GEYSER?.publish){window.GVAULT_PUBLIC_TRIPLE_GEYSER.publish(detail);return true}
  if(window.GVAULT_PUBLIC_TRIPLE_GEYSER?.ingest){window.GVAULT_PUBLIC_TRIPLE_GEYSER.ingest(detail);return true}
  flowBacklog.push(detail);return false;
 }catch{return false}
}
function flushFlows(){const g=window.GVAULT_PUBLIC_TRIPLE_GEYSER;if(!g)return;for(const x of flowBacklog.splice(0))try{g.publish?g.publish(x):g.ingest?.(x)}catch{}}
function emitNetworkFlow(urlLike,{method='GET',initiatorType='fetch',source=null}={}){
 try{
  const url=new URL(String(urlLike||''),location.href);if(privateHint(url.pathname))return false;
  return deliverFlow({kind:'public.network.ingress',intent:'transform_and_push_outward',surface:'public-network',role:'network',destination:'public.outward',routeHint:source||sourceFor(url),primary:'public.bus',source:source||sourceFor(url),method:String(method).toUpperCase(),origin:url.origin,path:url.pathname,initiatorType:String(initiatorType||'network'),valve:'FULL_OPEN',applicationRateLimit:null,flowPolicy:FLOW_POLICY,at:new Date().toISOString()});
 }catch{return false}
}
function emitFlowRoute(input,primary){
 try{
  if(!input||typeof input!=='object'||typeof input.blobId==='string'||input.schema==='GVAULT_UNIVERSAL_BLOB_V1')return;
  const surface=clean(input.surface),destination=clean(input.destination||input.to),routeHint=clean(input.routeHint||input.payload?.routeHint),hint=[surface,destination,routeHint].join(' ');
  if(privateHint(hint))return;
  deliverFlow({kind:clean(input.kind||input.type)||'public.ingress',intent:clean(input.intent||input.payload?.intent)||null,surface:surface||'public',role:clean(input.role)||null,destination:destination||primary,routeHint:routeHint||null,primary,source:'routing-fabric',valve:'FULL_OPEN',applicationRateLimit:null,flowPolicy:FLOW_POLICY,at:new Date().toISOString()});
 }catch{}
}
function emitServiceWorkerIngress(d={}){
 if(d.schema!=='GVAULT_SW_EVENT_V1'||d.type!=='PUBLIC_FLOW_INGRESS')return;
 const hint=[d.origin,d.path,d.source,d.destination].join(' ');if(privateHint(hint))return;
 try{emitNetworkFlow(`${d.origin||location.origin}${d.path||'/'}`,{method:d.method||'GET',initiatorType:d.destination||d.mode||'service-worker',source:d.source||'public-network'})}catch{}
}
function installFetchObserver(){
 try{
  const current=window.fetch;if(typeof current!=='function'||current.__gvaultRoutingFlowObserver)return;
  const native=current.bind(window);const wrapped=async function(input,init){try{const raw=typeof input==='string'?input:String(input?.url||''),method=String(init?.method||input?.method||'GET');emitNetworkFlow(raw,{method,initiatorType:'fetch'})}catch{}return native(input,init)};
  Object.defineProperty(wrapped,'__gvaultRoutingFlowObserver',{value:true});window.fetch=wrapped;
 }catch{}
}
function installResourceObserver(){
 try{
  if(!('PerformanceObserver' in window))return;
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())emitNetworkFlow(entry.name,{method:'GET',initiatorType:entry.initiatorType||entry.entryType||'resource'})});
  observer.observe({type:'resource',buffered:true});
  emitNetworkFlow(location.href,{method:'GET',initiatorType:'navigation'});
 }catch{}
}
function plan(input={},opts={}){
 const primary=opts.destination||classify(input),routes=[];
 const add=(id,mode,reason,guard=null)=>{if(!routes.some(x=>x.id===id))routes.push({id,mode,reason,guard})};
 if(primary==='private.gthink'){
  add('private.capture','sidecar','archive explicit public user input','EXPLICIT_INPUT_ONLY');
  add('private.gthink','primary','interpret and answer in private plane','PRIVATE_BRIDGE_OR_AUTONOMOUS_WORKER');
  add('public.ui','return','render only authorized public release',PRIVATE_POLICY);
 }else if(primary==='private.capture'){
  add('private.capture','primary','store explicit public input privately','EXPLICIT_INPUT_ONLY');
  add('public.bus','ack','publish state/receipt only','NO_PRIVATE_CONTENT');
 }else if(primary==='private.gadmin')add('private.gadmin','primary','administration surface','LIVE_SAS_REQUIRED');
 else if(primary==='private.control-tower')add('private.control-tower','primary','diagnostic and maintenance surface','LIVE_SAS_REQUIRED');
 else if(primary==='public.ui')add('public.ui','primary','visible response surface',PRIVATE_POLICY);
 else if(primary==='public.blob-stream')add('public.blob-stream','primary','shared public coordination bus','NO_SECRET_PAYLOAD');
 else if(primary==='public.local')add('public.local','primary','same-origin public project/module route','PUBLIC_ONLY');
 else add('public.bus','primary','unclassified public event','NO_PRIVILEGE_ESCALATION');
 emitFlowRoute(input,primary);
 return Object.freeze({schema:SCHEMA,version:VERSION,primary,routes:Object.freeze(routes),privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,flowPolicy:FLOW_POLICY,privateContentPublished:false,createdAt:new Date().toISOString(),source:{kind:clean(input.kind||input.type)||null,intent:clean(input.intent||input.payload?.intent)||null,surface:clean(input.surface)||null,role:clean(input.role)||null,destination:clean(input.destination||input.to)||null,routeHint:clean(input.routeHint||input.payload?.routeHint)||null}})
}
function describe(input,opts){const p=plan(input,opts);return {schema:SCHEMA,version:VERSION,primary:p.primary,routeIds:p.routes.map(x=>x.id),privatePolicy:p.privatePolicy,flowPolicy:FLOW_POLICY,privateContentPublished:false}}
window.GVAULT_ROUTING_FABRIC=Object.freeze({schema:SCHEMA,version:VERSION,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,valve:'FULL_OPEN',applicationRateLimit:null,flowPolicy:FLOW_POLICY,classify,plan,describe,deliverFlow,emitNetworkFlow,status:()=>({version:VERSION,valve:'FULL_OPEN',applicationRateLimit:null,flowPolicy:FLOW_POLICY,startupQueued:flowBacklog.length})});
try{window.dispatchEvent(new CustomEvent('gvault:routing-fabric-ready',{detail:{schema:SCHEMA,version:VERSION,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,valve:'FULL_OPEN',applicationRateLimit:null,flowPolicy:FLOW_POLICY,privateContentPublished:false}}))}catch{}
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',e=>emitServiceWorkerIngress(e.data||{}));
function loadTripleGeyser(){if(window.GVAULT_PUBLIC_TRIPLE_GEYSER){flushFlows();return}if(document.querySelector('script[data-gvault-triple-geyser]'))return;const s=document.createElement('script');s.src='./scripts/gvault-public-triple-geyser.js?v=4';s.async=false;s.setAttribute('data-gvault-triple-geyser','V4');s.onload=flushFlows;s.onerror=()=>console.warn('GVAULT triple geyser unavailable');(document.head||document.documentElement).appendChild(s)}
loadTripleGeyser();installFetchObserver();installResourceObserver();
})();