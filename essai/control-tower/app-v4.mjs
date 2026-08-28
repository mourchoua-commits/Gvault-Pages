import './content-addressed-feed-v2.mjs';

const nativeFetch=window.fetch.bind(window);
let lastHead=null;
function urlOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href)}catch{return null}}
function isCompatManifest(input){const u=urlOf(input);return !!u&&u.origin===location.origin&&/\/essai\/control-tower\/data\/manifest\.json$/.test(u.pathname)}
function isCompatPayload(input){const u=urlOf(input);return !!u&&u.origin===location.origin&&/\/essai\/control-tower\/data\/snapshots\/[a-f0-9]{64}\.bin$/i.test(u.pathname)}
window.fetch=async function(input,init){
 const ca=window.GVAULT_CONTENT_ADDRESSED_FEED_V2;
 if(!ca)return nativeFetch(input,init);
 if(isCompatManifest(input)){
  try{
   const head=await ca.fetchHead();lastHead=head;
   window.__GVAULT_CONTROL_TOWER_PUBLIC_HEAD__={version:head.version,continuity:head.continuity,source:head.source||ca.getSource?.()||null,snapshotChainSha256:head.manifest?.snapshot?.snapshotChainSha256||null,previousSnapshotSha256:head.manifest?.snapshot?.previousSnapshotSha256||null,sourceMarker:head.manifest?.snapshot?.sourceMarker||null,generatedAt:head.manifest?.generatedAt||null};
   return new Response(JSON.stringify(head.manifest),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-gvault-feed-version':String(head.version),'x-gvault-source':String(head.source?.mode||'UNKNOWN')}});
  }catch(e){console.error('[Control Tower chain gate]',e);throw e}
 }
 if(isCompatPayload(input)){
  try{if(!lastHead)lastHead=await ca.fetchHead();const cipher=await ca.fetchCipher(lastHead.manifest);return new Response(cipher,{status:200,headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-gvault-source':String(lastHead.source?.mode||ca.getSource?.()?.mode||'UNKNOWN')}})}catch(e){console.error('[Control Tower payload gate]',e);throw e}
 }
 return nativeFetch(input,init);
};
await import('./app-v3.mjs');
void import('./commit-capsule-vfs-v1.mjs?v=keytypes1').catch(e=>console.error('[Control Tower commit image loader]',e));
function armAcceptedHead(){const n=document.querySelector('#connectionState');if(!n)return;const accept=()=>{if(!/^LIVE\b/.test(String(n.textContent||''))||lastHead?.version!==2)return;try{window.GVAULT_CONTENT_ADDRESSED_FEED_V2?.markAccepted?.(lastHead.manifest)}catch{}};const o=new MutationObserver(accept);o.observe(n,{childList:true,subtree:true,characterData:true});accept();window.addEventListener('pagehide',()=>o.disconnect(),{once:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',armAcceptedHead,{once:true});else armAcceptedHead();
window.GVAULT_CONTROL_TOWER_CHAIN_V2=Object.freeze({schema:'GVAULT_CONTROL_TOWER_CHAIN_GATE_V2',getState:()=>structuredClone(window.__GVAULT_CONTROL_TOWER_PUBLIC_HEAD__||{version:lastHead?.version||null,source:window.GVAULT_CONTENT_ADDRESSED_FEED_V2?.getSource?.()||null})});
