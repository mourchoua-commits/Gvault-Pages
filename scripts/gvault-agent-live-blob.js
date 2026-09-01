(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V5';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const DOM_EVENT='gvault:blob';
const LEGACY_EVENT='gvault:blob:signal';
const CHANNEL='gvault.public.blobs.v2';
const LEGACY_CHANNEL='gvault.public.blobs.v1';
const STREAM_URL='gvault://blobs/public/gthink/stream';
const SCRIPT_URL=document.currentScript?.src||location.href;
const SCRIPT_BASE=new URL('.',SCRIPT_URL);
const CONFIG_URL=new URL('gvault-agent-gateway.json',SCRIPT_BASE).href;
const KERNEL_URL=new URL('../blobs/public/gthink-controller-kernel-v1.json',SCRIPT_BASE).href;
const PROTOCOL_URL=new URL('../blobs/public/gthink-universal-blob-protocol-v1.json',SCRIPT_BASE).href;
const CHAT_PATH='/api/vault/chat';
const HISTORY_MAX=12;
const SIGNAL_HISTORY_MAX=128;
const WAIT_MS=45000;
const rootNativeFetch=window.fetch.bind(window);
const signalHistory=[],seen=new Set(),pending=new Map(),boundWindows=new WeakSet(),boundFrames=new WeakSet();
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
function normalizeIntent(v,fallback='observe'){const s=String(v||'').trim();return s||fallback}
function makeBlob(kind,payload={},parentBlobId=null,meta={}){
 const role=meta.role||'system';
 return Object.freeze({
  schema:BLOB_SCHEMA,blobId:meta.blobId||uid('gblob'),parentBlobId:parentBlobId||null,
  conversationId:meta.conversationId||sessionId(),kind:String(kind||'state'),role,
  from:meta.from||role,to:meta.to||'public.bus',intent:normalizeIntent(meta.intent,kind==='utterance'?'communicate':'observe'),
  language:meta.language||'fr',at:meta.at||new Date().toISOString(),surface:meta.surface||'Gvault-Pages',
  streamUrl:meta.streamUrl||STREAM_URL,
  text:typeof meta.text==='string'?meta.text:typeof payload?.text==='string'?payload.text:undefined,
  display:typeof meta.display==='string'?meta.display:typeof payload?.text==='string'?payload.text:undefined,
  chroma:meta.chroma||payload?.chroma||null,
  understoodBy:meta.understoodBy||['GThink','public-kernel','gateway-adapter','public-ui'],
  silent:meta.silent!==false,muted:false,payload
 });
}
function rememberSignal(blob){
 if(!blob?.blobId||seen.has(blob.blobId))return false;
 seen.add(blob.blobId);if(seen.size>512){const first=seen.values().next().value;seen.delete(first)}
 signalHistory.push(blob);if(signalHistory.length>SIGNAL_HISTORY_MAX)signalHistory.splice(0,signalHistory.length-SIGNAL_HISTORY_MAX);
 return true;
}
function dispatchLocal(blob){
 try{window.dispatchEvent(new CustomEvent(DOM_EVENT,{detail:blob}))}catch{}
 try{window.dispatchEvent(new CustomEvent(LEGACY_EVENT,{detail:blob}))}catch{}
}
function emitBlob(blob){
 if(!rememberSignal(blob))return blob;
 dispatchLocal(blob);
 try{channel?.postMessage(blob)}catch{}
 try{legacyChannel?.postMessage(blob)}catch{}
 return blob;
}
function acceptInbound(blob){
 if(!blob||blob.schema!==BLOB_SCHEMA||!rememberSignal(blob))return;
 dispatchLocal(blob);resolvePending(blob);
}
function signal(kind,payload={},parentBlobId=null,meta={}){return emitBlob(makeBlob(kind,payload,parentBlobId,meta))}
function ancestryMatches(blob,ids){return !!blob&&ids.has(blob.parentBlobId)||!!blob?.payload?.requestBlobId&&ids.has(blob.payload.requestBlobId)}
function resolvePending(blob){
 for(const [id,p] of pending){
  if(blob.conversationId!==p.conversationId)continue;
  if(!ancestryMatches(blob,p.ids))continue;
  if(blob.kind==='error'){clearTimeout(p.timer);pending.delete(id);p.reject(new Error(blob.payload?.error||blob.text||'gthink_error'));continue}
  if(blob.kind==='gateway.response'||(blob.kind==='utterance'&&blob.role==='gthink')){
   clearTimeout(p.timer);pending.delete(id);p.resolve(blob);
  }
 }
}
channel&&(channel.onmessage=e=>acceptInbound(e.data));
legacyChannel&&(legacyChannel.onmessage=e=>acceptInbound(e.data));

function listen(handler,{kinds=null,roles=null}={}){
 if(typeof handler!=='function')throw new TypeError('listener_function_required');
 const ks=Array.isArray(kinds)?new Set(kinds):null,rs=Array.isArray(roles)?new Set(roles):null;
 const wrapped=e=>{const b=e.detail;if(ks&&!ks.has(b?.kind))return;if(rs&&!rs.has(b?.role))return;handler(b)};
 window.addEventListener(DOM_EVENT,wrapped);return ()=>window.removeEventListener(DOM_EVENT,wrapped);
}
function hearLast(n=12){return signalHistory.slice(-Math.max(1,Math.min(SIGNAL_HISTORY_MAX,Number(n)||12)))}
function speak(blobLike){
 if(blobLike?.schema===BLOB_SCHEMA)return emitBlob(Object.freeze({...blobLike,blobId:blobLike.blobId||uid('gblob'),conversationId:blobLike.conversationId||sessionId(),at:blobLike.at||new Date().toISOString(),surface:blobLike.surface||'Gvault-Pages',streamUrl:blobLike.streamUrl||STREAM_URL}));
 return signal(blobLike?.kind||'state',blobLike?.payload||{},blobLike?.parentBlobId||null,blobLike||{});
}
function streamReply(text,parentBlobId,chroma=null){
 const chars=Array.from(String(text||''));let i=0;
 signal('state',{state:'rendering',length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'render_reply',streamUrl:STREAM_URL});
 const step=()=>{
  if(i>=chars.length){signal('render.done',{length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'finish_render',chroma,streamUrl:STREAM_URL});return}
  const remaining=chars.length-i,burst=Math.max(1,Math.min(4,Math.ceil(remaining/120)));let piece='';
  for(let n=0;n<burst&&i<chars.length;n++)piece+=chars[i++];
  signal('render.delta',{chars:piece,index:i,length:chars.length},parentBlobId,{role:'renderer',from:'renderer',to:'public-ui',intent:'append_characters',chroma,streamUrl:STREAM_URL});
  requestAnimationFrame(step);
 };requestAnimationFrame(step);
}
function responseText(blob){
 return String(blob?.text||blob?.display||blob?.payload?.text||blob?.payload?.data?.text||blob?.payload?.response?.text||'').trim();
}
function responseChroma(blob){return blob?.chroma||blob?.payload?.chroma||blob?.payload?.data?.blob?.chroma||blob?.payload?.data?.pair?.responseBlob?.chroma||null}
function finalizeReply(inbound,requestBlob){
 let reply=inbound,text=responseText(inbound);
 if(!text)throw new Error('empty_gthink_response');
 if(!(inbound.kind==='utterance'&&inbound.role==='gthink')){
  reply=signal('utterance',{text,sourceBlobId:inbound.blobId,remote:inbound.payload?.data||null},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public-ui',intent:'reply',text,chroma:responseChroma(inbound),streamUrl:STREAM_URL});
 }
 remember('user',requestBlob.text);remember('assistant',text);streamReply(text,reply.blobId,reply.chroma);
 signal('state',{state:'reply_emitted',replyBlobId:reply.blobId},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public.bus',intent:'announce_state',streamUrl:STREAM_URL});
 return {ok:true,schema:'GVAULT_BLOB_STREAM_RESPONSE_V1',text,blob:reply,universalRequestBlob:requestBlob,universalReplyBlob:reply};
}
function remember(role,content){if(!content)return;history.push({role,content:String(content)});if(history.length>HISTORY_MAX)history=history.slice(-HISTORY_MAX)}

async function loadConfig(force=false){
 if(!force&&config&&Date.now()-configAt<30000)return config;
 try{
  const r=await rootNativeFetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('CONFIG_HTTP_'+r.status);
  const c=await r.json();if(!['GVAULT_AGENT_GATEWAY_CONFIG_V1','GVAULT_AGENT_GATEWAY_CONFIG_V2'].includes(c?.schema))throw new Error('CONFIG_SCHEMA');
  config=c;configAt=Date.now();
  const stream=c.streamUrl||c.gatewayBlob?.payload?.streamUrl||STREAM_URL,configured=c.transport==='blob-stream'&&!!stream;
  signal('gateway.state',{status:c.status||null,configured,transport:c.transport||'legacy-http',streamUrl:stream,model:c.model||null},null,{role:'gateway',from:'gateway-config',to:'public-kernel',intent:'announce_gateway_state',streamUrl:stream});
  return c;
 }catch(e){
  config={schema:'GVAULT_AGENT_GATEWAY_CONFIG_V2',status:'UNAVAILABLE',transport:'blob-stream',streamUrl:STREAM_URL,error:String(e?.message||e)};configAt=Date.now();
  signal('gateway.state',{status:'UNAVAILABLE',configured:false,transport:'blob-stream',streamUrl:STREAM_URL,error:config.error},null,{role:'gateway',from:'gateway-config',to:'public-kernel',intent:'announce_gateway_state',streamUrl:STREAM_URL});
  return config;
 }
}
async function loadKernel(force=false){
 if(!force&&kernel&&Date.now()-kernelAt<30000)return kernel;
 try{
  const r=await rootNativeFetch(KERNEL_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('KERNEL_HTTP_'+r.status);
  const k=await r.json();if(k?.schema!=='GVAULT_PUBLIC_CONTROLLER_KERNEL/1')throw new Error('KERNEL_SCHEMA');
  kernel=k;kernelAt=Date.now();signal('kernel.state',{status:'READY',blobId:k.blobId||null,route:k.routing?.defaultRoute||null},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_kernel_state',streamUrl:STREAM_URL});return k;
 }catch(e){
  kernel={schema:'GVAULT_PUBLIC_CONTROLLER_KERNEL/1',status:'UNAVAILABLE',error:String(e?.message||e)};kernelAt=Date.now();
  signal('kernel.state',{status:'UNAVAILABLE',error:kernel.error},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_kernel_state',streamUrl:STREAM_URL});return kernel;
 }
}
function kernelEnvelope(k){if(!k||k.status==='UNAVAILABLE')return null;return {schema:k.schema,blobId:k.blobId||null,route:k.routing?.defaultRoute||null,privateControllerIsAuthoritative:k.authority?.privateControllerIsAuthoritative===true}}
async function waitOnStream(requestBlob,gatewayBlob){
 return new Promise((resolve,reject)=>{
  const key=gatewayBlob.blobId,timer=setTimeout(()=>{pending.delete(key);reject(new Error('blob_stream_no_gthink_listener'))},WAIT_MS);
  pending.set(key,{resolve,reject,timer,conversationId:requestBlob.conversationId,ids:new Set([requestBlob.blobId,gatewayBlob.blobId])});
 });
}
async function ask(message,{historyOverride=null}={}){
 message=String(message??'').trim();
 const requestBlob=signal('utterance',{text:message,messageBytes:new TextEncoder().encode(message).byteLength},null,{role:'user',from:'public.user',to:'GThink',intent:'interpret_and_reply',text:message,streamUrl:STREAM_URL});
 if(!message){const out={ok:false,error:'empty_message'};signal('error',out,requestBlob.blobId,{role:'system',from:'public-kernel',to:'public-ui',intent:'report_error',streamUrl:STREAM_URL});return out}
 const [c,k]=await Promise.all([loadConfig(),loadKernel()]);
 const stream=c?.streamUrl||STREAM_URL;
 signal('state',{state:'interpreting',streamUrl:stream},requestBlob.blobId,{role:'gthink',from:'GThink',to:'public-ui',intent:'announce_state',streamUrl:stream});
 const gatewayBlob=signal('gateway.request',{
  streamUrl:stream,message,requestBlobId:requestBlob.blobId,
  history:Array.isArray(historyOverride)?historyOverride:history.slice(-HISTORY_MAX),
  controllerKernel:kernelEnvelope(k),blobProtocol:BLOB_SCHEMA
 },requestBlob.blobId,{role:'gateway',from:'public-kernel',to:'GThink',intent:'route_request_on_blob_stream',streamUrl:stream});
 try{return finalizeReply(await waitOnStream(requestBlob,gatewayBlob),requestBlob)}
 catch(e){const out={ok:false,error:String(e?.message||e)};signal('error',out,gatewayBlob.blobId,{role:'gateway',from:'blob-stream',to:'public-ui',intent:'report_error',streamUrl:stream});return out}
}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function bindWindow(w){
 if(!w||boundWindows.has(w))return;boundWindows.add(w);let native;try{native=w.fetch.bind(w)}catch{return}
 w.fetch=async function(input,init){
  const method=String(init?.method||input?.method||'GET').toUpperCase();if(method!=='POST'||!isChatUrl(input,w))return native(input,init);
  let body={};try{body=typeof init?.body==='string'?JSON.parse(init.body):{}}catch{}
  const result=await ask(body?.message||body?.blob?.text||'',{historyOverride:Array.isArray(body?.history)?body.history:null});
  const status=result.ok?200:503;return new Response(JSON.stringify(result),{status,headers:{'content-type':'application/json','x-gvault-transport':'blob-stream','x-gvault-stream':STREAM_URL}});
 };
}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow)}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}

bindWindow(window);scanFrames();new MutationObserver(scanFrames).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('online',()=>{void loadConfig(true);void loadKernel(true)});
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({
 schema:SCHEMA,blobSchema:BLOB_SCHEMA,streamUrl:STREAM_URL,ask,speak,listen,hearLast,
 reloadConfig:()=>loadConfig(true),reloadKernel:()=>loadKernel(true),
 status:async()=>{const [c,k]=await Promise.all([loadConfig(),loadKernel()]);const stream=c?.streamUrl||STREAM_URL;return {configured:c?.transport==='blob-stream'&&!!stream,transport:'blob-stream',streamUrl:stream,config:c,kernel:kernelEnvelope(k),historyItems:history.length,signalItems:signalHistory.length,sessionId:sessionId(),bus:DOM_EVENT,legacyBus:LEGACY_EVENT,broadcastChannel:CHANNEL,legacyBroadcastChannel:LEGACY_CHANNEL,protocolUrl:PROTOCOL_URL}}
});
void loadKernel();void loadConfig();
signal('state',{state:'listener_ready',transport:'blob-stream',streamUrl:STREAM_URL,bus:DOM_EVENT,broadcastChannel:CHANNEL},null,{role:'kernel',from:'public-kernel',to:'public.bus',intent:'announce_ready',streamUrl:STREAM_URL});
})();