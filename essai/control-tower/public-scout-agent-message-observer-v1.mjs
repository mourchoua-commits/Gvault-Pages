import {verifyAgentPublicOutbound} from './public-scout-agent-core-v1.mjs';
const OWNER='mourchoua-commits',REPO='Gvault-Pages';
const ACK_URL='./public-scout/agent/ack/latest.json';
const MESSAGE_PATH='essai/control-tower/public-scout/agent/messages/latest.json';
const POLL_MS=120000;
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
async function sha256Text(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function verifyAgentMessageAck(ack){
  if(ack?.schema!=='GVAULT_AI_PUBLIC_MESSAGE_ACK_V1'||ack?.status!=='ACKNOWLEDGED_PUBLIC_AI_MESSAGE')throw new Error('AI_MESSAGE_ACK_SCHEMA');
  if(!/^[a-f0-9]{40}$/i.test(ack.dataCommitSha||'')||!/^[a-f0-9]{64}$/i.test(ack.ackDigest||''))throw new Error('AI_MESSAGE_ACK_DIGEST_TYPE');
  const {ackDigest,...base}=ack;const computed=await sha256Text(JSON.stringify(stable(base)));if(computed!==ackDigest)throw new Error('AI_MESSAGE_ACK_HASH_MISMATCH');
  if(ack.rawPrivateDataPublished!==false)throw new Error('AI_MESSAGE_ACK_PRIVATE_DATA_POLICY');
  if(ack.authority!=='PUBLIC_ACK_REFERENCES_EXACT_AI_MESSAGE_COMMIT')throw new Error('AI_MESSAGE_ACK_AUTHORITY');
  return {status:'PASS',ackDigest:computed,dataCommitSha:ack.dataCommitSha};
}
export async function verifyAgentMessageState(state,ack){
  if(state?.schema!=='GVAULT_AI_PUBLIC_MESSAGE_V1'||state?.status!=='PASS'||state?.integrity?.state!=='PASS')throw new Error('AI_MESSAGE_STATE_POLICY');
  if(state.integrity?.rawPrivateDataPublished!==false)throw new Error('AI_MESSAGE_STATE_PRIVATE_DATA_POLICY');
  await verifyAgentPublicOutbound(state.packet);
  const {publicMessageSha256,...core}=state;const computed=await sha256Text(JSON.stringify(stable(core)));if(computed!==publicMessageSha256)throw new Error('AI_MESSAGE_STATE_HASH_MISMATCH');
  if(publicMessageSha256!==ack.publicMessageSha256||state.packet.payloadSha256!==ack.payloadSha256||state.packet.packetId!==ack.packetId)throw new Error('AI_MESSAGE_ACK_BINDING_MISMATCH');
  return {status:'PASS',publicMessageSha256:computed,packetId:state.packet.packetId};
}
async function fetchExactMessage(commitSha){
  const u=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${commitSha}/${MESSAGE_PATH}`;
  const r=await fetch(`${u}?proof=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`AI_MESSAGE_EXACT_HTTP_${r.status}`);return r.json();
}
export async function readVerifiedAgentPublicMessage(){
  const ackUrl=new URL(ACK_URL,location.href);ackUrl.searchParams.set('_',Date.now());
  const ar=await fetch(ackUrl,{cache:'no-store'});if(!ar.ok)throw new Error(`AI_MESSAGE_ACK_HTTP_${ar.status}`);const ack=await ar.json();await verifyAgentMessageAck(ack);
  const state=await fetchExactMessage(ack.dataCommitSha);await verifyAgentMessageState(state,ack);
  return {...structuredClone(state),publicAck:structuredClone(ack),publicDataCommitSha:ack.dataCommitSha,observerProof:'AI_MESSAGE_HASH_PLUS_PUBLIC_ACK_EXACT_COMMIT',observerVerifiedAt:new Date().toISOString()};
}
export function startAgentPublicMessageObserver({pollMs=POLL_MS,onUpdate=()=>{},onError=()=>{}}={}){
  let timer=null,stopped=false,busy=false,last=null;
  const run=async()=>{if(stopped||busy)return;busy=true;try{const state=await readVerifiedAgentPublicMessage();if(state.publicMessageSha256!==last){last=state.publicMessageSha256;onUpdate(state);window.dispatchEvent(new CustomEvent('gvault:ai-public-message',{detail:structuredClone(state)}))}}catch(error){onError(error)}finally{busy=false}};
  void run();timer=setInterval(run,Math.max(30000,Number(pollMs)||POLL_MS));const focus=()=>void run();window.addEventListener('focus',focus);
  return {refresh:run,stop(){stopped=true;if(timer)clearInterval(timer);window.removeEventListener('focus',focus)},getLast:()=>last};
}
if(typeof window!=='undefined')window.GVAULT_AI_PUBLIC_MESSAGE_OBSERVER_V1=Object.freeze({schema:'GVAULT_AI_PUBLIC_MESSAGE_OBSERVER_V1',readVerifiedAgentPublicMessage,startAgentPublicMessageObserver,verifyAgentMessageAck,verifyAgentMessageState});
