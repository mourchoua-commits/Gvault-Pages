(()=>{'use strict';
const SCHEMA='GTHINK_PING_PONG_ALTER_EGO_LOOP_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const LOOP_ID='gthink-health-infinite-ping-pong';
const INTERVAL_MS=1500;
const ENTITIES=Object.freeze({
  ping:'blob:gthink:health:ping:primary',
  pingAlter:'blob:gthink:health:ping:alter-ego',
  pong:'blob:gthink:health:pong:primary',
  pongAlter:'blob:gthink:health:pong:alter-ego'
});
let active=true,generation=0,timer=null,unlisten=null,lastPingBlobId=null,lastPongBlobIds=[],cycles=0;
const processed=new Set();
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function uid(prefix='health'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function clean(v){return String(v??'').trim()}
function virtualMultiplicity(gen){return Object.freeze({base:2,exponent:Math.max(0,Number(gen)||0),notation:`2^${Math.max(0,Number(gen)||0)}`,materializedPerCycle:2,policy:'VIRTUAL_MULTIPLICATION_WITH_BOUNDED_RUNTIME'})}
function emit(kind,entityId,alterEgoEntityId,parentBlobId,payload={}){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid(kind.endsWith('ping')?'ping':'pong'),parentBlobId:parentBlobId||null,conversationId:LOOP_ID,kind,role:'health',from:entityId,to:'public.bus',intent:kind.endsWith('ping')?'multiply_ping_into_pong':'prove_ping_alive',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:kind.endsWith('ping')?'PING':'PONG',payload:{meshSchema:SCHEMA,loopId:LOOP_ID,entityId,alterEgoEntityId,generation,...payload},understoodBy:['GThink','public-kernel','client-private-worker','private-bridge','health-mesh','public-ui'],silent:true,muted:false})}
function clearSchedule(){if(timer){clearTimeout(timer);timer=null}}
function scheduleNext(parentBlobId,nextGeneration){if(!active)return;clearSchedule();timer=setTimeout(()=>sendPing(nextGeneration,parentBlobId),INTERVAL_MS)}
function sendPing(nextGeneration=generation+1,parentBlobId=null){if(!active)return null;generation=Math.max(1,Number(nextGeneration)||1);const useAlter=generation%2===0,entityId=useAlter?ENTITIES.pingAlter:ENTITIES.ping,alterEgoEntityId=useAlter?ENTITIES.ping:ENTITIES.pingAlter;const blob=emit('gthink.health.ping',entityId,alterEgoEntityId,parentBlobId,{pair:'PING',phase:useAlter?'alter-ego':'primary',transformsInto:[ENTITIES.pong,ENTITIES.pongAlter],virtualMultiplicity:virtualMultiplicity(generation),cadenceMs:INTERVAL_MS});lastPingBlobId=blob?.blobId||null;return blob}
async function bridgeStatus(){try{const b=window.GTHINK_PUBLIC_PRIVATE_BRIDGE;if(!b?.status)return {configured:false,mode:'bridge-not-loaded',localWorkerConfigured:false};const s=await b.status();return {configured:s?.configured===true,mode:clean(s?.mode)||'unknown',localWorkerConfigured:s?.localWorkerConfigured===true,serverConfigured:s?.serverConfigured===true,status:clean(s?.status)||null}}catch(e){return {configured:false,mode:'status-error',localWorkerConfigured:false,error:clean(e?.message||e)}}}
async function answerPing(blob){if(!active||blob?.payload?.meshSchema!==SCHEMA||blob?.payload?.loopId!==LOOP_ID)return;if(processed.has(blob.blobId))return;processed.add(blob.blobId);if(processed.size>256)processed.delete(processed.values().next().value);generation=Math.max(generation,Number(blob?.payload?.generation)||1);const health=await bridgeStatus();const common={pair:'PONG',sourcePingBlobId:blob.blobId,sourcePingEntityId:blob?.payload?.entityId||blob?.from||null,workerHealth:health,virtualMultiplicity:virtualMultiplicity(generation+1),continuation:'ONE_SUCCESSOR_PING_AFTER_TWO_REAL_PONGS',cadenceMs:INTERVAL_MS};const p1=emit('gthink.health.pong',ENTITIES.pong,ENTITIES.pongAlter,blob.blobId,{...common,phase:'primary',siblingEntityId:ENTITIES.pongAlter});const p2=emit('gthink.health.pong',ENTITIES.pongAlter,ENTITIES.pong,blob.blobId,{...common,phase:'alter-ego',siblingEntityId:ENTITIES.pong});lastPongBlobIds=[p1?.blobId,p2?.blobId].filter(Boolean);cycles++;scheduleNext(p2?.blobId||p1?.blobId||blob.blobId,generation+1)}
function attach(){const a=api();if(!a?.listen||!a?.speak)return false;if(unlisten)return true;unlisten=a.listen(blob=>{if(blob?.kind==='gthink.health.ping')void answerPing(blob)},{kinds:['gthink.health.ping']});setTimeout(()=>sendPing(1),40);return true}
function start(){if(active&&unlisten)return status();active=true;if(!attach()){let tries=0;const t=setInterval(()=>{tries++;if(attach()||tries>240)clearInterval(t)},25)}else if(!timer)sendPing(generation+1);return status()}
function stop(){active=false;clearSchedule();return status()}
function status(){return {schema:SCHEMA,loopId:LOOP_ID,active,generation,cycles,cadenceMs:INTERVAL_MS,entities:ENTITIES,lastPingBlobId,lastPongBlobIds:[...lastPongBlobIds],virtualMultiplicity:virtualMultiplicity(generation),physicalPolicy:'2 real PONG blobs per PING; 1 successor PING keeps the loop bounded',streamUrl:api()?.streamUrl||'gvault://blobs/public/gthink/stream'}}
window.GTHINK_PING_PONG_ALTER_EGO=Object.freeze({schema:SCHEMA,entities:ENTITIES,start,stop,status,ping:()=>sendPing(generation+1,lastPongBlobIds.at(-1)||null)});
if(!attach()){let tries=0;const t=setInterval(()=>{tries++;if(attach()||tries>240)clearInterval(t)},25)}
})();
