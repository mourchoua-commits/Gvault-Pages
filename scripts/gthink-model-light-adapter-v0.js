(()=>{'use strict';
const SCHEMA='GTHINK_MODEL_LIGHT_ADAPTER_V0';
const VERSION='0.1.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const MODEL_URL=new URL('gthink-model-runtime-v0.js?v=1',SCRIPT_BASE).href;
const histories=new WeakMap();
const wrapped=new WeakSet();
let modelLoad=null;
function clean(v){return String(v??'').trim()}
function historyFor(target){let h=histories.get(target);if(!h){h=[];histories.set(target,h)}return h}
function remember(target,q,a){const h=historyFor(target);if(clean(q))h.push({role:'user',content:clean(q)});if(clean(a))h.push({role:'assistant',content:clean(a)});if(h.length>28)h.splice(0,h.length-28)}
function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`gthink-model-light-${crypto.randomUUID?.()||Date.now()}`,parentBlobId:null,conversationId:'gthink-model-light-adapter-v0',kind,role:'adapter',from:'GThinkModelLightAdapterV0',to:'public.bus',intent:'compound_agentic_model_light',language:'fr',at:new Date().toISOString(),surface:'VAULT AGENT // LIGHT',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,version:VERSION,...payload,containsSecret:false},understoodBy:['GThink','ModelConductor','LIGHT'],silent:true,muted:false})}catch{}}
function loadModel(){
 if(window.GTHINK_MODEL_RUNTIME_V0?.ask)return Promise.resolve(window.GTHINK_MODEL_RUNTIME_V0);
 if(modelLoad)return modelLoad;
 modelLoad=new Promise(resolve=>{const existing=document.querySelector('script[data-gthink-model-runtime-v0]');if(existing){const started=Date.now(),tick=()=>window.GTHINK_MODEL_RUNTIME_V0?.ask?resolve(window.GTHINK_MODEL_RUNTIME_V0):Date.now()-started>10000?resolve(null):setTimeout(tick,40);tick();return}const s=document.createElement('script');s.src=MODEL_URL;s.async=false;s.setAttribute('data-gthink-model-runtime-v0','1');s.onload=()=>resolve(window.GTHINK_MODEL_RUNTIME_V0||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)}).finally(()=>{modelLoad=null});
 return modelLoad;
}
function style(text,query){let out=clean(text);try{out=window.GVAULT_PUBLIC_AGENT_CONVERSATION?.conversationalize?.(out,query)||out}catch{}return out}
function callOriginal(original,self,args,target,q){let v=original.apply(self,args);if(v&&typeof v.then==='function')return v.then(a=>{if(clean(a))remember(target,q,a);return a});if(clean(v))remember(target,q,v);return v}
async function useModel(q,target){
 const model=window.GTHINK_MODEL_RUNTIME_V0?.ask?window.GTHINK_MODEL_RUNTIME_V0:await loadModel();
 if(!model?.ask)return null;
 let should=true;try{should=await model.shouldHandle(q,{surface:'vault-agent-light'})}catch{}
 if(!should)return null;
 emit('gthink.model.light.request',{queryLength:q.length});
 let result;try{result=await model.ask(q,historyFor(target).slice(-14),{surface:'vault-agent-light',navigator:false})}catch(error){result={ok:false,error:clean(error?.message||error)}}
 const status=result?.safeState?.status||'';
 if((result?.ok||status==='PRIVATE_RELAY_REQUIRED')&&clean(result?.text)){
   const out=style(result.text,q);remember(target,q,out);emit('gthink.model.light.response',{taskId:result.taskId||null,status,confidence:result?.safeState?.confidence??null,workforce:result?.safeState?.workforce||[]});return out;
 }
 emit('gthink.model.light.fallback',{error:result?.error||status||'model_no_result'});return null;
}
function installTarget(target=window){
 if(!target||wrapped.has(target))return true;
 let original;try{original=target.applyAgentModel}catch{return false}
 if(typeof original!=='function')return false;
 if(original.__gthinkModelLightAdapterV0){wrapped.add(target);return true}
 if(!original.__gvaultConversationStyleV1&&!original.__gvaultLightRuntimeBridge&&!original.__gthinkInlineRelayV2&&!original.__gthinkInlineRelayV1)return false;
 const fn=function(answer,query,ctx){const q=clean(query);if(!q)return original.call(this,answer,query,ctx);const self=this,args=[answer,query,ctx];return (async()=>{const out=await useModel(q,target);if(out)return out;return await callOriginal(original,self,args,target,q)})()};
 try{Object.defineProperty(fn,'__gthinkModelLightAdapterV0',{value:true});Object.defineProperty(fn,'__gvaultConversationStyleV1',{value:true});Object.defineProperty(fn,'__gvaultLightRuntimeBridge',{value:true})}catch{}
 try{target.applyAgentModel=fn;if(target.applyAgentModel!==fn)return false;wrapped.add(target);return true}catch{return false}
}
function installRuntime(){const frame=document.getElementById('gvaultRuntime');if(!frame)return false;try{installTarget(frame.contentWindow)}catch{}if(!frame.__gthinkModelLightHookV0){frame.__gthinkModelLightHookV0=true;frame.addEventListener('load',()=>setTimeout(()=>{try{installTarget(frame.contentWindow)}catch{}},50))}return true}
function install(){installTarget(window);installRuntime()}
void loadModel().then(()=>install());install();let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>=720)clearInterval(timer)},125);window.addEventListener('pageshow',install);
window.GTHINK_MODEL_LIGHT_ADAPTER_V0=Object.freeze({schema:SCHEMA,version:VERSION,install,status:async()=>({schema:SCHEMA,version:VERSION,model:await window.GTHINK_MODEL_RUNTIME_V0?.status?.(),windowWrapped:wrapped.has(window),runtimeWrapped:(()=>{try{return wrapped.has(document.getElementById('gvaultRuntime')?.contentWindow)}catch{return false}})()})});
emit('gthink.model.light.ready',{version:VERSION});
})();
