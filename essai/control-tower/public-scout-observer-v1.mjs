const ACK_URL='./public-scout/ack/latest.json';
const DATA_PATH='essai/control-tower/public-scout/data/latest.json';
const RAW_REPO='https://raw.githubusercontent.com/mourchoua-commits/Gvault-Pages';
const COMMIT_VIEW='https://github.com/mourchoua-commits/Gvault-Pages/commit/';
const POLL_MS=120000;

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
async function sha256Text(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function clone(value){return JSON.parse(JSON.stringify(value));}
async function verifyState(state){
  if(state?.schema!=='GVAULT_PUBLIC_SCOUT_LATEST_V1'||state?.status!=='PASS')throw new Error('PUBLIC_SCOUT_STATE_SCHEMA');
  if(!/^[a-f0-9]{64}$/i.test(state.translationDigest||'')||!/^[a-f0-9]{64}$/i.test(state.sourceBodySha256||'')||!/^[a-f0-9]{64}$/i.test(state.publicStateSha256||''))throw new Error('PUBLIC_SCOUT_STATE_DIGEST_TYPE');
  if(state.integrity?.rawBodyPublished!==false||state.integrity?.privateCredentialRequired!==false||state.integrity?.translatorNetworkUsed!==false)throw new Error('PUBLIC_SCOUT_STATE_POLICY');
  const {publicStateSha256,...core}=state;
  const computed=await sha256Text(JSON.stringify(stable(core)));
  if(computed!==publicStateSha256)throw new Error('PUBLIC_SCOUT_STATE_HASH_MISMATCH');
  return computed;
}
async function verifyAck(ack){
  if(ack?.schema!=='GVAULT_PUBLIC_SCOUT_PUBLIC_ACK_V1'||ack?.status!=='ACKNOWLEDGED_PUBLIC_STATE')throw new Error('PUBLIC_SCOUT_ACK_SCHEMA');
  if(!/^[a-f0-9]{40}$/i.test(ack.dataCommitSha||''))throw new Error('PUBLIC_SCOUT_ACK_COMMIT_TYPE');
  if(!/^[a-f0-9]{64}$/i.test(ack.ackDigest||'')||!/^[a-f0-9]{64}$/i.test(ack.translationDigest||'')||!/^[a-f0-9]{64}$/i.test(ack.publicStateSha256||''))throw new Error('PUBLIC_SCOUT_ACK_DIGEST_TYPE');
  if(ack.rawBodyPublished!==false||ack.privateDataPublished!==false||ack.authority!=='PUBLIC_ACK_REFERENCES_EXACT_DATA_COMMIT')throw new Error('PUBLIC_SCOUT_ACK_POLICY');
  const {ackDigest,...core}=ack;
  const computed=await sha256Text(JSON.stringify(stable(core)));
  if(computed!==ackDigest)throw new Error('PUBLIC_SCOUT_ACK_HASH_MISMATCH');
  return computed;
}
async function fetchJson(url,label){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${label}_HTTP_${r.status}`);return r.json();}
export async function readPublicScoutState(){
  const ackUrl=new URL(ACK_URL,location.href);ackUrl.searchParams.set('_',String(Date.now()));
  const ack=await fetchJson(ackUrl,'PUBLIC_SCOUT_ACK');await verifyAck(ack);
  const exactStateUrl=`${RAW_REPO}/${ack.dataCommitSha}/${DATA_PATH}`;
  const state=await fetchJson(`${exactStateUrl}?proof=${encodeURIComponent(ack.ackDigest.slice(0,16))}`,'PUBLIC_SCOUT_EXACT_STATE');await verifyState(state);
  if(state.translationDigest!==ack.translationDigest||state.publicStateSha256!==ack.publicStateSha256||state.sourceBodySha256!==ack.sourceBodySha256)throw new Error('PUBLIC_SCOUT_ACK_STATE_DIVERGENCE');
  return {...clone(state),publicAck:clone(ack),publicDataCommitSha:ack.dataCommitSha,publicCommitUrl:`${COMMIT_VIEW}${ack.dataCommitSha}`,observerVerifiedAt:new Date().toISOString(),observerProof:'PUBLIC_ACK_PLUS_EXACT_DATA_COMMIT'};
}
export function toControlTowerRawEvents(state){
  return (state?.observerEvents||[]).map((raw,index)=>({...clone(raw),_publicScoutIndex:index,_publicCommitSha:state.publicDataCommitSha||null,_publicStateSha256:state.publicStateSha256,_translationDigest:state.translationDigest,_ackDigest:state.publicAck?.ackDigest||null,_observerProof:state.observerProof,html_url:raw.url||state.publicCommitUrl||null}));
}
export function startPublicScoutObserver({pollMs=POLL_MS,onUpdate=()=>{},onError=()=>{}}={}){
  let stopped=false,timer=null,last=null,busy=false;
  const run=async()=>{
    if(stopped||busy)return;busy=true;
    try{
      const state=await readPublicScoutState();
      const proofKey=`${state.publicStateSha256}:${state.publicAck?.ackDigest||''}`;
      if(proofKey!==last){last=proofKey;onUpdate(state);window.dispatchEvent(new CustomEvent('gvault:public-scout-update',{detail:clone(state)}));}
    }catch(error){onError(error);window.dispatchEvent(new CustomEvent('gvault:public-scout-error',{detail:{message:String(error?.message||error),at:new Date().toISOString()}}));}
    finally{busy=false}
  };
  const arm=()=>{if(timer)clearInterval(timer);timer=setInterval(run,Math.max(30000,Number(pollMs)||POLL_MS));};
  void run();arm();
  const focus=()=>void run();window.addEventListener('focus',focus);const visibility=()=>{if(document.visibilityState==='visible')void run()};document.addEventListener('visibilitychange',visibility);
  return {stop(){stopped=true;if(timer)clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility)},refresh:run,getLastProof:()=>last};
}

window.GVAULT_PUBLIC_SCOUT_OBSERVER_V1=Object.freeze({schema:'GVAULT_PUBLIC_SCOUT_OBSERVER_V1',readPublicScoutState,toControlTowerRawEvents,startPublicScoutObserver});
