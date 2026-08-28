import './content-addressed-feed-v2.mjs';

const nativeFetch=window.fetch.bind(window);
let lastHead=null;
function isCompatManifest(input){try{const u=new URL(typeof input==='string'?input:input.url,location.href);return u.origin===location.origin&&/\/essai\/control-tower\/data\/manifest\.json$/.test(u.pathname)}catch{return false}}
window.fetch=async function(input,init){
 if(!isCompatManifest(input))return nativeFetch(input,init);
 const ca=window.GVAULT_CONTENT_ADDRESSED_FEED_V2;
 if(!ca)return nativeFetch(input,init);
 try{
   const head=await ca.fetchHead();
   lastHead=head;
   window.__GVAULT_CONTROL_TOWER_PUBLIC_HEAD__={version:head.version,continuity:head.continuity,snapshotChainSha256:head.manifest?.snapshot?.snapshotChainSha256||null,previousSnapshotSha256:head.manifest?.snapshot?.previousSnapshotSha256||null,sourceMarker:head.manifest?.snapshot?.sourceMarker||null,generatedAt:head.manifest?.generatedAt||null};
   return new Response(JSON.stringify(head.manifest),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-gvault-feed-version':String(head.version)}});
 }catch(e){console.error('[Control Tower chain gate]',e);throw e}
};
await import('./app-v3.mjs');
window.GVAULT_CONTROL_TOWER_CHAIN_V2=Object.freeze({schema:'GVAULT_CONTROL_TOWER_CHAIN_GATE_V2',getState:()=>structuredClone(window.__GVAULT_CONTROL_TOWER_PUBLIC_HEAD__||{version:lastHead?.version||null})});
