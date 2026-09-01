(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V3_LOCAL_GTHINK';
const BUS_SCHEMA='GVAULT_PUBLIC_BLOB_SIGNAL_V1';
const CHAT_PATH='/api/vault/chat';
const SIGNAL_HISTORY_MAX=96;
const boundWindows=new WeakSet(),boundFrames=new WeakSet();
const signalHistory=[];
let channel=null,localCallDepth=0;
try{channel=new BroadcastChannel('gvault.public.blobs.v1')}catch{}

function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function makeBlob(type,payload={},parentBlobId=null){return Object.freeze({schema:BUS_SCHEMA,blobId:uid('pbs'),parentBlobId,type,at:new Date().toISOString(),surface:'Gvault-Pages',silent:true,muted:false,payload})}
function signal(type,payload={},parentBlobId=null){const blob=makeBlob(type,payload,parentBlobId);signalHistory.push(blob);if(signalHistory.length>SIGNAL_HISTORY_MAX)signalHistory.splice(0,signalHistory.length-SIGNAL_HISTORY_MAX);try{window.dispatchEvent(new CustomEvent('gvault:blob:signal',{detail:blob}))}catch{}try{channel?.postMessage(blob)}catch{}return blob}
function extractText(result){if(typeof result==='string')return result;for(const k of ['text','answer','message','output'])if(typeof result?.[k]==='string')return result[k];return ''}
function resolveRuntimeWindow(){
 try{const frame=document.querySelector('#gvaultRuntime');if(frame?.contentWindow&&typeof frame.contentWindow.sendAgentMessage==='function')return frame.contentWindow}catch{}
 try{if(typeof window.sendAgentMessage==='function')return window}catch{}
 return null;
}
function exposeResponse(blob){
 if(!blob)return;
 for(const root of [document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch{return null}}).filter(Boolean)]){
  try{const a=root.querySelector('[data-blob-agent-side]'),b=root.querySelector('[data-blob-other-side]');if(a)a.textContent=blob.agentSide?.display||'';if(b)b.textContent=blob.otherSide?.display||'banane'}catch{}
 }
 try{window.dispatchEvent(new CustomEvent('gvault:agent-direct-blob',{detail:{schema:SCHEMA,blob}}))}catch{}
}
async function askLocal(message){
 const root=signal('banana.turn.begin',{method:'GTHINK_LOCAL_ROUTING',remoteProvider:false});
 message=String(message??'').trim();
 signal('input.capture',{bytes:new TextEncoder().encode(message).byteLength},root.blobId);
 if(!message){const out={ok:false,error:'empty_message'};signal('banana.turn.error',out,root.blobId);return out}
 const runtime=resolveRuntimeWindow();
 signal('runtime.resolve',{available:!!runtime,sendAgentMessage:typeof runtime?.sendAgentMessage==='function'},root.blobId);
 if(!runtime||typeof runtime.sendAgentMessage!=='function'){
  const out={ok:false,error:'local_agent_unavailable'};signal('banana.turn.error',out,root.blobId);return out;
 }
 signal('gthink.route.entry',{methodAuthority:'GVAULT_METHOD_ROUTER',invocationScope:'EVERY_NEW_USER_MESSAGE',integrationPoint:'sendAgentMessage -> agentGThinkRouteRequest -> agentAnswer -> recordAgentTrace'},root.blobId);
 let result;
 try{localCallDepth++;result=await runtime.sendAgentMessage(message)}catch(e){const out={ok:false,error:'local_agent_error',detail:String(e?.message||e).slice(0,240)};signal('banana.turn.error',out,root.blobId);return out}finally{localCallDepth=Math.max(0,localCallDepth-1)}
 const text=extractText(result);
 if(!text){const out={ok:false,error:'local_agent_empty_output'};signal('banana.turn.error',out,root.blobId);return out}
 signal('gthink.route.exit',{routeId:result?.routeId??null,correlationId:result?.correlationId??null,routeTrace:result?.routeTrace??null},root.blobId);
 const correlationId=result?.correlationId??result?.routeId??uid('corr');
 const blob={schema:'BLOB_AGENT_DIRECT_BANANA_EVENT_V1',blobId:uid('banana'),correlationId,agentSide:{surface:'blob.direct.reply',display:text,routeTrace:result?.routeTrace??null},otherSide:{surface:'blob.other.display',display:'banane'},actionsAuthorized:false,localAgent:true,provider:'GVAULT_AGENT_LOCAL_GTHINK'};
 exposeResponse(blob);
 signal('banana.verify',{literal:'banane',localAgent:true},root.blobId);
 signal('banana.turn.pass',{textPresent:true,localAgent:true,remoteProvider:false,correlationId},root.blobId);
 return {ok:true,schema:'GVAULT_AGENT_CHAT_RESPONSE_V1',text,model:'GVAULT_AGENT_LOCAL_GTHINK',correlationId,blob,localAgent:true,remoteProvider:false};
}
function responseFrom(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-gvault-agent':'local-gthink'}})}
function bindWindow(w){
 if(!w||boundWindows.has(w))return;boundWindows.add(w);
 let native;try{native=w.fetch.bind(w)}catch{return}
 w.fetch=async function(input,init){
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(method!=='POST'||!isChatUrl(input,w)||localCallDepth>0)return native(input,init);
  let body={};try{body=typeof init?.body==='string'?JSON.parse(init.body):{}}catch{}
  const data=await askLocal(body?.message||'');
  return responseFrom(data,data.ok?200:data.error==='empty_message'?400:503);
 };
}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow);signal('runtime.listener.bound',{frameId:frame.id||null})}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}
function listen(handler){if(typeof handler!=='function')throw new TypeError('listener_function_required');const wrapped=e=>handler(e.detail);window.addEventListener('gvault:blob:signal',wrapped);return ()=>window.removeEventListener('gvault:blob:signal',wrapped)}
function hearLast(n=12){return signalHistory.slice(-Math.max(1,Math.min(SIGNAL_HISTORY_MAX,Number(n)||12)))}

bindWindow(window);scanFrames();
new MutationObserver(scanFrames).observe(document.documentElement,{childList:true,subtree:true});
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({schema:SCHEMA,ask:askLocal,listen,hearLast,status:async()=>({configured:!!resolveRuntimeWindow(),localAgent:true,remoteProvider:false,methodAuthority:'GVAULT_METHOD_ROUTER',integrationPoint:'sendAgentMessage -> agentGThinkRouteRequest -> agentAnswer -> recordAgentTrace',silent:true,muted:false,bus:'gvault:blob:signal',broadcastChannel:'gvault.public.blobs.v1'})});
signal('listener.ready',{localAgent:true,remoteProvider:false,silent:true,muted:false,methodAuthority:'GVAULT_METHOD_ROUTER'});
})();
