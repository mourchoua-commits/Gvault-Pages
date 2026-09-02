(()=>{'use strict';
const SCHEMA='GTHINK_NATIVE_OFFLINE_LINK_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThinkNativeOfflineLink';
let bound=false,baseNative=null;
function clean(v){return String(v??'').trim()}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function bridge(){return window.GTHINK_OFFLINE_CONTROL_PLANE_BRIDGE||null}
function native(){return window.GTHINK_PUBLIC_NATIVE_ENGINE||null}
function offlineState(){const b=bridge();if(!b)return {connected:false,networkRequired:false};const s=b.status?.()||{};return {
  connected:s.configured===true,
  bridgeSchema:b.schema,
  source:b.source,
  principle:b.snapshot?.principle||'',
  sourceOrder:[...(b.snapshot?.sourceOrder||[])],
  method:[...(b.snapshot?.method||[])],
  forbiddenRuntimeDependencies:[...(b.snapshot?.forbiddenRuntimeDependencies||[])],
  relayRule:{...(b.snapshot?.relayRule||{})},
  networkRule:b.snapshot?.networkRule||'',
  networkRequired:false,
  sourceMutation:false,
  mergeRequired:false
}}
function emit(kind,payload={},text=''){try{api()?.speak?.({schema:BLOB_SCHEMA,blobId:`native-offline-link-${crypto.randomUUID?.()||Date.now().toString(36)}`,parentBlobId:null,conversationId:'gthink-native-offline-link',kind,role:'gthink',from:NAME,to:'public.bus',intent:'announce_native_offline_link',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:api()?.streamUrl||'gvault://blobs/public/gthink/stream',text,display:text,payload:{...payload,linkSchema:SCHEMA},understoodBy:['GThinkPublicNative','GThink','GThinkMini','public-kernel','prelistener'],silent:true,muted:false})}catch{}}
function bind(){if(bound)return true;const b=bridge(),n=native();if(!b||!n?.answer||!n?.status)return false;baseNative=n;
 const linked={
  schema:n.schema,
  name:n.name,
  async answer(request){
    const off=offlineState();
    const req={...request,payload:{...(request?.payload||{}),offlineControlPlane:off}};
    const out=await baseNative.answer(req);
    if(!out||out.handled===false)return out;
    return {...out,offlineControlPlane:off,resolutionMethod:off.method,networkRequired:false};
  },
  status(){const s=baseNative.status?.()||{};return {...s,offlineControlPlane:offlineState(),offlineBridgeConnected:offlineState().connected,networkRequired:false}},
  streamState:typeof n.streamState==='function'?n.streamState.bind(n):()=>({}),
  knowledge:n.knowledge,
  offlineContext:offlineState,
  get base(){return baseNative}
 };
 window.GTHINK_PUBLIC_NATIVE_ENGINE=Object.freeze(linked);
 window.GTHINK_NATIVE_OFFLINE_LINK=Object.freeze({schema:SCHEMA,name:NAME,status:()=>({schema:SCHEMA,bound:true,offline:offlineState(),nativeEngine:baseNative.status?.().engine||null}),offlineContext:offlineState,base:baseNative});
 bound=true;
 b.announce?.();
 emit('gthink.native.offline.link.ready',{state:'ready',nativeEngine:baseNative.status?.().engine||null,offline:offlineState()},'GThink natif relié au plan sans-internet par le pont blob');
 return true
}
if(!bind()){let tries=0;const timer=setInterval(()=>{tries++;if(bind()||tries>240)clearInterval(timer)},25)}
})();
