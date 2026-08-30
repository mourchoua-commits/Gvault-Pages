const SECRET_PATTERNS=[
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/i
];
function clean(v){return String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n').trim()}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
const canonical=value=>JSON.stringify(stable(value));
async function sha256(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function hasSecret(text){return SECRET_PATTERNS.some(re=>re.test(String(text||'')))}
export function inboxFromVerifiedScoutState(state={}){
  if(state.observerProof!=='STATE_HASH_PLUS_PUBLIC_ACK_EXACT_COMMIT')throw new Error('AGENT_INBOX_UNVERIFIED_SCOUT_STATE');
  if(state.integrity?.state!=='PASS'||state.publicAck?.status!=='ACKNOWLEDGED_PUBLIC_STATE')throw new Error('AGENT_INBOX_INTEGRITY_REQUIRED');
  if(!/^[a-f0-9]{40}$/i.test(state.publicDataCommitSha||''))throw new Error('AGENT_INBOX_DATA_COMMIT_REQUIRED');
  const common={visibility:'PUBLIC',publicDataCommitSha:state.publicDataCommitSha,publicStateSha256:state.publicStateSha256,publicAckDigest:state.publicAck?.ackDigest||null,translationDigest:state.translationDigest||null,receivedAt:new Date().toISOString()};
  const rows=(state.observerEvents||[]).map((e,index)=>({schema:'GVAULT_AI_PUBLIC_INBOX_ITEM_V1',id:String(e.id||`${state.publicStateSha256}:${index}`),kind:String(e.type||'public_event'),engine:String(e.engine||'public-scout'),summary:clean(e.summary||''),at:e.at||state.publishedAt||common.receivedAt,proofRefs:Array.isArray(e.proofRefs)?e.proofRefs.slice(0,12):[],...common}));
  rows.unshift({schema:'GVAULT_AI_PUBLIC_INBOX_ITEM_V1',id:`public-state:${state.publicStateSha256}`,kind:'public_state',engine:'public-scout-observer',summary:`État public vérifié ${String(state.publicStateSha256).slice(0,12)} · ACK ${String(state.publicAck?.ackDigest||'').slice(0,12)}`,at:state.publishedAt||common.receivedAt,proofRefs:[`gitc:${state.publicDataCommitSha}`,`state:${state.publicStateSha256}`,`ack:${state.publicAck?.ackDigest||''}`],...common});
  return rows;
}
export async function sealAgentPublicOutbound({text,topic='agent-public-message',replyTo=null,channel='CONTROL_TOWER',createdAt=null}={}){
  const safe=clean(text);
  if(!safe)throw new Error('AGENT_OUTBOUND_EMPTY');
  if(safe.length>1400)throw new Error('AGENT_OUTBOUND_TOO_LARGE');
  if(hasSecret(safe))throw new Error('AGENT_OUTBOUND_SECRET_PATTERN');
  const base={schema:'GVAULT_AI_PUBLIC_OUTBOUND_V1',version:1,visibility:'PUBLIC_ONLY',topic:clean(topic).slice(0,120),channel:clean(channel).slice(0,80),text:safe,replyTo:replyTo?clean(replyTo).slice(0,180):null,createdAt:createdAt||new Date().toISOString(),authoritative:false,rawPrivateDataAllowed:false};
  const payloadSha256=await sha256(canonical(base));
  return {...base,payloadSha256,packetId:`AIPUB-${payloadSha256.slice(0,20)}`};
}
export async function verifyAgentPublicOutbound(packet={}){
  if(packet.schema!=='GVAULT_AI_PUBLIC_OUTBOUND_V1'||packet.visibility!=='PUBLIC_ONLY'||packet.rawPrivateDataAllowed!==false)throw new Error('AGENT_OUTBOUND_POLICY');
  if(hasSecret(packet.text)||String(packet.text||'').length>1400)throw new Error('AGENT_OUTBOUND_CONTENT_POLICY');
  const {payloadSha256,packetId,...base}=packet;
  const expected=await sha256(canonical(base));
  if(expected!==payloadSha256||packetId!==`AIPUB-${expected.slice(0,20)}`)throw new Error('AGENT_OUTBOUND_HASH_MISMATCH');
  return {status:'PASS',payloadSha256:expected,packetId};
}
