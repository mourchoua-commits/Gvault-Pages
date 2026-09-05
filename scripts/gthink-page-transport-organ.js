(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_PAGE_TRANSPORT_ORGAN_V2_SELF_INVOCATION';
const BLOB_ID='blob:public:gvault-page:transport:v1';
const OWNER_BLOB_ID='blob:public:gvault-page:v1';
const CORE_URL=new URL('gthink-page-transport-core.js?v=3',document.currentScript?.src||location.href).href;
let coreLoad=null;
function core(){return window.GVAULT_PUBLIC_PAGE_TRANSPORT_CORE||null}
function waitForCore(resolve,started){const c=core();if(c?.askRequest){resolve(c);return}if(Date.now()-started>4000){resolve(null);return}setTimeout(()=>waitForCore(resolve,started),25)}
function load(){const c=core();if(c?.askRequest)return Promise.resolve(c);if(coreLoad)return coreLoad;coreLoad=new Promise(resolve=>{const existing=document.querySelector('script[data-gvault-page-transport-core="V3"]');if(existing){waitForCore(resolve,Date.now());return}const s=document.createElement('script');s.src=CORE_URL;s.async=false;s.setAttribute('data-gvault-page-transport-core','V3');s.onload=()=>waitForCore(resolve,Date.now());s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)}).finally(()=>{coreLoad=null});return coreLoad}
async function status(){const c=await load();if(!c?.status)return{configured:false,error:'page_transport_core_unavailable',schema:SCHEMA,blobId:BLOB_ID,ownerBlobId:OWNER_BLOB_ID,internal:true};try{return{...(await c.status()),schema:SCHEMA,blobId:BLOB_ID,ownerBlobId:OWNER_BLOB_ID,internal:true}}catch(e){return{configured:false,error:String(e?.message||e),schema:SCHEMA,blobId:BLOB_ID,ownerBlobId:OWNER_BLOB_ID,internal:true}}}
async function askRequest(request){const c=await load();if(!c?.askRequest)throw new Error('page_transport_core_unavailable');return c.askRequest(request)}
const api=Object.freeze({schema:SCHEMA,blobId:BLOB_ID,ownerBlobId:OWNER_BLOB_ID,internal:true,load,status,askRequest,get coreReady(){return!!core()?.askRequest}});
window.GVAULT_PUBLIC_PAGE_TRANSPORT_ORGAN=api;
window.dispatchEvent(new CustomEvent('gvault:public-page-transport-ready',{detail:{schema:SCHEMA,blobId:BLOB_ID,ownerBlobId:OWNER_BLOB_ID,internal:true}}));
})();
(()=>{'use strict';try{if(window.GTHINK_BLOB_RELAUNCH||document.querySelector('script[data-gthink-blob-relaunch="V1"]'))return;const base=new URL('.',document.currentScript?.src||location.href),s=document.createElement('script');s.src=new URL('gthink-blob-relaunch-orchestrator.js?v=1',base).href;s.async=false;s.dataset.gthinkBlobRelaunch='V1';(document.head||document.documentElement).appendChild(s)}catch{}})();
(()=>{'use strict';try{if(window.GTHINK_DORMANT_BLOB_HOST||document.querySelector('script[data-gthink-dormant-blob-host="V1"]'))return;const base=new URL('.',document.currentScript?.src||location.href),s=document.createElement('script');s.src=new URL('gthink-dormant-blob-host.js?v=1',base).href;s.async=false;s.dataset.gthinkDormantBlobHost='V1';(document.head||document.documentElement).appendChild(s)}catch{}})();
(()=>{'use strict';try{if(window.GVAULT_VFS_FUSION||document.querySelector('script[data-gvault-vfs-fusion="V1"]'))return;const base=new URL('.',document.currentScript?.src||location.href),s=document.createElement('script');s.src=new URL('gvault-vfs-fusion.js?v=1',base).href;s.async=false;s.dataset.gvaultVfsFusion='V1';(document.head||document.documentElement).appendChild(s)}catch{}})();
