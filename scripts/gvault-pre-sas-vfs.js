(()=>{'use strict';
const API_SCHEMA='GVAULT_PRE_SAS_VFS_V1';
const DB_NAME='GVAULT_PRE_SAS_VFS_V1';
const DB_VERSION=1;
const STORE='entries';
const PATH_INDEX='path';
const FALLBACK_KEY='gvault.preSasVfs.entries.v1';
const enc=new TextEncoder();
let backend='UNPROVEN',lastError=null;

const hex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(text){return hex(await crypto.subtle.digest('SHA-256',enc.encode(String(text??''))));}
function normalizePath(value){
  let p=String(value??'').trim().replace(/^gvault:\/\//i,'').replace(/^\/+|\/+$/g,'');
  if(!p||p.length>240||p.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('VFS_PATH_INVALID');
  return p;
}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function fallbackRows(){try{const x=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return [];}}
function saveFallback(rows){localStorage.setItem(FALLBACK_KEY,JSON.stringify(rows));}

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('INDEXEDDB_UNAVAILABLE'));return;}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      const store=db.objectStoreNames.contains(STORE)?req.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:'seq',autoIncrement:true});
      if(!store.indexNames.contains(PATH_INDEX))store.createIndex(PATH_INDEX,'path',{unique:false});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('INDEXEDDB_OPEN_FAILED'));
  });
}
const dbPromise=openDb().then(db=>{backend='INDEXEDDB';return db}).catch(error=>{backend='LOCALSTORAGE_FALLBACK';lastError=String(error&&error.message||error);return null;});

function requestResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('INDEXEDDB_REQUEST_FAILED'));});}
async function idbAdd(row){
  const db=await dbPromise;if(!db)return null;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),req=store.add(row);let key=null;
    req.onsuccess=()=>{key=req.result};req.onerror=()=>reject(req.error||new Error('VFS_ADD_FAILED'));
    tx.oncomplete=()=>resolve(key);tx.onerror=()=>reject(tx.error||new Error('VFS_TX_FAILED'));tx.onabort=()=>reject(tx.error||new Error('VFS_TX_ABORTED'));
  });
}
async function idbAll(pathValue=null){
  const db=await dbPromise;if(!db)return null;
  const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
  const req=pathValue?store.index(PATH_INDEX).getAll(IDBKeyRange.only(pathValue)):store.getAll();
  return requestResult(req);
}

async function append(pathValue,content,meta={}){
  const path=normalizePath(pathValue),text=String(content??'');
  if(!text.length)throw new Error('VFS_EMPTY_WRITE_REJECTED');
  const row={schema:'GVAULT_PRE_SAS_VFS_ENTRY_V1',path,operation:'APPEND',content:text,utf8Bytes:enc.encode(text).byteLength,contentSha256:await sha256(text),meta:meta&&typeof meta==='object'?clone(meta):{},createdAt:new Date().toISOString(),networkWrite:false,tokenRequired:false,deleteAllowed:false,overwriteAllowed:false};
  try{
    const key=await idbAdd(row);
    if(key!==null)return {status:'APPENDED',backend:'INDEXEDDB',path,seq:key,contentSha256:row.contentSha256,utf8Bytes:row.utf8Bytes,deleteAllowed:false,overwriteAllowed:false};
  }catch(error){lastError=String(error&&error.message||error);backend='LOCALSTORAGE_FALLBACK';}
  const items=fallbackRows();const seq=(items.at(-1)?.seq||0)+1;items.push({...row,seq});saveFallback(items);
  return {status:'APPENDED',backend:'LOCALSTORAGE_FALLBACK',path,seq,contentSha256:row.contentSha256,utf8Bytes:row.utf8Bytes,deleteAllowed:false,overwriteAllowed:false};
}
async function appendJson(pathValue,value,meta={}){return append(pathValue,`${JSON.stringify(value)}\n`,{...meta,encoding:'JSONL'});}
async function history(pathValue){
  const path=normalizePath(pathValue);let items=null;
  try{items=await idbAll(path);}catch(error){lastError=String(error&&error.message||error);}
  if(!items)items=fallbackRows().filter(x=>x.path===path);
  return items.slice().sort((a,b)=>(a.seq||0)-(b.seq||0)).map(clone);
}
async function read(pathValue){const items=await history(pathValue);return {status:items.length?'PASS':'EMPTY',path:normalizePath(pathValue),content:items.map(x=>x.content).join(''),entries:items.length,utf8Bytes:items.reduce((n,x)=>n+Number(x.utf8Bytes||0),0)};}
async function list(){
  let items=null;try{items=await idbAll();}catch(error){lastError=String(error&&error.message||error);}
  if(!items)items=fallbackRows();
  const map=new Map();for(const row of items){const x=map.get(row.path)||{path:row.path,entries:0,utf8Bytes:0,lastWriteAt:null};x.entries+=1;x.utf8Bytes+=Number(row.utf8Bytes||0);x.lastWriteAt=row.createdAt||x.lastWriteAt;map.set(row.path,x);}
  return [...map.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
function status(){return {schema:API_SCHEMA,status:'READY',location:'PUBLIC_PRE_SAS',visibility:'HIDDEN',storage:backend,writePolicy:'APPEND_ONLY_API_NO_DELETE_NO_OVERWRITE',tokenRequired:false,networkWrite:false,deleteApi:false,clearApi:false,overwriteApi:false,lastError};}

const api=Object.freeze({schema:API_SCHEMA,append,appendJson,read,history,list,status,ready:dbPromise.then(()=>status())});
Object.defineProperty(window,'GVAULT_PRE_SAS_VFS',{value:api,writable:false,configurable:false,enumerable:false});
window.addEventListener('gvault:pre-sas-vfs-append',event=>{const d=event.detail||{};if(d.explicit!==true)return;void append(d.path,d.content,d.meta).catch(error=>{lastError=String(error&&error.message||error)});});
})();
