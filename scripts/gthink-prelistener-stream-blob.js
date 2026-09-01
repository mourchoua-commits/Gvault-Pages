(()=>{'use strict';
const SCHEMA='GTHINK_PRELISTENER_STREAM_BLOB_V8_RELAY';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThinkPrelistener';
const CHANNELS=['gvault.public.blobs.v2','gvault.public.blobs.v1'];
const DOWNSTREAM_TTL=20000;
const MAX_QUEUE=32;
let attached=false,downstreamReadyAt=0,heartbeat=null;
const channels=[],queue=new Map();
function uid(prefix='gpre'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function downstreamReady(){return Date.now()-downstreamReadyAt<DOWNSTREAM_TTL}
function speak(kind,payload={},parentBlobId=null,meta={}){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid(),parentBlobId,conversationId:meta.conversationId||payload?.conversationId||'gthink-prelistener',kind,role:meta.role||'prelistener',from:meta.from||NAME,to:meta.to||'public.bus',intent:meta.intent||'prelisten_stream',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:meta.text,payload:{...payload,schema:SCHEMA},understoodBy:['GThinkPrelistener','GThinkMini','GThink','public-kernel','public-ui','throughput-guard'],silent:true,muted:false})}
function announce(){speak('gthink.prelistener.ready',{state:'prelistener_ready',name:NAME,mode:'relay-buffer-before-gthink',downstreamReady:downstreamReady(),miniSwarmReady:!!window.GTHINK_MINI_LISTENER_SWARM,gthinkReady:!!window.GTHINK_PUBLIC_RESPONDER?.attached,throughputGuardReady:!!window.GTHINK_THROUGHPUT_GUARD,queued:queue.size,streamUrl:api()?.streamUrl||null},null,{role:'prelistener',from:NAME,to:'public.bus',intent:'announce_prelistener_ready',text:'GThink prelistener relay ready'})}
function trimQueue(){while(queue.size>MAX_QUEUE)queue.delete(queue.keys().next().value)}
function queueRequest(blob){if(!blob?.blobId||queue.has(blob.blobId))return;queue.set(blob.blobId,blob);trimQueue();speak('gthink.prelistener.buffered',{gatewayBlobId:blob.blobId,requestBlobId:blob.parentBlobId||blob.payload?.requestBlobId||null,queued:queue.size,conversationId:blob.conversationId||null},blob.blobId,{role:'prelistener',from:NAME,to:'GThinkMini',intent:'buffer_before_gthink',conversationId:blob.conversationId})}
function replayQueued(){if(!downstreamReady()||!queue.size)return;for(const [id,request] of [...queue]){queue.delete(id);speak('gthink.prelistener.forward',{gatewayBlobId:id,requestBlobId:request.parentBlobId||request.payload?.requestBlobId||null,conversationId:request.conversationId||null},id,{role:'prelistener',from:NAME,to:'GThink',intent:'forward_buffered_stream',conversationId:request.conversationId});for(const ch of channels){try{ch.postMessage(request)}catch{}}}}
function markDownstream(blob){if(blob?.kind!=='gthink.listener.ready')return false;const from=String(blob.from||blob.payload?.name||'');if(!from||from===NAME||/prelistener/i.test(from))return false;downstreamReadyAt=Date.now();replayQueued();return true}
function onBlob(blob){if(!blob||blob.schema!==BLOB_SCHEMA)return;if(markDownstream(blob))return;if(blob.kind==='gateway.request'&&!downstreamReady())queueRequest(blob);if(blob.kind==='gateway.probe')announce()}
function attachChannels(){if(channels.length)return;for(const name of CHANNELS){try{const ch=new BroadcastChannel(name);ch.onmessage=e=>onBlob(e.data);channels.push(ch)}catch{}}}
function attach(){if(attached)return true;const a=api();if(!a?.speak||!a?.listen)return false;delete window.GTHINK_OFFLINE_ONLY;attachChannels();a.listen(onBlob);for(const b of a.hearLast?.(48)||[])onBlob(b);announce();heartbeat=setInterval(announce,5000);attached=true;window.GTHINK_PRELISTENER_STREAM_BLOB=Object.freeze({schema:SCHEMA,name:NAME,mode:'relay-buffer-before-gthink',get downstreamReady(){return downstreamReady()},get miniSwarmReady(){return !!window.GTHINK_MINI_LISTENER_SWARM},get gthinkReady(){return !!window.GTHINK_PUBLIC_RESPONDER?.attached},get throughputGuardReady(){return !!window.GTHINK_THROUGHPUT_GUARD},get queued(){return queue.size},flush:replayQueued});return true}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>200)clearInterval(timer)},25)}
})();