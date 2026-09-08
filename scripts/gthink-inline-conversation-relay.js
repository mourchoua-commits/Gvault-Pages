(()=>{'use strict';
const SCHEMA='GTHINK_INLINE_CONVERSATION_RELAY_V2';
const VERSION='2.0.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=2',SCRIPT_BASE).href;
const TOOLBUS_URL=new URL('gthink-universal-tool-bus.js?v=1',SCRIPT_BASE).href;
const relayHistory=new WeakMap();
const wrappedTargets=new WeakSet();
let federationLoad=null,toolBusLoad=null;

function clean(v){return String(v??'').trim()}
function historyFor(target){let h=relayHistory.get(target);if(!h){h=[];relayHistory.set(target,h)}return h}
function remember(target,query,answer){const h=historyFor(target);if(clean(query))h.push({role:'user',content:clean(query)});if(clean(answer))h.push({role:'assistant',content:clean(answer)});if(h.length>28)h.splice(0,h.length-28)}
function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`inline-relay-${crypto.randomUUID?.()||Date.now()}`,parentBlobId:null,conversationId:'gthink-inline-relay',kind,role:'relay',from:'GThinkInlineConversationRelay',to:'public.bus',intent:'public_conversation_relay',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,version:VERSION,...payload,containsSecret:false},understoodBy:['GThink','MethodRouter','public-kernel','provider-router','tool-bus'],silent:true,muted:false})}catch{}}

function loadScriptGlobal(url,attr,test){
 return new Promise(resolve=>{
  if(test())return resolve(test());
  const existing=document.querySelector(`script[${attr}]`);
  if(existing){const start=Date.now(),tick=()=>test()?resolve(test()):Date.now()-start>7000?resolve(null):setTimeout(tick,35);tick();return}
  const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.onload=()=>resolve(test()||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)
 });
}
function loadFederation(){
 if(window.GTHINK_PROVIDER_FEDERATION?.ask)return Promise.resolve(window.GTHINK_PROVIDER_FEDERATION);
 if(federationLoad)return federationLoad;
 federationLoad=loadScriptGlobal(FEDERATION_URL,'data-gthink-inline-federation-v2',()=>window.GTHINK_PROVIDER_FEDERATION?.ask?window.GTHINK_PROVIDER_FEDERATION:null).finally(()=>{federationLoad=null});
 return federationLoad;
}
function loadToolBus(){
 if(window.GTHINK_UNIVERSAL_TOOL_BUS?.execute)return Promise.resolve(window.GTHINK_UNIVERSAL_TOOL_BUS);
 if(toolBusLoad)return toolBusLoad;
 toolBusLoad=loadScriptGlobal(TOOLBUS_URL,'data-gthink-inline-toolbus-v1',()=>window.GTHINK_UNIVERSAL_TOOL_BUS?.execute?window.GTHINK_UNIVERSAL_TOOL_BUS:null).finally(()=>{toolBusLoad=null});
 return toolBusLoad;
}
function styleAnswer(text,query){
 let out=clean(text);
 try{out=window.GVAULT_PUBLIC_AGENT_CONVERSATION?.conversationalize?.(out,query)||out}catch{}
 return out;
}
function connectionText(result,query){
 const live=window.GTHINK_PROVIDER_FEDERATION?.needsLiveWeb?.(query)===true;
 if(live||result?.needsConnection==='openrouter')return 'Le relais est prêt, mais cette demande a besoin du web actuel. Appuie une fois sur ☁ IA puis OpenRouter. Après ça, tu continues à écrire ici et la réponse revient ici.';
 return 'Le relais conversationnel est prêt, mais aucun fournisseur distant n’est autorisé dans cette session. Appuie une fois sur ☁ IA puis Hugging Face ou OpenRouter. Après l’autorisation, tu continues à écrire ici.';
}
function callOriginal(original,self,args,target,query){
 let value=original.apply(self,args);
 if(value&&typeof value.then==='function')return value.then(answer=>{const out=clean(answer);if(out)remember(target,query,out);return answer});
 if(clean(value))remember(target,query,value);
 return value;
}
function formatToolResult(name,result){
 if(!result||result.ok===false)return result?.error?`Je n’ai pas pu utiliser ${name} : ${result.error}.`:`Je n’ai pas pu utiliser ${name}.`;
 if(name==='local_calculate')return `${result.expression} = ${result.value}`;
 if(name==='local_time')return `Heure du navigateur : ${result.local}${result.timezone?` · ${result.timezone}`:''}.`;
 if(name==='gvault_current_context'){
  const names=(result.visibleProjects||[]).map(x=>x.name).filter(Boolean);
  return names.length?`Là, le contexte visible est ${result.context}. Projet visible : ${names.join(', ')}.`:`Là, le contexte visible est ${result.context}.`;
 }
 if(name==='gvault_search_projects'){
  const rows=result.results||[];if(!rows.length)return 'Je ne trouve pas de projet correspondant dans la projection publique du Vault.';
  return `Je trouve ${rows.length} correspondance${rows.length>1?'s':''} :\n${rows.map(x=>`• ${x.name}${x.version?` · ${x.version}`:''}${x.status?` · ${x.status}`:''}`).join('\n')}`;
 }
 if(name==='gvault_project_details'){
  const x=result.project||{};return `${x.name}${x.version?` · ${x.version}`:''}${x.status?` · ${x.status}`:''}${x.summary?`\n${x.summary}`:''}${x.publicPath?`\nChemin public : ${x.publicPath}`:''}`;
 }
 if(name==='gvault_compare_projects'){
  const a=result.left||{},b=result.right||{};return `${a.name} ↔ ${b.name}\nVersions : ${a.version||'—'} / ${b.version||'—'}\nStatuts : ${a.status||'—'} / ${b.status||'—'}\nOuverture publique : ${a.publicPath?'oui':'non'} / ${b.publicPath?'oui':'non'}.`;
 }
 if(name==='runtime_status'){
  const p=result.provider||{},tools=result.tools||[];return `GThink public : Tool Bus ${tools.length} outil(s) · HF ${p?.huggingFace?.connected?'✓':'○'} · WEB ${p?.openRouter?.connected?'✓':'○'} · réseau ${result.network?.online?'✓':'○'}.`;
 }
 if(name==='gvault_best_functional_checkup')return `Check-up Best Functional : ${result.status||result.result?.status||'état inconnu'}.`;
 return clean(result.text)||clean(result.result)||'Outil exécuté.';
}
async function maybeLocalTool(target,q){
 const bus=await loadToolBus();if(!bus?.quickClassify)return null;
 const tool=bus.quickClassify(q);if(!tool)return null;
 let args={};
 if(tool==='local_calculate')args={expression:q};
 else if(tool==='gvault_search_projects')args={query:q,limit:5};
 else if(tool==='gvault_project_details')args={query:q};
 else if(tool==='gvault_current_context'||tool==='runtime_status')args={};
 else if(tool==='gvault_best_functional_checkup')args={message:q};
 else return null;
 const result=await bus.execute(tool,args,{userMessage:q,surface:'vault-agent-light-inline'});
 return {tool,result,text:styleAnswer(formatToolResult(tool,result),q)};
}

function installTarget(target=window){
 if(!target)return false;
 let original;try{original=target.applyAgentModel}catch{return false}
 if(typeof original!=='function')return false;
 if(original.__gthinkInlineRelayV2){wrappedTargets.add(target);return true}
 if(!original.__gvaultConversationStyleV1&&!original.__gvaultLightRuntimeBridge&&!original.__gthinkInlineRelayV1)return false;
 const wrapped=function(answer,query,ctx){
  const q=clean(query);if(!q)return original.call(this,answer,query,ctx);
  const self=this,args=[answer,query,ctx];
  const fedNow=window.GTHINK_PROVIDER_FEDERATION;
  const busNow=window.GTHINK_UNIVERSAL_TOOL_BUS;
  const quick=busNow?.quickClassify?.(q)||null;
  if(!quick&&fedNow?.shouldFederate?.(q)===false)return callOriginal(original,self,args,target,q);
  return (async()=>{
    const local=await maybeLocalTool(target,q).catch(()=>null);
    if(local?.text){remember(target,q,local.text);emit('gthink.inline.relay.local_tool',{tool:local.tool,ok:local.result?.ok!==false});return local.text}
    const fed=fedNow?.ask?fedNow:await loadFederation();
    if(!fed?.ask)return await callOriginal(original,self,args,target,q);
    if(fed.shouldFederate?.(q)===false)return await callOriginal(original,self,args,target,q);
    if(!fed.hasCloud?.())return await callOriginal(original,self,args,target,q);
    emit('gthink.inline.relay.request',{historyItems:historyFor(target).length,cloud:true});
    let result=null;try{result=await fed.ask(q,historyFor(target).slice(-14),{surface:'vault-agent-light-inline',relay:true,toolBus:true})}catch(error){result={ok:false,error:clean(error?.message||error)}}
    if(result?.ok&&clean(result.text)){
      const out=styleAnswer(result.text,q);remember(target,q,out);
      emit('gthink.inline.relay.response',{provider:result.provider||null,model:result.model||null,webGrounded:result.webGrounded===true,toolCalls:result.toolCalls||0});return out;
    }
    if(result?.needsConnection){
      const out=connectionText(result,q);remember(target,q,out);emit('gthink.inline.relay.connection_required',{provider:result.needsConnection});return out;
    }
    emit('gthink.inline.relay.fallback',{error:result?.error||'relay_failed'});
    return await callOriginal(original,self,args,target,q);
  })();
 };
 try{Object.defineProperty(wrapped,'__gthinkInlineRelayV2',{value:true});Object.defineProperty(wrapped,'__gvaultConversationStyleV1',{value:true});Object.defineProperty(wrapped,'__gvaultLightRuntimeBridge',{value:true})}catch{}
 try{target.applyAgentModel=wrapped;if(target.applyAgentModel!==wrapped)return false;wrappedTargets.add(target);return true}catch{return false}
}
function installRuntime(){
 const frame=document.getElementById('gvaultRuntime');if(!frame)return false;
 try{installTarget(frame.contentWindow)}catch{}
 if(!frame.__gthinkInlineRelayLoadHookV2){frame.__gthinkInlineRelayLoadHookV2=true;frame.addEventListener('load',()=>setTimeout(()=>{try{installTarget(frame.contentWindow)}catch{}},40))}
 return true;
}
function install(){installTarget(window);installRuntime()}
void Promise.all([loadToolBus(),loadFederation()]).then(()=>install());
install();let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>=720)clearInterval(timer)},125);
window.addEventListener('pageshow',install);
window.GTHINK_INLINE_CONVERSATION_RELAY=Object.freeze({schema:SCHEMA,version:VERSION,install,status:async()=>{const [fed,bus]=await Promise.all([loadFederation(),loadToolBus()]);let fs=null;try{fs=await fed?.status?.()}catch{}return{schema:SCHEMA,version:VERSION,windowWrapped:wrappedTargets.has(window),runtimeWrapped:(()=>{try{return wrappedTargets.has(document.getElementById('gvaultRuntime')?.contentWindow)}catch{return false}})(),federation:fs,toolBus:!!bus?.execute,containsSecret:false}}});
emit('gthink.inline.relay.ready',{version:VERSION});
})();