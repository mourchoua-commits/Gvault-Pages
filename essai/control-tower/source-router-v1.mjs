const CFG_KEY='gvault.controlTower.source.v1';
const MODES=new Set(['PRIVATE_MASTER_PROJECTION','LOCAL_VFS','REMOTE_COMPATIBLE_SOURCE']);
const DEFAULT_CFG=Object.freeze({mode:'PRIVATE_MASTER_PROJECTION',baseUrl:'./data/',label:'GVAULT MASTER'});
const DB='gvault-control-tower-vfs-v1',VER=2,SNAP='snapshots';
let dbPromise=null;

function safeBase(input){
  const u=new URL(String(input||'./data/'),location.href);
  const localHttp=u.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(u.hostname);
  if(u.protocol!=='https:'&&!localHttp&&u.origin!==location.origin)throw new Error('REMOTE_SOURCE_PROTOCOL');
  if(u.username||u.password)throw new Error('REMOTE_SOURCE_EMBEDDED_CREDENTIAL_FORBIDDEN');
  u.hash='';u.search='';
  return u.href.endsWith('/')?u.href:u.href+'/';
}
function load(){
  try{
    const x=JSON.parse(localStorage.getItem(CFG_KEY)||'null');
    if(!x||!MODES.has(x.mode))return {...DEFAULT_CFG};
    if(x.mode==='REMOTE_COMPATIBLE_SOURCE')return {mode:x.mode,baseUrl:safeBase(x.baseUrl),label:String(x.label||'REMOTE')};
    if(x.mode==='LOCAL_VFS')return {mode:x.mode,baseUrl:null,label:'LOCAL VFS'};
    return {...DEFAULT_CFG};
  }catch{return {...DEFAULT_CFG}}
}
let cfg=load();
function sourceId(){return cfg.mode==='REMOTE_COMPATIBLE_SOURCE'?`REMOTE:${cfg.baseUrl}`:cfg.mode}
function getState(){return {...cfg,sourceId:sourceId()}}
function save(next){cfg=next;localStorage.setItem(CFG_KEY,JSON.stringify(next));window.dispatchEvent(new CustomEvent('gvault:control-tower-source-changed',{detail:getState()}));return getState()}
function useMaster(){return save({...DEFAULT_CFG})}
function useLocal(){return save({mode:'LOCAL_VFS',baseUrl:null,label:'LOCAL VFS'})}
function useRemote(baseUrl,label='REMOTE'){return save({mode:'REMOTE_COMPATIBLE_SOURCE',baseUrl:safeBase(baseUrl),label:String(label||'REMOTE')})}

function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(SNAP))d.createObjectStore(SNAP,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return dbPromise}
async function localSnaps(){const d=await openDb();return new Promise((res,rej)=>{const r=d.transaction(SNAP,'readonly').objectStore(SNAP).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function localLatestSnap(){const rows=await localSnaps();rows.sort((a,b)=>String(b.generatedAt||b.archivedAt||'').localeCompare(String(a.generatedAt||a.archivedAt||'')));if(!rows.length)throw new Error('LOCAL_VFS_EMPTY');return rows[0]}
async function localByChain(hash){const rows=await localSnaps();const x=rows.find(s=>String(s.snapshotChainSha256||s.manifest?.snapshot?.snapshotChainSha256||'')===String(hash));if(!x)throw new Error('LOCAL_VFS_CHAIN_NOT_FOUND');return x}
async function localByPayload(rel){const rows=await localSnaps();const x=rows.find(s=>String(s.manifest?.payload?.path||'')===String(rel)||String(s.payloadSha256||'')===String(rel).match(/([a-f0-9]{64})/i)?.[1]);if(!x)throw new Error('LOCAL_VFS_PAYLOAD_NOT_FOUND');return x}
function latestFromManifest(m){return {schema:'GVAULT_CONTROL_TOWER_LATEST_V2',version:2,generatedAt:m.generatedAt,snapshotId:m.snapshot?.snapshotId,snapshotChainSha256:m.snapshot?.snapshotChainSha256,previousSnapshotSha256:m.snapshot?.previousSnapshotSha256,sourceMarker:m.snapshot?.sourceMarker||m.source?.sourceMarker,manifestPath:m.snapshot?.manifestPath||`manifests/${m.snapshot?.snapshotChainSha256}.json`,payloadPath:m.payload?.path,payloadSha256:m.payload?.sha256}}
async function readLocalJson(rel){
  if(rel==='latest.json')return latestFromManifest((await localLatestSnap()).manifest);
  if(rel==='manifest.json')return (await localLatestSnap()).manifest;
  const m=String(rel).match(/^manifests\/([a-f0-9]{64})\.json$/i);if(m)return (await localByChain(m[1])).manifest;
  throw new Error('LOCAL_VFS_JSON_PATH_UNSUPPORTED');
}
async function readLocalBytes(rel){const s=await localByPayload(rel);return s.cipher instanceof Blob?s.cipher.arrayBuffer():s.cipher}
async function readNetwork(rel,kind){const base=cfg.mode==='REMOTE_COMPATIBLE_SOURCE'?cfg.baseUrl:safeBase('./data/');const u=new URL(rel,base);const r=await fetch(u.href+(u.search?'&':'?')+'src='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('SOURCE_HTTP_'+r.status);return kind==='json'?r.json():r.arrayBuffer()}
async function readJson(rel){return cfg.mode==='LOCAL_VFS'?readLocalJson(rel):readNetwork(rel,'json')}
async function readBytes(rel){return cfg.mode==='LOCAL_VFS'?readLocalBytes(rel):readNetwork(rel,'bytes')}

window.GVAULT_CONTROL_TOWER_SOURCE_ROUTER_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_SOURCE_ROUTER_V1',getState,sourceId,useMaster,useLocal,useRemote,readJson,readBytes});
export {getState,sourceId,useMaster,useLocal,useRemote,readJson,readBytes};
