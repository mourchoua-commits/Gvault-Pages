(()=>{'use strict';
const ext=globalThis.browser||globalThis.chrome;
const REQUEST_EVENT='GTHINK_NAVIGATOR_BRIDGE_REQUEST_V1';
const RESPONSE_EVENT='GTHINK_NAVIGATOR_BRIDGE_RESPONSE_V1';
const TOOL_EVENT='GTHINK_NAVIGATOR_TOOL_REQUEST_V1';
const TOOL_RESPONSE_EVENT='GTHINK_NAVIGATOR_TOOL_RESPONSE_V1';
const pending=new Map();
function clean(v){return String(v??'').trim()}
function id(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}
function waitResponse(requestId,timeout=65000){
 return new Promise(resolve=>{const timer=setTimeout(()=>{pending.delete(requestId);resolve({ok:false,error:'gvault_main_bridge_timeout'})},timeout);pending.set(requestId,{resolve:(value)=>{clearTimeout(timer);pending.delete(requestId);resolve(value)}})});
}
window.addEventListener(RESPONSE_EVENT,event=>{const detail=event?.detail||{},p=pending.get(detail.id);if(p)p.resolve(detail.result||{ok:false,error:'empty_bridge_result'})});
window.addEventListener(TOOL_EVENT,event=>{
 const d=event?.detail||{};if(!d.id)return;
 Promise.resolve(ext.runtime.sendMessage({type:'gthink.navigator.tool',targetTabId:d.targetTabId,tool:d.tool,args:d.args||{}}))
  .then(result=>window.dispatchEvent(new CustomEvent(TOOL_RESPONSE_EVENT,{detail:{id:d.id,result}})))
  .catch(error=>window.dispatchEvent(new CustomEvent(TOOL_RESPONSE_EVENT,{detail:{id:d.id,result:{ok:false,error:clean(error?.message||error)}}})));
});
ext.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 const run=async()=>{
  if(message?.type==='gthink.bridge.ping')return{ok:true,bridge:'isolated'};
  if(message?.type!=='gthink.bridge.ask')return null;
  const requestId=id();const promise=waitResponse(requestId);
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT,{detail:{id:requestId,request:message.request||{}}}));
  return await promise;
 };
 Promise.resolve(run()).then(sendResponse).catch(error=>sendResponse({ok:false,error:clean(error?.message||error)}));return true;
});
})();