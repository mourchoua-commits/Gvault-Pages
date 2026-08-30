const DEFAULT_BRANCH='experiment/power-ranger-public-scout-20260830';
const LATEST_URL='./public-scout/data/latest.json';
const COMMITS_API='https://api.github.com/repos/mourchoua-commits/Gvault-Pages/commits';
const DATA_PATH='essai/control-tower/public-scout/data/latest.json';
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
async function fetchPublicCommit(translationDigest,{branch=DEFAULT_BRANCH}={}){
  const u=new URL(COMMITS_API);
  u.searchParams.set('sha',branch);u.searchParams.set('path',DATA_PATH);u.searchParams.set('per_page','5');u.searchParams.set('_',String(Date.now()));
  const r=await fetch(u,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
  if(!r.ok)throw new Error(`PUBLIC_SCOUT_COMMIT_HTTP_${r.status}`);
  const rows=await r.json();
  const hit=(Array.isArray(rows)?rows:[]).find(c=>String(c?.commit?.message||'').includes(`GVAULT-Public-Scout-Translation: ${translationDigest}`));
  if(!hit?.sha)throw new Error('PUBLIC_SCOUT_PUBLIC_COMMIT_NOT_PROVEN');
  return {sha:hit.sha,htmlUrl:hit.html_url||null,committedAt:hit.commit?.committer?.date||null,subject:String(hit.commit?.message||'').split(/\r?\n/)[0]||''};
}
export async function readPublicScoutState({branch=DEFAULT_BRANCH}={}){
  const latest=new URL(LATEST_URL,location.href);latest.searchParams.set('_',String(Date.now()));
  const r=await fetch(latest,{cache:'no-store'});if(!r.ok)throw new Error(`PUBLIC_SCOUT_LATEST_HTTP_${r.status}`);
  const state=await r.json();await verifyState(state);
  const commit=await fetchPublicCommit(state.translationDigest,{branch});
  return {...clone(state),publicCommit:commit,observerVerifiedAt:new Date().toISOString(),observerProof:'STATE_HASH_PLUS_PUBLIC_COMMIT_TRAILER'};
}
export function toControlTowerRawEvents(state){
  return (state?.observerEvents||[]).map((raw,index)=>({...clone(raw),_publicScoutIndex:index,_publicCommitSha:state.publicCommit?.sha||null,_publicStateSha256:state.publicStateSha256,_translationDigest:state.translationDigest,_observerProof:state.observerProof,html_url:raw.url||state.publicCommit?.htmlUrl||null}));
}
export function startPublicScoutObserver({branch=DEFAULT_BRANCH,pollMs=POLL_MS,onUpdate=()=>{},onError=()=>{}}={}){
  let stopped=false,timer=null,last=null,busy=false;
  const run=async()=>{
    if(stopped||busy)return;busy=true;
    try{
      const state=await readPublicScoutState({branch});
      if(state.publicStateSha256!==last){last=state.publicStateSha256;onUpdate(state);window.dispatchEvent(new CustomEvent('gvault:public-scout-update',{detail:clone(state)}));}
    }catch(error){onError(error);window.dispatchEvent(new CustomEvent('gvault:public-scout-error',{detail:{message:String(error?.message||error),at:new Date().toISOString()}}));}
    finally{busy=false}
  };
  const arm=()=>{if(timer)clearInterval(timer);timer=setInterval(run,Math.max(30000,Number(pollMs)||POLL_MS));};
  void run();arm();
  const focus=()=>void run();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void run()});
  return {stop(){stopped=true;if(timer)clearInterval(timer);window.removeEventListener('focus',focus)},refresh:run,getLastDigest:()=>last};
}

window.GVAULT_PUBLIC_SCOUT_OBSERVER_V1=Object.freeze({schema:'GVAULT_PUBLIC_SCOUT_OBSERVER_V1',readPublicScoutState,toControlTowerRawEvents,startPublicScoutObserver,branch:DEFAULT_BRANCH});
