import {inboxFromVerifiedScoutState,sealAgentPublicOutbound,verifyAgentPublicOutbound} from './public-scout-agent-core-v1.mjs';
const INBOX_KEY='gvault.ai.public.inbox.v1',OUTBOX_KEY='gvault.ai.public.outbox.v1';
let writer=null;
function load(key){try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value.slice(-250)))}catch{}}
function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail:structuredClone(detail)}))}
function appendInbox(incoming){const prior=load(INBOX_KEY),seen=new Set(prior.map(x=>x.id));const added=incoming.filter(x=>!seen.has(x.id));if(added.length){const merged=[...prior,...added];save(INBOX_KEY,merged);emit('gvault:ai-public-inbox',{added:added.length,total:merged.length,items:added})}return {status:'PASS',added:added.length,total:load(INBOX_KEY).length}}
function queueOutbound(packet,reason=null){const out=load(OUTBOX_KEY);if(!out.some(x=>x.packetId===packet.packetId)){out.push(packet);save(OUTBOX_KEY,out)}const detail={packetId:packet.packetId,status:'SEALED_AWAITING_TRUSTED_WRITER',reason:reason?String(reason).slice(0,160):null};emit('gvault:ai-public-outbox',detail);return {status:'SEALED_AWAITING_TRUSTED_WRITER',packet,reason:detail.reason}}
export function ingestVerifiedScoutState(state){return appendInbox(inboxFromVerifiedScoutState(state))}
export async function ingestVerifiedAgentMessage(state={}){
  if(state.observerProof!=='AI_MESSAGE_HASH_PLUS_PUBLIC_ACK_EXACT_COMMIT')throw new Error('AGENT_MESSAGE_UNVERIFIED');
  if(state.integrity?.state!=='PASS'||state.publicAck?.status!=='ACKNOWLEDGED_PUBLIC_AI_MESSAGE')throw new Error('AGENT_MESSAGE_INTEGRITY_REQUIRED');
  if(!/^[a-f0-9]{40}$/i.test(state.publicDataCommitSha||''))throw new Error('AGENT_MESSAGE_DATA_COMMIT_REQUIRED');
  await verifyAgentPublicOutbound(state.packet);
  const item={schema:'GVAULT_AI_PUBLIC_INBOX_ITEM_V1',id:`agent-message:${state.packet.packetId}`,kind:'agent_public_message',engine:'public-agent-relay',summary:String(state.packet.text||''),at:state.publishedAt||state.packet.createdAt||new Date().toISOString(),visibility:'PUBLIC',replyTo:state.packet.replyTo||null,topic:state.packet.topic||null,channel:state.packet.channel||null,proofRefs:[`gitc:${state.publicDataCommitSha}`,`message:${state.publicMessageSha256}`,`ack:${state.publicAck.ackDigest}`],publicDataCommitSha:state.publicDataCommitSha,publicMessageSha256:state.publicMessageSha256,publicAckDigest:state.publicAck.ackDigest,payloadSha256:state.packet.payloadSha256,receivedAt:new Date().toISOString()};
  return appendInbox([item]);
}
export function receive({limit=50,afterId=null}={}){let rows=load(INBOX_KEY);if(afterId){const i=rows.findIndex(x=>x.id===afterId);if(i>=0)rows=rows.slice(i+1)}return rows.slice(-Math.max(1,Math.min(250,Number(limit)||50))).map(x=>structuredClone(x))}
export function clearReceived(){localStorage.removeItem(INBOX_KEY);emit('gvault:ai-public-inbox-cleared',{});return true}
export function registerWriter(fn){if(fn!==null&&typeof fn!=='function')throw new TypeError('AGENT_WRITER_FUNCTION_REQUIRED');writer=fn;return Boolean(writer)}
export async function prepareOutbound(payload){return sealAgentPublicOutbound(payload)}
export async function produce(payload){
  const packet=await sealAgentPublicOutbound(payload);await verifyAgentPublicOutbound(packet);
  if(writer){
    try{const result=await writer(structuredClone(packet));emit('gvault:ai-public-produced',{packetId:packet.packetId,result});return {status:'DISPATCHED_TO_TRUSTED_WRITER',packet,result}}
    catch(error){return queueOutbound(packet,error?.message||error)}
  }
  return queueOutbound(packet,'NO_TRUSTED_WRITER');
}
export function pendingOutbound(){return load(OUTBOX_KEY).map(x=>structuredClone(x))}
export function acknowledgeOutbound(packetId){const before=load(OUTBOX_KEY),after=before.filter(x=>x.packetId!==packetId);save(OUTBOX_KEY,after);return before.length-after.length}
export function getState(){return {schema:'GVAULT_AI_PUBLIC_BRIDGE_STATE_V1',inbox:load(INBOX_KEY).length,outbox:load(OUTBOX_KEY).length,writerAttached:Boolean(writer),networkWriterEmbedded:false}}
const api=Object.freeze({schema:'GVAULT_AI_PUBLIC_BRIDGE_V1',ingestVerifiedScoutState,ingestVerifiedAgentMessage,receive,clearReceived,registerWriter,prepareOutbound,produce,pendingOutbound,acknowledgeOutbound,getState,verifyAgentPublicOutbound});
window.GVAULT_AI_PUBLIC_BRIDGE_V1=api;
export default api;
