(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_TRIPLE_GEYSER_V2';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const BRANCHES=['GEYSER_1','GEYSER_2','GEYSER_3'];
const tails=new Map(BRANCHES.map(x=>[x,null]));
let sequence=0,converted=0;
function isBlob(v){return !!v&&typeof v==='object'&&(v.schema===BLOB_SCHEMA||typeof v.blobId==='string')}
function safe(v){
 if(v==null||typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='string')return v.slice(0,2048);
 if(Array.isArray(v))return v.slice(0,32).map(safe);
 if(typeof v==='object'){
  if(isBlob(v))return {blobId:v.blobId||null,schema:v.schema||null};
  const out={};for(const [k,x] of Object.entries(v).slice(0,48))out[k]=/password|secret|token|authorization|cookie|sas|key/i.test(k)?'[redacted]':safe(x);
  return out;
 }
 return String(v).slice(0,2048);
}
function live(){return window.GVAULT_AGENT_LIVE_BLOB}
function convert(flow){
 if(isBlob(flow))return flow;
 const bus=live();if(!bus?.speak)return null;
 const envelope=bus.speak({kind:'public.flow.envelope',role:'router',from:'public.ingress.adapter',to:'public.geysers',intent:'transform_public_flow_to_blob',surface:'Gvault-Pages',silent:true,payload:{schema:SCHEMA,conversion:'NON_BLOB_TO_BLOB',direction:'OUTWARD',flow:safe(flow)}});
 if(envelope?.blobId)converted++;return envelope;
}
function push(branch,envelope){
 const bus=live();if(!bus?.speak||!envelope?.blobId)return null;
 const previousTailBlobId=tails.get(branch);
 const blob=bus.speak({kind:'public.flow.propulsion',parentBlobId:envelope.blobId,role:'router',from:branch,to:'public.outward',intent:'push_blob_wrapped_flow_outward',surface:'Gvault-Pages',silent:true,payload:{schema:SCHEMA,branch,sequence:++sequence,propulsion:'REACTION_FLOW',direction:'OUTWARD',exhaustDirection:'BACKWARD',sourceFlowBlobId:envelope.blobId,previousBranchTailBlobId:previousTailBlobId||null}});
 if(blob?.blobId)tails.set(branch,blob.blobId);return blob;
}
function ingest(flow){const envelope=convert(flow);if(!envelope)return false;for(const branch of BRANCHES)push(branch,envelope);return envelope}
window.addEventListener('gvault:public-flow',e=>ingest(e.detail));
window.GVAULT_PUBLIC_TRIPLE_GEYSER=Object.freeze({schema:SCHEMA,branches:BRANCHES,convert,ingest,status:()=>({mode:'CONTINUOUS_ALL_PUBLIC_FLOW',conversion:'NON_BLOB_TO_BLOB',propulsion:'BLOBS_PUSH_WRAPPED_FLOW_BACKWARD_AND_MOVE_OUTWARD',sequence,converted,branches:BRANCHES.map(branch=>({branch,tailBlobId:tails.get(branch)}))})});
})();