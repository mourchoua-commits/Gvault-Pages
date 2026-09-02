(()=>{'use strict';
const SCHEMA='GVAULT_PRIVATE_UBIQUITY_MESH_V2_ROUTED';
const root=new URL('.',document.currentScript?.src||location.href);
const repoRoot=new URL('../',root);
const urls={
 live:new URL('gvault-agent-live-blob.js?v=6',root).href,
 router:new URL('gvault-routing-fabric.js?v=1',root).href,
 bridge:new URL('gthink-public-private-bridge.js?v=6',root).href,
 gadmin:new URL('essai/gadmin/',repoRoot).href,
 controlTower:new URL('essai/control-tower/v2.html',repoRoot).href
};
function load(src,attr){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[${attr}]`);if(existing){if(existing.dataset.ready==='1')return resolve(existing);existing.addEventListener('load',()=>resolve(existing),{once:true});existing.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,SCHEMA);s.addEventListener('load',()=>{s.dataset.ready='1';resolve(s)},{once:true});s.addEventListener('error',reject,{once:true});(document.head||document.documentElement).appendChild(s)})}
async function install(){
 try{
  if(!window.GVAULT_AGENT_LIVE_BLOB)await load(urls.live,'data-gvault-private-mesh-live');
  if(!window.GVAULT_ROUTING_FABRIC)await load(urls.router,'data-gvault-routing-fabric');
  if(!window.GTHINK_PUBLIC_PRIVATE_BRIDGE)await load(urls.bridge,'data-gvault-private-mesh-bridge');
  const detail={schema:SCHEMA,installed:true,router:!!window.GVAULT_ROUTING_FABRIC,bridge:!!window.GTHINK_PUBLIC_PRIVATE_BRIDGE,liveBlob:!!window.GVAULT_AGENT_LIVE_BLOB,privateContentPublished:false,policy:'EXPLICIT_DECLASSIFICATION_V1'};
  try{window.dispatchEvent(new CustomEvent('gvault:private-mesh-ready',{detail}))}catch{}
  return detail;
 }catch(e){const detail={schema:SCHEMA,installed:false,error:String(e&&e.message||e),privateContentPublished:false};try{window.dispatchEvent(new CustomEvent('gvault:private-mesh-error',{detail}))}catch{}return detail}
}
async function ask(request){await ready;const bridge=window.GTHINK_PUBLIC_PRIVATE_BRIDGE;if(!bridge?.askRequest)throw new Error('GVAULT_PRIVATE_MESH_BRIDGE_UNAVAILABLE');return bridge.askRequest(request)}
async function capture(request,opts={}){await ready;if(opts.explicit!==true)throw new Error('GVAULT_PRIVATE_CAPTURE_REQUIRES_EXPLICIT_INPUT');const relay=window.GVAULT_PUBLIC_INPUT_RELAY;if(!relay?.capture)throw new Error('GVAULT_PUBLIC_INPUT_RELAY_UNAVAILABLE');const text=String(request?.payload?.message||request?.text||request?.payload?.text||'');return relay.capture(text,{explicit:true,surface:String(request?.surface||opts.surface||'public-route'),sessionId:request?.conversationId||undefined,location:location.pathname})}
async function route(request,opts={}){
 await ready;
 const fabric=window.GVAULT_ROUTING_FABRIC;if(!fabric?.plan)throw new Error('GVAULT_ROUTING_FABRIC_UNAVAILABLE');
 const plan=fabric.plan(request,opts),primary=opts.destination||plan.primary;
 let result;
 if(primary==='private.gthink'){
  if(opts.capture===true)try{await capture(request,{...opts,explicit:true})}catch{}
  result=await ask(request);
 }else if(primary==='private.capture')result=await capture(request,opts);
 else if(primary==='private.gadmin')result={ok:true,route:primary,href:urls.gadmin,requires:'LIVE_SAS_REQUIRED',navigate:false};
 else if(primary==='private.control-tower')result={ok:true,route:primary,href:urls.controlTower,requires:'LIVE_SAS_REQUIRED',navigate:false};
 else result={ok:true,route:primary,local:true,streamUrl:fabric.publicStream||'gvault://blobs/public/gthink/stream'};
 const detail={schema:SCHEMA,requestId:request?.blobId||null,primary,plan,result,privateContentPublished:false};
 try{window.dispatchEvent(new CustomEvent('gvault:route-result',{detail}))}catch{}
 return detail;
}
async function status(){await ready;let bridgeStatus=null;try{bridgeStatus=await window.GTHINK_PUBLIC_PRIVATE_BRIDGE?.status?.()}catch(e){bridgeStatus={configured:false,error:String(e&&e.message||e)}}return {schema:SCHEMA,installed:true,routingFabric:window.GVAULT_ROUTING_FABRIC?.schema||null,privateContentPublished:false,policy:'EXPLICIT_DECLASSIFICATION_V1',bridge:bridgeStatus,toolRoutes:{gadmin:{href:urls.gadmin,requires:'LIVE_SAS_REQUIRED'},controlTower:{href:urls.controlTower,requires:'LIVE_SAS_REQUIRED'}}}}
const ready=install();
window.GVAULT_PRIVATE_UBIQUITY=Object.freeze({schema:SCHEMA,ready,ask,capture,route,status,urls});
window.addEventListener('gvault:private-route',e=>{const d=e.detail||{};if(!d.request)return;ask(d.request).then(response=>window.dispatchEvent(new CustomEvent('gvault:private-route-result',{detail:{schema:SCHEMA,requestId:d.request?.blobId||null,response}}))).catch(error=>window.dispatchEvent(new CustomEvent('gvault:private-route-error',{detail:{schema:SCHEMA,requestId:d.request?.blobId||null,error:String(error&&error.message||error)}}))) });
window.addEventListener('gvault:route',e=>{const d=e.detail||{};if(!d.request)return;route(d.request,d.options||{}).catch(error=>window.dispatchEvent(new CustomEvent('gvault:route-error',{detail:{schema:SCHEMA,requestId:d.request?.blobId||null,error:String(error&&error.message||error)}}))) });
})();
