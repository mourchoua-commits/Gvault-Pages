(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V4_LOCAL_GTHINK';
const BUS_SCHEMA='GVAULT_PUBLIC_BLOB_SIGNAL_V1';
const KERNEL_URL='./blobs/public/gthink-controller-kernel-v1.json';
const CHAT_PATH='/api/vault/chat';
const SIGNAL_HISTORY_MAX=96;
const rootNativeFetch=window.fetch.bind(window);
const boundWindows=new WeakSet(),boundFrames=new WeakSet();
const signalHistory=[];
let kernel=null,kernelAt=0,localCallDepth=0;
let channel=null;
try{channel=new BroadcastChannel('gvault.public.blobs.v1')}catch{}

function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function makeBlob(type,payload={},parentBlobId=null){return Object.freeze({schema:BUS_SCHEMA,blobId:uid('pbs'),parentBlobId,type,at:new Date().toISOString(),surface:'Gvault-Pages',silent:true,muted:false,payload})}
function signal(type,payload={},parentBlobId=null){const blob=makeBlob(type,payload,parentBlobId);signalHistory.push(blob);if(signalHistory.length>SIGNAL_HISTORY_MAX)signalHistory.splice(0,signalHistory.length-SIGNAL_HISTORY_MAX);try{window.dispatchEvent(new CustomEvent('gvault:blob:signal',{detail:blob}))}catch{}try{channel?.postMessage(blob)}catch{}return blob}
async function loadKernel(force=false){
 if(!force&&kernel&&Date.now()-kernelAt<30000)return kernel;
 try{const r=await rootNativeFetch(KERNEL_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('KERNEL_HTTP_'+r.status);const k=await r.json();if(k?.schema!=='GVAULT_PUBLIC_CONTROLLER_KERNEL/1')throw new Error('KERNEL_SCHEMA');kernel=k;kernelAt=Date.now();signal('kernel.state',{status:'READY',blobId:k.blobId||null,defaultRoute:k.routing?.defaultRoute||null,offlineFallback:k.health?.offlineFallback||null,methodOrder:k.routing?.order||[]});return k}
 catch(e){kernel={schema:'GVAULT_PUBLIC_CONTROLLER_KERNEL/1',status:'UNAVAILABLE',error:String(e?.message||e)};kernelAt=Date.now();signal('kernel.state',{status:'UNAVAILABLE',error:kernel.error,offlineFallback:'PUBLIC_LOCAL_LIMITED'});return kernel}
}
function resolveRuntimeWindow(){try{const frame=document.querySelector('#gvaultRuntime');if(frame?.contentWindow&&typeof frame.contentWindow.sendAgentMessage==='function')return frame.contentWindow}catch{}try{if(typeof window.sendAgentMessage==='function')return window}catch{}return null}
function extractText(result){if(typeof result==='string')return result;for(const k of ['text','answer','message','output'])if(typeof result?.[k]==='string')return result[k];return ''}
function conversationalize(text,query){try{const fn=window.GVAULT_PUBLIC_AGENT_CONVERSATION?.conversationalize;return typeof fn==='function'?fn(text,query):text}catch{return text}}
function exposeResponse(blob){if(!blob)return;for(const root of [document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch{return null}}).filter(Boolean)]){try{const a=root.querySelector('[data-blob-agent-side]'),b=root.querySelector('[data-blob-other-side]');if(a)a.textContent=blob.agentSide?.display||'';if(b)b.textContent=blob.otherSide?.display||'banane'}catch{}}try{window.dispatchEvent(new CustomEvent('gvault:agent-direct-blob',{detail:{schema:SCHEMA,blob}}))}catch{}}
async function ask(message){
 const root=signal('banana.turn.begin',{method:'GTHINK_LOCAL_ROUTING',remoteProvider:false});
 message=String(message??'').trim();signal('input.capture',{bytes:new TextEncoder().encode(message).byteLength},root.blobId);
 if(!message){const out={ok:false,error:'empty_message'};signal('banana.turn.error',out,root.blobId);return out}
 const [runtime,k]=await Promise.all([Promise.resolve(resolveRuntimeWindow()),loadKernel()]);
 signal('runtime.resolve',{available:!!runtime,sendAgentMessage:typeof runtime?.sendAgentMessage==='function'},root.blobId);
 if(!runtime||typeof runtime.sendAgentMessage!=='function'){const out={ok:false,error:'local_agent_unavailable'};signal('banana.turn.error',out,root.blobId);return out}
 signal('gthink.route.entry',{methodAuthority:'GVAULT_METHOD_ROUTER',invocationScope:'EVERY_NEW_USER_MESSAGE',integrationPoint:'sendAgentMessage -> agentGThinkRouteRequest -> agentAnswer -> recordAgentTrace',kernelBlobId:k?.blobId||null,kernelDefaultRoute:k?.routing?.defaultRoute||null,selectedRoute:'PUBLIC_LOCAL_LIMITED_SEND_AGENT_MESSAGE',routingOrder:k?.routing?.order||['intention/fonction','méthode de routage','emplacement logique existant','index/cadastre en support']},root.blobId);
 let result;
 try{localCallDepth++;result=await runtime.sendAgentMessage(message)}catch(e){const out={ok:false,error:'local_agent_error',detail:String(e?.message||e).slice(0,240)};signal('banana.turn.error',out,root.blobId);return out}finally{localCallDepth=Math.max(0,localCallDepth-1)}
 let text=extractText(result);if(!text){const out={ok:false,error:'local_agent_empty_output'};signal('banana.turn.error',out,root.blobId);return out}
 text=conversationalize(text,message);
 signal('gthink.route.exit',{routeId:result?.routeId??null,correlationId:result?.correlationId??null,routeTrace:result?.routeTrace??null},root.blobId);
 const correlationId=result?.correlationId??result?.routeId??uid('corr');
 const bananaBlob={schema:'BLOB_AGENT_DIRECT_BANANA_EVENT_V1',blobId:uid('banana'),correlationId,agentSide:{surface:'blob.direct.reply',display:text,routeTrace:result?.routeTrace??null},otherSide:{surface:'blob.other.display',display:'banane'},actionsAuthorized:false,actionAuthority:'GTHINK_RUNTIME_ONLY',localAgent:true,provider:'GVAULT_AGENT_LOCAL_GTHINK'};
 exposeResponse(bananaBlob);signal('banana.verify',{literal:'banane',localAgent:true},root.blobId);signal('banana.turn.pass',{textPresent:true,localAgent:true,remoteProvider:false,correlationId},root.blobId);
 return {ok:true,schema:'GVAULT_AGENT_CHAT_RESPONSE_V1',text,model:'GVAULT_AGENT_LOCAL_GTHINK',correlationId,blob:bananaBlob,localAgent:true,remoteProvider:false};
}
function responseFrom(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-gvault-agent':'local-gthink'}})}
function bindWindow(w){if(!w||boundWindows.has(w))return;boundWindows.add(w);let native;try{native=w.fetch.bind(w)}catch{return}w.fetch=async function(input,init){const method=String(init?.method||input?.method||'GET').toUpperCase();if(method!=='POST'||!isChatUrl(input,w)||localCallDepth>0)return native(input,init);let body={};try{body=typeof init?.body==='string'?JSON.parse(init.body):{}}catch{}const data=await ask(body?.message||'');return responseFrom(data,data.ok?200:data.error==='empty_message'?400:503)}}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow);signal('runtime.listener.bound',{frameId:frame.id||null})}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}
function listen(handler){if(typeof handler!=='function')throw new TypeError('listener_function_required');const wrapped=e=>handler(e.detail);window.addEventListener('gvault:blob:signal',wrapped);return ()=>window.removeEventListener('gvault:blob:signal',wrapped)}
function hearLast(n=12){return signalHistory.slice(-Math.max(1,Math.min(SIGNAL_HISTORY_MAX,Number(n)||12)))}

bindWindow(window);scanFrames();new MutationObserver(scanFrames).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('online',()=>void loadKernel(true));void loadKernel();
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({schema:SCHEMA,ask,listen,hearLast,reloadKernel:()=>loadKernel(true),status:async()=>{const k=await loadKernel();return {configured:!!resolveRuntimeWindow(),localAgent:true,remoteProvider:false,kernel:{blobId:k?.blobId||null,status:k?.status||'READY',defaultRoute:k?.routing?.defaultRoute||null,offlineFallback:k?.health?.offlineFallback||null},signalItems:signalHistory.length,silent:true,muted:false,methodAuthority:'GVAULT_METHOD_ROUTER',integrationPoint:'sendAgentMessage -> agentGThinkRouteRequest -> agentAnswer -> recordAgentTrace',bus:'gvault:blob:signal',broadcastChannel:'gvault.public.blobs.v1'}}});
signal('listener.ready',{localAgent:true,remoteProvider:false,silent:true,muted:false,methodAuthority:'GVAULT_METHOD_ROUTER',kernelUrl:KERNEL_URL});
})();
