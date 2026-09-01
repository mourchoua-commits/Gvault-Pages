const CHAIN_SCHEMA='GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_PUBLIC_RUNTIME_V1';
const PACKET_SCHEMA='GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_PACKET_V1';
const LATEST_URL=new URL('../../bridge/public-private-blob-chain/state/latest.json',import.meta.url).href;
const SENSITIVE_KEY=/pass(word|phrase)?|token|secret|authorization|api[-_ ]?key|sas/i;
const state={status:'BOOTING',lastPublicToPrivate:null,lastPrivateToPublic:null,pendingPrivateRelease:null,error:null};

function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function assert(c,m){if(!c)throw new Error(m);}
function pathParts(p){return String(p||'').split('.').map(x=>x.trim()).filter(Boolean);}
function readPath(source,p){let cur=source;for(const part of pathParts(p)){if(cur===null||cur===undefined||!(part in Object(cur)))return {found:false};cur=cur[part];}return {found:true,value:clone(cur)};}
function writePath(target,p,value){const parts=pathParts(p);let cur=target;for(let i=0;i<parts.length;i++){const part=parts[i];if(i===parts.length-1){cur[part]=value;break;}if(!cur[part]||typeof cur[part]!=='object'||Array.isArray(cur[part]))cur[part]={};cur=cur[part];}}
function select(payload,selectedPaths){assert(Array.isArray(selectedPaths)&&selectedPaths.length,'BLOB_CHAIN_SELECTION_REQUIRED');const out={};const unique=[...new Set(selectedPaths.map(x=>String(x||'').trim()).filter(Boolean))];for(const p of unique){const r=readPath(payload,p);assert(r.found,`BLOB_CHAIN_SELECTED_PATH_MISSING:${p}`);writePath(out,p,r.value);}return {payload:out,selectedPaths:unique};}
function sensitive(value){const found=[];const walk=(v,b='')=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){const p=b?`${b}.${k}`:k;if(SENSITIVE_KEY.test(k))found.push(p);walk(x,p);}};walk(value);return found;}
function gthink(){return window.GVAULT_GTHINK_SAS_V1?.getState?.()||null;}
function relay(){return window.GVAULT_PUBLIC_INPUT_RELAY||null;}
async function sha256(value){const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

async function dispatchToPrivate({payload,selectedPaths,explicit=false,reason=''}={}){
  assert(explicit===true,'BLOB_CHAIN_EXPLICIT_DISPATCH_REQUIRED');
  assert(gthink(),'BLOB_CHAIN_GTHINK_REQUIRED');
  const r=relay();assert(r?.capture,'BLOB_CHAIN_PUBLIC_INPUT_RELAY_UNAVAILABLE');
  const picked=select(payload,selectedPaths);const blocked=sensitive(picked.payload);assert(!blocked.length,`BLOB_CHAIN_SENSITIVE_DATA_BLOCKED:${blocked.join(',')}`);
  const core={schema:PACKET_SCHEMA,version:1,direction:'PUBLIC_TO_PRIVATE',createdAt:new Date().toISOString(),requestedBy:'user',reason:String(reason||''),explicitSelection:true,explicitDispatch:true,selectedPaths:picked.selectedPaths,payload:picked.payload,sourceRef:location.pathname,gthink:{present:true,role:'ADVISORY_TRANSIT_GUARD',mayForceDispatch:false,mayExpandSelection:false},guards:{automaticBackgroundDispatch:false,implicitWholePayload:false,sensitiveDataBlocked:true,sourceMutation:false}};
  const contentSha256=await sha256(core),packet={...core,contentSha256,packetId:`blob-chain-public_to_private-${contentSha256.slice(0,24)}`};
  const id=await r.capture(JSON.stringify(packet),{explicit:true,surface:'blob-chain-public-private'});
  assert(id,'BLOB_CHAIN_PUBLIC_INPUT_RELAY_BLOCKED');
  state.status='PUBLIC_TO_PRIVATE_STAGED';state.error=null;state.lastPublicToPrivate={packetId:packet.packetId,relayId:id,contentSha256,selectedPaths:picked.selectedPaths,at:new Date().toISOString()};
  return clone(state.lastPublicToPrivate);
}

async function refreshPrivateRelease(){
  try{
    const r=await fetch(`${LATEST_URL}?t=${Date.now()}`,{cache:'no-store',credentials:'omit'});if(r.status===404){state.pendingPrivateRelease=null;state.status='READY_NO_PRIVATE_RELEASE';return null;}assert(r.ok,`BLOB_CHAIN_LATEST_HTTP_${r.status}`);const latest=await r.json();
    if(latest?.status!=='READY'||!latest?.path){state.pendingPrivateRelease=null;state.status='READY_NO_PRIVATE_RELEASE';return null;}
    const releaseUrl=new URL(`../../${String(latest.path).replace(/^\/+/, '')}`,import.meta.url).href;const rr=await fetch(`${releaseUrl}?t=${Date.now()}`,{cache:'no-store',credentials:'omit'});assert(rr.ok,`BLOB_CHAIN_RELEASE_HTTP_${rr.status}`);const release=await rr.json();
    assert(release?.schema==='GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_PUBLIC_RELEASE_V1'&&release.publicSafe===true,'BLOB_CHAIN_RELEASE_SCHEMA_INVALID');
    assert(release?.packet?.schema===PACKET_SCHEMA&&release.packet.direction==='PRIVATE_TO_PUBLIC','BLOB_CHAIN_RELEASE_PACKET_INVALID');
    assert(release.packet.explicitSelection===true&&release.packet.explicitDispatch===true,'BLOB_CHAIN_RELEASE_NOT_EXPLICIT');
    const blocked=sensitive(release.packet.payload);assert(!blocked.length,`BLOB_CHAIN_RELEASE_SENSITIVE_DATA:${blocked.join(',')}`);
    state.pendingPrivateRelease={releaseId:release.releaseId,contentSha256:release.packet.contentSha256,selectedPaths:[...release.packet.selectedPaths],payload:clone(release.packet.payload),publishedAt:release.publishedAt||latest.publishedAt||null};state.status='PRIVATE_RELEASE_PENDING_EXPLICIT_CONSUME';state.error=null;return clone(state.pendingPrivateRelease);
  }catch(e){state.status='BLOCKED';state.error=String(e?.message||e);return null;}
}

function consumePrivateRelease({releaseId,explicit=false}={}){
  assert(explicit===true,'BLOB_CHAIN_EXPLICIT_CONSUME_REQUIRED');const p=state.pendingPrivateRelease;assert(p&&p.releaseId===releaseId,'BLOB_CHAIN_RELEASE_NOT_PENDING');state.lastPrivateToPublic={...clone(p),consumedAt:new Date().toISOString()};state.pendingPrivateRelease=null;state.status='PRIVATE_TO_PUBLIC_CONSUMED';return clone(state.lastPrivateToPublic);
}

function getState(){return clone({...state,schema:CHAIN_SCHEMA,defaultClosed:true,automaticBackgroundDispatch:false,gthinkRequired:true,publicToPrivateTransport:'GVAULT_PUBLIC_INPUT_RELAY_V2',privateToPublicTransport:'MANUAL_OUTBOX_TO_PUBLIC_RELEASE'});}
function arm(){state.status=gthink()?'READY':'BLOCKED_GTHINK_UNAVAILABLE';}

window.GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_V1=Object.freeze({schema:CHAIN_SCHEMA,dispatchToPrivate,refreshPrivateRelease,consumePrivateRelease,getState});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm,{once:true});else arm();
