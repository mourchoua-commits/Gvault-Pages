const CHANNEL='gvault-control-tower-blob-mesh-v1';
const POLL_MS=5000;
const registry=new Map();
let bc=null,stopped=false,timer=null,seq=0;
const now=()=>new Date().toISOString();
const emit=(type,detail={})=>{const payload={schema:'GVAULT_CT_BLOB_EVENT_V1',type,seq:++seq,at:now(),...detail};window.dispatchEvent(new CustomEvent('gvault:ct-blob',{detail:payload}));try{bc?.postMessage(payload)}catch{}return payload};
class BlobNode{
  constructor(id,{kind='state',read=null,deps=[]}={}){this.id=id;this.kind=kind;this.read=read;this.deps=deps;this.value=null;this.hash='';this.updatedAt=null;this.status='idle';registry.set(id,this)}
  async refresh(reason='tick'){
    if(stopped||typeof this.read!=='function')return this.value;
    this.status='syncing';
    try{const value=await this.read();const hash=JSON.stringify(value);const changed=hash!==this.hash;this.value=value;this.hash=hash;this.updatedAt=now();this.status='live';if(changed)emit('blob-change',{blobId:this.id,kind:this.kind,reason,value});return value}catch(e){this.status='degraded';emit('blob-error',{blobId:this.id,kind:this.kind,reason,error:String(e?.message||e)});return this.value}
  }
}
async function fetchJson(url){const r=await fetch(url,{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return r.json()}
const feed=new BlobNode('feed',{kind:'source',read:async()=>{try{return await fetchJson('./data/latest.json')}catch{return fetchJson('./data/manifest.json')}}});
const vfs=new BlobNode('vfs',{kind:'runtime',deps:['feed'],read:async()=>window.GVAULT_CONTROL_TOWER_VFS_V2?.getState?.()||null});
const watcher=new BlobNode('watcher',{kind:'runtime',read:async()=>window.GVAULT_CONTROL_TOWER_COMMIT_WATCHER_V1?.getState?.()||null});
const ui=new BlobNode('ui',{kind:'view',deps:['feed','vfs','watcher'],read:async()=>({events:document.querySelectorAll('#eventList .event').length,timeline:document.querySelectorAll('.timelineItem').length,kpis:[...document.querySelectorAll('.kpi b')].map(x=>x.textContent)})});
function gthinkState(){return window.GVAULT_GTHINK_SAS_V1?.getState?.()||{sasOpen:false,mode:'UNAVAILABLE'}}
async function propose(blobId,proposal={},executor){
  const node=registry.get(blobId);if(!node)return {executed:false,error:'unknown-blob'};
  const arbiter=window.GVAULT_GTHINK_SAS_V1;if(!arbiter)return {executed:false,error:'gthink-unavailable'};
  return arbiter.request({blobId,...proposal,targetRole:proposal.targetRole||'blob-zone',touchesWall:proposal.touchesWall===true,touchesSas:proposal.touchesSas===true},executor)
}
async function refreshAll(reason='tick'){for(const node of registry.values())await node.refresh(reason);emit('mesh-sync',{reason,state:getState()})}
function schedule(){clearTimeout(timer);if(!stopped)timer=setTimeout(async()=>{await refreshAll('poll');schedule()},POLL_MS)}
function wake(){if(stopped)return;if(document.visibilityState==='visible')void refreshAll('wake')}
function getState(){return {schema:'GVAULT_CONTROL_TOWER_BLOB_MESH_V1',pollMs:POLL_MS,stopped,gthink:gthinkState(),walls:'external-fixed',nodes:[...registry.values()].map(x=>({id:x.id,kind:x.kind,status:x.status,updatedAt:x.updatedAt,deps:x.deps}))}}
function stop(){stopped=true;clearTimeout(timer);try{bc?.close()}catch{}document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake)}
try{bc=new BroadcastChannel(CHANNEL);bc.onmessage=ev=>{const d=ev.data||{};if(d.type==='blob-change'||d.type==='mesh-sync')emit('peer-signal',{peerType:d.type})}}catch{}
for(const name of ['gvault:control-tower-new-public-commit','gvault:control-tower-vfs-ingested','gvault:control-tower-public-commit','gvault:control-tower-vfs-ingest-failed'])window.addEventListener(name,()=>void refreshAll(name));
const mo=new MutationObserver(()=>{ui.refresh('dom')});mo.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('pagehide',()=>{mo.disconnect();stop()},{once:true});
window.GVAULT_CONTROL_TOWER_BLOB_MESH_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_BLOB_MESH_V1',refresh:()=>refreshAll('manual'),getState,blobs:registry,propose,stop});
setTimeout(async()=>{await refreshAll('boot');schedule()},900);
