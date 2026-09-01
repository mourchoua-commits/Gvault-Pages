(()=>{'use strict';
const SCHEMA='GTHINK_PRELISTENER_STREAM_BLOB_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThinkPrelistener';
const WAIT_MS=45000;
let attached=false,downstream=null,downstreamName='GThink';
const waiters=new Set();
function uid(prefix='prelistener'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function speak(kind,payload={},parentBlobId=null,meta={}){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid('gpre'),parentBlobId,conversationId:meta.conversationId||payload?.conversationId||'gthink-prelistener',kind,role:meta.role||'prelistener',from:meta.from||NAME,to:meta.to||'public.bus',intent:meta.intent||'prelisten_stream',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:meta.text,payload:{...payload,schema:SCHEMA},understoodBy:['GThinkPrelistener','GThink','public-kernel','public-ui'],silent:true,muted:false})}
function announce(state='prelistener_ready'){speak('gthink.listener.ready',{state,name:NAME,mode:'prelistener-stream',downstreamReady:!!downstream,downstreamName,streamUrl:api()?.streamUrl||null},null,{role:'gthink',from:NAME,to:'public.bus',intent:'announce_prelistener_ready',text:'GThink prelistener stream ready'})}
function bindDownstream(handler,name='GThink'){
 if(typeof handler!=='function')throw new TypeError('downstream_listener_function_required');
 downstream=handler;downstreamName=name||'GThink';
 for(const w of [...waiters]){clearTimeout(w.timer);waiters.delete(w);w.resolve(downstream)}
 speak('gthink.prelistener.downstream.ready',{name:downstreamName,state:'downstream_ready'},null,{role:'gthink',from:NAME,to:'public.bus',intent:'bind_downstream'});
 announce('listener_ready');
 return ()=>{if(downstream===handler){downstream=null;speak('gthink.prelistener.downstream.waiting',{name:downstreamName,state:'waiting'},null,{role:'prelistener',from:NAME,to:'public.bus',intent:'unbind_downstream'});announce('prelistener_ready')}}
}
function waitForDownstream(){if(downstream)return Promise.resolve(downstream);return new Promise((resolve,reject)=>{const w={resolve,reject,timer:null};w.timer=setTimeout(()=>{waiters.delete(w);reject(new Error('gthink_downstream_listener_timeout'))},WAIT_MS);waiters.add(w)})}
async function preResponder(request){
 speak('gthink.prelistener.ingress',{requestBlobId:request?.blobId||null,message:String(request?.payload?.message||request?.text||'').slice(0,256),conversationId:request?.conversationId||null},request?.blobId||null,{role:'prelistener',from:NAME,to:'GThink',intent:'capture_stream_before_listener',conversationId:request?.conversationId});
 const handler=await waitForDownstream();
 const result=await handler(request);
 speak('gthink.prelistener.egress',{requestBlobId:request?.blobId||null,downstream:downstreamName,conversationId:request?.conversationId||null},request?.blobId||null,{role:'prelistener',from:NAME,to:'public-kernel',intent:'return_downstream_result',conversationId:request?.conversationId});
 return result
}
function attach(){if(attached)return true;const a=api();if(!a?.registerResponder)return false;a.registerResponder(preResponder,NAME);attached=true;announce();window.GTHINK_PRELISTENER_STREAM_BLOB=Object.freeze({schema:SCHEMA,name:NAME,mode:'prelistener-stream',bindDownstream,get downstreamReady(){return !!downstream},get downstreamName(){return downstreamName}});return true}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>200)clearInterval(timer)},25)}
})();
