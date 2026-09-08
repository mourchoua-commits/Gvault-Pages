(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_NATIVE_ENGINE_V8_FEDERATED_GENERAL';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const CORE_URL=new URL('gthink-public-native-engine-core.js?v=1',SCRIPT_BASE).href;
const TEST_INTENT_URL=new URL('gthink-public-test-intent-router.js?v=1',SCRIPT_BASE).href;
const CONVERSATION_URL=new URL('gthink-secondary-conversation-bridge.js?v=5',SCRIPT_BASE).href;
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=1',SCRIPT_BASE).href;
let coreRef=null,testIntentRef=null,conversationRef=null,federationRef=null,wrapper=null;
function clean(v){return String(v??'').trim()}
function loadScript(url,attr){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[${attr}]`);if(existing){if(existing.dataset.ready==='1')return resolve();existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});return}const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.addEventListener('load',()=>{s.dataset.ready='1';resolve()},{once:true});s.addEventListener('error',()=>reject(new Error('secondary_script_load_failed')),{once:true});(document.head||document.documentElement).appendChild(s)})}
const readyPromise=Promise.all([
  loadScript(CORE_URL,'data-gthink-secondary-native-core'),
  loadScript(TEST_INTENT_URL,'data-gthink-public-test-intent-router-v1'),
  loadScript(CONVERSATION_URL,'data-gthink-secondary-conversation-bridge-v5'),
  loadScript(FEDERATION_URL,'data-gthink-provider-federation-v1').catch(()=>null)
]).then(()=>{
  coreRef=window.GTHINK_PUBLIC_NATIVE_ENGINE;
  testIntentRef=window.GTHINK_PUBLIC_TEST_INTENT_ROUTER||null;
  conversationRef=window.GTHINK_SECONDARY_CONVERSATION_BRIDGE||null;
  federationRef=window.GTHINK_PROVIDER_FEDERATION||null;
  if(!coreRef?.answer||coreRef===wrapper)throw new Error('secondary_native_core_unavailable');
  window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
  return {core:coreRef,testIntent:testIntentRef,conversation:conversationRef,federation:federationRef}
});
function wrapHandled(result,source){return {schema:SCHEMA,handled:true,text:String(result.text),engine:'gthink-public-native-js+core-cognition+co-development+free-conversation+intent-router+provider-federation',model:result.model||'conversation-guard-v6',publicNative:true,offlineCapable:source!=='provider-federation',actionsAuthorized:false,conversationIntent:result.intent||null,evidence:result.evidence||[],knowledgeBranch:result.knowledgeBranch||null,methodHint:result.methodHint||null,nextProtocol:result.nextProtocol||null,targetState:result.targetState||null,knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,intentRouter:source,provider:result.provider||null,webGrounded:result.webGrounded===true,sources:result.sources||[]}}
function requestHistory(request){return (Array.isArray(request?.payload?.history)?request.payload.history:[]).slice(-10).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content)})).filter(x=>x.content)}
async function answer(request){
 const {core,testIntent,conversation,federation}=await readyPromise;
 const context=request?.payload?.secondKernelContext||null;
 const message=clean(request?.payload?.message||request?.text);
 let intentResult=null;
 try{intentResult=testIntent?.answer?.(request,context)||null}catch{}
 if(intentResult?.handled&&clean(intentResult.text))return wrapHandled(intentResult,'test-intent');
 let conversational=null;
 try{conversational=conversation?.answer?.(request,context)||null}catch{}
 if(conversational?.handled&&clean(conversational.text))return wrapHandled(conversational,'conversation');
 if(message&&federation?.shouldFederate?.(message)){
   try{
     const external=await federation.ask(message,requestHistory(request),{parentBlobId:request?.blobId||null});
     if(external?.ok&&clean(external.text))return wrapHandled({...external,text:clean(external.text)},'provider-federation');
     if(external?.needsConnection==='openrouter')return wrapHandled({text:'Pour répondre avec des données Internet actuelles, connecte OpenRouter via le bouton ☁ IA. Je préfère te dire que le web live n’est pas branché plutôt que d’inventer.',provider:null,webGrounded:false},'provider-federation');
     if(external?.needsConnection==='huggingface_or_openrouter')return wrapHandled({text:'Pour cette demande générale, connecte Hugging Face ou OpenRouter via ☁ IA. Le cœur GVAULT local reste actif, mais je ne vais pas transformer une fiche projet en fausse réponse.',provider:null,webGrounded:false},'provider-federation');
   }catch{}
 }
 const result=await core.answer(request);
 return typeof result==='string'?{schema:SCHEMA,handled:true,text:result,engine:'gthink-public-native-js',model:'native-rules-v1',publicNative:true,offlineCapable:true,actionsAuthorized:false,knowledgeAware:false,coDevelopmentAware:true,simulationTrained:true}:{...result,schema:result?.schema||SCHEMA,knowledgeAware:false,coDevelopmentAware:true,simulationTrained:true}
}
function status(){let base={configured:true,ready:false,mode:'public-native-loading',engine:'gthink-public-native-js+core-cognition+co-development+free-conversation+intent-router+provider-federation',model:'conversation-guard-v6',offlineCapable:true,networkRequired:false,knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,testIntentRouted:true,freeConversationGuard:true,providerFederation:true};try{if(coreRef?.status)base={...base,...coreRef.status(),ready:true,engine:'gthink-public-native-js+core-cognition+co-development+free-conversation+intent-router+provider-federation',model:'conversation-guard-v6',knowledgeAware:true,coreCognitionAware:true,coDevelopmentAware:true,simulationTrained:true,testIntentRouted:true,freeConversationGuard:true,testIntentRouterSchema:testIntentRef?.schema||null,conversationBridge:!!conversationRef,conversationBridgeSchema:conversationRef?.schema||null,providerFederation:!!federationRef,providerFederationSchema:federationRef?.schema||null}}catch{}return base}
wrapper=Object.freeze({schema:SCHEMA,name:'GThinkPublicNativeFederatedGeneral',answer,status,get core(){return coreRef},get testIntent(){return testIntentRef},get conversation(){return conversationRef},get federation(){return federationRef},ready:()=>readyPromise});
window.GTHINK_PUBLIC_NATIVE_ENGINE=wrapper;
})();
