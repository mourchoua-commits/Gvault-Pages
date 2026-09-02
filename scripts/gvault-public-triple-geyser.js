(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_TRIPLE_GEYSER_V3_OPEN_BACKBONE';
const BACKBONE_SCHEMA='GVAULT_PUBLIC_BLOB_BACKBONE_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const CHANNEL='gvault.public.geyser.backbone.v1';
const BRANCHES=['GEYSER_1','GEYSER_2','GEYSER_3'];
const tails=new Map(BRANCHES.map(x=>[x,null]));
const instanceId=crypto.randomUUID?.()||('geyser-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
let sequence=0,converted=0,transported=0,published=0,received=0;
let channel=null;try{channel=new BroadcastChannel(CHANNEL)}catch{}
function isBlob(v){return !!v&&typeof v==='object'&&(v.schema===BLOB_SCHEMA||typeof v.blobId==='string')}
function isOwnBlob(v){return !!v&&(v.kind==='public.flow.propulsion'||v.kind==='public.flow.envelope'||BRANCHES.includes(v.from)||v.payload?.geyserSchema===SCHEMA)}
function safe(v){
 if(v==null||typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='string')return v.slice(0,4096);
 if(Array.isArray(v))return v.slice(0,64).map(safe);
 if(typeof v==='object'){
  const out={};for(const [k,x] of Object.entries(v).slice(0,64))out[k]=/password|secret|token|authorization|cookie|sas|privatekey|api[-_]?key/i.test(k)?'[redacted]':safe(x);
  return out;
 }
 return String(v).slice(0,4096);
}
function blobRef(v){return {blobId:v?.blobId||null,schema:v?.schema||null,kind:v?.kind||null,role:v?.role||null,from:v?.from||null,to:v?.to||null,intent:v?.intent||null,surface:v?.surface||null,parentBlobId:v?.parentBlobId||null,at:v?.at||null}}
function live(){return window.GVAULT_AGENT_LIVE_BLOB}
function convert(flow){
 if(isBlob(flow))return flow;
 const bus=live();if(!bus?.speak)return null;
 const envelope=bus.speak({kind:'public.flow.envelope',role:'router',from:'public.ingress.adapter',to:'public.geysers',intent:'transform_public_flow_to_blob',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,conversion:'NON_BLOB_TO_BLOB',direction:'OUTWARD',flow:safe(flow)}});
 if(envelope?.blobId)converted++;return envelope;
}
function push(branch,source){
 const bus=live();if(!bus?.speak||!source?.blobId)return null;
 const previousTailBlobId=tails.get(branch);
 const blob=bus.speak({kind:'public.flow.propulsion',parentBlobId:source.blobId,role:'router',from:branch,to:'public.outward',intent:'push_blob_flow_outward',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,branch,sequence:++sequence,valve:'FULL_OPEN',applicationRateLimit:null,propulsion:'REACTION_FLOW',direction:'OUTWARD',exhaustDirection:'BACKWARD',sourceFlowBlobId:source.blobId,previousBranchTailBlobId:previousTailBlobId||null}});
 if(blob?.blobId)tails.set(branch,blob.blobId);return blob;
}
function transportBlob(blob){if(!isBlob(blob)||isOwnBlob(blob))return false;for(const branch of BRANCHES)push(branch,blob);transported++;return true}
function ingest(flow){const envelope=convert(flow);if(!envelope)return false;for(const branch of BRANCHES)push(branch,envelope);return envelope}
function publish(flow,{broadcast=true}={}){
 const result=isBlob(flow)?transportBlob(flow):ingest(flow);if(!result)return false;published++;
 if(broadcast&&channel){try{channel.postMessage({schema:BACKBONE_SCHEMA,instanceId,type:isBlob(flow)?'blob.ref':'flow',payload:isBlob(flow)?blobRef(flow):safe(flow),at:new Date().toISOString()})}catch{}}
 return result;
}
function acceptBackbone(d){if(!d||d.schema!==BACKBONE_SCHEMA||d.instanceId===instanceId)return;received++;if(d.type==='flow')ingest(d.payload);else if(d.type==='blob.ref'&&d.payload?.blobId){const bus=live();if(bus?.speak){const ref=bus.speak({kind:'public.backbone.blob.ref',role:'router',from:'public.backbone.peer',to:'public.geysers',intent:'transport_public_blob_reference',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,source:d.payload}});if(ref)for(const branch of BRANCHES)push(branch,ref)}}}
if(channel)channel.onmessage=e=>acceptBackbone(e.data);
window.addEventListener('gvault:public-flow',e=>publish(e.detail));
window.addEventListener('gvault:blob',e=>{const b=e.detail;if(isBlob(b)&&!isOwnBlob(b))transportBlob(b)});
window.GVAULT_PUBLIC_TRIPLE_GEYSER=Object.freeze({schema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,channel:CHANNEL,branches:BRANCHES,valve:'FULL_OPEN',applicationRateLimit:null,convert,ingest,publish,transportBlob,status:()=>({mode:'FULL_OPEN_PUBLIC_BLOB_BACKBONE',valve:'FULL_OPEN',applicationRateLimit:null,buffering:'IMMEDIATE_NO_PERSISTENT_HISTORY',scope:'PUBLIC_SAME_ORIGIN_PLUS_CURRENT_PAGE_BLOB_BUS',conversion:'NON_BLOB_TO_BLOB',bridgeTransport:true,blobNetworkTransport:true,sequence,converted,transported,published,received,branches:BRANCHES.map(branch=>({branch,tailBlobId:tails.get(branch)}))})});
try{window.dispatchEvent(new CustomEvent('gvault:public-geyser-backbone-ready',{detail:{schema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,channel:CHANNEL,valve:'FULL_OPEN',applicationRateLimit:null}}))}catch{}
})();