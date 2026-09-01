(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_INPUT_RELAY_V3';
const KEY_URL='./scripts/gvault-input-relay-key.v2.json';
const QKEY='gvault.publicInputRelay.queue.v2';
const LEGACY_QKEY='gvault.publicInputRelay.queue.v1';
const RECENT_KEY='gvault.publicInputRelay.recent.v3';
const BLOB_DB='GVAULT_PUBLIC_MESSAGE_BLOB_DB_V1';
const BLOB_STORE='pending';
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sensitive=/pass(word|phrase)?|token|secret|authorization|api[-_ ]?key|sas/i;
let keyCache=null,keyError=null,blobPending=null,lastBlobState='UNPROVEN';
function endpoint(){const x=window.GVAULT_DATAPASSIV_INGEST_URL||window.GVAULT_INGRESS_BASE_URL;return x?String(x).replace(/\/+$/,'')+(String(x).includes('/v1/datapassiv')?'':'/v1/datapassiv'):null}
function blobEndpoint(){const x=window.GVAULT_PUBLIC_MESSAGE_ENDPOINT||window.GVAULT_INGRESS_BASE_URL;if(!x)return null;const s=String(x).replace(/\/+$/,'');return s.includes('/v1/public-message')?s:s+'/v1/public-message'}
function queue(){try{const q=JSON.parse(localStorage.getItem(QKEY)||'[]');return Array.isArray(q)?q:[]}catch{return []}}
function legacyQueueCount(){try{const q=JSON.parse(localStorage.getItem(LEGACY_QKEY)||'[]');return Array.isArray(q)?q.length:0}catch{return 0}}
function save(q){try{localStorage.setItem(QKEY,JSON.stringify(q.slice(-500)))}catch{}}
function recent(){try{const x=JSON.parse(sessionStorage.getItem(RECENT_KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}}
function saveRecent(x){try{sessionStorage.setItem(RECENT_KEY,JSON.stringify(x))}catch{}}
async function sha(buf){return hex(await crypto.subtle.digest('SHA-256',buf))}
function safeTarget(el){if(!el)return false;const type=String(el.type||'').toLowerCase();const hint=[el.name,el.id,el.autocomplete,el.getAttribute?.('aria-label')].filter(Boolean).join(' ');return type!=='password'&&!sensitive.test(hint)}
function explicitRoot(node){const el=node?.nodeType===1?node:node?.parentElement;return el?.closest?.('[data-gvault-input-relay]')||null}
function surfaceFor(root,fallback='public'){const v=root?.getAttribute?.('data-gvault-input-relay');return String(v&&v!=='true'?v:fallback).slice(0,64)}
function readEditable(el){if(!safeTarget(el))return '';if(el.isContentEditable)return el.innerText||el.textContent||'';return typeof el.value==='string'?el.value:''}
function readMarked(root){if(!root)return '';const nodes=root.matches?.('textarea,input,[contenteditable="true"]')?[root]:[...root.querySelectorAll?.('textarea,input,[contenteditable="true"]')||[]];return nodes.filter(safeTarget).map(readEditable).filter(Boolean).join('\n')}
async function loadKey({force=false}={}){
 if(keyCache&&!force)return keyCache;
 keyError=null;
 try{const r=await fetch(KEY_URL+'?v=2',{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('KEY_CONFIG_HTTP_'+r.status);const c=await r.json();if(c?.schema!=='GVAULT_PUBLIC_INPUT_RELAY_KEY_V2')throw new Error('KEY_CONFIG_SCHEMA');if(c.status!=='ACTIVE'||!c.kid||!c.spkiB64)throw new Error('KEY_ROTATION_REQUIRED');if((c.revokedKeyIds||[]).includes(c.kid))throw new Error('KEY_REVOKED');const key=await crypto.subtle.importKey('spki',unb64(c.spkiB64),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);keyCache={kid:c.kid,key};return keyCache}catch(e){keyCache=null;keyError=String(e&&e.message||e);return null}
}
function sessionId(){let sid='';try{sid=sessionStorage.getItem('gvault.inputRelay.session.v3')||sessionStorage.getItem('gvault.inputRelay.session.v2')||''}catch{}if(!sid){sid=crypto.randomUUID?.()||('pir-session-'+Date.now().toString(36)+'-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36));try{sessionStorage.setItem('gvault.inputRelay.session.v3',sid)}catch{}}return sid}
async function dedupeFingerprint({sid,surface,contentSha}){const bucket=Math.floor(Date.now()/5000);return sha(enc.encode(`${sid}\n${surface}\n${contentSha}\n${bucket}`))}
function blobDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(BLOB_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(BLOB_STORE))r.result.createObjectStore(BLOB_STORE,{keyPath:'blobId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function blobPut(v){const db=await blobDb();await new Promise((resolve,reject)=>{const tx=db.transaction(BLOB_STORE,'readwrite');tx.objectStore(BLOB_STORE).put(v);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function blobDelete(id){const db=await blobDb();await new Promise((resolve,reject)=>{const tx=db.transaction(BLOB_STORE,'readwrite');tx.objectStore(BLOB_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function blobAll(){const db=await blobDb();const out=await new Promise((resolve,reject)=>{const tx=db.transaction(BLOB_STORE,'readonly');const r=tx.objectStore(BLOB_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});db.close();blobPending=out.length;return out}
function announceBlob(type,detail={}){lastBlobState=type;try{window.dispatchEvent(new CustomEvent('gvault:public-message-blob-state',{detail:{schema:'GVAULT_PUBLIC_MESSAGE_BLOB_STATE_V1',type,at:new Date().toISOString(),...detail}}))}catch{}}
async function captureBlobFallback(content,meta={}){
 const sid=String(meta.sessionId||sessionId()),surface=String(meta.surface||'public').slice(0,64),contentSha=await sha(enc.encode(content));
 const blobId='pmb1-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(2)),x=>x.toString(36)).join('-');
 const item={schema:'GVAULT_PUBLIC_MESSAGE_BLOB_V1',version:1,blobId,createdAt:new Date().toISOString(),explicit:true,surface,sessionId:sid,location:location.pathname,content:String(content),contentSha256:contentSha,blob:{type:'message_blob',parent:'PUBLIC_INPUT',stage:'LOCAL_CAPTURED',transport:'HTTPS_WRITE_ONLY_GATEWAY'},lastError:null,lastAttemptAt:null};
 await blobPut(item);blobPending=(blobPending??0)+1;announceBlob('LOCAL_CAPTURED',{blobId,contentSha256:contentSha,reason:keyError||'PRIMARY_RELAY_UNAVAILABLE'});void flushBlobs();return blobId
}
async function flushBlobs(){
 const ep=blobEndpoint(),all=await blobAll();
 if(!all.length){announceBlob('EMPTY',{pending:0});return true}
 if(!ep){announceBlob('BLOCKED_EXTERNAL_ENDPOINT',{pending:all.length});return false}
 let ok=true;
 for(const item of all){
  try{
   const next={...item,blob:{...item.blob,stage:'TRANSMITTING'},lastAttemptAt:new Date().toISOString(),lastError:null};await blobPut(next);announceBlob('TRANSMITTING',{blobId:item.blobId});
   const r=await fetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item),cache:'no-store',credentials:'omit'});let data=null;try{data=await r.json()}catch{}
   if(!r.ok||data?.schema!=='GVAULT_PUBLIC_MESSAGE_BLOB_RECEIPT_V1'||data?.privateStored!==true)throw new Error(data?.error||`PUBLIC_MESSAGE_HTTP_${r.status}`);
   await blobDelete(item.blobId);blobPending=Math.max(0,(blobPending??1)-1);announceBlob('PRIVATE_RECEIPT',{blobId:item.blobId,receivedAt:data.receivedAt,contentSha256:data.contentSha256});
  }catch(e){ok=false;const failed={...item,blob:{...item.blob,stage:'TRANSPORT_PENDING'},lastAttemptAt:new Date().toISOString(),lastError:String(e&&e.message||e)};await blobPut(failed);announceBlob('TRANSPORT_PENDING',{blobId:item.blobId,error:failed.lastError})}
 }
 return ok
}
async function seal(content,meta={}){
 content=String(content??'');if(!content.trim())return null;
 const loaded=await loadKey();if(!loaded)return null;
 const sid=String(meta.sessionId||sessionId()),surface=String(meta.surface||'public').slice(0,64),contentSha=await sha(enc.encode(content)),submissionFingerprint=await dedupeFingerprint({sid,surface,contentSha});
 const seen=recent(),now=Date.now();for(const [k,t] of Object.entries(seen))if(now-Number(t)>15000)delete seen[k];if(seen[submissionFingerprint]&&now-Number(seen[submissionFingerprint])<10000)return {duplicate:true,submissionFingerprint};seen[submissionFingerprint]=now;saveRecent(seen);
 const id='pir3-'+Date.now().toString(36)+'-'+crypto.getRandomValues(new Uint32Array(2)).join('-');
 const event={schema:SCHEMA,id,createdAt:new Date().toISOString(),surface,sessionId:sid,content,contentSha256:contentSha,submissionFingerprint,location:location.pathname};
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const raw=await crypto.subtle.exportKey('raw',aes);const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,enc.encode(JSON.stringify(event)));const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},loaded.key,raw);
 return {schema:'GVAULT_DATAPASSIV_CAPSULE_V1',kind:SCHEMA,id,epoch:new Date().toISOString().slice(0,10).replaceAll('-',''),createdAt:event.createdAt,eventCount:1,kid:loaded.kid,ciphertext:b64(cipher),wrappedKey:b64(wrapped),iv:b64(iv),ciphertextSha256:await sha(cipher)}
}
async function flush(){const ep=endpoint();if(!ep)return false;let q=queue(),keep=[];for(const c of q){try{const r=await fetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c),cache:'no-store',credentials:'omit'});if(!r.ok)keep.push(c)}catch{keep.push(c)}}save(keep);return keep.length===0}
async function capture(content,meta={}){
 if(meta.explicit!==true)return null;content=String(content??'');if(!content.trim())return null;
 const c=await seal(content,meta);
 if(!c)return captureBlobFallback(content,meta);
 if(c.duplicate)return c.submissionFingerprint;
 const q=queue();if(!q.some(x=>x.id===c.id))q.push(c);save(q);await flush();return c.id
}
async function captureMarked(root,meta={}){if(!root?.hasAttribute?.('data-gvault-input-relay')&&!explicitRoot(root))return null;const r=root.hasAttribute?.('data-gvault-input-relay')?root:explicitRoot(root);const text=readMarked(r);return text?capture(text,{...meta,explicit:true,surface:meta.surface||surfaceFor(r)}):null}
document.addEventListener('submit',e=>{const form=e.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-gvault-input-relay'))return;void captureMarked(form,{surface:surfaceFor(form,'form')})},true);
window.addEventListener('gvault:public-input-submit',e=>{const d=e.detail||{};if(d.explicit!==true||typeof d.content!=='string')return;void capture(d.content,{explicit:true,surface:String(d.surface||'agent'),sessionId:d.sessionId||undefined})});
window.addEventListener('online',()=>{void loadKey({force:true}).then(k=>k?flush():flushBlobs());void flushBlobs()});
window.GVAULT_PUBLIC_INPUT_RELAY=Object.freeze({schema:SCHEMA,version:3,capture,captureMarked,flush,flushBlobs,refreshKey:()=>loadKey({force:true}),status:()=>({mode:'EXPLICIT_ONLY',key:keyCache?'ACTIVE':(keyError||'UNPROVEN'),kid:keyCache?.kid||null,queued:queue().length,legacyQueued:legacyQueueCount(),endpoint:Boolean(endpoint()),blobFallback:'DURABLE_LOCAL_QUEUE',blobEndpoint:Boolean(blobEndpoint()),blobPending,blobState:lastBlobState,passiveTracking:false})});
void blobAll().then(()=>flushBlobs()).catch(()=>{});void loadKey().then(k=>{if(k)void flush()});
})();
