(()=>{'use strict';
const SCHEMA='GVAULT_STREAM_LISTENER_BLOBS_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const STREAM_URL='gvault://blobs/public/gthink/stream';
const api=window.GVAULT_AGENT_LIVE_BLOB;
if(!api||api.blobSchema!==BLOB_SCHEMA)return;

const listeners=[
  {blobId:'blob:listener:user:v1',name:'listener.user',accept:b=>b.kind==='utterance'&&b.role==='user'},
  {blobId:'blob:listener:gateway:v1',name:'listener.gateway',accept:b=>['gateway.request','gateway.probe','gateway.state'].includes(b.kind)},
  {blobId:'blob:listener:gthink:v1',name:'listener.gthink',accept:b=>(b.kind==='utterance'&&b.role==='gthink')||b.kind==='gateway.response'},
  {blobId:'blob:listener:health:v1',name:'listener.health',accept:b=>['error','method.violation','state'].includes(b.kind)},
];
const seen=new Set();
let renderBuffer='',renderParent=null,renderTimer=null,renderCount=0;

function clip(s,n=120){s=String(s??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s}
function summary(b){
  if(b.kind==='utterance')return `${b.role||'?' } utterance · ${clip(b.text||b.payload?.text||'')}`;
  if(b.kind==='gateway.request')return `gateway.request · ${clip(b.payload?.message||b.text||'')}`;
  if(b.kind==='gateway.response')return `gateway.response · ${clip(b.text||b.payload?.text||'')}`;
  if(b.kind==='gateway.probe')return `gateway.probe · ${clip(b.payload?.need||'listener')}`;
  if(b.kind==='gateway.state')return `gateway.state · transport=${b.payload?.transportReady?'ready':'wait'} responder=${b.payload?.responderReady?'ready':'wait'}`;
  if(b.kind==='error')return `error · ${clip(b.payload?.error||b.text||'')}`;
  if(b.kind==='method.violation')return `method.violation · ${clip(b.payload?.reason||b.text||'')}`;
  if(b.kind==='state')return `state · ${clip(b.payload?.state||b.text||'')}`;
  return `${b.kind} · ${clip(b.text||b.payload?.text||'')}`;
}
function reply(listener,b,extra={}){
  if(!b?.blobId||seen.has(`${listener.blobId}:${b.blobId}`))return;
  seen.add(`${listener.blobId}:${b.blobId}`);if(seen.size>600)seen.delete(seen.values().next().value);
  api.speak({schema:BLOB_SCHEMA,kind:'listener.reply',role:'listener',from:listener.blobId,to:'public.bus',intent:'report_seen_blob',parentBlobId:b.blobId,conversationId:b.conversationId,streamUrl:b.streamUrl||STREAM_URL,text:summary(b),payload:{listenerBlobId:listener.blobId,listenerName:listener.name,seenBlobId:b.blobId,seenKind:b.kind,seenRole:b.role||null,summary:summary(b),...extra}});
}
function flushRender(){
  renderTimer=null;
  if(!renderParent||!renderBuffer)return;
  const parent=renderParent,chars=renderBuffer,count=renderCount;
  renderParent=null;renderBuffer='';renderCount=0;
  api.speak({schema:BLOB_SCHEMA,kind:'listener.reply',role:'listener',from:'blob:listener:render:v1',to:'public.bus',intent:'report_render_progress',parentBlobId:parent.blobId,conversationId:parent.conversationId,streamUrl:parent.streamUrl||STREAM_URL,text:`render.delta · +${chars.length} caractères`,payload:{listenerBlobId:'blob:listener:render:v1',listenerName:'listener.render',seenBlobId:parent.blobId,seenKind:'render.delta',deltaCount:count,chars:clip(chars,80),summary:`render.delta · +${chars.length} caractères`}});
}
function onBlob(b){
  if(!b||b.schema!==BLOB_SCHEMA)return;
  if(String(b.kind||'').startsWith('listener.'))return;
  if(String(b.from||'').startsWith('blob:listener:'))return;
  if(b.kind==='render.delta'){
    renderParent=b;renderBuffer+=String(b.payload?.chars||'');renderCount++;
    if(renderBuffer.length>=24){if(renderTimer)clearTimeout(renderTimer);flushRender()}else if(!renderTimer)renderTimer=setTimeout(flushRender,180);
    return;
  }
  if(b.kind==='render.done'){
    if(renderTimer){clearTimeout(renderTimer);flushRender()}
    reply({blobId:'blob:listener:render:v1',name:'listener.render'},b,{final:true,length:b.payload?.length||null});
    return;
  }
  for(const listener of listeners)if(listener.accept(b))reply(listener,b);
}

for(const listener of [...listeners,{blobId:'blob:listener:render:v1',name:'listener.render'}]){
  api.speak({schema:BLOB_SCHEMA,kind:'listener.ready',role:'listener',from:listener.blobId,to:'public.bus',intent:'announce_listener_ready',streamUrl:STREAM_URL,text:`${listener.name} écoute le stream`,payload:{listenerBlobId:listener.blobId,listenerName:listener.name,streamUrl:STREAM_URL,state:'ready'}});
}
api.listen(onBlob);
for(const b of api.hearLast(32))onBlob(b);
window.GVAULT_STREAM_LISTENER_BLOBS=Object.freeze({schema:SCHEMA,streamUrl:STREAM_URL,listeners:listeners.map(x=>({blobId:x.blobId,name:x.name})).concat([{blobId:'blob:listener:render:v1',name:'listener.render'}])});
})();