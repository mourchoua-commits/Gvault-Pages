(()=>{'use strict';
const SCHEMA='GTHINK_LIGHT_BEST_FUNCTIONAL_CHECKUP_V1';
const PROFILE='BEST_FUNCTIONAL_2026-09-01';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const METHOD_URL=new URL('gthink-public-full-method-router.js?v=2',SCRIPT_BASE).href;
const KNOWLEDGE_URL=new URL('../gthink/second-kernel/blob/second-kernel-adapter.js?v=1',SCRIPT_BASE).href;
const PROFILE_URL=new URL('../blobs/public/gthink-best-functional-20260901.v1.json?v=1',SCRIPT_BASE).href;
const targetState=new WeakMap();
const wrappedTargets=new WeakSet();
let depsPromise=null,profilePromise=null;
function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function uid(prefix='checkup'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function stateFor(target){let s=targetState.get(target);if(!s){s={running:false,last:null,lastError:null,lastAt:null};targetState.set(target,s)}return s}
function isCheckup(message){
 const n=norm(message);
 if(!n)return false;
 if(/\b(check ?up|checkup|bilan|etat global|etat general|verification generale|controle general)\b/.test(n))return true;
 return /\b(check|verifie|verification|controle)\b/.test(n)&&/\b(gvault|gthink|agent|runtime|systeme|tout|global)\b/.test(n);
}
function asksResult(message){const n=norm(message);return /\b(resultat|resultats|rapport|verdict|fini|termine|terminee)\b/.test(n)&&/\b(check|checkup|bilan|route|routage)\b/.test(n)}
function api(target){try{return target?.GVAULT_AGENT_LIVE_BLOB||window.GVAULT_AGENT_LIVE_BLOB||null}catch{return window.GVAULT_AGENT_LIVE_BLOB||null}}
function emit(target,kind,payload={},text=null,parentBlobId=null){
 const a=api(target);if(!a?.speak)return null;
 try{return a.speak({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:uid('best-route'),parentBlobId,conversationId:'gthink-light-best-functional-checkup',kind,role:'gthink',from:'GThinkLightBestFunctionalCheckup',to:'public.bus',intent:'best_functional_checkup',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages:VaultAgentLight',streamUrl:a.streamUrl,text,display:text,payload:{...payload,schema:SCHEMA,profile:PROFILE,publicOnly:true,privateRouteAllowed:false},understoodBy:['GThink','MethodRouter','public-kernel','public-native','public-ui','route-spine'],silent:true,muted:false})}catch{return null}
}
async function profile(){
 if(profilePromise)return profilePromise;
 profilePromise=fetch(PROFILE_URL,{cache:'no-store',credentials:'omit'}).then(r=>r.ok?r.json():null).catch(()=>null);
 return profilePromise;
}
async function deps(){
 if(depsPromise)return depsPromise;
 depsPromise=Promise.all([import(METHOD_URL),import(KNOWLEDGE_URL)]).then(([methodMod,knowledgeMod])=>({createRouter:methodMod.createPublicFullMethodRouter,knowledge:knowledgeMod.secondKernelKnowledge||window.GTHINK_SECOND_KERNEL_KNOWLEDGE||null})).catch(e=>{depsPromise=null;throw e});
 return depsPromise;
}
function preflight(target){
 let engine=null;try{engine=target?.GTHINK_PUBLIC_NATIVE_ENGINE||window.GTHINK_PUBLIC_NATIVE_ENGINE}catch{engine=window.GTHINK_PUBLIC_NATIVE_ENGINE}
 let es={};try{es=engine?.status?.()||{}}catch{}
 const a=api(target);
 return {liveBlob:!!a?.speak,stream:a?.streamUrl||'gvault://blobs/public/gthink/stream',nativeEngine:!!engine?.answer,nativeReady:es?.ready!==false,conversationBridge:!!(target?.GTHINK_SECONDARY_CONVERSATION_BRIDGE||window.GTHINK_SECONDARY_CONVERSATION_BRIDGE),testIntent:!!(target?.GTHINK_PUBLIC_TEST_INTENT_ROUTER||window.GTHINK_PUBLIC_TEST_INTENT_ROUTER)};
}
function preflightText(p){const ok=[p.liveBlob,p.nativeEngine,p.nativeReady].filter(Boolean).length;return `${ok}/3 organes critiques prêts`}
async function runDeep(target,message,ctx){
 const s=stateFor(target);if(s.running)return s.last;
 s.running=true;s.lastError=null;s.lastAt=new Date().toISOString();
 const startBlob=emit(target,'gthink.light.checkup.start',{exactMessage:message,decisionOrder:['CURRENT_EXPLICIT_USER_INTENT','CANONICAL_METHOD_ROUTER_POLICY','EXISTING_CANONICAL_ARCHITECTURE_AND_CONSTRAINTS','CURRENT_FUNCTIONAL_RUNTIME','DERIVED_SUPPORT_ONLY'],baseline:'2026-09-01',mode:'ADAPTIVE_NO_ROLLBACK'},'Check-up Best Functional 01/09 lancé');
 try{
   const [{createRouter,knowledge},prof]=await Promise.all([deps(),profile()]);
   const a=api(target);let engine=null;try{engine=target?.GTHINK_PUBLIC_NATIVE_ENGINE||window.GTHINK_PUBLIC_NATIVE_ENGINE}catch{engine=window.GTHINK_PUBLIC_NATIVE_ENGINE}
   if(!a?.speak)throw new Error('live_blob_unavailable');
   if(!engine?.answer)throw new Error('public_native_engine_unavailable');
   try{await engine.ready?.()}catch{}
   try{await knowledge?.ready?.()}catch{}
   if(typeof createRouter!=='function'||!knowledge?.contextForTask)throw new Error('full_method_router_dependency_unavailable');
   const traces=[];
   const router=await createRouter({api:a,engine,knowledge,trace:x=>traces.push(clean(x))});
   const history=[];
   try{const h=target?.GVAULT_PUBLIC_AGENT_CONVERSATION?.history;if(Array.isArray(h))history.push(...h.slice(-20))}catch{}
   const exactReq={schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:uid('checkup-exact'),conversationId:'gthink-light-best-functional-checkup',kind:'gateway.request',role:'user',from:'VaultAgentLight',to:'GThinkMethodRouterPublic',intent:'checkup_best_functional',text:message,payload:{message,history,checkupProfile:PROFILE,originalExactMessage:message,publicOnly:true}};
   const exact=await router.respond(exactReq);
   const exactProof=router.lastProof?structuredClone(router.lastProof):null;
   const auditMessage=`Double vérification de cohérence et continuité du runtime public pour cette demande exacte, sans la remplacer : ${message}`;
   const auditReq={...exactReq,blobId:uid('checkup-audit'),intent:'checkup_best_functional_counterproof',text:auditMessage,payload:{...exactReq.payload,message:auditMessage,originalExactMessage:message,checkupProfile:PROFILE,auditDirective:true}};
   const audit=await router.respond(auditReq);
   const auditProof=router.lastProof?structuredClone(router.lastProof):null;
   const pf=preflight(target);
   const result={schema:SCHEMA,status:'PASS_PUBLIC_METHOD_EXECUTED',profile:PROFILE,baselineSource:prof?.source||null,exactMessage:message,preflight:pf,exactPass:{text:clean(exact?.text||exact),proof:exactProof},counterproofPass:{text:clean(audit?.text||audit),proof:auditProof},traces:traces.slice(-24),privateRouteAttempted:false,completedAt:new Date().toISOString()};
   s.last=result;s.lastError=null;
   emit(target,'gthink.light.checkup.completed',result,`Check-up ${PROFILE} terminé`,startBlob?.blobId||null);
   return result;
 }catch(e){
   const err=clean(e?.message||e);s.lastError=err;s.last={schema:SCHEMA,status:'PARTIAL_PRECHECK_ONLY',profile:PROFILE,exactMessage:message,preflight:preflight(target),error:err,privateRouteAttempted:false,completedAt:new Date().toISOString()};
   emit(target,'gthink.light.checkup.failed',s.last,`Check-up incomplet : ${err}`,startBlob?.blobId||null);
   return s.last;
 }finally{s.running=false}
}
function immediateReply(target,message){
 const p=preflight(target);
 void runDeep(target,message,null);
 const bits=[p.liveBlob?'blob ✓':'blob ✕',p.nativeEngine?'moteur ✓':'moteur ✕',p.conversationBridge?'conversation ✓':'conversation …'];
 return `Oui. Je lance le check-up avec la méthode de routage Best Functional du 1er septembre, pas avec la fiche projet affichée. Préflight : ${bits.join(' · ')}. La passe exacte puis la contrepreuve tournent sur le Method Router canonique.`;
}
function resultReply(target){
 const s=stateFor(target);
 if(s.running)return 'Le check-up Best Functional du 1er septembre tourne encore : passe exacte puis contrepreuve.';
 if(!s.last)return 'Je n’ai pas encore de résultat de check-up dans ce contexte. Demande-moi de lancer un check-up.';
 const r=s.last,p=r.preflight||{},prot=[...(r.exactPass?.proof?.protocols||[]),...(r.counterproofPass?.proof?.protocols||[])];const uniq=[...new Set(prot)];
 if(r.status==='PASS_PUBLIC_METHOD_EXECUTED')return `Check-up terminé. Route 01/09 exécutée sur le plan public : ${preflightText(p)}${uniq.length?` · protocoles ${uniq.join(' + ')}`:''}. Route privée tentée : non.`;
 return `Le préflight a tourné, mais la passe Method Router complète n’a pas été scellée : ${r.error||'cause inconnue'}. Je n’invente pas un PASS.`;
}
function wrapTarget(target){
 if(!target||wrappedTargets.has(target))return true;
 let original;try{original=target.applyAgentModel}catch{return false}
 if(typeof original!=='function')return false;
 const wrapped=function(answer,query,ctx){
   const q=clean(query);
   if(asksResult(q))return resultReply(target);
   if(isCheckup(q))return immediateReply(target,q);
   return original.call(this,answer,query,ctx);
 };
 Object.defineProperty(wrapped,'__gthinkBestFunctionalCheckupV1',{value:true});
 try{target.applyAgentModel=wrapped;if(target.applyAgentModel===wrapped){wrappedTargets.add(target);return true}}catch{}
 return false;
}
function wrapFetch(target){
 try{if(target.__GTHINK_LIGHT_BEST_CHECKUP_FETCH_V1)return true}catch{return false}
 let nativeFetch;try{nativeFetch=target.fetch.bind(target)}catch{return false}
 const wrapped=async function(input,init){
   let q='',chat=false;try{const url=typeof input==='string'?input:String(input?.url||'');const method=String(init?.method||input?.method||'GET').toUpperCase();chat=method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url);if(chat&&typeof init?.body==='string'){const body=JSON.parse(init.body);q=clean(body?.message)}}catch{}
   if(chat&&q&&(isCheckup(q)||asksResult(q))){
     const text=asksResult(q)?resultReply(target):immediateReply(target,q);
     const ResponseCtor=target.Response||Response,HeadersCtor=target.Headers||Headers;const headers=new HeadersCtor({'content-type':'application/json'});
     return new ResponseCtor(JSON.stringify({schema:'GVAULT_AGENT_CHAT_RESPONSE_V2',ok:true,text,engine:'gthink-light-best-functional-checkup',profile:PROFILE,actionsAuthorized:false}),{status:200,headers});
   }
   return nativeFetch(input,init);
 };
 try{target.fetch=wrapped;target.__GTHINK_LIGHT_BEST_CHECKUP_FETCH_V1=true;return true}catch{return false}
}
function install(){
 wrapFetch(window);wrapTarget(window);
 const frame=document.getElementById('gvaultRuntime');if(frame){try{wrapFetch(frame.contentWindow);wrapTarget(frame.contentWindow)}catch{}if(!frame.__gthinkBestCheckupHook){frame.__gthinkBestCheckupHook=true;frame.addEventListener('load',()=>setTimeout(()=>{try{wrapFetch(frame.contentWindow);wrapTarget(frame.contentWindow)}catch{}},40))}}
}
install();let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>480)clearInterval(timer)},125);
window.GTHINK_LIGHT_BEST_FUNCTIONAL_CHECKUP=Object.freeze({schema:SCHEMA,profile:PROFILE,isCheckup,run:(message,target=window)=>runDeep(target,clean(message),null),status:(target=window)=>({...stateFor(target),preflight:preflight(target)})});
})();