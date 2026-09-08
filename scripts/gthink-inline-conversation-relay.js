(()=>{'use strict';
const SCHEMA='GTHINK_INLINE_CONVERSATION_RELAY_V1';
const VERSION='1.0.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=1',SCRIPT_BASE).href;
const relayHistory=new WeakMap();
const wrappedTargets=new WeakSet();
let federationLoad=null;

function clean(v){return String(v??'').trim()}
function historyFor(target){let h=relayHistory.get(target);if(!h){h=[];relayHistory.set(target,h)}return h}
function remember(target,query,answer){const h=historyFor(target);if(clean(query))h.push({role:'user',content:clean(query)});if(clean(answer))h.push({role:'assistant',content:clean(answer)});if(h.length>20)h.splice(0,h.length-20)}
function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`inline-relay-${crypto.randomUUID?.()||Date.now()}`,parentBlobId:null,conversationId:'gthink-inline-relay',kind,role:'relay',from:'GThinkInlineConversationRelay',to:'public.bus',intent:'public_conversation_relay',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,...payload,containsSecret:false},understoodBy:['GThink','public-kernel','provider-router'],silent:true,muted:false})}catch{}}

function loadFederation(){
 if(window.GTHINK_PROVIDER_FEDERATION?.ask)return Promise.resolve(window.GTHINK_PROVIDER_FEDERATION);
 if(federationLoad)return federationLoad;
 federationLoad=new Promise(resolve=>{
   const existing=document.querySelector('script[data-gthink-inline-federation]');
   if(existing){const started=Date.now(),tick=()=>window.GTHINK_PROVIDER_FEDERATION?.ask?resolve(window.GTHINK_PROVIDER_FEDERATION):Date.now()-started>6000?resolve(null):setTimeout(tick,35);tick();return}
   const s=document.createElement('script');s.src=FEDERATION_URL;s.async=false;s.setAttribute('data-gthink-inline-federation','1');s.onload=()=>resolve(window.GTHINK_PROVIDER_FEDERATION||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)
 }).finally(()=>{federationLoad=null});
 return federationLoad;
}

function styleAnswer(text,query){
 let out=clean(text);
 try{out=window.GVAULT_PUBLIC_AGENT_CONVERSATION?.conversationalize?.(out,query)||out}catch{}
 return out;
}

function connectionText(result,query){
 const live=window.GTHINK_PROVIDER_FEDERATION?.needsLiveWeb?.(query)===true;
 if(live||result?.needsConnection==='openrouter')return 'Le relais Internet est prêt, mais cette demande a besoin du web actuel. Appuie une fois sur ☁ IA puis OpenRouter. Ensuite tu pourras continuer à écrire ici, sans changer de zone de dialogue.';
 return 'Le relais conversationnel est prêt, mais aucun fournisseur distant n’est encore autorisé dans cette session. Appuie une fois sur ☁ IA puis Hugging Face. Ensuite tes messages envoyés ici pourront être relayés vers les modèles externes et la réponse reviendra directement dans cette conversation.';
}

function callOriginal(original,self,args,target,query){
 let value;
 try{value=original.apply(self,args)}catch(error){throw error}
 if(value&&typeof value.then==='function')return value.then(answer=>{const out=clean(answer);if(out)remember(target,query,out);return answer});
 if(clean(value))remember(target,query,value);
 return value;
}

function installTarget(target=window){
 if(!target)return false;
 let original;
 try{original=target.applyAgentModel}catch{return false}
 if(typeof original!=='function')return false;
 if(original.__gthinkInlineRelayV1){wrappedTargets.add(target);return true}
 if(!original.__gvaultConversationStyleV1&&!original.__gvaultLightRuntimeBridge)return false;

 const wrapped=function(answer,query,ctx){
   const q=clean(query);
   if(!q)return original.call(this,answer,query,ctx);
   const self=this,args=[answer,query,ctx];
   const federation=window.GTHINK_PROVIDER_FEDERATION;
   const should=federation?.shouldFederate?.(q);
   if(should===false)return callOriginal(original,self,args,target,q);

   return (async()=>{
     const fed=federation?.ask?federation:await loadFederation();
     if(!fed?.ask)return callOriginal(original,self,args,target,q);
     if(fed.shouldFederate?.(q)===false)return callOriginal(original,self,args,target,q);
     emit('gthink.inline.relay.request',{historyItems:historyFor(target).length});
     let result=null;
     try{result=await fed.ask(q,historyFor(target).slice(-12),{surface:'vault-agent-light-inline',relay:true})}catch(error){result={ok:false,error:clean(error?.message||error)}}
     if(result?.ok&&clean(result.text)){
       const out=styleAnswer(result.text,q);
       remember(target,q,out);
       emit('gthink.inline.relay.response',{provider:result.provider||null,model:result.model||null,webGrounded:result.webGrounded===true});
       return out;
     }
     if(result?.needsConnection){
       const out=connectionText(result,q);
       remember(target,q,out);
       emit('gthink.inline.relay.connection_required',{provider:result.needsConnection});
       return out;
     }
     emit('gthink.inline.relay.fallback',{error:result?.error||'relay_failed'});
     return await callOriginal(original,self,args,target,q);
   })();
 };

 try{Object.defineProperty(wrapped,'__gthinkInlineRelayV1',{value:true});Object.defineProperty(wrapped,'__gvaultConversationStyleV1',{value:true});Object.defineProperty(wrapped,'__gvaultLightRuntimeBridge',{value:true})}catch{}
 try{target.applyAgentModel=wrapped;if(target.applyAgentModel!==wrapped)return false;wrappedTargets.add(target);return true}catch{return false}
}

function installRuntime(){
 const frame=document.getElementById('gvaultRuntime');
 if(!frame)return false;
 try{installTarget(frame.contentWindow)}catch{}
 if(!frame.__gthinkInlineRelayLoadHook){
   frame.__gthinkInlineRelayLoadHook=true;
   frame.addEventListener('load',()=>setTimeout(()=>{try{installTarget(frame.contentWindow)}catch{}},40));
 }
 return true;
}

function install(){installTarget(window);installRuntime()}
void loadFederation().then(()=>install());
install();
let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>=720)clearInterval(timer)},125);
window.addEventListener('pageshow',install);
window.GTHINK_INLINE_CONVERSATION_RELAY=Object.freeze({schema:SCHEMA,version:VERSION,install,status:async()=>{const federation=await loadFederation();let fedStatus=null;try{fedStatus=await federation?.status?.()}catch{}return{schema:SCHEMA,version:VERSION,windowWrapped:wrappedTargets.has(window),runtimeWrapped:(()=>{try{return wrappedTargets.has(document.getElementById('gvaultRuntime')?.contentWindow)}catch{return false}})(),federation:fedStatus,containsSecret:false}}});
emit('gthink.inline.relay.ready',{version:VERSION});
})();
