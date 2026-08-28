const BASE='./data/',LATEST=BASE+'latest.json',LEGACY=BASE+'manifest.json',KNOWN='gvault.controlTower.snapshotHead.v2';
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async b=>hex(await crypto.subtle.digest('SHA-256',b instanceof ArrayBuffer?b:new TextEncoder().encode(String(b))));
const json=async url=>{const r=await fetch(url+(url.includes('?')?'&':'?')+'ca='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return r.json()};
const valid64=s=>/^[a-f0-9]{64}$/i.test(String(s||''));
function known(){try{const x=JSON.parse(localStorage.getItem(KNOWN)||'null');return x&&valid64(x.snapshotChainSha256)?x:null}catch{return null}}
function manifestUrl(hash){return BASE+'manifests/'+hash+'.json'}
async function verifyManifest(m){
 if(!m||m.schema!=='GVAULT_CONTROL_TOWER_ENCRYPTED_FEED_V1')throw new Error('MANIFEST_SCHEMA');
 if(Number(m.version)!==2||m.snapshot?.schema!=='GVAULT_CONTROL_TOWER_SNAPSHOT_CHAIN_V2')return {legacy:true,hash:null};
 const s=m.snapshot,parts=String(s.chainInput||'').split('\n');
 if(parts.length!==5)throw new Error('CHAIN_INPUT_FORMAT');
 const [prev,id,marker,payload,generated]=parts;
 if(prev!==String(s.previousSnapshotSha256)||id!==String(s.snapshotId)||marker!==String(s.sourceMarker)||payload!==String(m.payload?.sha256)||generated!==String(m.generatedAt))throw new Error('CHAIN_INPUT_FIELDS');
 const h=await sha(s.chainInput);
 if(h!==String(s.snapshotChainSha256))throw new Error('CHAIN_HASH');
 if(!valid64(h)||!valid64(m.payload?.sha256)||!valid64(s.sourceMarker))throw new Error('CHAIN_HASH_FORMAT');
 if(s.sourceMarker!==m.source?.sourceMarker)throw new Error('SOURCE_MARKER_MISMATCH');
 return {legacy:false,hash:h};
}
async function fetchManifestHash(hash){if(!valid64(hash))throw new Error('BAD_MANIFEST_HASH');const m=await json(manifestUrl(hash));const v=await verifyManifest(m);if(v.legacy||v.hash!==hash)throw new Error('MANIFEST_ADDRESS_MISMATCH');return m}
async function verifyContinuity(head){
 const v=await verifyManifest(head);if(v.legacy)return {status:'LEGACY',walked:0,known:null,head:null};
 const k=known();if(!k)return {status:'FIRST_SEEN',walked:0,known:null,head:v.hash};
 if(k.snapshotChainSha256===v.hash)return {status:'SAME',walked:0,known:k.snapshotChainSha256,head:v.hash};
 let cur=head,walked=0;
 while(walked<128){const prev=String(cur.snapshot.previousSnapshotSha256||'');if(prev===k.snapshotChainSha256)return {status:'ADVANCED',walked:walked+1,known:k.snapshotChainSha256,head:v.hash};if(prev==='GENESIS')throw new Error('CHAIN_DIVERGENCE_OR_ROLLBACK');cur=await fetchManifestHash(prev);walked++}
 throw new Error('CHAIN_WALK_LIMIT');
}
async function fetchHead(){
 let latest=null;try{latest=await json(LATEST)}catch{}
 if(latest?.schema!=='GVAULT_CONTROL_TOWER_LATEST_V2'){
   const manifest=await json(LEGACY);return {version:1,latest:null,manifest,continuity:{status:'LEGACY',walked:0}};
 }
 if(!valid64(latest.snapshotChainSha256)||!valid64(latest.payloadSha256)||!valid64(latest.sourceMarker))throw new Error('LATEST_HASH_FORMAT');
 const manifest=await json(BASE+latest.manifestPath);const v=await verifyManifest(manifest);
 if(v.legacy||v.hash!==latest.snapshotChainSha256)throw new Error('LATEST_MANIFEST_MISMATCH');
 if(manifest.payload?.sha256!==latest.payloadSha256||manifest.payload?.path!==latest.payloadPath||manifest.snapshot?.previousSnapshotSha256!==latest.previousSnapshotSha256||manifest.snapshot?.sourceMarker!==latest.sourceMarker)throw new Error('LATEST_FIELDS_MISMATCH');
 const continuity=await verifyContinuity(manifest);return {version:2,latest,manifest,continuity};
}
async function fetchCipher(manifest){const r=await fetch(BASE+manifest.payload.path+'?ca='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('PAYLOAD_HTTP_'+r.status);const cipher=await r.arrayBuffer();if(cipher.byteLength!==Number(manifest.payload.size))throw new Error('PAYLOAD_SIZE');if(await sha(cipher)!==manifest.payload.sha256)throw new Error('PAYLOAD_SHA');return cipher}
async function fetchEnvelope(){const head=await fetchHead(),cipher=await fetchCipher(head.manifest);return {...head,cipher}}
async function walk(limit=32){const head=await fetchHead();if(head.version!==2)return [head.manifest];const out=[head.manifest];let cur=head.manifest;while(out.length<Math.max(1,Math.min(128,Number(limit)||32))){const prev=String(cur.snapshot?.previousSnapshotSha256||'');if(prev==='GENESIS')break;cur=await fetchManifestHash(prev);out.push(cur)}return out}
function markAccepted(manifest){if(manifest?.snapshot?.schema!=='GVAULT_CONTROL_TOWER_SNAPSHOT_CHAIN_V2')return;const h=manifest.snapshot.snapshotChainSha256;if(!valid64(h))return;localStorage.setItem(KNOWN,JSON.stringify({schema:'GVAULT_CONTROL_TOWER_ACCEPTED_HEAD_V2',snapshotChainSha256:h,acceptedAt:new Date().toISOString(),generatedAt:manifest.generatedAt||null,sourceMarker:manifest.snapshot.sourceMarker||null}))}
function getKnown(){return known()}
window.GVAULT_CONTENT_ADDRESSED_FEED_V2=Object.freeze({schema:'GVAULT_CONTENT_ADDRESSED_FEED_V2',fetchHead,fetchEnvelope,fetchManifestHash,fetchCipher,verifyManifest,verifyContinuity,walk,markAccepted,getKnown});
