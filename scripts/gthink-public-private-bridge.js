(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_PRIVATE_BRIDGE_CLIENT_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const REQUEST_SCHEMA='GTHINK_PUBLIC_PRIVATE_BRIDGE_REQUEST_V1';
const RESPONSE_SCHEMA='GTHINK_PUBLIC_PRIVATE_BRIDGE_RESPONSE_V1';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const CONFIG_URL=new URL('gvault-agent-gateway.json',SCRIPT_BASE).href;
const CONFIG_TTL_MS=15000;
const pending=new Map();
let config=null,configAt=0;
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function uid(prefix='gpubpriv'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function clean(v){return String(v??'').trim()}
function bytes(v){return new TextEncoder().encode(String(v??'')).byteLength}
async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text??'')));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sessionId(){let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}if(!id){id=uid('gas');try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}return id}
function emit(kind,payload={},parentBlobId=null,meta={}){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid(),parentBlobId,conversationId:meta.conversationId||payload?.conversationId||sessionId(),kind,role:meta.role||'bridge',from:meta.from||'GThinkPublicPrivateBridge',to:meta.to||'public.bus',intent:meta.intent||'route_public_private',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:meta.text,display:meta.text,payload:{...payload,bridgeSchema:SCHEMA},understoodBy:['GThink','GThinkMini','public-kernel','public-ui','private-bridge'],silent:true,muted:false})}
async function loadConfig(force=false){if(!force&&config&&Date.now()-configAt<CONFIG_TTL_MS)return config;const r=await fetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('gthink_bridge_config_http_'+r.status);const c=await r.json();if(!c?.baseUrl)throw new Error('gthink_private_bridge_not_discovered');config=c;configAt=Date.now();return c}
function bridgeAdapter(c){const base=clean(c?.baseUrl||c?.httpAdapter?.baseUrl).replace(/\/+$/,'');const path=clean(c?.privateBridgePath)||'/v1/gthink-private-bridge';if(!base)return null;return {url:base+(path.startsWith('/')?path:'/'+path),path,schema:c?.privateBridgeSchema||RESPONSE_SCHEMA}}
function historyFor(request){return (Array.isArray(request?.payload?.history)?request.payload.history:[]).slice(-12).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content)})).filter(x=>x.content)}
function requestMessage(request){return clean(request?.payload?.message||request?.text)}
async function perform(request){
 const message=requestMessage(request);if(!message)throw new Error('gthink_bridge_empty_message');
 const c=await loadConfig(),adapter=bridgeAdapter(c);if(!adapter)throw new Error('gthink_private_bridge_not_discovered');
 const messageSha=await sha256(message),correlationId=uid('corr');
 emit('gthink.private.handoff',{state:'handoff',correlationId,publicGatewayBlobId:request.blobId,publicUserBlobId:request.parentBlobId||request?.payload?.requestBlobId||null,messageSha256:messageSha,messageBytes:bytes(message),privateBridgePath:adapter.path},request.blobId,{role:'bridge',from:'GThinkPublicPrivateBridge',to:'private-bridge',intent:'handoff_public_blob_to_private',conversationId:request.conversationId});
 const body={schema:REQUEST_SCHEMA,sessionId:sessionId(),correlationId,benchmark:request?.payload?.benchmark===true,publicBlob:{blobId:request.blobId,conversationId:request.conversationId||sessionId(),text:message,byteLength:bytes(message),sha256:messageSha},history:historyFor(request)};
 let r;try{r=await fetch(adapter.url,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify(body)})}catch(e){emit('gthink.private.error',{state:'network_error',correlationId,publicGatewayBlobId:request.blobId,error:clean(e?.message||e).slice(0,160)},request.blobId,{role:'bridge',from:'GThinkPublicPrivateBridge',to:'public-kernel',intent:'report_private_bridge_error',conversationId:request.conversationId});throw new Error('gthink_private_bridge_network_error')}
 let data=null;try{data=await r.json()}catch{}
 if(!r.ok||data?.ok!==true){const err=clean(data?.error)||`gthink_private_bridge_http_${r.status}`;emit('gthink.private.error',{state:'rejected',correlationId,publicGatewayBlobId:request.blobId,status:r.status,error:err},request.blobId,{role:'bridge',from:'GThinkPublicPrivateBridge',to:'public-kernel',intent:'report_private_bridge_error',conversationId:request.conversationId});throw new Error(err)}
 if(data?.schema!==RESPONSE_SCHEMA)throw new Error('gthink_private_bridge_response_schema_invalid');
 emit('gthink.private.accepted',{state:'accepted',correlationId:data.correlationId||correlationId,publicGatewayBlobId:request.blobId,privateRequestBlobId:data?.privateRequestRef?.blobId||null,privateRequestSha256:data?.privateRequestRef?.sha256||null},request.blobId,{role:'bridge',from:'private-bridge',to:'public-kernel',intent:'confirm_private_acceptance',conversationId:request.conversationId});
 const release=data?.release;if(release?.allowPublic!==true)throw new Error('gthink_private_release_not_authorized');
 const text=clean(release.text);if(!text)throw new Error('gthink_private_release_empty');
 if(bytes(text)!==Number(release.byteLength))throw new Error('gthink_private_release_byte_length_mismatch');
 const releaseSha=await sha256(text);if(releaseSha!==clean(release.sha256).toLowerCase())throw new Error('gthink_private_release_sha256_mismatch');
 emit('gthink.private.release',{state:'released',correlationId:data.correlationId||correlationId,publicGatewayBlobId:request.blobId,privateRequestBlobId:data?.privateRequestRef?.blobId||null,privateResponseBlobId:data?.privateResponseRef?.blobId||null,privateResponseSha256:data?.privateResponseRef?.sha256||null,publicTextSha256:releaseSha,publicTextBytes:bytes(text),releasePolicy:release.policy||'EXPLICIT_DECLASSIFICATION_V1',allowPublic:true},request.blobId,{role:'bridge',from:'private-bridge',to:'public-kernel',intent:'confirm_explicit_public_release',conversationId:request.conversationId});
 return {schema:SCHEMA,text,engine:'gthink-private-bridge',model:data?.model||c?.model||null,correlationId:data.correlationId||correlationId,privateRequestRef:data?.privateRequestRef||null,privateResponseRef:data?.privateResponseRef||null,publicTextSha256:releaseSha,releasePolicy:release.policy||null,actionsAuthorized:false};
}
function askRequest(request){const id=request?.blobId;if(!id)return Promise.reject(new Error('gthink_bridge_request_id_required'));if(pending.has(id))return pending.get(id);const p=perform(request).finally(()=>{setTimeout(()=>pending.delete(id),5000)});pending.set(id,p);return p}
async function status(){try{const c=await loadConfig(true),a=bridgeAdapter(c);return {schema:SCHEMA,configured:!!a,url:a?.url||null,path:a?.path||null,responseSchema:a?.schema||null,status:c?.status||null,model:c?.model||null}}catch(e){return {schema:SCHEMA,configured:false,error:clean(e?.message||e)}}}
window.GTHINK_PUBLIC_PRIVATE_BRIDGE=Object.freeze({schema:SCHEMA,requestSchema:REQUEST_SCHEMA,responseSchema:RESPONSE_SCHEMA,askRequest,status,reload:()=>loadConfig(true),sha256});
emit('gthink.private.bridge.ready',{state:'client_ready',requestSchema:REQUEST_SCHEMA,responseSchema:RESPONSE_SCHEMA},null,{role:'bridge',from:'GThinkPublicPrivateBridge',to:'public.bus',intent:'announce_private_bridge_client_ready'});
})();
