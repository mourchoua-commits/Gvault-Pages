(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_NATIVE_ENGINE_V6_TEST_INTENT_ROUTED';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const CORE_URL=new URL('gthink-public-native-engine-core.js?v=1',SCRIPT_BASE).href;
const TEST_INTENT_URL=new URL('gthink-public-test-intent-router.js?v=1',SCRIPT_BASE).href;
const CONVERSATION_URL=new URL('gthink-secondary-conversation-bridge.js?v=4',SCRIPT_BASE).href;
let coreRef=null,testIntentRef=null,conversationRef=null,wrapper=null;
function loadScript(url,attr){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[${attr}]`);if(existing){if(existing.dataset.ready==='1')return resolve();existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});return}const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.addEventListener('load',()=>{s.dataset.ready='1';resolve()},{once:true});s.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});(document.head||document.documentElement).appendChild(s)})}
const readyPromise=Promise.all([
  loadScript(CORE_URL,'data-gthink-secondary-native-core'),
  loadScript(TEST_INTENT_URL,'data-gthink-public-test-intent-router-v1'),
  loadScript(CONVERSATION_URL,'data-gthink-secondary-conversation-bridge-v4')
]).then(()=>{
  coreRef=window.GTHINK_PUBLIC_NATIVE_ENGINE;
  testIntentRef=window.GTHINK_PUBLIC_TEST_INTENT_ROUTER||null;
  conversationRef=window.GTHINK_SECONDARY_CONVERSATION_BRIDGE||null;
  if(!coreRef?.answer||coreRef===wrapper)throw new Error('secondary_native_core_unavailable');
  window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
  return {core:coreRef,testIntent:testIntentRef,conversation:conversationRef}
});
function wrapHandled(result,source){return {schema:SCHEMA,handled:true,text:String(result.text),engine:'gthink-public-native-js+core-cognition+co-development+sim-trained+intent-router',model:'simulation-trained-conversation-v5',publicNative:true,offlineCapable:true,actionsAuthorized:false,conversationIntent:result.intent||null,evidence:result.evidence||[],knowledgeBranch:result.knowledgeBranch||null,methodHint:result.methodHint||null,nextProtocol:result.nextProtocol||null,targetState:result.targetState||null,knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,intentRouter:source}}
async function answer(request){const {core,testIntent,conversation}=await readyPromise;const context=request?.payload?.secondKernelContext||null;let intentResult=null;try{intentResult=testIntent?.answer?.(request,context)||null}catch{}if(intentResult?.handled&&String(intentResult?.text||'').trim())return wrapHandled(intentResult,'test-intent');let conversational=null;try{conversational=conversation?.answer?.(request,context)||null}catch{}if(conversational?.handled&&String(conversational?.text||'').trim())return wrapHandled(conversational,'conversation');const result=await core.answer(request);return typeof result==='string'?{schema:SCHEMA,handled:true,text:result,engine:'gthink-public-native-js',model:'native-rules-v1',publicNative:true,offlineCapable:true,actionsAuthorized:false,knowledgeAware:false,coDevelopmentAware:true,simulationTrained:true}:{...result,schema:result?.schema||SCHEMA,knowledgeAware:false,coDevelopmentAware:true,simulationTrained:true}}
function status(){let base={configured:true,ready:false,mode:'public-native-loading',engine:'gthink-public-native-js+core-cognition+co-development+sim-trained+intent-router',model:'simulation-trained-conversation-v5',offlineCapable:true,networkRequired:false,knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,testIntentRouted:true};try{if(coreRef?.status)base={...base,...coreRef.status(),ready:true,engine:'gthink-public-native-js+core-cognition+co-development+sim-trained+intent-router',model:'simulation-trained-conversation-v5',knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,testIntentRouted:true,testIntentRouterSchema:testIntentRef?.schema||null,conversationBridge:!!conversationRef,conversationBridgeSchema:conversationRef?.schema||null}}catch{}return base}
wrapper=Object.freeze({schema:SCHEMA,name:'GThinkPublicNativeTestIntentRouted',answer,status,get core(){return coreRef},get testIntent(){return testIntentRef},get conversation(){return conversationRef},ready:()=>readyPromise});
window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
})();