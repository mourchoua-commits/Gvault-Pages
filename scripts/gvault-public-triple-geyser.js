(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_TRIPLE_GEYSER_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const BRANCHES=['GEYSER_1','GEYSER_2','GEYSER_3'];
const tails=new Map(BRANCHES.map(x=>[x,null]));
let sequence=0;
function isBlob(v){return !!v&&typeof v==='object'&&(v.schema===BLOB_SCHEMA||typeof v.blobId==='string')}
function safe(v){
 if(v==null||typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='string')return v.slice(0,8192);
 if(Array.isArray(v))return v.slice(0,64).map(safe);
 if(typeof v==='object'){
  if(isBlob(v))return null;
  const out={};for(const [k,x] of Object.entries(v).slice(0,64))out[k]=/password|secret|token|authorization|cookie|sas/i.test(k)?'[redacted]':safe(x);
  return out;
 }
 return String(v);
}
function push(branch,flow){
 const live=window.GVAULT_AGENT_LIVE_BLOB;if(!live?.speak)return null;
 const blob=live.speak({kind:'public.flow.propulsion',parentBlobId:tails.get(branch),role:'router',from:branch,to:'public.outward',intent:'push_flow_outward',surface:'Gvault-Pages',silent:true,payload:{schema:SCHEMA,branch,sequence:++sequence,propulsion:'REACTION_FLOW',direction:'OUTWARD',exhaustDirection:'BACKWARD',flow:safe(flow)}});
 if(blob?.blobId)tails.set(branch,blob.blobId);return blob;
}
function ingest(flow){if(isBlob(flow))return false;for(const branch of BRANCHES)push(branch,flow);return true}
window.addEventListener('gvault:public-flow',e=>ingest(e.detail));
window.GVAULT_PUBLIC_TRIPLE_GEYSER=Object.freeze({schema:SCHEMA,branches:BRANCHES,ingest,status:()=>({mode:'CONTINUOUS_ON_PUBLIC_FLOW',propulsion:'BLOBS_PUSH_FLOW_BACKWARD_AND_MOVE_OUTWARD',sequence,branches:BRANCHES.map(branch=>({branch,tailBlobId:tails.get(branch)}))})});
})();