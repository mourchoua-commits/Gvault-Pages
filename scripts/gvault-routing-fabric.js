(()=>{'use strict';
const SCHEMA='GVAULT_ROUTING_FABRIC_V1';
const PRIVATE_POLICY='EXPLICIT_DECLASSIFICATION_V1';
const PUBLIC_STREAM='gvault://blobs/public/gthink/stream';
function clean(v){return String(v??'').trim()}
function words(v){return clean(v).toLowerCase()}
function classify(input={}){
 const kind=words(input.kind||input.type),intent=words(input.intent||input.payload?.intent),surface=words(input.surface),role=words(input.role),destination=words(input.destination||input.to),text=words(input.text||input.payload?.message||input.payload?.text);
 const hay=[kind,intent,surface,role,destination,text].join(' ');
 if(/\b(gadmin|admin|administration)\b/.test(hay))return 'private.gadmin';
 if(/\b(control[- ]?tower|diagnostic|debug|maintenance|checkpoint|build|rapport technique)\b/.test(hay))return 'private.control-tower';
 if(/\b(capture|archive|input[- ]?relay|public[- ]?input|datapassiv)\b/.test(hay))return 'private.capture';
 if(kind==='gateway.request'||intent==='interpret_and_reply'||/\b(gthink|assistant|conversation|chat|question|demande)\b/.test(hay))return 'private.gthink';
 if(/\b(render|public-ui|ui|display|utterance.*gthink|gateway.response)\b/.test(hay))return 'public.ui';
 if(/\b(blob|stream|bus|relay|signal)\b/.test(hay))return 'public.blob-stream';
 if(/\b(project|projet|navigation|page|module|app)\b/.test(hay))return 'public.local';
 return 'public.bus';
}
function plan(input={},opts={}){
 const primary=classify(input),routes=[];
 const add=(id,mode,reason,guard=null)=>{if(!routes.some(x=>x.id===id))routes.push({id,mode,reason,guard})};
 if(primary==='private.gthink'){
  add('private.capture','sidecar','archive explicit public user input','EXPLICIT_INPUT_ONLY');
  add('private.gthink','primary','interpret and answer in private plane','PRIVATE_BRIDGE');
  add('public.ui','return','render only explicitly declassified response',PRIVATE_POLICY);
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
 return Object.freeze({schema:SCHEMA,primary,routes:Object.freeze(routes),privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,privateContentPublished:false,createdAt:new Date().toISOString(),source:{kind:clean(input.kind||input.type)||null,intent:clean(input.intent||input.payload?.intent)||null,surface:clean(input.surface)||null,role:clean(input.role)||null}})
}
function describe(input){const p=plan(input);return {schema:SCHEMA,primary:p.primary,routeIds:p.routes.map(x=>x.id),privatePolicy:p.privatePolicy,privateContentPublished:false}}
window.GVAULT_ROUTING_FABRIC=Object.freeze({schema:SCHEMA,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,classify,plan,describe});
try{window.dispatchEvent(new CustomEvent('gvault:routing-fabric-ready',{detail:{schema:SCHEMA,privatePolicy:PRIVATE_POLICY,publicStream:PUBLIC_STREAM,privateContentPublished:false}}))}catch{}
})();
