(()=>{'use strict';
const SCHEMA='GTHINK_BLOB_TURRETS_V1';
const STORAGE='gvault.blob.turret.graph.v1';
const EDGE_MAX=512,TARGET_MAX=24,DEPTH_MAX=5;
const api=window.GVAULT_AGENT_LIVE_BLOB;
if(!api)return;
const edges=new Map();
const ignoreKind=/^turret\.|^render\.|^gateway\.|^gthink\.turret/;
const scanKind=/(scan|discover|observation|evidence|capture|index|manifest|snapshot|source|resource)/i;
function edgeKey(source,target){return `${source}\u0000${target}`}
function targetType(v){
  if(/^https?:\/\//i.test(v))return 'url';
  if(/^gvault:\/\//i.test(v))return 'gvault';
  if(/^[a-f0-9]{64}$/i.test(v))return 'sha256';
  if(/^[a-f0-9]{40}$/i.test(v))return 'sha';
  if(/[\\/]/.test(v)||/\.[a-z0-9]{1,8}(?:[?#].*)?$/i.test(v))return 'path';
  return 'ref';
}
function looksLikeTarget(v,key=''){
  if(typeof v!=='string')return false;
  const s=v.trim(); if(!s||s.length>2048)return false;
  if(/^https?:\/\//i.test(s)||/^gvault:\/\//i.test(s)||/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(s))return true;
  return /(url|href|src|path|ref|sha|hash|digest|source|origin|resource|repository|target)/i.test(key)&&s.length>2;
}
function collect(value,out,key='',depth=0){
  if(depth>DEPTH_MAX||out.length>=TARGET_MAX||value==null)return;
  if(typeof value==='string'){if(looksLikeTarget(value,key))out.push(value.trim());return;}
  if(Array.isArray(value)){for(const v of value){collect(v,out,key,depth+1);if(out.length>=TARGET_MAX)break;}return;}
  if(typeof value==='object')for(const [k,v] of Object.entries(value)){collect(v,out,k,depth+1);if(out.length>=TARGET_MAX)break;}
}
function load(){try{const a=JSON.parse(localStorage.getItem(STORAGE)||'[]');for(const e of a)if(e?.sourceBlobId&&e?.target)edges.set(edgeKey(e.sourceBlobId,e.target),e)}catch{}}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(Array.from(edges.values()).slice(-EDGE_MAX)))}catch{}}
function turretFor(type,sourceKind=''){if(type==='sha'||type==='sha256')return 'T-HASH';if(scanKind.test(sourceKind))return 'T-SCAN';if(type==='url'||type==='gvault'||type==='path')return 'T-REF';return 'T-SOURCE'}
function emitThread(source,target,relation='references'){
  const sourceBlobId=source?.blobId||String(source?.sourceBlobId||'boot-scan');
  const t=String(target||'').trim(); if(!t)return null;
  const key=edgeKey(sourceBlobId,t); if(edges.has(key))return edges.get(key);
  const type=targetType(t),turretId=turretFor(type,source?.kind||'');
  const edge={schema:'gthink.blob-turret.edge.v1',turretId,sourceBlobId,target:t,targetType:type,relation,createdAt:new Date().toISOString()};
  edges.set(key,edge); while(edges.size>EDGE_MAX)edges.delete(edges.keys().next().value); save();
  api.speak({schema:'GVAULT_UNIVERSAL_BLOB_V1',kind:'turret.thread',role:'kernel',from:'scan-link-turret',to:'external.graph',intent:'link_scanned_target',parentBlobId:source?.blobId||null,payload:edge,silent:true});
  return edge;
}
function ingest(blob){
  if(!blob||blob.schema!=='GVAULT_UNIVERSAL_BLOB_V1'||ignoreKind.test(blob.kind||''))return 0;
  const targets=[]; collect(blob.payload,targets,'payload'); collect(blob.text,targets,'text');
  if(scanKind.test(blob.kind||'')||targets.length){
    let n=0; for(const t of [...new Set(targets)].slice(0,TARGET_MAX))if(emitThread(blob,t))n++;
    return n;
  }
  return 0;
}
function bootScan(){
  const source={blobId:'boot:'+location.pathname,kind:'scan.boot'};
  emitThread(source,location.href,'page');
  for(const el of document.querySelectorAll('script[src],link[href]'))emitThread(source,el.src||el.href,'loaded-resource');
  emitThread(source,new URL('../gthink/second-kernel/blob/manifest.json',location.href).href,'knowledge-manifest');
  for(const b of api.hearLast(128))ingest(b);
  api.speak({schema:'GVAULT_UNIVERSAL_BLOB_V1',kind:'turret.snapshot',role:'kernel',from:'scan-link-turret',to:'public.bus',intent:'announce_link_graph',payload:{edges:edges.size,storage:STORAGE,outboundOnly:true,targetFetch:false},silent:true});
}
load();
api.listen(ingest);
window.GTHINK_BLOB_TURRETS=Object.freeze({schema:SCHEMA,ingest,link:(sourceBlobId,target,relation='manual')=>emitThread({blobId:String(sourceBlobId||'manual'),kind:'scan.manual'},target,relation),snapshot:()=>({schema:SCHEMA,edges:Array.from(edges.values()),count:edges.size}),clear:()=>{edges.clear();save();return 0}});
bootScan();
api.speak({schema:'GVAULT_UNIVERSAL_BLOB_V1',kind:'gthink.turret.ready',role:'kernel',from:'scan-link-turret',to:'public.bus',intent:'announce_ready',payload:{schema:SCHEMA,turrets:['T-REF','T-HASH','T-SOURCE','T-SCAN'],outboundOnly:true,targetFetch:false},silent:true});
})();
