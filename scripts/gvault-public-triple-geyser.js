(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_TRIPLE_GEYSER_V4_BLOB_LIMITS';
const BACKBONE_SCHEMA='GVAULT_PUBLIC_BLOB_BACKBONE_V2';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const CHANNEL='gvault.public.geyser.backbone.v1';
const BRANCHES=['GEYSER_1','GEYSER_2','GEYSER_3'];
const POLICY=Object.freeze({frameChars:16384,maxDepth:16,overflowStrategy:'BLOB_FRAGMENTATION',contentPolicy:'SPLIT_DONT_DROP',applicationRateLimit:null});
const LEGACY_LIMITS=Object.freeze([
 {id:'legacy.safe.string',value:4096,unit:'chars',replacement:'BLOB_FRAGMENTATION'},
 {id:'legacy.safe.array',value:64,unit:'items',replacement:'STREAM_ALL_ITEMS'},
 {id:'legacy.safe.object',value:64,unit:'entries',replacement:'STREAM_ALL_ENTRIES'},
 {id:'legacy.routing.backlog',value:256,unit:'flows',replacement:'BLOB_BACKLOG_POLICY'}
]);
const tails=new Map(BRANCHES.map(x=>[x,null]));
const instanceId=crypto.randomUUID?.()||('geyser-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const inboundGroups=new Map();
let sequence=0,converted=0,transported=0,published=0,received=0,fragmented=0,legacyBlobbed=0,legacyReady=false;
let channel=null;try{channel=new BroadcastChannel(CHANNEL)}catch{}
function uid(prefix='geyser'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function isBlob(v){return !!v&&typeof v==='object'&&(v.schema===BLOB_SCHEMA||typeof v.blobId==='string')}
function isOwnBlob(v){return !!v&&(v.kind==='public.flow.propulsion'||v.kind==='public.flow.envelope'||v.kind==='public.flow.fragment.manifest'||v.kind==='public.flow.fragment'||v.kind==='public.limit.legacy'||v.kind==='public.backbone.blob.ref'||BRANCHES.includes(v.from)||v.payload?.geyserSchema===SCHEMA)}
function live(){return window.GVAULT_AGENT_LIVE_BLOB}
function sanitize(v,depth=0,seen=new WeakSet()){
 if(v==null||typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='string')return v;
 if(typeof v==='bigint')return String(v);
 if(typeof v!=='object')return String(v);
 if(depth>=POLICY.maxDepth)return {constraint:'MAX_DEPTH',depth,policy:'BLOB_BOUNDARY'};
 if(seen.has(v))return {constraint:'CYCLE_REFERENCE',policy:'BLOB_BOUNDARY'};
 seen.add(v);
 if(Array.isArray(v))return v.map(x=>sanitize(x,depth+1,seen));
 const out={};for(const [k,x] of Object.entries(v))out[k]=/password|secret|token|authorization|cookie|sas|privatekey|api[-_]?key/i.test(k)?'[redacted]':sanitize(x,depth+1,seen);return out;
}
function blobRef(v){return {blobId:v?.blobId||null,schema:v?.schema||null,kind:v?.kind||null,role:v?.role||null,from:v?.from||null,to:v?.to||null,intent:v?.intent||null,surface:v?.surface||null,parentBlobId:v?.parentBlobId||null,at:v?.at||null}}
function push(branch,source,extra={}){
 const bus=live();if(!bus?.speak||!source?.blobId)return null;
 const previousTailBlobId=tails.get(branch);
 const blob=bus.speak({kind:'public.flow.propulsion',parentBlobId:source.blobId,role:'router',from:branch,to:'public.outward',intent:'push_blob_flow_outward',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,branch,sequence:++sequence,valve:'FULL_OPEN',applicationRateLimit:null,policy:POLICY,propulsion:'REACTION_FLOW',direction:'OUTWARD',exhaustDirection:'BACKWARD',sourceFlowBlobId:source.blobId,previousBranchTailBlobId:previousTailBlobId||null,...extra}});
 if(blob?.blobId)tails.set(branch,blob.blobId);return blob;
}
function propel(source,extra={}){if(!source?.blobId)return false;for(const branch of BRANCHES)push(branch,source,extra);return true}
function emitLegacyLimits(){
 if(legacyReady)return true;const bus=live();if(!bus?.speak)return false;legacyReady=true;
 for(const legacy of LEGACY_LIMITS){const b=bus.speak({kind:'public.limit.legacy',role:'router',from:'public.geyser.policy',to:'public.outward',intent:'blobify_replaced_limit',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,legacy,replacedBy:POLICY,active:false}});if(b?.blobId){legacyBlobbed++;propel(b,{legacyLimit:true})}}
 return true;
}
function convert(flow){
 if(isBlob(flow))return {root:flow,parts:[]};const bus=live();if(!bus?.speak)return null;emitLegacyLimits();
 const cleaned=sanitize(flow),serialized=JSON.stringify(cleaned);
 if(serialized.length<=POLICY.frameChars){const envelope=bus.speak({kind:'public.flow.envelope',role:'router',from:'public.ingress.adapter',to:'public.geysers',intent:'transform_public_flow_to_blob',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,conversion:'NON_BLOB_TO_BLOB',direction:'OUTWARD',policy:POLICY,flow:cleaned}});if(envelope?.blobId)converted++;return envelope?{root:envelope,parts:[]}:null}
 const total=Math.ceil(serialized.length/POLICY.frameChars),groupId=uid('flow-group');
 const manifest=bus.speak({kind:'public.flow.fragment.manifest',role:'router',from:'public.ingress.adapter',to:'public.geysers',intent:'fragment_public_flow_to_blobs',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,groupId,total,totalChars:serialized.length,policy:POLICY}});if(!manifest?.blobId)return null;
 const parts=[];for(let i=0;i<total;i++){const data=serialized.slice(i*POLICY.frameChars,(i+1)*POLICY.frameChars);const part=bus.speak({kind:'public.flow.fragment',parentBlobId:manifest.blobId,role:'router',from:'public.ingress.adapter',to:'public.geysers',intent:'carry_public_flow_fragment',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,groupId,index:i,total,data}});if(part?.blobId)parts.push(part)}
 converted++;fragmented+=parts.length;return {root:manifest,parts};
}
function transportBlob(blob){if(!isBlob(blob)||isOwnBlob(blob))return false;emitLegacyLimits();propel(blob,{transportExistingBlob:true});transported++;return true}
function ingest(flow){const packet=convert(flow);if(!packet)return false;propel(packet.root,{packetRoot:true});for(const part of packet.parts)propel(part,{packetFragment:true});return packet.root}
function broadcastFlow(flow){if(!channel)return;try{const cleaned=sanitize(flow),serialized=JSON.stringify(cleaned);if(serialized.length<=POLICY.frameChars){channel.postMessage({schema:BACKBONE_SCHEMA,instanceId,type:'flow',payload:cleaned,at:new Date().toISOString()});return}const groupId=uid('backbone-group'),total=Math.ceil(serialized.length/POLICY.frameChars);channel.postMessage({schema:BACKBONE_SCHEMA,instanceId,type:'flow.manifest',groupId,total,at:new Date().toISOString()});for(let i=0;i<total;i++)channel.postMessage({schema:BACKBONE_SCHEMA,instanceId,type:'flow.fragment',groupId,index:i,total,data:serialized.slice(i*POLICY.frameChars,(i+1)*POLICY.frameChars),at:new Date().toISOString()})}catch{}}
function publish(flow,{broadcast=true}={}){const result=isBlob(flow)?transportBlob(flow):ingest(flow);if(!result)return false;published++;if(broadcast&&channel){try{if(isBlob(flow))channel.postMessage({schema:BACKBONE_SCHEMA,instanceId,type:'blob.ref',payload:blobRef(flow),at:new Date().toISOString()});else broadcastFlow(flow)}catch{}}return result}
function acceptBackbone(d){
 if(!d||d.schema!==BACKBONE_SCHEMA||d.instanceId===instanceId)return;received++;
 if(d.type==='flow'){ingest(d.payload);return}
 if(d.type==='flow.manifest'){inboundGroups.set(d.groupId,{total:Number(d.total)||0,parts:[],at:Date.now()});return}
 if(d.type==='flow.fragment'){const g=inboundGroups.get(d.groupId)||{total:Number(d.total)||0,parts:[],at:Date.now()};g.parts[Number(d.index)||0]=String(d.data||'');inboundGroups.set(d.groupId,g);if(g.total>0&&g.parts.filter(x=>typeof x==='string').length===g.total){inboundGroups.delete(d.groupId);try{ingest(JSON.parse(g.parts.join('')))}catch{}}return}
 if(d.type==='blob.ref'&&d.payload?.blobId){const bus=live();if(bus?.speak){const ref=bus.speak({kind:'public.backbone.blob.ref',role:'router',from:'public.backbone.peer',to:'public.geysers',intent:'transport_public_blob_reference',surface:'Gvault-Pages',silent:true,payload:{geyserSchema:SCHEMA,source:d.payload}});if(ref)propel(ref,{backboneReference:true})}}
}
if(channel)channel.onmessage=e=>acceptBackbone(e.data);
window.addEventListener('gvault:public-flow',e=>publish(e.detail));
window.addEventListener('gvault:blob',e=>{const b=e.detail;if(isBlob(b)&&!isOwnBlob(b))transportBlob(b)});
const legacyTimer=setInterval(()=>{if(emitLegacyLimits())clearInterval(legacyTimer)},100);
window.GVAULT_PUBLIC_TRIPLE_GEYSER=Object.freeze({schema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,channel:CHANNEL,branches:BRANCHES,valve:'FULL_OPEN',applicationRateLimit:null,policy:POLICY,legacyLimits:LEGACY_LIMITS,convert,ingest,publish,transportBlob,status:()=>({mode:'FULL_OPEN_BLOBIFIED_LIMIT_BACKBONE',valve:'FULL_OPEN',applicationRateLimit:null,policy:POLICY,legacyLimitsBlobbed:legacyBlobbed,buffering:'FRAGMENTED_TRANSIT_NOT_CONTENT_CAP',scope:'PUBLIC_SAME_ORIGIN_PLUS_CURRENT_PAGE_BLOB_BUS',conversion:'NON_BLOB_TO_BLOB',bridgeTransport:true,blobNetworkTransport:true,sequence,converted,fragmented,transported,published,received,branches:BRANCHES.map(branch=>({branch,tailBlobId:tails.get(branch)}))})});
try{window.dispatchEvent(new CustomEvent('gvault:public-geyser-backbone-ready',{detail:{schema:SCHEMA,backboneSchema:BACKBONE_SCHEMA,channel:CHANNEL,valve:'FULL_OPEN',applicationRateLimit:null,policy:POLICY}}))}catch{}
})();