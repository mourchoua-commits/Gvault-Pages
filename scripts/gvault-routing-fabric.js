(()=>{'use strict';
const SCHEMA='GVAULT_ROUTING_FABRIC_V1';
const VERSION=3;
const PRIVATE_POLICY='EXPLICIT_DECLASSIFICATION_V1';
const PUBLIC_STREAM='gvault://blobs/public/gthink/stream';
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
 }else if(primary==='private.gadmin'){
  add('private.gadmin','primary','administration surface','LIVE_SAS_REQUIRED');
 }else if(primary==='private.control-tower'){
  add('private.control-tower','primary','diagnostic and maintenance surface','LIVE_SAS_REQUIRED');
 }else if(primary==='public.ui'){
  add('public.ui','primary','visible response surface',PRIVATE_POLICY);
 }else if(primary==='public.blob-stream'){
  add('public.blob-stream','primary','shared public coordination bus','NO_SECRET_PAYLOAD');
 }else if(primary==='public.local'){
  add('public.local','primary','same-origin public project/module route','PUBLIC_ONLY');
 }else add('public.bus','primary','unclassified public event','NO_PRIVILEGE_ESCALATION');
 return Object.freeze({schema:SCHEMA,version:VERSION,primary,routes:Object.freeze(routes),privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,privateContentPublished:false,createdAt:new Date().toISOString(),source:{kind:clean(input.kind||input.type)||null,intent:clean(input.intent||input.payload?.intent)||null,surface:clean(input.surface)||null,role:clean(input.role)||null,destination:clean(input.destination||input.to)||null,routeHint:clean(input.routeHint||input.payload?.routeHint)||null}})
}
function describe(input,opts){const p=plan(input,opts);return {schema:SCHEMA,version:VERSION,primary:p.primary,routeIds:p.routes.map(x=>x.id),privatePolicy:p.privatePolicy,privateContentPublished:false}}
window.GVAULT_ROUTING_FABRIC=Object.freeze({schema:SCHEMA,version:VERSION,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,classify,plan,describe});
try{window.dispatchEvent(new CustomEvent('gvault:routing-fabric-ready',{detail:{schema:SCHEMA,version:VERSION,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,privateContentPublished:false}}))}catch{}
function loadTripleGeyser(){if(window.GVAULT_PUBLIC_TRIPLE_GEYSER||document.querySelector('script[data-gvault-triple-geyser]'))return;const s=document.createElement('script');s.src='./scripts/gvault-public-triple-geyser.js?v=1';s.async=false;s.setAttribute('data-gvault-triple-geyser','V1');s.onerror=()=>console.warn('GVAULT triple geyser unavailable');(document.head||document.documentElement).appendChild(s)}
loadTripleGeyser();
})();