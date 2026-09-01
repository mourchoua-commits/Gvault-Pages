import {createFullSaveActionPipeline} from './full-save-action-pipeline.mjs';

const BUS='gvault.fullsave.study.blobs.v1';
let channel=null;try{channel=new BroadcastChannel(BUS)}catch{}
function emit(blob){
  try{window.dispatchEvent(new CustomEvent('gvault:fullsave:blob',{detail:blob}))}catch{}
  try{channel?.postMessage(blob)}catch{}
}
async function waitLive(timeout=8000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(window.GVAULT_AGENT_LIVE_BLOB?.ask)return window.GVAULT_AGENT_LIVE_BLOB;await new Promise(r=>setTimeout(r,50))}
  throw new Error('live_blob_agent_unavailable');
}
async function snapshot(){
  const live=await waitLive();
  const liveStatus=await live.status().catch(e=>({configured:false,error:String(e?.message||e)}));
  return {
    schema:'GVAULT_FULL_SAVE_PUBLIC_SNAPSHOT_V1',
    at:new Date().toISOString(),
    location:location.href,
    runtimeReady:!!document.querySelector('#gvaultRuntime.ready'),
    liveStatus,
    conversationStyle:window.GVAULT_PUBLIC_AGENT_CONVERSATION?.status?.()||null,
    bananaLiteral:'banane'
  };
}
const pipeline=createFullSaveActionPipeline({
  emit,
  snapshot,
  ask:async message=>{
    const live=await waitLive();
    return live.ask(message);
  }
});
window.GVAULT_FULL_SAVE_DIRECT_BANANA_STUDY=Object.freeze({
  schema:'GVAULT_FULL_SAVE_DIRECT_BANANA_STUDY_V1',
  turn:pipeline.turn,
  hear:pipeline.hear,
  last:pipeline.last,
  snapshot,
  silent:true,
  muted:false,
  busEvent:'gvault:fullsave:blob',
  broadcastChannel:BUS
});
emit(Object.freeze({schema:'GVAULT_FULL_SAVE_ACTION_BLOB_V1',blobId:`fsb-ready-${Date.now().toString(36)}`,parentBlobId:null,type:'study.ready',at:new Date().toISOString(),surface:'Gvault-Pages',silent:true,muted:false,payload:{methodology:'FULL_SAVE_ASSEMBLE_THEN_TEST',target:'BLOB_AGENT_DIRECT_BANANA'}}));
