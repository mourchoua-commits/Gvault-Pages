(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_RESPONDER_V10_PELLICULE_PRIMARY';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThink';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const OFFLINE_URL=new URL('gthink-offline-control-plane-blob-bridge.js?v=1',SCRIPT_BASE).href;
const NATIVE_URL=new URL('gthink-public-native-engine.js?v=1',SCRIPT_BASE).href;
const LINK_URL=new URL('gthink-native-offline-link.js?v=1',SCRIPT_BASE).href;
const BRIDGE_URL=new URL('gthink-public-private-bridge.js?v=3',SCRIPT_BASE).href;
let attached=false,connected=false,heartbeat=null,offlineLoad=null,nativeLoad=null,linkLoad=null,bridgeLoad=null,unregister=null;
function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function clean(v){return String(v??'').trim()}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function loadScript(src,attr,value,ready,slot){if(ready())return Promise.resolve(ready());if(slot.current)return slot.current;slot.current=new Promise(resolve=>{const existing=document.querySelector(`script[${attr}]`);if(existing){const start=Date.now(),tick=()=>ready()?resolve(ready()):Date.now()-start>3000?resolve(null):setTimeout(tick,25);tick();return}const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,value);s.onload=()=>resolve(ready()||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)}).finally(()=>{slot.current=null});return slot.current}
async function ensureOffline(){const slot={get current(){return offlineLoad},set current(v){offlineLoad=v}};return loadScript(OFFLINE_URL,'data-gthink-offline-control-plane-bridge','V1',()=>window.GTHINK_OFFLINE_CONTROL_PLANE_BRIDGE?.status?window.GTHINK_OFFLINE_CONTROL_PLANE_BRIDGE:null,slot)}
async function ensureNative(){const slot={get current(){return nativeLoad},set current(v){nativeLoad=v}};return loadScript(NATIVE_URL,'data-gthink-public-native-engine','V1',()=>window.GTHINK_PUBLIC_NATIVE_ENGINE?.answer?window.GTHINK_PUBLIC_NATIVE_ENGINE:null,slot)}
async function ensureNativeLink(){const slot={get current(){return linkLoad},set current(v){linkLoad=v}};return loadScript(LINK_URL,'data-gthink-native-offline-link','V1',()=>window.GTHINK_NATIVE_OFFLINE_LINK?.status?window.GTHINK_PUBLIC_NATIVE_ENGINE:null,slot)}
async function ensureBridge(){const slot={get current(){return bridgeLoad},set current(v){bridgeLoad=v}};return loadScript(BRIDGE_URL,'data-gthink-public-private-bridge','V3',()=>window.GTHINK_PUBLIC_PRIVATE_BRIDGE?.askRequest?window.GTHINK_PUBLIC_PRIVATE_BRIDGE:null,slot)}
async function activeNative(){await ensureOffline();const n=await ensureNative();if(!n?.answer)return n;const linked=await ensureNativeLink();return linked?.answer?linked:n}
async function responder(request){
 const message=clean(request?.payload?.message||request?.text);if(!message)throw new Error('gthink_empty_message');
 await ensureOffline();
 const bridge=await ensureBridge();if(bridge?.askRequest){try{const s=await bridge.status();if(s?.configured===true){const out=await bridge.askRequest(request);if(clean(out?.text||out?.display))return out}}catch{}}
 const native=await activeNative();if(native?.answer){const out=await native.answer(request);if(out?.handled!==false&&clean(out?.text||out?.display))return out}
 throw new Error('gthink_no_responder_available');
}
function emit(kind,payload={},text){const a=api();if(!a?.speak)return;a.speak({schema:BLOB_SCHEMA,blobId:uid('gthink-state'),parentBlobId:null,conversationId:'gthink-public-listener',kind,role:'gthink',from:NAME,to:'public.bus',intent:kind==='gthink.listener.ready'?'announce_responder_ready':'announce_responder_waiting',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:a.streamUrl,text,payload:{...payload,schema:SCHEMA,streamUrl:a.streamUrl},understoodBy:['GThink','GThinkPelliculeBridge','GThinkPublicNative','GThinkNativeOfflineLink','OfflineControlPlaneBlobBridge','GThinkMini','public-kernel','gateway-adapter','public-ui','private-bridge'],silent:true,muted:false})}
async function syncConnection(){
 const a=api();let bridgeStatus={configured:false},nativeStatus={configured:false},offlineStatus={configured:false};
 try{const offline=await ensureOffline();if(offline?.status)offlineStatus=offline.status()}catch(e){offlineStatus={configured:false,error:clean(e?.message||e)}}
 try{const bridge=await ensureBridge();if(bridge?.status)bridgeStatus=await bridge.status()}catch(e){bridgeStatus={configured:false,error:clean(e?.message||e)}}
 if(!bridgeStatus?.configured){try{const native=await activeNative();if(native?.status)nativeStatus=await native.status()}catch(e){nativeStatus={configured:false,error:clean(e?.message||e)}}}else{void activeNative()}
 const bridgeReady=bridgeStatus?.configured===true,nativeReady=nativeStatus?.configured===true,offlineReady=offlineStatus?.configured===true,ready=bridgeReady||nativeReady;
 if(ready&&!connected&&a?.registerResponder){unregister=a.registerResponder(responder,NAME);connected=true}
 if(!ready&&connected){try{unregister?.()}catch{}unregister=null;connected=false}
 window.GTHINK_OFFLINE_ONLY=!bridgeReady&&nativeReady;
 if(ready)emit('gthink.listener.ready',{state:'listener_ready',name:NAME,mode:bridgeReady?'public-private-pellicule':'public-native-offline-bridge',transport:bridgeReady?'pellicule':'blob-stream',pelliculeConfigured:bridgeReady,pelliculeFrameBytes:bridgeStatus?.frameBytes||null,privateBridgeConfigured:bridgeReady,publicNativeConfigured:nativeReady,publicNativeEngine:nativeStatus?.engine||null,offlineCapable:nativeReady,offlineControlPlaneConfigured:offlineReady,offlineControlPlaneSource:offlineStatus?.source||null,offlineNativeLinkBound:window.GTHINK_NATIVE_OFFLINE_LINK?.status?.().bound===true},bridgeReady?'GThink pont-pellicule ready':offlineReady?'GThink public natif + plan sans-internet ready':'GThink public native ready');
 else emit('gthink.listener.waiting',{state:'listener_waiting',name:NAME,mode:'pellicule-primary',pelliculeConfigured:false,publicNativeConfigured:false,offlineControlPlaneConfigured:offlineReady,error:bridgeStatus?.error||nativeStatus?.error||offlineStatus?.error||null},'GThink waiting');
 return ready;
}
function attach(){if(attached)return true;const a=api();if(!a?.speak)return false;attached=true;void syncConnection();heartbeat=setInterval(()=>void syncConnection(),4000);window.GTHINK_PUBLIC_RESPONDER=Object.freeze({schema:SCHEMA,name:NAME,engine:'pellicule-private-primary',attached:true,transport:'pellicule',respond:responder,syncConnection,get connected(){return connected},get native(){return window.GTHINK_PUBLIC_NATIVE_ENGINE||null},get bridge(){return window.GTHINK_PUBLIC_PRIVATE_BRIDGE||null},get offlineBridge(){return window.GTHINK_OFFLINE_CONTROL_PLANE_BRIDGE||null},get offlineLink(){return window.GTHINK_NATIVE_OFFLINE_LINK||null}});return true}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>240)clearInterval(timer)},25)}
})();
