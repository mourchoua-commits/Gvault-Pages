import {inboxFromVerifiedScoutState,sealAgentPublicOutbound,verifyAgentPublicOutbound} from './public-scout-agent-core-v1.mjs';
const INBOX_KEY='gvault.ai.public.inbox.v1',OUTBOX_KEY='gvault.ai.public.outbox.v1';
let writer=null;
function load(key){try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value.slice(-250)))}catch{}}
function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail:structuredClone(detail)}))}
export function ingestVerifiedScoutState(state){
  const incoming=inboxFromVerifiedScoutState(state);
  const prior=load(INBOX_KEY),seen=new Set(prior.map(x=>x.id));
  const added=incoming.filter(x=>!seen.has(x.id));
  if(added.length){const merged=[...prior,...added];save(INBOX_KEY,merged);emit('gvault:ai-public-inbox',{added:added.length,total:merged.length,items:added})}
  return {status:'PASS',added:added.length,total:load(INBOX_KEY).length};
}
export function receive({limit=50,afterId=null}={}){
  let rows=load(INBOX_KEY);if(afterId){const i=rows.findIndex(x=>x.id===afterId);if(i>=0)rows=rows.slice(i+1)}
  return rows.slice(-Math.max(1,Math.min(250,Number(limit)||50))).map(x=>structuredClone(x));
}
export function clearReceived(){localStorage.removeItem(INBOX_KEY);emit('gvault:ai-public-inbox-cleared',{});return true}
export function registerWriter(fn){if(fn!==null&&typeof fn!=='function')throw new TypeError('AGENT_WRITER_FUNCTION_REQUIRED');writer=fn;return Boolean(writer)}
export async function prepareOutbound(payload){return sealAgentPublicOutbound(payload)}
export async function produce(payload){
  const packet=await sealAgentPublicOutbound(payload);await verifyAgentPublicOutbound(packet);
  if(writer){const result=await writer(structuredClone(packet));emit('gvault:ai-public-produced',{packetId:packet.packetId,result});return {status:'DISPATCHED_TO_TRUSTED_WRITER',packet,result}}
  const out=load(OUTBOX_KEY);if(!out.some(x=>x.packetId===packet.packetId)){out.push(packet);save(OUTBOX_KEY,out)}
  emit('gvault:ai-public-outbox',{packetId:packet.packetId,status:'SEALED_AWAITING_TRUSTED_WRITER'});
  return {status:'SEALED_AWAITING_TRUSTED_WRITER',packet};
}
export function pendingOutbound(){return load(OUTBOX_KEY).map(x=>structuredClone(x))}
export function acknowledgeOutbound(packetId){const before=load(OUTBOX_KEY),after=before.filter(x=>x.packetId!==packetId);save(OUTBOX_KEY,after);return before.length-after.length}
export function getState(){return {schema:'GVAULT_AI_PUBLIC_BRIDGE_STATE_V1',inbox:load(INBOX_KEY).length,outbox:load(OUTBOX_KEY).length,writerAttached:Boolean(writer),networkWriterEmbedded:false}}
const api=Object.freeze({schema:'GVAULT_AI_PUBLIC_BRIDGE_V1',ingestVerifiedScoutState,receive,clearReceived,registerWriter,prepareOutbound,produce,pendingOutbound,acknowledgeOutbound,getState,verifyAgentPublicOutbound});
window.GVAULT_AI_PUBLIC_BRIDGE_V1=api;
export default api;
