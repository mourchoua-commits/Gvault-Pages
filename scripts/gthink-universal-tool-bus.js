(()=>{'use strict';
const SCHEMA='GTHINK_UNIVERSAL_TOOL_BUS_V1';
const VERSION='1.0.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const KNOWLEDGE_URL=new URL('gvault-public-agent-knowledge-v1.json?v=1',SCRIPT_BASE).href;
const BEST_OF_URL=new URL('../blobs/public/gthink-best-of-20260824-20260908.v1.json?v=1',SCRIPT_BASE).href;
const registry=new Map();
const catalogState={loadedAt:0,manifest:null,entries:[],promise:null};
let bestOfPromise=null;

function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").replace(/[^a-z0-9._:/+-]+/g,' ').replace(/\s+/g,' ').trim()}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min}
function uid(prefix='tool'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function json(v){try{return JSON.stringify(v)}catch{return '{"ok":false,"error":"json_encode_failed"}'}}
function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:uid('toolbus'),parentBlobId:null,conversationId:'gthink-universal-tool-bus',kind,role:'toolbus',from:'GThinkUniversalToolBus',to:'public.bus',intent:'universal_tool_bus',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,version:VERSION,...payload,containsSecret:false},understoodBy:['GThink','MethodRouter','public-kernel','provider-router'],silent:true,muted:false})}catch{}}

async function fetchJson(url,timeout=12000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const r=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:ctrl.signal});
  if(!r.ok)throw new Error(`http_${r.status}`);
  return await r.json();
 }finally{clearTimeout(timer)}
}
async function bestOf(){
 if(bestOfPromise)return bestOfPromise;
 bestOfPromise=fetchJson(BEST_OF_URL,8000).catch(()=>null);
 return bestOfPromise;
}
async function knowledge(force=false){
 if(!force&&catalogState.entries.length&&Date.now()-catalogState.loadedAt<60000)return catalogState;
 if(catalogState.promise)return catalogState.promise;
 catalogState.promise=(async()=>{
  const manifest=await fetchJson(KNOWLEDGE_URL);
  const parts=Array.isArray(manifest?.catalog?.parts)?manifest.catalog.parts:[];
  const payloads=await Promise.all(parts.map(async p=>{
   try{const u=new URL(p,KNOWLEDGE_URL);return await fetchJson(u.href)}catch{return null}
  }));
  const entries=payloads.flatMap(x=>Array.isArray(x?.entries)?x.entries:[]);
  catalogState.manifest=manifest;catalogState.entries=entries;catalogState.loadedAt=Date.now();
  return catalogState;
 })().finally(()=>{catalogState.promise=null});
 return catalogState.promise;
}
function projectScore(entry,query){
 const q=norm(query),tokens=q.split(' ').filter(x=>x.length>1);
 const fields=[
  [entry?.id,8],[entry?.name,12],[entry?.version,5],[entry?.status,3],[entry?.category,3],
  [entry?.kind,2],[entry?.summary,4],[(entry?.proof||[]).join(' '),2]
 ];
 let score=0;
 for(const [value,w] of fields){
  const n=norm(value);if(!n)continue;
  if(n===q)score+=w*6;
  if(q&&n.includes(q))score+=w*3;
  for(const t of tokens)if(n.includes(t))score+=w;
 }
 return score;
}
function projectView(x){
 return {
  id:clean(x?.id),name:clean(x?.name),kind:clean(x?.kind),category:clean(x?.category),
  version:clean(x?.version),status:clean(x?.status),summary:clean(x?.summary),
  publicPath:clean(x?.publicPath),confidence:Number(x?.confidence||0),
  proof:Array.isArray(x?.proof)?x.proof.slice(0,8):[]
 };
}
async function searchProjects(query,limit=5){
 const state=await knowledge();
 const q=clean(query),n=clamp(limit,1,10);
 const ranked=state.entries.map(x=>({x,score:projectScore(x,q)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,n);
 return {ok:true,query:q,count:ranked.length,results:ranked.map(r=>({...projectView(r.x),score:r.score})),source:'public-gvault-catalog'};
}
async function projectDetails(query){
 const r=await searchProjects(query,1);
 return r.results.length?{ok:true,project:r.results[0],source:r.source}:{ok:false,error:'project_not_found',query:clean(query)};
}
async function compareProjects(left,right){
 const [a,b]=await Promise.all([projectDetails(left),projectDetails(right)]);
 if(!a.ok||!b.ok)return {ok:false,error:'comparison_project_not_found',left:a,right:b};
 const A=a.project,B=b.project;
 return {ok:true,left:A,right:B,differences:{
  version:[A.version,B.version],status:[A.status,B.status],category:[A.category,B.category],
  publicLaunch:[!!A.publicPath,!!B.publicPath],confidence:[A.confidence,B.confidence]
 },source:'public-gvault-catalog'};
}
async function currentContext(){
 const state=await knowledge().catch(()=>({entries:[]}));
 const docs=[document];
 try{const d=document.getElementById('gvaultRuntime')?.contentDocument;if(d)docs.push(d)}catch{}
 let visible='';
 for(const d of docs){try{visible+=' '+clean(d?.body?.innerText).slice(0,12000)}catch{}}
 const matches=state.entries.map(x=>({x,score:visible&&clean(x?.name)&&visible.includes(clean(x.name))?100:0})).filter(r=>r.score).slice(0,3);
 const contextRx=/Contexte actuel\s*:\s*([^\n.]+)/i;
 const m=visible.match(contextRx);
 return {ok:true,url:location.href,context:clean(m?.[1])||'PUBLIC_PAGE',visibleProjects:matches.map(r=>projectView(r.x)),surface:'VAULT_AGENT_LIGHT',privateDataIncluded:false};
}
function safeCalculate(expression){
 const raw=clean(expression);
 if(!raw||raw.length>180)return {ok:false,error:'invalid_expression'};
 if(!/^[0-9+\-*/%.()^\s]+$/.test(raw))return {ok:false,error:'unsupported_expression'};
 const js=raw.replace(/\^/g,'**');
 if(/\*\*\*/.test(js)||/\/\//.test(js))return {ok:false,error:'unsupported_expression'};
 try{
  const value=Function(`"use strict";return (${js})`)();
  if(typeof value!=='number'||!Number.isFinite(value))return {ok:false,error:'non_finite_result'};
  return {ok:true,expression:raw,value};
 }catch{return {ok:false,error:'calculation_failed'}}
}
function localTime(){
 const now=new Date();
 return {ok:true,iso:now.toISOString(),local:now.toString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null};
}
function networkStatus(){
 const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
 return {ok:true,online:navigator.onLine!==false,effectiveType:c?.effectiveType||null,downlink:c?.downlink??null,rtt:c?.rtt??null,saveData:c?.saveData===true};
}
async function runtimeStatus(){
 let provider=null;try{provider=await window.GTHINK_PROVIDER_FEDERATION?.status?.()}catch{}
 let checkup=null;try{checkup=window.GTHINK_LIGHT_BEST_FUNCTIONAL_CHECKUP?.status?.()}catch{}
 const profile=await bestOf();
 return {ok:true,schema:SCHEMA,version:VERSION,profile:profile?.schema||null,tools:publicToolNames(),provider,checkup,network:networkStatus(),containsSecret:false};
}
async function bestFunctionalCheckup(args,meta){
 const message=clean(args?.message||meta?.userMessage);
 const runner=window.GTHINK_LIGHT_BEST_FUNCTIONAL_CHECKUP;
 if(!runner?.run)return {ok:false,error:'best_functional_checkup_unavailable'};
 const result=await runner.run(message||'check up',window);
 return {ok:!!result,status:result?.status||'UNKNOWN',result};
}

function validateArgs(tool,args){
 const input=args&&typeof args==='object'&&!Array.isArray(args)?args:{};
 const schema=tool.parameters||{type:'object',properties:{}};
 const props=schema.properties||{},required=schema.required||[];
 for(const k of required)if(input[k]===undefined||input[k]===null||input[k]==='')return {ok:false,error:`missing_${k}`};
 for(const k of Object.keys(input))if(!Object.prototype.hasOwnProperty.call(props,k))return {ok:false,error:`unknown_${k}`};
 for(const [k,v] of Object.entries(input)){
  const p=props[k]||{};
  if(p.type==='string'&&typeof v!=='string')return {ok:false,error:`type_${k}_string`};
  if(p.type==='number'&&typeof v!=='number')return {ok:false,error:`type_${k}_number`};
  if(p.type==='integer'&&(!Number.isInteger(v)))return {ok:false,error:`type_${k}_integer`};
  if(p.enum&&!p.enum.includes(v))return {ok:false,error:`enum_${k}`};
  if(typeof v==='string'&&p.maxLength&&v.length>p.maxLength)return {ok:false,error:`max_${k}`};
 }
 return {ok:true,args:input};
}
function registerTool(spec){
 if(!spec||typeof spec!=='object'||!clean(spec.name)||typeof spec.execute!=='function')throw new Error('invalid_tool_spec');
 const name=clean(spec.name);
 if(!/^[a-z][a-z0-9_]{2,63}$/.test(name))throw new Error('invalid_tool_name');
 const normalized=Object.freeze({
  name,description:clean(spec.description),parameters:spec.parameters||{type:'object',properties:{},additionalProperties:false},
  scope:spec.scope||'public',risk:spec.risk||'read_only',requiresExplicit:spec.requiresExplicit||null,
  exposeToModel:spec.exposeToModel!==false,execute:spec.execute
 });
 registry.set(name,normalized);return normalized;
}
function publicToolNames(){return [...registry.values()].filter(t=>t.scope==='public'&&t.exposeToModel).map(t=>t.name)}
function toolSchemas(){
 return [...registry.values()].filter(t=>t.scope==='public'&&t.exposeToModel).map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));
}
async function execute(name,args={},meta={}){
 const tool=registry.get(clean(name));
 if(!tool)return {ok:false,error:'tool_not_found',tool:clean(name)};
 if(tool.scope!=='public')return {ok:false,error:'private_relay_required',tool:tool.name};
 const checked=validateArgs(tool,args);
 if(!checked.ok)return {ok:false,error:checked.error,tool:tool.name};
 if(tool.requiresExplicit&&!tool.requiresExplicit.test(norm(meta?.userMessage||'')))return {ok:false,error:'explicit_user_intent_required',tool:tool.name};
 const started=Date.now();
 emit('gthink.tool.started',{tool:tool.name,risk:tool.risk});
 try{
  const result=await tool.execute(checked.args,meta);
  const out=result&&typeof result==='object'?result:{ok:true,result};
  emit('gthink.tool.completed',{tool:tool.name,ok:out.ok!==false,durationMs:Date.now()-started});
  return {tool:tool.name,...out};
 }catch(error){
  const err=clean(error?.message||error)||'tool_failed';
  emit('gthink.tool.failed',{tool:tool.name,error:err,durationMs:Date.now()-started});
  return {ok:false,error:err,tool:tool.name};
 }
}
function quickClassify(message){
 const n=norm(message);
 if(!n)return null;
 if(/\b(check ?up|checkup|bilan|verification generale|controle general)\b/.test(n))return 'gvault_best_functional_checkup';
 if(/\b(compare|comparaison|compare moi|difference entre)\b/.test(n)&&/\b(projet|project|gvault|vault)\b/.test(n))return 'gvault_compare_projects';
 if(/\b(cherche|trouve|liste|quel projet|quels projets|projets)\b/.test(n)&&/\b(projet|projects?|gvault|vault)\b/.test(n))return 'gvault_search_projects';
 if(/\b(contexte actuel|ce que je regarde|ou je suis)\b/.test(n))return 'gvault_current_context';
 if(/^[0-9+\-*/%.()^\s]+$/.test(clean(message))&&/[0-9]/.test(message))return 'local_calculate';
 if(/\b(etat de l agent|statut de l agent|etat du relais|provider status|etat gthink)\b/.test(n))return 'runtime_status';
 return null;
}

registerTool({
 name:'gvault_search_projects',
 description:'Recherche des projets dans la projection publique vérifiée de GVAULT. Utiliser pour retrouver ou lister un projet sans exposer de contenu privé.',
 parameters:{type:'object',properties:{query:{type:'string',maxLength:240},limit:{type:'integer'}},required:['query'],additionalProperties:false},
 execute:({query,limit})=>searchProjects(query,limit||5)
});
registerTool({
 name:'gvault_project_details',
 description:'Retourne les détails publics vérifiés du projet GVAULT le plus proche de la requête.',
 parameters:{type:'object',properties:{query:{type:'string',maxLength:240}},required:['query'],additionalProperties:false},
 execute:({query})=>projectDetails(query)
});
registerTool({
 name:'gvault_compare_projects',
 description:'Compare deux projets GVAULT à partir du catalogue public vérifié.',
 parameters:{type:'object',properties:{left:{type:'string',maxLength:200},right:{type:'string',maxLength:200}},required:['left','right'],additionalProperties:false},
 execute:({left,right})=>compareProjects(left,right)
});
registerTool({
 name:'gvault_current_context',
 description:'Lit seulement le contexte visible de la page publique VAULT AGENT // LIGHT et les projets publics visibles.',
 parameters:{type:'object',properties:{},additionalProperties:false},
 execute:()=>currentContext()
});
registerTool({
 name:'gvault_best_functional_checkup',
 description:'Lance le check-up public GThink avec la méthode Best Functional du 1er septembre. À appeler seulement si l’utilisateur demande explicitement un check-up, bilan ou contrôle.',
 parameters:{type:'object',properties:{message:{type:'string',maxLength:500}},additionalProperties:false},
 risk:'controlled_action',requiresExplicit:/\b(check ?up|checkup|bilan|verif|verification|controle)\b/,
 execute:bestFunctionalCheckup
});
registerTool({
 name:'local_calculate',
 description:'Calcule une expression arithmétique locale sans l’envoyer à un service externe.',
 parameters:{type:'object',properties:{expression:{type:'string',maxLength:180}},required:['expression'],additionalProperties:false},
 execute:({expression})=>safeCalculate(expression)
});
registerTool({
 name:'local_time',
 description:'Donne l’heure et le fuseau vus par le navigateur actuel.',
 parameters:{type:'object',properties:{},additionalProperties:false},
 execute:()=>localTime()
});
registerTool({
 name:'runtime_status',
 description:'Retourne l’état public du Tool Bus, du relais IA, du réseau et du check-up sans lire de secret.',
 parameters:{type:'object',properties:{},additionalProperties:false},
 execute:()=>runtimeStatus()
});

window.GTHINK_UNIVERSAL_TOOL_BUS=Object.freeze({
 schema:SCHEMA,version:VERSION,registerTool,execute,toolSchemas,publicToolNames,quickClassify,
 searchProjects,projectDetails,compareProjects,currentContext,safeCalculate,knowledge,bestOf,
 status:runtimeStatus,
 policy:Object.freeze({
  explicitUserIntentFirst:true,methodRouterCanonical:true,gvaultLocalFirst:true,publicOnly:true,
  privateActionsRequireSecureRelay:true,derivedIndexesSupportOnly:true,noFakePass:true
 }),
 __test:Object.freeze({norm,validateArgs,safeCalculate,quickClassify})
});
emit('gthink.toolbus.ready',{tools:publicToolNames(),policy:'BEST_OF_20260824_20260908'});
})();