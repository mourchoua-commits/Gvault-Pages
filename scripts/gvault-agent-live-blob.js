(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V4';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const DOM_EVENT='gvault:blob';
const LEGACY_EVENT='gvault:blob:signal';
const CHANNEL='gvault.public.blobs.v2';
const LEGACY_CHANNEL='gvault.public.blobs.v1';
const SCRIPT_URL=document.currentScript?.src||location.href;
const SCRIPT_BASE=new URL('.',SCRIPT_URL);
const CONFIG_URL=new URL('gvault-agent-gateway.json',SCRIPT_BASE).href;
const KERNEL_URL=new URL('../blobs/public/gthink-controller-kernel-v1.json',SCRIPT_BASE).href;
const PROTOCOL_URL=new URL('../blobs/public/gthink-universal-blob-protocol-v1.json',SCRIPT_BASE).href;
const CHAT_PATH='/api/vault/chat';
const HISTORY_MAX=12;
const SIGNAL_HISTORY_MAX=128;
const rootNativeFetch=window.fetch.bind(window);
const boundWindows=new WeakSet(),boundFrames=new WeakSet();
const signalHistory=[];
let config=null,configAt=0,kernel=null,kernelAt=0,history=[];
let channel=null,legacyChannel=null;
try{channel=new BroadcastChannel(CHANNEL)}catch{}
try{legacyChannel=new BroadcastChannel(LEGACY_CHANNEL)}catch{}

function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function sessionId(){
 let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}
 if(!id){id=uid('gas');try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}
 return id;
}
function clean(v){return String(v||'').replace(/\/+$/,'')}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function normalizeIntent(v,fallback='observe'){const s=String(v||'').trim();return s||fallback}
function makeBlob(kind,payload={},parentBlobId=null,meta={}){
 const role=meta.role||'system';
 const blob=Object.freeze({
  schema:BLOB_SCHEMA,
  blobId:meta.blobId||uid('gblob'),
  parentBlobId:parentBlobId||null,
  conversationId:meta.conversationId||sessionId(),
  kind:String(kind||'state'),
  role,
  from:meta.from||role,
  to:meta.to||'public.bus',
  intent:normalizeIntent(meta.intent,kind==='utterance'?'communicate':'observe'),
  language:meta.language||'fr',
  at:new Date().toISOString(),
  surface:'Gvault-Pages',
  text:typeof meta.text==='string'?meta.text:typeof payload?.text==='string'?payload.text:undefined,
  display:typeof meta.display==='string'?meta.display:typeof payload?.text==='string'?payload.text:undefined,
  chroma:meta.chroma||payload?.chroma||null,
  understoodBy:meta.understoodBy||['GThink','public-kernel','gateway-adapter','public-ui'],
  silent:meta.silent!==false,
  muted:false,
  payload
 });
 return blob;
}
function emitBlob(blob){
 signalHistory.push(blob);if(signalHistory.length>SIGNAL_HISTORY_MAX)signalHistory.splice(0,signalHistory.length-SIGNAL_HISTORY_MAX);
 try{window.dispatchEvent(new CustomEvent(DOM_EVENT,{detail:blob}))}catch{}
 try{window.dispatchEvent(new CustomEvent(LEGACY_EVENT,{detail:blob}))}catch{}
 try{channel?.postMessage(blob)}catch{}
 try{legacyChannel?.postMessage(blob)}catch{}
 return blob;
}
function signal(kind,payload={},parentBlobId=null,meta={}){return emitBlob(makeBlob(kind,payload,parentBlobId,meta))}
function responseAccepted(data){return data?.schema==='GVAULT_AGENT_CHAT_RESPONSE_V1'||data?.schema==='GVAULT_AGENT_CHAT_RESPONSE_V2'}
function remoteReply(data){return data?.blob||data?.pair?.responseBlob||null}
function remoteText(data){return String(data?.text||remoteReply(data)?.text||remoteReply(data)?.display||'').trim()}
function replyChroma(data){return remoteReply(data)?.chroma||null}
function streamReply(text,parentBlobId,chroma=null){
 const chars=Array.from(String(text||''));let i=0;
 signal('state',{state:'rendering',length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'render_reply'});
 const step=()=>{
  if(i>=chars.length){signal('render.done',{length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'finish_render',chroma});return}
  const remaining=chars.length-i;
  const burst=Math.max(1,Math.min(4,Math.ceil(remaining/120)));
  let piece='';for(let n=0;n<burst&&i<chars.length;n++)piece+=chars[i++];
  signal('render.delta',{chars:piece,index:i,length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'append_characters',chroma});
  requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}
async function loadConfig(force=false){
 if(!force&&config&&Date.now()-configAt<30000)return config;
 try{
  const r=await rootNativeFetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!r.ok)throw new Error('CONFIG_HTTP_'+r.status);
  const c=await r.json();if(c?.schema!=='GVAULT_AGENT_GATEWAY_CONFIG_V1')throw new Error('CONFIG_SCHEMA');
  config=c;configAt=Date.now();if(c.baseUrl)window.GVAULT_INGRESS_BASE_URL=clean(c.baseUrl);
  signal('gateway.state',{status:c.status||null,configured:!!c.baseUrl,model:c.model||null,baseUrl:c.baseUrl||null},null,{role:'gateway',from:'gateway-config',to:'public-kernel',intent:'announce_gateway_state'});
  return c;
 }catch(e){
  config={schema:'GVAULT_AGENT_GATEWAY_CONFIG_V1',status:'UNAVAILABLE',baseUrl:null,error:String(e?.message||e)};configAt=Date.now();
  signal('gateway.state',{status:'UNAVAILABLE',configured:false,error:config.error},null,{role:'gateway',from:'gateway-config',to:'public-kernel',intent:'announce_gateway_state'});
  return config;
 }
}
async function loadKernel(force=false){
 if(!force&&kernel&&Date.now()-kernelAt<30000)return kernel;
 try{
  const r=await rootNativeFetch(KERNEL_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!r.ok)throw new Error('KERNEL_HTTP_'+r.status);
  const k=await r.json();if(k?.schema!=='GVAULT_PUBLIC_CONTROLLER_KERNEL/1')throw new Error('KERNEL_SCHEMA');
  kernel=k;kernelAt=Date.now();
  signal('kernel.state',{status:'READY',blobId:k.blobId||null,route:k.routing?.defaultRoute||null,privateControllerIsAuthoritative:k.authority?.privateControllerIsAuthoritative===true},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_kernel_state'});
  return k;
 }catch(e){
  kernel={schema:'GVAULT_PUBLIC_CONTROLLER_KERNEL/1',status:'UNAVAILABLE',error:String(e?.message||e)};kernelAt=Date.now();
  signal('kernel.state',{status:'UNAVAILABLE',error:kernel.error},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_kernel_state'});
  return kernel;
 }
}
function kernelEnvelope(k){
 if(!k||k.status==='UNAVAILABLE')return null;
 return {schema:k.schema,blobId:k.blobId||null,route:k.routing?.defaultRoute||null,privateControllerIsAuthoritative:k.authority?.privateControllerIsAuthoritative===true};
}
async function endpoint(){
 const direct=clean(window.GVAULT_AGENT_CHAT_ENDPOINT||'');if(direct)return direct;
 const base=clean(window.GVAULT_INGRESS_BASE_URL||'');if(base)return base+CHAT_PATH;
 const c=await loadConfig();return c?.baseUrl?clean(c.baseUrl)+CHAT_PATH:null;
}
function remember(role,content){if(!content)return;history.push({role,content:String(content)});if(history.length>HISTORY_MAX)history=history.slice(-HISTORY_MAX)}
function exposeResponse(data){
 const reply=remoteReply(data),text=remoteText(data);if(!text&&!reply)return;
 for(const root of [document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch{return null}}).filter(Boolean)]){
  try{
   const a=root.querySelector('[data-blob-agent-side]'),b=root.querySelector('[data-blob-other-side]');
   if(a)a.textContent=text||reply?.agentSide?.display||'';
   if(b&&reply?.otherSide)b.textContent=reply.otherSide.display||'';
  }catch{}
 }
}
function emitReply(data,requestBlob){
 const text=remoteText(data);if(!text)return null;
 const source=remoteReply(data);
 const reply=signal('utterance',{text,model:data?.model||null,correlationId:data?.correlationId||null,remoteBlob:source},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public-ui',intent:'reply',text,chroma:replyChroma(data)});
 exposeResponse(data);streamReply(text,reply.blobId,reply.chroma);return reply;
}
async function ask(message,{historyOverride=null}={}){
 message=String(message??'').trim();
 const requestBlob=signal('utterance',{text:message,messageBytes:new TextEncoder().encode(message).byteLength},null,{role:'user',from:'public.user',to:'GThink',intent:'interpret_and_reply',text:message});
 if(!message){const out={ok:false,error:'empty_message'};signal('error',out,requestBlob.blobId,{role:'system',from:'public-kernel',to:'public-ui',intent:'report_error'});return out}
 signal('state',{state:'interpreting'},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public-ui',intent:'announce_state'});
 const [ep,k]=await Promise.all([endpoint(),loadKernel()]);if(!ep){const out={ok:false,error:'gateway_pending'};signal('error',out,requestBlob.blobId,{role:'gateway',from:'gateway-adapter',to:'public-ui',intent:'report_error'});return out}
 const prior=Array.isArray(historyOverride)?historyOverride:history.slice(-HISTORY_MAX);
 let r;
 try{r=await rootNativeFetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,blob:requestBlob,sessionId:sessionId(),history:prior,controllerKernel:kernelEnvelope(k),blobProtocol:BLOB_SCHEMA}),cache:'no-store',credentials:'omit'})}
 catch(e){const out={ok:false,error:'network_error',detail:String(e?.message||e)};signal('error',out,requestBlob.blobId,{role:'gateway',from:'gateway-adapter',to:'public-ui',intent:'report_error'});return out}
 let data=null;try{data=await r.json()}catch{}
 if(!r.ok||!responseAccepted(data)){
  const out={ok:false,error:data?.error||`HTTP_${r.status}`,detail:data?.detail||null};signal('error',out,requestBlob.blobId,{role:'gateway',from:'gateway-adapter',to:'public-ui',intent:'report_error'});return out;
 }
 const text=remoteText(data);if(!text){const out={ok:false,error:'empty_gthink_response'};signal('error',out,requestBlob.blobId,{role:'gthink',from:'GThink',to:'public-ui',intent:'report_error'});return out}
 remember('user',message);remember('assistant',text);const reply=emitReply(data,requestBlob);
 signal('state',{state:'reply_emitted',replyBlobId:reply?.blobId||null},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public.bus',intent:'announce_state'});
 return {...data,ok:data?.ok!==false,text,universalRequestBlob:requestBlob,universalReplyBlob:reply};
}
function bindWindow(w){
 if(!w||boundWindows.has(w))return;boundWindows.add(w);
 let native;try{native=w.fetch.bind(w)}catch{return}
 w.fetch=async function(input,init){
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(method!=='POST'||!isChatUrl(input,w))return native(input,init);
  const [ep,k]=await Promise.all([endpoint(),loadKernel()]);if(!ep)return native(input,init);
  let body={};try{body=typeof init?.body==='string'?JSON.parse(init.body):{}}catch{}
  const message=typeof body?.message==='string'?body.message:'';if(!message.trim())return native(input,init);
  const requestBlob=body?.blob?.schema===BLOB_SCHEMA?body.blob:signal('utterance',{text:message,messageBytes:new TextEncoder().encode(message).byteLength},null,{role:'user',from:'public.user',to:'GThink',intent:'interpret_and_reply',text:message});
  const nextBody={...body,message,blob:requestBlob,blobProtocol:BLOB_SCHEMA,sessionId:body.sessionId||sessionId(),history:Array.isArray(body.history)?body.history:history.slice(-HISTORY_MAX),controllerKernel:kernelEnvelope(k)};
  const response=await native(ep,{...init,method:'POST',headers:{...(init?.headers||{}),'content-type':'application/json'},body:JSON.stringify(nextBody),cache:'no-store',credentials:'omit'});
  try{
   const data=await response.clone().json();
   if(response.ok&&responseAccepted(data)){
    const text=remoteText(data);remember('user',message);remember('assistant',text);emitReply(data,requestBlob);
   }else signal('error',{error:data?.error||`HTTP_${response.status}`},requestBlob.blobId,{role:'gateway',from:'gateway-adapter',to:'public-ui',intent:'report_error'});
  }catch{signal('error',{error:'response_unreadable'},requestBlob.blobId,{role:'gateway',from:'gateway-adapter',to:'public-ui',intent:'report_error'})}
  return response;
 };
}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow);signal('state',{frameId:frame.id||null,state:'listener_bound'},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_state'})}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}
function listen(handler,{kinds=null,roles=null}={}){
 if(typeof handler!=='function')throw new TypeError('listener_function_required');
 const kindSet=Array.isArray(kinds)?new Set(kinds):null,roleSet=Array.isArray(roles)?new Set(roles):null;
 const wrapped=e=>{const b=e.detail;if(kindSet&&!kindSet.has(b?.kind))return;if(roleSet&&!roleSet.has(b?.role))return;handler(b)};
 window.addEventListener(DOM_EVENT,wrapped);
 return ()=>window.removeEventListener(DOM_EVENT,wrapped);
}
function hearLast(n=12){return signalHistory.slice(-Math.max(1,Math.min(SIGNAL_HISTORY_MAX,Number(n)||12)))}
function speak(blobLike){
 if(blobLike?.schema===BLOB_SCHEMA)return emitBlob(Object.freeze({...blobLike,blobId:blobLike.blobId||uid('gblob'),conversationId:blobLike.conversationId||sessionId(),at:blobLike.at||new Date().toISOString(),surface:blobLike.surface||'Gvault-Pages'}));
 return signal(blobLike?.kind||'state',blobLike?.payload||{},blobLike?.parentBlobId||null,blobLike||{});
}

bindWindow(window);scanFrames();
new MutationObserver(scanFrames).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('online',()=>{void loadConfig(true);void loadKernel(true)});
void loadKernel();void loadConfig();
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({
 schema:SCHEMA,blobSchema:BLOB_SCHEMA,ask,speak,listen,hearLast,
 reloadConfig:()=>loadConfig(true),reloadKernel:()=>loadKernel(true),
 status:async()=>{const [c,k]=await Promise.all([loadConfig(),loadKernel()]);return {configured:!!(await endpoint()),config:c,kernel:kernelEnvelope(k),historyItems:history.length,signalItems:signalHistory.length,sessionId:sessionId(),bus:DOM_EVENT,legacyBus:LEGACY_EVENT,broadcastChannel:CHANNEL,legacyBroadcastChannel:LEGACY_CHANNEL,protocolUrl:PROTOCOL_URL}}
});
signal('state',{state:'listener_ready',bus:DOM_EVENT,broadcastChannel:CHANNEL,protocolUrl:PROTOCOL_URL},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_ready'});
})();
