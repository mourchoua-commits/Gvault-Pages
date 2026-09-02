(()=>{'use strict';
const SCHEMA='GTHINK_CHAT_HOLD_BEFORE_PRELISTENER_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const CHAT_PATH='/api/vault/chat';
const MAX_HOLD_MS=20000,POLL_MS=100,PROBE_EVERY_MS=500;
if(window.GTHINK_CHAT_HOLD_BEFORE_PRELISTENER?.schema===SCHEMA)return;
const downstreamFetch=window.fetch.bind(window);
let seq=0;
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function uid(prefix='ghold'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function isChat(input,init){try{const method=String(init?.method||input?.method||'GET').toUpperCase();const url=new URL(typeof input==='string'?input:String(input?.url||''),location.href);return method==='POST'&&url.pathname===CHAT_PATH}catch{return false}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function speak(kind,payload={}){try{const a=api();if(!a?.speak)return;a.speak({schema:BLOB_SCHEMA,blobId:uid(),conversationId:'gthink-chat-hold',kind,role:'prelistener',from:'GThinkChatHoldBeforePrelistener',to:'public.bus',intent:'hold_chat_until_gthink_ready',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,payload:{...payload,schema:SCHEMA},understoodBy:['GThink','GThinkPrelistener','public-kernel','public-ui'],silent:true,muted:false})}catch{}}
async function responderReady(){try{return (await api()?.status?.())?.responderReady===true}catch{return false}}
async function waitUntilReady(turnId){const started=Date.now();let lastProbe=0,held=false;while(Date.now()-started<MAX_HOLD_MS){if(await responderReady()){if(held)speak('gthink.chat.hold.release',{turnId,heldMs:Date.now()-started});return true}if(!held){held=true;speak('gthink.chat.hold',{turnId,maxHoldMs:MAX_HOLD_MS})}if(Date.now()-lastProbe>=PROBE_EVERY_MS){lastProbe=Date.now();try{api()?.probeResponder?.()}catch{}}await sleep(POLL_MS)}if(held)speak('gthink.chat.hold.timeout',{turnId,heldMs:Date.now()-started});return false}
window.fetch=async function(input,init){if(!isChat(input,init))return downstreamFetch(input,init);const turnId=`chat-hold-${++seq}`;await waitUntilReady(turnId);return downstreamFetch(input,init)};
window.GTHINK_CHAT_HOLD_BEFORE_PRELISTENER=Object.freeze({schema:SCHEMA,maxHoldMs:MAX_HOLD_MS,pollMs:POLL_MS,probeEveryMs:PROBE_EVERY_MS,status:async()=>({schema:SCHEMA,responderReady:await responderReady()})});
speak('gthink.chat.hold.ready',{state:'ready',maxHoldMs:MAX_HOLD_MS});
})();
