(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_NATIVE_ENGINE_V2_BRIDGED';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const CORE_URL=new URL('gthink-public-native-engine-core.js?v=1',SCRIPT_BASE).href;
const CONVERSATION_URL=new URL('gthink-secondary-conversation-bridge.js?v=1',SCRIPT_BASE).href;
let coreRef=null,conversationRef=null,wrapper=null;
function loadScript(url,attr){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[${attr}]`);if(existing){if(existing.dataset.ready==='1')return resolve();existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});return}const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.addEventListener('load',()=>{s.dataset.ready='1';resolve()},{once:true});s.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});(document.head||document.documentElement).appendChild(s)})}
const readyPromise=Promise.all([
  loadScript(CORE_URL,'data-gthink-secondary-native-core'),
  loadScript(CONVERSATION_URL,'data-gthink-secondary-conversation-bridge')
]).then(()=>{
  coreRef=window.GTHINK_PUBLIC_NATIVE_ENGINE;
  conversationRef=window.GTHINK_SECONDARY_CONVERSATION_BRIDGE||null;
  if(!coreRef?.answer||coreRef===wrapper)throw new Error('secondary_native_core_unavailable');
  window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
  return {core:coreRef,conversation:conversationRef}
});
async function answer(request){const {core,conversation}=await readyPromise;const context=request?.payload?.secondKernelContext||null;let conversational=null;try{conversational=conversation?.answer?.(request,context)||null}catch{}if(conversational?.handled&&String(conversational?.text||'').trim())return {schema:SCHEMA,handled:true,text:String(conversational.text),engine:'gthink-public-native-js+blob-knowledge',model:'secondary-conversation-v1',publicNative:true,offlineCapable:true,actionsAuthorized:false,conversationIntent:conversational.intent||null,evidence:conversational.evidence||[],knowledgeAware:true};const result=await core.answer(request);return typeof result==='string'?{schema:SCHEMA,handled:true,text:result,engine:'gthink-public-native-js',model:'native-rules-v1',publicNative:true,offlineCapable:true,actionsAuthorized:false,knowledgeAware:false}:{...result,schema:result?.schema||SCHEMA,knowledgeAware:false}}
function status(){let base={configured:true,ready:false,mode:'public-native-loading',engine:'gthink-public-native-js+blob-knowledge',model:'secondary-conversation-v1',offlineCapable:true,networkRequired:false,knowledgeAware:true};try{if(coreRef?.status)base={...base,...coreRef.status(),ready:true,engine:'gthink-public-native-js+blob-knowledge',model:'secondary-conversation-v1',knowledgeAware:true,conversationBridge:!!conversationRef}}catch{}return base}
wrapper=Object.freeze({schema:SCHEMA,name:'GThinkPublicNativeBridged',answer,status,get core(){return coreRef},get conversation(){return conversationRef},ready:()=>readyPromise});
window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
})();