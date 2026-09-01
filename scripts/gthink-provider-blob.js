(()=>{'use strict';
const SCHEMA='GTHINK_PROVIDER_BLOB_V2';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const SCRIPT_URL=document.currentScript?.src||location.href;
const CONFIG_URL=new URL('gvault-agent-gateway.json',new URL('.',SCRIPT_URL)).href;
const WEBLLM_URL='https://esm.run/@mlc-ai/web-llm';
const LOCAL_MODEL='SmolLM2-360M-Instruct-q4f32_1-MLC';
const CACHE_MS=15000;
let cached=null,cachedAt=0,localEngine=null,localEnginePromise=null;
function clean(v){return String(v??'').trim()}
function uid(prefix='gthink-provider'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function emit(kind,payload={},parentBlobId=null,intent='observe'){
 const a=api();if(!a?.speak)return null;
 return a.speak({schema:BLOB_SCHEMA,blobId:uid(),parentBlobId,conversationId:payload?.conversationId||'gthink-provider',kind,role:'provider',from:'GThinkProviderBlob',to:'GThink',intent,language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:typeof payload?.text==='string'?payload.text:undefined,payload:{...payload,providerSchema:SCHEMA},understoodBy:['GThink','public-kernel','gateway-adapter','public-ui'],silent:true,muted:false});
}
function sessionId(){let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}if(!id){id='gthink-'+(crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}return id}
async function loadConfig(force=false){
 if(!force&&cached&&Date.now()-cachedAt<CACHE_MS)return cached;
 const r=await fetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});
 if(!r.ok)throw new Error('provider_config_http_'+r.status);
 const c=await r.json();if(!['GVAULT_AGENT_GATEWAY_CONFIG_V1','GVAULT_AGENT_GATEWAY_CONFIG_V2'].includes(c?.schema))throw new Error('provider_config_schema');cached=c;cachedAt=Date.now();return c;
}
function adapter(c){
 const base=clean(c?.httpAdapter?.enabled?c?.httpAdapter?.baseUrl:c?.baseUrl);
 const path=clean(c?.httpAdapter?.enabled?c?.httpAdapter?.chatPath:c?.chatPath)||'/api/vault/chat';
 if(!base)return null;return {url:base.replace(/\/+$/,'')+(path.startsWith('/')?path:'/'+path),model:clean(c?.model)||null};
}
function historyMessages(history){return (Array.isArray(history)?history:[]).slice(-8).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content)})).filter(x=>x.content)}
async function ensureLocalEngine(meta={}){
 if(localEngine)return localEngine;
 if(localEnginePromise)return localEnginePromise;
 if(!navigator.gpu)throw new Error('webgpu_unavailable');
 localEnginePromise=(async()=>{
  emit('gthink.provider.state',{state:'local_model_loading',model:LOCAL_MODEL,conversationId:meta.conversationId},meta.parentBlobId,'announce_provider_state');
  const webllm=await import(WEBLLM_URL);
  localEngine=await webllm.CreateMLCEngine(LOCAL_MODEL,{initProgressCallback:p=>emit('gthink.provider.progress',{state:'local_model_loading',model:LOCAL_MODEL,progress:Number(p?.progress||0),detail:clean(p?.text).slice(0,120),conversationId:meta.conversationId},meta.parentBlobId,'announce_provider_progress')});
  emit('gthink.provider.state',{state:'local_model_ready',model:LOCAL_MODEL,conversationId:meta.conversationId},meta.parentBlobId,'announce_provider_state');
  return localEngine;
 })().catch(error=>{localEnginePromise=null;localEngine=null;throw error});
 return localEnginePromise;
}
async function askLocal(text,history,meta,priorError=null){
 const requestBlob=emit('gthink.provider.request',{conversationId:meta.conversationId,mode:'local-webllm',model:LOCAL_MODEL,messageBytes:new TextEncoder().encode(text).byteLength,historyItems:Array.isArray(history)?history.length:0,priorRemoteError:priorError||null},meta.parentBlobId,'request_local_interpretation');
 try{
  const engine=await ensureLocalEngine({parentBlobId:requestBlob?.blobId||meta.parentBlobId,conversationId:meta.conversationId});
  const messages=[{role:'system',content:'Tu es GThink, l’entité de GVAULT qui interprète les blobs de conversation. Réponds en français, directement, clairement et factuellement. Ne prétends pas avoir effectué une action externe que tu n’as pas effectuée.'},...historyMessages(history),{role:'user',content:text}];
  const out=await engine.chat.completions.create({messages,temperature:0.7,max_tokens:512});
  const answer=clean(out?.choices?.[0]?.message?.content);if(!answer)throw new Error('local_model_empty_output');
  const responseBlob=emit('gthink.provider.response',{text:answer,mode:'local-webllm',model:LOCAL_MODEL,conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'return_local_interpretation');
  return {ok:true,text:answer,engine:'gthink-provider-blob-local-webllm',model:LOCAL_MODEL,providerBlobId:responseBlob?.blobId||null};
 }catch(error){const err=clean(error?.message||error)||'local_model_error';emit('gthink.provider.error',{error:err,mode:'local-webllm',conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');return {ok:false,error:err}}
}
async function askRemote(text,history,meta,a){
 const requestBlob=emit('gthink.provider.request',{conversationId:meta.conversationId,mode:'remote-gateway',messageBytes:new TextEncoder().encode(text).byteLength,historyItems:Array.isArray(history)?history.length:0,model:a.model},meta.parentBlobId,'request_remote_interpretation');
 let r,data;
 try{r=await fetch(a.url,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify({message:text,history:Array.isArray(history)?history.slice(-12):[],sessionId:sessionId(),surface:'gthink-public',transport:'blob-provider'})});try{data=await r.json()}catch{data=null}}catch(error){const err='provider_network_error';emit('gthink.provider.error',{error:err,detail:clean(error?.message||error).slice(0,160),mode:'remote-gateway',conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');return {ok:false,error:err}}
 if(!r.ok||data?.ok===false){const err=clean(data?.error)||`provider_http_${r.status}`;emit('gthink.provider.error',{error:err,status:r.status,mode:'remote-gateway',conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');return {ok:false,error:err,status:r.status}}
 const out=clean(data?.text);if(!out){emit('gthink.provider.error',{error:'provider_empty_output',mode:'remote-gateway',conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');return {ok:false,error:'provider_empty_output'}}
 const responseBlob=emit('gthink.provider.response',{text:out,mode:'remote-gateway',model:clean(data?.model)||a.model,correlationId:clean(data?.correlationId)||null,conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'return_remote_interpretation');
 return {ok:true,text:out,engine:'gthink-provider-blob-remote',model:clean(data?.model)||a.model,correlationId:clean(data?.correlationId)||null,providerBlobId:responseBlob?.blobId||null,rawBlob:data?.blob||null};
}
async function ask(message,history=[],meta={}){
 const text=clean(message);if(!text)return {ok:false,error:'empty_message'};
 let c=null,a=null,configError=null;
 try{c=await loadConfig();a=adapter(c)}catch(error){configError=clean(error?.message||error)}
 if(a){const remote=await askRemote(text,history,meta,a);if(remote.ok)return remote;return askLocal(text,history,meta,remote.error)}
 emit('gthink.provider.state',{state:'remote_gateway_unavailable',reason:configError||'not_configured',conversationId:meta.conversationId},meta.parentBlobId,'announce_provider_state');
 return askLocal(text,history,meta,configError||'provider_gateway_not_configured');
}
async function status(){
 let c=null,a=null,error=null;try{c=await loadConfig(true);a=adapter(c)}catch(e){error=clean(e?.message||e)}
 return {schema:SCHEMA,configured:!!a||!!navigator.gpu,remoteConfigured:!!a,localEligible:!!navigator.gpu,localReady:!!localEngine,configSchema:c?.schema||null,status:c?.status||null,transport:c?.transport||null,model:a?.model||LOCAL_MODEL,error};
}
window.GTHINK_PROVIDER_BLOB=Object.freeze({schema:SCHEMA,ask,status,reload:()=>loadConfig(true),localModel:LOCAL_MODEL});
emit('gthink.provider.ready',{state:'ready',localEligible:!!navigator.gpu,localModel:LOCAL_MODEL},null,'announce_provider_ready');
})();
