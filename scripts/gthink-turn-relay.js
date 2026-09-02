(()=>{'use strict';
const SCHEMA='GTHINK_TURN_RELAY_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const RELAYS=['A','B'];
const requestSlots=new Map();
const gatewaySlots=new Map();
const watchdogs=new Map();
const doneParents=new Set();
let turn=0;
function uid(prefix='relay'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function speak(kind,payload,parentBlobId=null,slot=null){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid('grelay'),parentBlobId,conversationId:payload?.conversationId||'gthink-relay',kind,role:'relay',from:slot?`GThinkRelay-${slot}`:'GThinkRelay',to:'public.bus',intent:'relay_turn',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text:undefined,payload:{...payload,slot,schema:SCHEMA},understoodBy:['GThink','public-kernel','public-ui','relay-team'],silent:true,muted:false})}
function arm(userBlob){const slot=RELAYS[turn%2];turn++;requestSlots.set(userBlob.blobId,slot);speak('gthink.relay.armed',{turn,requestBlobId:userBlob.blobId,conversationId:userBlob.conversationId},userBlob.blobId,slot);return slot}
function forward(gatewayBlob){const slot=requestSlots.get(gatewayBlob.parentBlobId)||RELAYS[turn%2];gatewaySlots.set(gatewayBlob.blobId,slot);speak('gthink.relay.forward',{gatewayBlobId:gatewayBlob.blobId,requestBlobId:gatewayBlob.parentBlobId,conversationId:gatewayBlob.conversationId},gatewayBlob.blobId,slot);const timer=setTimeout(()=>{if(!gatewaySlots.has(gatewayBlob.blobId))return;speak('gthink.relay.watchdog',{gatewayBlobId:gatewayBlob.blobId,state:'probe_listener',conversationId:gatewayBlob.conversationId},gatewayBlob.blobId,slot);try{api()?.probeResponder?.()}catch{}},6000);watchdogs.set(gatewayBlob.blobId,timer)}
function complete(blob){const id=blob?.payload?.requestBlobId||blob?.parentBlobId;if(!id)return;const slot=gatewaySlots.get(id);if(!slot)return;gatewaySlots.delete(id);const timer=watchdogs.get(id);if(timer)clearTimeout(timer);watchdogs.delete(id);speak('gthink.relay.return',{gatewayBlobId:id,responseBlobId:blob.blobId,conversationId:blob.conversationId},blob.blobId,slot)}
function ensureRenderDone(blob){const parent=blob.parentBlobId;if(!parent)return;const index=Number(blob.payload?.index),length=Number(blob.payload?.length);if(!Number.isFinite(index)||!Number.isFinite(length)||index<length)return;setTimeout(()=>{if(doneParents.has(parent))return;doneParents.add(parent);const a=api();if(!a?.speak)return;a.speak({schema:BLOB_SCHEMA,blobId:uid('render-done-relay'),parentBlobId:parent,conversationId:blob.conversationId||'gthink-relay',kind:'render.done',role:'renderer',from:'GThinkRelay-Recovery',to:'public-ui',intent:'finish_render_relay_recovery',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,payload:{length,relayRecovery:true,schema:SCHEMA},understoodBy:['public-ui','GThink','relay-team'],silent:true,muted:false})},240)}
function onBlob(blob){if(!blob||blob.schema!==BLOB_SCHEMA)return;if(blob.kind==='utterance'&&blob.role==='user'&&blob.intent==='interpret_and_reply'){arm(blob);return}if(blob.kind==='gateway.request'){forward(blob);return}if(blob.kind==='gateway.response'||(blob.kind==='utterance'&&blob.role==='gthink')){complete(blob);return}if(blob.kind==='render.done'){if(blob.parentBlobId)doneParents.add(blob.parentBlobId);return}if(blob.kind==='render.delta'){ensureRenderDone(blob);return}}
function attach(){const a=api();if(!a?.listen)return false;a.listen(onBlob);for(const b of a.hearLast?.(32)||[])onBlob(b);window.GTHINK_TURN_RELAY=Object.freeze({schema:SCHEMA,mode:'alternating',relays:[...RELAYS],get turn(){return turn}});speak('gthink.relay.ready',{mode:'alternating-A-B',conversationId:'gthink-relay'},null,'A');return true}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>200)clearInterval(timer)},50)}
})();
(()=>{'use strict';
if(window.GTHINK_BLOB_TURRETS||document.querySelector('script[data-gthink-blob-turrets]'))return;
const current=document.currentScript?.src||location.href;
const script=document.createElement('script');
script.src=new URL('gthink-blob-turrets.js?v=1',current).href;
script.dataset.gthinkBlobTurrets='V1';
script.async=false;
document.head.appendChild(script);
})();
(()=>{'use strict';
if(window.GTHINK_RESPONSE_WORD_FLOW||document.querySelector('script[data-gthink-response-word-flow]'))return;
const current=document.currentScript?.src||location.href;
const script=document.createElement('script');
script.src=new URL('gthink-response-word-flow.js?v=1',current).href;
script.dataset.gthinkResponseWordFlow='V1';
script.async=false;
document.head.appendChild(script);
})();
(()=>{'use strict';
if(window.GVAULT_BLOB_URI||document.querySelector('script[data-gvault-blob-uri]'))return;
const current=document.currentScript?.src||location.href;
const script=document.createElement('script');
script.src=new URL('gvault-blob-uri.js?v=3',current).href;
script.dataset.gvaultBlobUri='V3';
script.async=false;
document.head.appendChild(script);
})();
