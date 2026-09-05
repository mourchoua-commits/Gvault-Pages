(()=>{'use strict';
const SCHEMA='GVAULT_VFS_FUSION_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const ROOT='gvault://vfs/';
const enc=new TextEncoder();
let lastError=null,lastSnapshot=null;
function now(){return new Date().toISOString()}
function clean(v){return String(v??'').trim()}
function clone(v){try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))}}
function api(){return window.GVAULT_AGENT_LIVE_BLOB||null}
function emit(kind,payload={}){try{return api()?.speak?.({schema:BLOB_SCHEMA,kind,role:'vfs-fusion',from:'GVaultVfsFusion',to:'public.bus',intent:'federate_virtual_file_systems_without_destructive_merge',language:'fr',surface:'Gvault-Pages',payload:{schema:SCHEMA,...payload},understoodBy:['GThink','blob-runtime','vfs','pre-sas-vfs','person-memory','dormant-host'],silent:true,muted:false})||null}catch{return null}}
function normalize(input){let p=clean(input).replace(/^gvault:\/\/vfs\/?/i,'').replace(/^\/+|\/+$/g,'');if(!p)return '';if(p.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('VFS_FUSION_PATH_INVALID');return p}
function mountTable(){return [
{id:'pre-sas',root:'pre-sas/',mode:'append-read',nativeSchema:window.GVAULT_PRE_SAS_VFS?.schema||null,ready:!!window.GVAULT_PRE_SAS_VFS},
{id:'blob-runtime',root:'blob-runtime/',mode:'virtual-read+payload-read',nativeSchema:window.GTHINK_BLOB_RUNTIME?.schema||null,ready:!!window.GTHINK_BLOB_RUNTIME},
{id:'person',root:'person/',mode:'virtual-read',nativeSchema:window.GVAULT_PERSON_BLOB?.schema||null,ready:!!window.GVAULT_PERSON_BLOB},
{id:'dormant',root:'dormant/',mode:'virtual-read+checkpoint',nativeSchema:window.GTHINK_DORMANT_BLOB_HOST?.schema||null,ready:!!window.GTHINK_DORMANT_BLOB_HOST},
{id:'fusion',root:'fusion/',mode:'virtual-read',nativeSchema:SCHEMA,ready:true}
]}
async function sha256(text){const d=await crypto.subtle.digest('SHA-256',enc.encode(String(text??'')));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function read(pathValue){const p=normalize(pathValue);if(!p)return {status:'PASS',path:'',type:'directory',entries:await list('')};
if(p==='fusion/status.json')return jsonFile(p,status());
if(p==='fusion/mounts.json')return jsonFile(p,mountTable());
if(p==='fusion/last-snapshot.json')return jsonFile(p,lastSnapshot);
if(p==='blob-runtime/blobs.json')return jsonFile(p,window.GTHINK_BLOB_RUNTIME?.snapshot?.()||[]);
if(p.startsWith('blob-runtime/blob/')){const id=decodeURIComponent(p.slice('blob-runtime/blob/'.length).replace(/\.json$/,''));return jsonFile(p,window.GTHINK_BLOB_RUNTIME?.getBlob?.(id)||null)}
if(p.startsWith('blob-runtime/payload/')){const id=decodeURIComponent(p.slice('blob-runtime/payload/'.length).replace(/\.json$/,''));const x=await window.GTHINK_BLOB_RUNTIME?.readPayload?.(id);return jsonFile(p,x||null)}
if(p==='person/profile.json')return jsonFile(p,window.GVAULT_PERSON_BLOB?.profile||null);
if(p==='person/writings.json')return jsonFile(p,await window.GVAULT_PERSON_BLOB?.getOwnWritings?.(500)||[]);
if(p==='dormant/status.json')return jsonFile(p,window.GTHINK_DORMANT_BLOB_HOST?.status?.()||null);
if(p==='dormant/checkpoint.json')return jsonFile(p,window.GTHINK_DORMANT_BLOB_HOST?.status?.()?.lastCheckpoint||null);
if(p.startsWith('pre-sas/')){const native=p.slice('pre-sas/'.length);const v=window.GVAULT_PRE_SAS_VFS;if(!v?.read)return unavailable(p,'PRE_SAS_VFS_UNAVAILABLE');const r=await v.read(native);return {...r,path:p,nativePath:native,mount:'pre-sas'}}
throw new Error('VFS_FUSION_PATH_NOT_FOUND:'+p)}
function jsonFile(path,value){const content=JSON.stringify(value,null,2)+'\n';return {status:value==null?'EMPTY':'PASS',path,type:'application/json',content,utf8Bytes:enc.encode(content).byteLength,mount:path.split('/')[0]||'fusion'}}
function unavailable(path,error){return {status:'UNAVAILABLE',path,error}}
async function append(pathValue,content,meta={}){const p=normalize(pathValue);if(!p.startsWith('pre-sas/'))throw new Error('VFS_FUSION_WRITE_REJECTED_NON_APPEND_MOUNT');const native=p.slice('pre-sas/'.length);const v=window.GVAULT_PRE_SAS_VFS;if(!v?.append)throw new Error('PRE_SAS_VFS_UNAVAILABLE');const out=await v.append(native,String(content??''),{...clone(meta),via:SCHEMA,fusionPath:p});emit('gvault.vfs.fusion.append',{path:p,nativePath:native,status:out?.status||null});return {...out,path:p,nativePath:native,mount:'pre-sas'}}
async function appendJson(pathValue,value,meta={}){return append(pathValue,JSON.stringify(value)+'\n',{...clone(meta),encoding:'JSONL'})}
async function list(pathValue=''){const p=normalize(pathValue);if(!p)return mountTable().map(m=>({name:m.root,path:m.root,type:'mount',mount:m.id,ready:m.ready,mode:m.mode,nativeSchema:m.nativeSchema}));
if(p==='fusion')return ['status.json','mounts.json','last-snapshot.json'].map(name=>({name,path:'fusion/'+name,type:'virtual-file'}));
if(p==='blob-runtime')return [{name:'blobs.json',path:'blob-runtime/blobs.json',type:'virtual-file'},{name:'blob/<blobId>.json',path:'blob-runtime/blob/<blobId>.json',type:'virtual-template'},{name:'payload/<payloadId>.json',path:'blob-runtime/payload/<payloadId>.json',type:'virtual-template'}];
if(p==='person')return [{name:'profile.json',path:'person/profile.json',type:'virtual-file'},{name:'writings.json',path:'person/writings.json',type:'virtual-file'}];
if(p==='dormant')return [{name:'status.json',path:'dormant/status.json',type:'virtual-file'},{name:'checkpoint.json',path:'dormant/checkpoint.json',type:'virtual-file'}];
if(p==='pre-sas'){const v=window.GVAULT_PRE_SAS_VFS;if(!v?.list)return [];const rows=await v.list();return rows.map(x=>({...x,path:'pre-sas/'+x.path,nativePath:x.path,mount:'pre-sas'}))}
return []}
async function snapshotAll(reason='manual'){
const mounts=mountTable(),blobs=window.GTHINK_BLOB_RUNTIME?.snapshot?.()||[],person=window.GVAULT_PERSON_BLOB?.profile||null,dormant=window.GTHINK_DORMANT_BLOB_HOST?.status?.()||null,pre=window.GVAULT_PRE_SAS_VFS?.status?.()||null;
const snapshot={schema:'GVAULT_VFS_FUSION_SNAPSHOT_V1',reason:clean(reason)||'manual',createdAt:now(),root:ROOT,mounts,counts:{mounts:mounts.length,readyMounts:mounts.filter(x=>x.ready).length,blobs:blobs.length,personWritings:person?.writingCount??null},nativeStatus:{preSas:pre,blobRuntime:window.GTHINK_BLOB_RUNTIME?{schema:window.GTHINK_BLOB_RUNTIME.schema,count:window.GTHINK_BLOB_RUNTIME.count}:null,person:person?{blobId:person.blobId,writingCount:person.writingCount}:null,dormant:dormant?{mode:dormant.mode,serviceWorkerState:dormant.serviceWorkerState}:null},policy:{merge:'FEDERATED_OVERLAY_NO_COPY',destructive:false,delete:false,overwrite:false,writeMount:'pre-sas-only',preserveNativeStores:true}};
snapshot.sha256=await sha256(JSON.stringify(snapshot));lastSnapshot=Object.freeze(clone(snapshot));
try{await window.GVAULT_PRE_SAS_VFS?.appendJson?.('fusion/snapshots/vfs-fusion.jsonl',snapshot,{source:SCHEMA,appendOnly:true})}catch(e){lastError=clean(e?.message||e)}
emit('gvault.vfs.fusion.snapshot',{reason:snapshot.reason,sha256:snapshot.sha256,readyMounts:snapshot.counts.readyMounts,totalMounts:snapshot.counts.mounts});return clone(snapshot)}
function status(){const mounts=mountTable();return {schema:SCHEMA,status:'READY',root:ROOT,mergeMode:'FEDERATED_OVERLAY_NO_COPY',mounts,mountCount:mounts.length,readyMounts:mounts.filter(x=>x.ready).length,writePolicy:'PRE_SAS_APPEND_ONLY',deleteApi:false,overwriteApi:false,preserveNativeStores:true,lastSnapshot:lastSnapshot?{createdAt:lastSnapshot.createdAt,sha256:lastSnapshot.sha256}:null,lastError}}
const fusion=Object.freeze({schema:SCHEMA,root:ROOT,read,list,append,appendJson,snapshotAll,status,resolve:path=>ROOT+normalize(path)});
Object.defineProperty(window,'GVAULT_VFS_FUSION',{value:fusion,writable:false,configurable:false,enumerable:false});
window.dispatchEvent(new CustomEvent('gvault:vfs-fusion-ready',{detail:status()}));
queueMicrotask(()=>void snapshotAll('boot').catch(e=>{lastError=clean(e?.message||e)}));
})();
