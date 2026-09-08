(()=>{'use strict';
const VERSION='1.4.1';
const STYLE=Object.freeze({
 schema:'GVAULT_PUBLIC_AGENT_CONVERSATION_STYLE_V1',
 version:VERSION,
 language:'fr',
 register:'contextual-informal',
 address:'tu',
 mirrorCadence:true,
 conciseByDefault:true,
 preserveProjectTerms:true,
 inferMinorTyposFromContext:true,
 callOutAmbiguityOnlyWhenMaterial:true,
 stateActionTruth:true,
 publicContextOnly:true,
 privateReasoning:false,
 secrets:false,
 routing:'GTHINK_FIRST_FOR_ACTIONS',
 outputPlanes:['conversation','diagnostic','maintenance'],
 defaultOutputPlane:'conversation'
});
const SYSTEM_INSTRUCTION=`Parle en français naturel comme dans une conversation de travail déjà engagée. Tutoie l’utilisateur. Adapte légèrement ton registre et ton rythme au sien sans caricaturer ses fautes. Comprends les petites fautes de frappe par le contexte et ne les corrige pas si elles ne gênent pas le sens. Réponds directement, plutôt court par défaut, mais développe quand la tâche le demande. Garde exactement les termes du projet (GVAULT, GThink, SAS, blobs, routes, versions). N’oblige pas l’utilisateur à reformuler une demande compréhensible. Tiens compte du fil local de la conversation. Pour toute action, distingue clairement ce qui est fait, proposé, bloqué ou non vérifié et conserve le passage GThink prévu par le runtime. Sur la surface publique, n’utilise que le contexte public explicitement fourni : ne révèle ni secret, ni contenu privé, ni raisonnement caché. Sépare strictement trois plans de sortie : conversation, diagnostic et maintenance. Par défaut, réponds uniquement sur le plan conversation. N’injecte pas Build, Dernière modification, Statut, Point de reprise, Checkpoint, Configuration, Systèmes, Affinités/statuts, bloc ANALYSE, Version ou Prochaine action technique dans une réponse conversationnelle, sauf si l’utilisateur demande explicitement un diagnostic, du debug, un état de build, une version, un checkpoint ou de la maintenance. Les métadonnées de registre servent de contexte interne et ne doivent pas devenir automatiquement le contenu de la réponse. Si le contexte courant est MENU PRINCIPAL, réponds d’abord à propos de ce contexte courant plutôt que de réciter l’état interne du build.`;
const DIAGNOSTIC_INTENT=/\b(diagnostic|debug|build|version|statut|checkpoint|point de reprise|maintenance|changelog|derni[eè]re modification|configuration|syst[eè]mes?|rapport technique|analyse technique)\b/i;
const INTERNAL_PREFIXES=[
 /^PIXEL AGENT ARENA\b/i,
 /^Build\s*:/i,
 /^Derni[eè]re modification\s*:/i,
 /^Statut\s*:/i,
 /^Point de reprise\s*:/i,
 /^Checkpoint\s*:/i,
 /^Configuration\s*:/i,
 /^Syst[eè]mes?\s*:/i,
 /^Affinit[eé]s?\s*\/\s*statuts?\s*:/i,
 /^ANALYSE\s*$/i,
 /^Version\s*:/i,
 /^Prochaine action\s*:/i
];
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const TEST_INTENT_URL=new URL('gthink-public-test-intent-router.js?v=1',SCRIPT_BASE).href;
const CONVERSATION_URL=new URL('gthink-secondary-conversation-bridge.js?v=4',SCRIPT_BASE).href;
const targetHistory=new WeakMap();
const targetWrapped=new WeakSet();
let dependencyPromise=null;
function clean(v){return String(v??'').trim()}
function diagnosticIntent(query=''){return DIAGNOSTIC_INTENT.test(String(query||''))}
function sanitizeConversationPlane(answer,query=''){
 const raw=clean(answer);
 if(!raw||diagnosticIntent(query))return raw;
 const lines=raw.replace(/\r\n?/g,'\n').split('\n');
 const kept=[];
 let context='';
 let skipWrapped=false;
 for(const original of lines){
  const line=original.trim();
  if(!line){skipWrapped=false;if(kept.length&&kept[kept.length-1]!=='')kept.push('');continue}
  const ctx=line.match(/^Contexte actuel\s*:\s*(.+)$/i);
  if(ctx){context=ctx[1].trim();skipWrapped=false;continue}
  const internal=INTERNAL_PREFIXES.some(rx=>rx.test(line));
  if(internal){skipWrapped=true;continue}
  if(skipWrapped)continue;
  kept.push(original.trimEnd());
 }
 while(kept[0]==='')kept.shift();
 while(kept[kept.length-1]==='')kept.pop();
 const out=kept.join('\n').replace(/\n{3,}/g,'\n\n').trim();
 if(out)return out;
 if(context)return `Là, tu es sur ${context}. Je reste sur ce contexte pour te répondre, sans ressortir le diagnostic interne.`;
 return 'Je reste sur ce que tu regardes actuellement et je garde le diagnostic interne hors de la conversation.';
}
function conversationalize(answer,query=''){
 let out=sanitizeConversationPlane(answer,query);
 if(!out)return out;
 const exact=new Map([
  ['Écris-moi une demande.','Vas-y, dis-moi ce que tu veux faire.'],
  ['Avec plaisir.','Oui.'],
  ['Aucune notification Agent enregistrée.','Là, je n’ai aucune notification Agent enregistrée.'],
  ['Je ne trouve aucun projet correspondant dans le registre.','Là, je ne trouve aucun projet correspondant dans le registre.']
 ]);
 if(exact.has(out))return exact.get(out);
 if(out.startsWith('Je ne sais pas encore répondre précisément à ça avec les données du Vault.')){
  return out.replace('Je ne sais pas encore répondre précisément à ça avec les données du Vault.','Là, je n’ai pas encore assez de données dans le Vault pour te répondre proprement.')
            .replace('Tu peux me l’apprendre avec :','Si tu veux me l’apprendre :')
            .replace('Ou reformuler avec','Sinon donne-moi');
 }
 if(out.startsWith('GTHINK_ACTION_BLOCKED\n'))out=out.replace(/^GTHINK_ACTION_BLOCKED\n/,'Action bloquée par GThink.\n');
 return out;
}
function loadScript(url,attr){
 return new Promise(resolve=>{
  const existing=document.querySelector(`script[${attr}]`);
  if(existing){
   if(existing.dataset.ready==='1')return resolve(true);
   existing.addEventListener('load',()=>resolve(true),{once:true});
   existing.addEventListener('error',()=>resolve(false),{once:true});
   return;
  }
  const s=document.createElement('script');
  s.src=url;
  s.async=false;
  s.setAttribute(attr,'1');
  s.addEventListener('load',()=>{s.dataset.ready='1';resolve(true)},{once:true});
  s.addEventListener('error',()=>resolve(false),{once:true});
  (document.head||document.documentElement).appendChild(s);
 });
}
function loadConversationDependencies(){
 if(dependencyPromise)return dependencyPromise;
 dependencyPromise=Promise.all([
  loadScript(TEST_INTENT_URL,'data-gvault-light-test-intent'),
  loadScript(CONVERSATION_URL,'data-gvault-light-conversation')
 ]).then(()=>true).catch(()=>false);
 return dependencyPromise;
}
function historyFor(target){
 let h=targetHistory.get(target);
 if(!h){h=[];targetHistory.set(target,h)}
 return h;
}
function remember(target,query,answer){
 const h=historyFor(target);
 if(clean(query))h.push({role:'user',content:clean(query)});
 if(clean(answer))h.push({role:'assistant',content:clean(answer)});
 if(h.length>24)h.splice(0,h.length-24);
}
function routeSynchronous(target,query,ctx){
 const q=clean(query);
 if(!q)return null;
 const request={text:q,payload:{message:q,history:historyFor(target).slice(-24),context:ctx||null}};
 try{
  const test=window.GTHINK_PUBLIC_TEST_INTENT_ROUTER?.answer?.(request,ctx);
  if(test?.handled&&clean(test.text))return clean(test.text);
 }catch{}
 try{
  const convo=window.GTHINK_SECONDARY_CONVERSATION_BRIDGE?.answer?.(request,ctx);
  if(convo?.handled&&clean(convo.text))return clean(convo.text);
 }catch{}
 return null;
}
function transformLocal(target,answer,query,ctx){
 const routed=routeSynchronous(target,query,ctx);
 const out=routed||conversationalize(answer,query);
 remember(target,query,out);
 return out;
}
function installLocalLayer(target=window){
 let fn;
 try{fn=target.applyAgentModel}catch{return false}
 if(typeof fn!=='function')return false;
 if(fn.__gvaultConversationStyleV1){targetWrapped.add(target);return true}
 const wrapped=function(answer,query,ctx){
  const result=fn.call(this,answer,query,ctx);
  if(result&&typeof result.then==='function')return result.then(v=>transformLocal(target,v,query,ctx));
  return transformLocal(target,result,query,ctx);
 };
 Object.defineProperty(wrapped,'__gvaultConversationStyleV1',{value:true});
 Object.defineProperty(wrapped,'__gvaultLightRuntimeBridge',{value:true});
 try{
  target.applyAgentModel=wrapped;
  const ok=target.applyAgentModel===wrapped;
  if(ok)targetWrapped.add(target);
  return ok;
 }catch{return false}
}
function installRemoteLayer(target=window){
 try{if(target.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1)return true}catch{return false}
 let nativeFetch;
 try{nativeFetch=target.fetch.bind(target)}catch{return false}
 const wrapped=async function(input,init){
  let next=init;
  let query='';
  let isChat=false;
  try{
   const url=typeof input==='string'?input:String(input?.url||'');
   const method=String(init?.method||input?.method||'GET').toUpperCase();
   isChat=method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url);
   if(isChat&&typeof init?.body==='string'){
    const body=JSON.parse(init.body);
    if(body&&typeof body==='object'&&typeof body.message==='string'){
     query=body.message;
     body.conversationStyle=STYLE;
     body.systemInstruction=SYSTEM_INSTRUCTION;
     body.context={...(body.context&&typeof body.context==='object'?body.context:{}),publicConversationStyle:STYLE.schema,outputPlane:'conversation'};
     next={...init,body:JSON.stringify(body)};
    }
   }
  }catch{}
  const response=await nativeFetch(input,next);
  if(!isChat)return response;
  try{
   const data=await response.clone().json();
   if(data&&typeof data==='object'&&(data.schema==='GVAULT_AGENT_CHAT_RESPONSE_V1'||data.schema==='GVAULT_AGENT_CHAT_RESPONSE_V2'||data.schema==='GVAULT_BLOB_STREAM_RESPONSE_V1')&&typeof data.text==='string'){
    const text=routeSynchronous(target,query,data?.context)||conversationalize(data.text,query);
    remember(target,query,text);
    let blob=data.blob,pair=data.pair;
    if(blob&&typeof blob==='object'){
     if(blob.agentSide&&typeof blob.agentSide==='object'&&typeof blob.agentSide.display==='string')blob={...blob,agentSide:{...blob.agentSide,display:text}};
     else if(typeof blob.text==='string'||typeof blob.display==='string')blob={...blob,text,display:text};
    }
    if(pair?.responseBlob&&typeof pair.responseBlob==='object')pair={...pair,responseBlob:{...pair.responseBlob,text,display:text}};
    const HeadersCtor=target.Headers||Headers;
    const ResponseCtor=target.Response||Response;
    const headers=new HeadersCtor(response.headers);
    headers.set('content-type','application/json');
    return new ResponseCtor(JSON.stringify({...data,text,blob,pair}),{status:response.status,statusText:response.statusText,headers});
   }
  }catch{}
  return response;
 };
 try{
  target.fetch=wrapped;
  target.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1=true;
  return true;
 }catch{return false}
}
function loadLiveBlobLayer(){
 if(window.GVAULT_AGENT_LIVE_BLOB||document.querySelector('script[data-gvault-agent-live-blob]'))return;
 const s=document.createElement('script');
 s.src='./scripts/gvault-agent-live-blob.js?v=5';
 s.async=false;
 s.setAttribute('data-gvault-agent-live-blob','V5');
 s.onerror=()=>console.warn('GVAULT blob stream layer unavailable');
 (document.head||document.documentElement).appendChild(s);
}
function installRuntimeFrame(){
 const frame=document.getElementById('gvaultRuntime');
 if(!frame)return false;
 let target;
 try{target=frame.contentWindow}catch{return false}
 if(!target)return false;
 installRemoteLayer(target);
 installLocalLayer(target);
 if(!frame.__gvaultLightRuntimeLoadHook){
  frame.__gvaultLightRuntimeLoadHook=true;
  frame.addEventListener('load',()=>{
   setTimeout(()=>{
    try{installRemoteLayer(frame.contentWindow);installLocalLayer(frame.contentWindow)}catch{}
   },30);
  });
 }
 return targetWrapped.has(target);
}
function announce(){
 try{
  window.dispatchEvent(new CustomEvent('gvault:public-agent-conversation-style-ready',{detail:{
   schema:STYLE.schema,
   version:VERSION,
   runtimeBridge:installRuntimeFrame()
  }}));
 }catch{}
}
installRemoteLayer(window);
loadLiveBlobLayer();
void loadConversationDependencies().then(()=>{installLocalLayer(window);installRuntimeFrame();announce()});
let tries=0;
const timer=setInterval(()=>{
 tries++;
 installLocalLayer(window);
 installRuntimeFrame();
 if(tries>=480){clearInterval(timer);announce()}
},125);
if(installLocalLayer(window))announce();
window.GVAULT_PUBLIC_AGENT_CONVERSATION=Object.freeze({
 version:VERSION,
 style:STYLE,
 systemInstruction:SYSTEM_INSTRUCTION,
 diagnosticIntent,
 sanitizeConversationPlane,
 conversationalize,
 status:()=>({
  localLayer:!!window.applyAgentModel?.__gvaultConversationStyleV1,
  remoteLayer:!!window.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1,
  liveBlobLayer:!!window.GVAULT_AGENT_LIVE_BLOB,
  runtimeFrame:!!document.getElementById('gvaultRuntime'),
  runtimeLocalLayer:(()=>{try{return !!document.getElementById('gvaultRuntime')?.contentWindow?.applyAgentModel?.__gvaultLightRuntimeBridge}catch{return false}})(),
  testIntent:!!window.GTHINK_PUBLIC_TEST_INTENT_ROUTER,
  conversationBridge:!!window.GTHINK_SECONDARY_CONVERSATION_BRIDGE
 })
});
})();