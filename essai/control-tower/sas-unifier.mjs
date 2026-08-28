const DB_NAME='gvault-control-tower-credential-v1';
const STORE='secrets';
const KEY_ID='deviceKey';
const TOKEN_ID='githubPat';
const AAD=new TextEncoder().encode('GVAULT_CONTROL_TOWER_DEVICE_CREDENTIAL_V1');

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB indisponible'));
  });
}
async function tx(mode,fn){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let value;try{value=fn(s)}catch(e){reject(e);return}t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error||new Error('Transaction IndexedDB impossible'));t.onabort=()=>reject(t.error||new Error('Transaction IndexedDB annulée'))})}finally{db.close()}
}
async function get(id){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}finally{db.close()}
}
async function put(value){
  const db=await openDb();
  try{await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(value);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}
}
async function del(id){
  const db=await openDb();
  try{await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}
}
async function deviceKey(){
  const found=await get(KEY_ID);
  if(found?.value instanceof CryptoKey)return found.value;
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  await put({id:KEY_ID,value:key,createdAt:new Date().toISOString(),extractable:false});
  return key;
}
async function saveToken(token){
  const text=String(token||'').trim();
  if(text.length<20)throw new Error('Token GitHub trop court');
  const key=await deviceKey(),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},key,new TextEncoder().encode(text));
  await put({id:TOKEN_ID,schema:'GVAULT_CONTROL_TOWER_DEVICE_TOKEN_V1',iv:[...iv],cipher:[...new Uint8Array(cipher)],createdAt:new Date().toISOString()});
}
async function loadToken(){
  const rec=await get(TOKEN_ID);if(!rec)return '';
  if(rec.schema!=='GVAULT_CONTROL_TOWER_DEVICE_TOKEN_V1')throw new Error('Capsule token locale incompatible');
  const keyRec=await get(KEY_ID);if(!(keyRec?.value instanceof CryptoKey))throw new Error('Clé locale absente');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(rec.iv),additionalData:AAD},keyRec.value,new Uint8Array(rec.cipher));
  return new TextDecoder().decode(plain);
}
async function forgetDevice(){await del(TOKEN_ID).catch(()=>{});await del(KEY_ID).catch(()=>{})}

function log(msg,cls=''){const box=document.querySelector('#terminalLog');if(!box)return;const p=document.createElement('div');p.className=cls;p.textContent=`${new Date().toLocaleTimeString()}  ${msg}`;box.appendChild(p);box.scrollTop=box.scrollHeight}

window.addEventListener('DOMContentLoaded',async()=>{
  const input=document.querySelector('#token'),connect=document.querySelector('#connect'),lock=document.querySelector('#lock'),auth=document.querySelector('.auth'),state=document.querySelector('#connectionState');
  if(!input||!connect||!lock||!auth||!state)return;
  const style=document.createElement('style');style.textContent='.auth[data-unified="1"] #token,.auth[data-unified="1"] #connect{display:none}.unifiedBadge{align-self:center;font-size:8px;color:var(--ok);white-space:nowrap}.forgetDevice{font-size:8px;padding:7px 8px}';document.head.appendChild(style);
  const badge=document.createElement('span');badge.className='unifiedBadge';badge.textContent='SAS GVAULT · accès privé à associer';auth.prepend(badge);
  const forget=document.createElement('button');forget.type='button';forget.className='forgetDevice';forget.textContent='OUBLIER APPAREIL';forget.title='Supprime uniquement la capsule locale chiffrée du token GitHub';auth.appendChild(forget);
  input.placeholder='1re configuration seulement · token GitHub';
  input.title='Le token GitHub est demandé une seule fois sur cet appareil, puis conservé chiffré avec une clé WebCrypto locale non exportable.';
  let pendingManual='',autoAttempt=false,stored=false;
  const unifiedOn=()=>{stored=true;auth.dataset.unified='1';badge.textContent='SAS GVAULT ✓ · accès privé auto';};
  const unifiedOff=()=>{stored=false;delete auth.dataset.unified;badge.textContent='SAS GVAULT ✓ · configurer accès privé une fois';};
  connect.addEventListener('click',()=>{const v=input.value.trim();if(v&&!autoAttempt)pendingManual=v},true);
  forget.addEventListener('click',async()=>{await forgetDevice();pendingManual='';autoAttempt=false;unifiedOff();try{lock.click()}catch{}log('Identifiant privé local oublié sur cet appareil','warn')});
  const observer=new MutationObserver(async()=>{
    const text=state.textContent||'';
    if((text.startsWith('AUTH OK')||text.startsWith('LIVE'))&&pendingManual){
      const t=pendingManual;pendingManual='';
      try{await saveToken(t);unifiedOn();log('Accès privé associé au SAS GVAULT sur cet appareil · token chiffré localement','ok')}catch(e){unifiedOff();log('Association locale non persistée · '+e.message,'warn')}
    }else if((text.startsWith('AUTH OK')||text.startsWith('LIVE'))&&autoAttempt){
      autoAttempt=false;unifiedOn();log('Accès privé restauré automatiquement après SAS GVAULT','ok');
    }else if(text.startsWith('AUTH FAIL')&&autoAttempt){
      autoAttempt=false;await forgetDevice().catch(()=>{});unifiedOff();log('Jeton local refusé · nouvelle configuration requise','warn');
    }
  });
  observer.observe(state,{childList:true,characterData:true,subtree:true,attributes:true});
  try{
    const saved=await loadToken();
    if(saved){autoAttempt=true;badge.textContent='SAS GVAULT ✓ · ouverture privée auto…';input.value=saved;connect.click();}
    else unifiedOff();
  }catch(e){await forgetDevice().catch(()=>{});unifiedOff();log('Capsule locale inutilisable · '+e.message,'warn')}
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  window.GVAULT_CONTROL_TOWER_SAS_UNIFIER=Object.freeze({schema:'GVAULT_CONTROL_TOWER_SAS_UNIFIER_V1',principalGate:'GVAULT_SAS',githubCredential:'DEVICE_LOCAL_ENCRYPTED_TOKEN',passwordReuse:'UX_SINGLE_SAS_NOT_GITHUB_PASSWORD',tokenAtRest:'AES_GCM_WEBCRYPTO_NON_EXTRACTABLE_KEY',forgetDevice});
});
