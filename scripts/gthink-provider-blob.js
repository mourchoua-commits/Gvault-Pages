(()=>{'use strict';
const SCHEMA='GTHINK_PROVIDER_BLOB_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const SCRIPT_URL=document.currentScript?.src||location.href;
const CONFIG_URL=new URL('gvault-agent-gateway.json',new URL('.',SCRIPT_URL)).href;
const CACHE_MS=15000;
let cached=null,cachedAt=0;
function clean(v){return String(v??'').trim()}
function uid(prefix='gthink-provider'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function emit(kind,payload={},parentBlobId=null,intent='observe'){
 const a=api();if(!a?.speak)return null;
 return a.speak({schema:BLOB_SCHEMA,blobId:uid(),parentBlobId,conversationId:payload?.conversationId||'gthink-provider',kind,role:'provider',from:'GThinkProviderBlob',to:'GThink',intent,language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:typeof payload?.text==='string'?payload.text:undefined,payload:{...payload,providerSchema:SCHEMA},understoodBy:['GThink','public-kernel','gateway-adapter','public-ui'],silent:true,muted:false});
}
function sessionId(){
 let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}
 if(!id){id='gthink-'+(crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}
 return id;
}
async function loadConfig(force=false){
 if(!force&&cached&&Date.now()-cachedAt<CACHE_MS)return cached;
 const r=await fetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});
 if(!r.ok)throw new Error('provider_config_http_'+r.status);
 const c=await r.json();
 if(!['GVAULT_AGENT_GATEWAY_CONFIG_V1','GVAULT_AGENT_GATEWAY_CONFIG_V2'].includes(c?.schema))throw new Error('provider_config_schema');
 cached=c;cachedAt=Date.now();return c;
}
function adapter(c){
 const base=clean(c?.httpAdapter?.enabled?c?.httpAdapter?.baseUrl:c?.baseUrl);
 const path=clean(c?.httpAdapter?.enabled?c?.httpAdapter?.chatPath:c?.chatPath)||'/api/vault/chat';
 if(!base)return null;
 return {url:base.replace(/\/+$/,'')+(path.startsWith('/')?path:'/'+path),model:clean(c?.model)||null};
}
async function ask(message,history=[],meta={}){
 const text=clean(message);if(!text)return {ok:false,error:'empty_message'};
 let c,a;
 try{c=await loadConfig();a=adapter(c)}catch(error){
  emit('gthink.provider.error',{error:clean(error?.message||error),stage:'config',conversationId:meta.conversationId},meta.parentBlobId,'report_provider_error');
  return {ok:false,error:clean(error?.message||error),stage:'config'};
 }
 if(!a){
  emit('gthink.provider.state',{state:'gateway_not_configured',conversationId:meta.conversationId},meta.parentBlobId,'announce_provider_state');
  return {ok:false,error:'provider_gateway_not_configured'};
 }
 const requestBlob=emit('gthink.provider.request',{conversationId:meta.conversationId,messageBytes:new TextEncoder().encode(text).byteLength,historyItems:Array.isArray(history)?history.length:0,model:a.model},meta.parentBlobId,'request_remote_interpretation');
 let r,data;
 try{
  r=await fetch(a.url,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify({message:text,history:Array.isArray(history)?history.slice(-12):[],sessionId:sessionId(),surface:'gthink-public',transport:'blob-provider'})});
  try{data=await r.json()}catch{data=null}
 }catch(error){
  const err='provider_network_error';emit('gthink.provider.error',{error:err,detail:clean(error?.message||error).slice(0,160),conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');
  return {ok:false,error:err};
 }
 if(!r.ok||data?.ok===false){
  const err=clean(data?.error)||`provider_http_${r.status}`;
  emit('gthink.provider.error',{error:err,status:r.status,conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');
  return {ok:false,error:err,status:r.status};
 }
 const out=clean(data?.text);if(!out){emit('gthink.provider.error',{error:'provider_empty_output',conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'report_provider_error');return {ok:false,error:'provider_empty_output'}}
 const responseBlob=emit('gthink.provider.response',{text:out,model:clean(data?.model)||a.model,correlationId:clean(data?.correlationId)||null,conversationId:meta.conversationId},requestBlob?.blobId||meta.parentBlobId,'return_remote_interpretation');
 return {ok:true,text:out,engine:'gthink-provider-blob',model:clean(data?.model)||a.model,correlationId:clean(data?.correlationId)||null,providerBlobId:responseBlob?.blobId||null,rawBlob:data?.blob||null};
}
async function status(){
 try{const c=await loadConfig(true),a=adapter(c);return {schema:SCHEMA,configured:!!a,configSchema:c?.schema||null,status:c?.status||null,transport:c?.transport||null,model:a?.model||c?.model||null}}catch(error){return {schema:SCHEMA,configured:false,error:clean(error?.message||error)}}
}
window.GTHINK_PROVIDER_BLOB=Object.freeze({schema:SCHEMA,ask,status,reload:()=>loadConfig(true)});
emit('gthink.provider.ready',{state:'ready'},null,'announce_provider_ready');
})();
