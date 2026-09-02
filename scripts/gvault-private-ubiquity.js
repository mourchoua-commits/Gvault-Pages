(()=>{'use strict';
const SCHEMA='GVAULT_PRIVATE_UBIQUITY_MESH_V1';
const root=new URL('.',document.currentScript?.src||location.href);
const urls={
 live:new URL('gvault-agent-live-blob.js?v=6',root).href,
 bridge:new URL('gthink-public-private-bridge.js?v=5',root).href
};
function load(src,attr){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[${attr}]`);if(existing){if(existing.dataset.ready==='1')return resolve(existing);existing.addEventListener('load',()=>resolve(existing),{once:true});existing.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,SCHEMA);s.addEventListener('load',()=>{s.dataset.ready='1';resolve(s)},{once:true});s.addEventListener('error',reject,{once:true});(document.head||document.documentElement).appendChild(s)})}
async function install(){
 try{
  if(!window.GVAULT_AGENT_LIVE_BLOB)await load(urls.live,'data-gvault-private-mesh-live');
  if(!window.GTHINK_PUBLIC_PRIVATE_BRIDGE)await load(urls.bridge,'data-gvault-private-mesh-bridge');
  const detail={schema:SCHEMA,installed:true,bridge:!!window.GTHINK_PUBLIC_PRIVATE_BRIDGE,liveBlob:!!window.GVAULT_AGENT_LIVE_BLOB,privateContentPublished:false,policy:'EXPLICIT_DECLASSIFICATION_V1'};
  try{window.dispatchEvent(new CustomEvent('gvault:private-mesh-ready',{detail}))}catch{}
  return detail;
 }catch(e){const detail={schema:SCHEMA,installed:false,error:String(e&&e.message||e),privateContentPublished:false};try{window.dispatchEvent(new CustomEvent('gvault:private-mesh-error',{detail}))}catch{}return detail}
}
async function ask(request){await ready;const bridge=window.GTHINK_PUBLIC_PRIVATE_BRIDGE;if(!bridge?.askRequest)throw new Error('GVAULT_PRIVATE_MESH_BRIDGE_UNAVAILABLE');return bridge.askRequest(request)}
async function status(){await ready;let bridgeStatus=null;try{bridgeStatus=await window.GTHINK_PUBLIC_PRIVATE_BRIDGE?.status?.()}catch(e){bridgeStatus={configured:false,error:String(e&&e.message||e)}}return {schema:SCHEMA,installed:true,privateContentPublished:false,policy:'EXPLICIT_DECLASSIFICATION_V1',bridge:bridgeStatus}}
const ready=install();
window.GVAULT_PRIVATE_UBIQUITY=Object.freeze({schema:SCHEMA,ready,ask,status,urls});
window.addEventListener('gvault:private-route',e=>{const d=e.detail||{};if(!d.request)return;ask(d.request).then(response=>window.dispatchEvent(new CustomEvent('gvault:private-route-result',{detail:{schema:SCHEMA,requestId:d.request?.blobId||null,response}}))).catch(error=>window.dispatchEvent(new CustomEvent('gvault:private-route-error',{detail:{schema:SCHEMA,requestId:d.request?.blobId||null,error:String(error&&error.message||error)}}))) });
})();
