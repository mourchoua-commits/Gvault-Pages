import {verifyAgentPublicOutbound} from './public-scout-agent-core-v1.mjs';

const OWNER='mourchoua-commits';
const PRIVATE_REPO='Gvault';
const PRIVATE_BRANCH='experiment/power-ranger-public-scout-20260830';
const OUTBOX_ROOT='ops/public-scout/agent-outbox';
const CURRENT_PATH=`${OUTBOX_ROOT}/current.json`;
const API=`https://api.github.com/repos/${OWNER}/${PRIVATE_REPO}`;

function b64encode(text){
  const bytes=new TextEncoder().encode(String(text));
  let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(text){
  const bin=atob(String(text||'').replace(/\n/g,''));
  return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));
}
function headers(token){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`}}
async function request(fetchImpl,url,token,init={}){
  const response=await fetchImpl(url,{...init,cache:'no-store',headers:{...headers(token),...(init.headers||{})}});
  if(response.status===404)return {missing:true,response};
  if(!response.ok){const body=await response.text().catch(()=>String(response.status));const error=new Error(`AI_PRIVATE_OUTBOX_HTTP_${response.status}: ${body.slice(0,120)}`);error.status=response.status;throw error}
  return {missing:false,data:response.status===204?null:await response.json(),response};
}
async function getFile(fetchImpl,path,token){
  const url=`${API}/contents/${path}?ref=${encodeURIComponent(PRIVATE_BRANCH)}&ts=${Date.now()}`;
  const result=await request(fetchImpl,url,token);
  if(result.missing)return null;
  return result.data;
}
async function putFile(fetchImpl,path,packet,token,sha=null){
  const content=JSON.stringify(packet,null,2)+'\n';
  const body={message:`Power Ranger Violet — range le paquet IA ${packet.packetId}. Intégrité GVault: PASS. Le Megazord ferme le casier avant de rendre la clé. [PR1:VT:TX:OK:${packet.payloadSha256.slice(0,12)}]`,content:b64encode(content),branch:PRIVATE_BRANCH};
  if(sha)body.sha=sha;
  const result=await request(fetchImpl,`${API}/contents/${path}`,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return result.data;
}
function packetFromGitFile(file){
  if(!file?.content)return null;
  try{return JSON.parse(b64decode(file.content))}catch{return null}
}

export async function writeSealedPacketToPrivateOutbox(packet,{sasToken='',fetchImpl=globalThis.fetch}={}){
  await verifyAgentPublicOutbound(packet);
  const token=String(sasToken||'').trim();
  if(!token)throw new Error('SAS_PRIVATE_WRITER_CLOSED');
  if(typeof fetchImpl!=='function')throw new Error('AI_PRIVATE_WRITER_FETCH_REQUIRED');
  const pendingPath=`${OUTBOX_ROOT}/pending/${packet.packetId}.json`;

  const pending=await getFile(fetchImpl,pendingPath,token);
  let pendingCommitSha=null;
  if(pending){
    const existing=packetFromGitFile(pending);
    if(existing?.packetId!==packet.packetId||existing?.payloadSha256!==packet.payloadSha256)throw new Error('AI_PRIVATE_PENDING_COLLISION');
  }else{
    const saved=await putFile(fetchImpl,pendingPath,packet,token);
    pendingCommitSha=saved?.commit?.sha||null;
  }

  const current=await getFile(fetchImpl,CURRENT_PATH,token);
  const currentPacket=packetFromGitFile(current);
  if(currentPacket?.packetId===packet.packetId&&currentPacket?.payloadSha256===packet.payloadSha256){
    return {status:'PRIVATE_OUTBOX_ALREADY_CURRENT',packetId:packet.packetId,payloadSha256:packet.payloadSha256,pendingPath,currentPath:CURRENT_PATH,pendingCommitSha,currentCommitSha:null};
  }
  const savedCurrent=await putFile(fetchImpl,CURRENT_PATH,packet,token,current?.sha||null);
  return {status:'PRIVATE_OUTBOX_STORED',packetId:packet.packetId,payloadSha256:packet.payloadSha256,pendingPath,currentPath:CURRENT_PATH,pendingCommitSha,currentCommitSha:savedCurrent?.commit?.sha||null};
}

export function installPrivateAgentWriter(agentBridge,{documentRef=globalThis.document,windowRef=globalThis.window,fetchImpl=globalThis.fetch}={}){
  if(!agentBridge?.registerWriter)throw new Error('AI_BRIDGE_REQUIRED');
  let sasToken='';
  const write=packet=>writeSealedPacketToPrivateOutbox(packet,{sasToken,fetchImpl});
  agentBridge.registerWriter(write);
  const flush=async()=>{
    for(const packet of agentBridge.pendingOutbound?.()||[]){
      try{await write(packet);agentBridge.acknowledgeOutbound?.(packet.packetId)}catch(error){if(error?.status===401||error?.status===403)sasToken='';break}
    }
  };
  const arm=()=>{
    const connect=documentRef?.querySelector?.('#connect');
    const lock=documentRef?.querySelector?.('#lock');
    if(connect)connect.addEventListener('click',()=>{const value=documentRef.querySelector?.('#token')?.value?.trim?.()||'';if(value){sasToken=value;setTimeout(()=>void flush(),350)}},{capture:true});
    if(lock)lock.addEventListener('click',()=>{sasToken='';},{capture:true});
  };
  if(documentRef?.readyState==='loading')documentRef.addEventListener('DOMContentLoaded',arm,{once:true});else arm();
  windowRef?.addEventListener?.('pagehide',()=>{sasToken='';},{once:true});
  return Object.freeze({schema:'GVAULT_AI_PRIVATE_WRITER_V1',write,flush,setSasToken(value){sasToken=String(value||'').trim();return Boolean(sasToken)},clearSasToken(){sasToken='';return true},getState(){return {sasOpen:Boolean(sasToken),branch:PRIVATE_BRANCH,currentPath:CURRENT_PATH}}});
}
