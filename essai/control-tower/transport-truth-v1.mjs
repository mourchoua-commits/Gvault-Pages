const KPI_IDS=['kEvents','kAlerts','kEngines','kTracks'];
const PROBE_MS=60000;
let snapshotReady=false,applying=false,timer=null;
const $=s=>document.querySelector(s);

function sessionActive(){return !!window.GVAULT_PRIVATE_TOOL_SESSION_V1?.getState?.().active}
function live(){return /(^|\s)LIVE(\s|·|$)/i.test(String($('#connectionState')?.textContent||''))}
function ensureAuxHost(){
 let host=$('#ctWatcherStateHost');
 if(host)return host;
 const brand=document.querySelector('.brand');
 if(!brand)return null;
 host=document.createElement('span');
 host.id='ctWatcherStateHost';
 host.style.cssText='display:inline-flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:8px;color:var(--muted)';
 brand.appendChild(host);
 return host;
}
function setUnknownKpis(){
 if(live()||applying)return;
 applying=true;
 for(const id of KPI_IDS){const n=$('#'+id);if(n){n.textContent='—';n.title=snapshotReady?'Snapshot disponible mais pas encore déchiffré':'Transport en attente : valeur source non mesurée';}}
 const ec=$('#eventCount');if(ec){ec.textContent='—';ec.title='Valeur inconnue tant que le feed n’est pas LIVE';}
 applying=false;
}
function rewriteNotice(){
 const n=$('#feedWaitNotice');if(!n||live())return;
 const sas=sessionActive()?'SAS PRINCIPAL ✓':'SAS PRINCIPAL NON ACTIF';
 n.textContent=snapshotReady
  ?`${sas} · SNAPSHOT CHIFFRÉ DISPONIBLE · les compteurs restent inconnus jusqu’au déchiffrement LIVE. COMMIT WATCH et VFS restent actifs sur le ciphertext.`
  :`${sas} · TRANSPORT EN ATTENTE · les sources privées ne sont pas mesurées par cet écran pour l’instant. COMMIT WATCH reste prêt à ingérer automatiquement le prochain snapshot chiffré dans le VFS.`;
}
function applyTruth(){ensureAuxHost();if(!live())setUnknownKpis();rewriteNotice()}
async function probe(){
 let ok=false;
 try{const r=await fetch('./data/latest.json?truth='+Date.now(),{cache:'no-store',credentials:'omit'});ok=!!r.ok}catch{}
 if(!ok)try{const r=await fetch('./data/manifest.json?truth='+Date.now(),{cache:'no-store',credentials:'omit'});ok=!!r.ok}catch{}
 snapshotReady=ok;applyTruth();return ok;
}
const obs=new MutationObserver(()=>applyTruth());
function start(){
 ensureAuxHost();
 const state=$('#connectionState');if(state)obs.observe(state,{subtree:true,childList:true,characterData:true});
 const kpis=document.querySelector('.kpis');if(kpis)obs.observe(kpis,{subtree:true,childList:true,characterData:true});
 window.addEventListener('gvault:private-tool-session-active',applyTruth);
 window.addEventListener('gvault:private-tool-session-expired',applyTruth);
 window.addEventListener('gvault:control-tower-vfs-ingested',()=>{snapshotReady=true;applyTruth()});
 void probe();timer=setInterval(()=>void probe(),PROBE_MS);
 window.addEventListener('pagehide',()=>{clearInterval(timer);obs.disconnect()},{once:true});
 applyTruth();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.GVAULT_CONTROL_TOWER_TRANSPORT_TRUTH_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_TRANSPORT_TRUTH_V1',probe,getState:()=>({snapshotReady,live:live(),sasActive:sessionActive()})});
