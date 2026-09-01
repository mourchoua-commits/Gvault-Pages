(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V3';
const BUS_SCHEMA='GVAULT_PUBLIC_BLOB_SIGNAL_V1';
const CONFIG_URL='./scripts/gvault-agent-gateway.json';
const KERNEL_URL='./blobs/public/gthink-controller-kernel-v1.json';
const CHAT_PATH='/api/vault/chat';
const HISTORY_MAX=12;
const SIGNAL_HISTORY_MAX=64;
const rootNativeFetch=window.fetch.bind(window);
const boundWindows=new WeakSet(),boundFrames=new WeakSet();
const signalHistory=[];
let config=null,configAt=0,kernel=null,kernelAt=0,history=[];
let channel=null;
try{channel=new BroadcastChannel('gvault.public.blobs.v1')}catch{}

function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function sessionId(){
 let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}
 if(!id){id=uid('gas');try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}
 return id;
}
function clean(v){return String(v||'').replace(/\/+$/,'')}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function makeBlob(type,payload={},parentBlobId=null){
 return Object.freeze({schema:BUS_SCHEMA,blobId:uid('pbs'),parentBlobId,type,at:new Date().toISOString(),surface:'Gvault-Pages',silent:true,muted:false,payload});
}
function signal(type,payload={},parentBlobId=null){
 const blob=makeBlob(type,payload,parentBlobId);
 signalHistory.push(blob);if(signalHistory.length>SIGNAL_HISTORY_MAX)signalHistory.splice(0,signalHistory.length-SIGNAL_HISTORY_MAX);
 try{window.dispatchEvent(new CustomEvent('gvault:blob:signal',{detail:blob}))}catch{}
 try{channel?.postMessage(blob)}catch{}
 return blob;
}
async function loadConfig(force=false){
 if(!force&&config&&Date.now()-configAt<30000)return config;
 try{
  const r=await rootNativeFetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!r.ok)throw new Error('CONFIG_HTTP_'+r.status);
  const c=await r.json();if(c?.schema!=='GVAULT_AGENT_GATEWAY_CONFIG_V1')throw new Error('CONFIG_SCHEMA');
  config=c;configAt=Date.now();if(c.baseUrl)window.GVAULT_INGRESS_BASE_URL=clean(c.baseUrl);
  signal('gateway.state',{status:c.status||null,configured:!!c.baseUrl,model:c.model||null});
  return c;
 }catch(e){
  config={schema:'GVAULT_AGENT_GATEWAY_CONFIG_V1',status:'UNAVAILABLE',baseUrl:null,error:String(e?.message||e)};configAt=Date.now();
  signal('gateway.state',{status:'UNAVAILABLE',configured:false,error:config.error});
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
  signal('kernel.state',{status:'READY',blobId:k.blobId||null,route:k.routing?.defaultRoute||null,privateControllerIsAuthoritative:k.authority?.privateControllerIsAuthoritative===true});
  return k;
 }catch(e){
  kernel={schema:'GVAULT_PUBLIC_CONTROLLER_KERNEL/1',status:'UNAVAILABLE',error:String(e?.message||e)};kernelAt=Date.now();
  signal('kernel.state',{status:'UNAVAILABLE',error:kernel.error});
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
function exposeResponse(blob){
 if(!blob)return;
 for(const root of [document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch{return null}}).filter(Boolean)]){
  try{
   const a=root.querySelector('[data-blob-agent-side]'),b=root.querySelector('[data-blob-other-side]');
   if(a)a.textContent=blob.agentSide?.display||'';
   if(b)b.textContent=blob.otherSide?.display||'banane';
  }catch{}
 }
}
async function ask(message,{historyOverride=null}={}){
 message=String(message??'').trim();
 const requestBlob=signal('agent.request',{messageBytes:new TextEncoder().encode(message).byteLength,sessionId:sessionId()});
 if(!message){const out={ok:false,error:'empty_message'};signal('agent.error',out,requestBlob.blobId);return out}
 const [ep,k]=await Promise.all([endpoint(),loadKernel()]);if(!ep){const out={ok:false,error:'gateway_pending'};signal('agent.error',out,requestBlob.blobId);return out}
 const prior=Array.isArray(historyOverride)?historyOverride:history.slice(-HISTORY_MAX);
 let r;
 try{r=await rootNativeFetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,sessionId:sessionId(),history:prior,controllerKernel:kernelEnvelope(k)}),cache:'no-store',credentials:'omit'})}
 catch(e){const out={ok:false,error:'network_error',detail:String(e?.message||e)};signal('agent.error',out,requestBlob.blobId);return out}
 let data=null;try{data=await r.json()}catch{}
 if(!r.ok||data?.schema!=='GVAULT_AGENT_CHAT_RESPONSE_V1'){
  const out={ok:false,error:data?.error||`HTTP_${r.status}`,detail:data?.detail||null};signal('agent.error',out,requestBlob.blobId);return out;
 }
 remember('user',message);remember('assistant',data.text);exposeResponse(data.blob);
 signal('agent.response',{text:data.text,model:data.model||null,correlationId:data.correlationId||null,blob:data.blob||null},requestBlob.blobId);
 return data;
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
  const requestBlob=signal('agent.request.intercepted',{messageBytes:new TextEncoder().encode(message).byteLength,sessionId:body.sessionId||sessionId(),kernelBlobId:k?.blobId||null});
  const nextBody={...body,message,sessionId:body.sessionId||sessionId(),history:Array.isArray(body.history)?body.history:history.slice(-HISTORY_MAX),controllerKernel:kernelEnvelope(k)};
  const response=await native(ep,{...init,method:'POST',headers:{...(init?.headers||{}),'content-type':'application/json'},body:JSON.stringify(nextBody),cache:'no-store',credentials:'omit'});
  try{
   const data=await response.clone().json();
   if(response.ok&&data?.schema==='GVAULT_AGENT_CHAT_RESPONSE_V1'){
    remember('user',message);remember('assistant',data.text);exposeResponse(data.blob);
    signal('agent.response',{text:data.text,model:data.model||null,correlationId:data.correlationId||null,blob:data.blob||null},requestBlob.blobId);
   }else signal('agent.error',{error:data?.error||`HTTP_${response.status}`},requestBlob.blobId);
  }catch{signal('agent.error',{error:'response_unreadable'},requestBlob.blobId)}
  return response;
 };
}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow);signal('runtime.listener.bound',{frameId:frame.id||null})}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}
function listen(handler){
 if(typeof handler!=='function')throw new TypeError('listener_function_required');
 const wrapped=e=>handler(e.detail);
 window.addEventListener('gvault:blob:signal',wrapped);
 return ()=>window.removeEventListener('gvault:blob:signal',wrapped);
}
function hearLast(n=12){return signalHistory.slice(-Math.max(1,Math.min(SIGNAL_HISTORY_MAX,Number(n)||12)))}

bindWindow(window);scanFrames();
new MutationObserver(scanFrames).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('online',()=>{void loadConfig(true);void loadKernel(true)});
void loadKernel();
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({schema:SCHEMA,ask,listen,hearLast,reloadConfig:()=>loadConfig(true),reloadKernel:()=>loadKernel(true),status:async()=>{const [c,k]=await Promise.all([loadConfig(),loadKernel()]);return {configured:!!(await endpoint()),config:c,kernel:kernelEnvelope(k),historyItems:history.length,signalItems:signalHistory.length,sessionId:sessionId(),silent:true,muted:false,bus:'gvault:blob:signal',broadcastChannel:'gvault.public.blobs.v1'}}});
signal('listener.ready',{silent:true,muted:false,bus:'gvault:blob:signal',broadcastChannel:'gvault.public.blobs.v1',kernelUrl:KERNEL_URL});
})();
