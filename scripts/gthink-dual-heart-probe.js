(()=>{'use strict';
const SCHEMA='GTHINK_DUAL_HEART_PROBE_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const KNOWLEDGE_URL=new URL('../gthink/second-kernel/blob/second-kernel-adapter.js?v=1',SCRIPT_BASE).href;
let knowledgeLoad=null,lastRun=null;
function clean(v){return String(v??'').trim()}
function uid(prefix='dual-heart'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB||null}
async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text??'')));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function emit(kind,payload={},parentBlobId=null){const a=api();if(!a?.speak)return null;return a.speak({schema:BLOB_SCHEMA,blobId:uid('dual-heart-blob'),parentBlobId,conversationId:payload.probeId||'gthink-dual-heart-probe',kind,role:'qa',from:'GThinkDualHeartProbe',to:'public.bus',intent:'parallel_dual_kernel_probe',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages:gthink/index.html',streamUrl:a.streamUrl,text:payload.text,payload:{...payload,probeSchema:SCHEMA},understoodBy:['GThink','GThinkDualRouterMark','primary-kernel','second-kernel','playwright','qa'],silent:true,muted:false})}
function tokens(text){return new Set(clean(text).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>1))}
function compareTexts(a,b){const A=tokens(a),B=tokens(b);if(!clean(a)||!clean(b))return {score:0,verdict:'INCONCLUSIVE'};let shared=0;for(const x of A)if(B.has(x))shared++;const union=new Set([...A,...B]).size||1,score=shared/union;return {score:Number(score.toFixed(4)),verdict:score>=.66?'CONVERGENT':score>=.24?'COMPLEMENTARY':'DIVERGENT'}}
function snapshotUi(){const ids=['answerLabel','status','gatewayTrace','answer'];const s={};for(const id of ids){const el=document.getElementById(id);if(el)s[id]={text:el.textContent,hidden:el.hidden,className:el.className}}return s}
function restoreUi(s){for(const [id,v] of Object.entries(s||{})){const el=document.getElementById(id);if(!el)continue;el.textContent=v.text;el.hidden=v.hidden;el.className=v.className}}
function withTimeout(p,ms,label){return Promise.race([Promise.resolve(p),new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+'_timeout')),ms))])}
async function loadKnowledge(){if(window.GTHINK_SECOND_KERNEL_KNOWLEDGE?.contextForTask)return window.GTHINK_SECOND_KERNEL_KNOWLEDGE;if(knowledgeLoad)return knowledgeLoad;knowledgeLoad=import(KNOWLEDGE_URL).then(async mod=>{const k=mod?.secondKernelKnowledge||window.GTHINK_SECOND_KERNEL_KNOWLEDGE||null;try{await k?.ready?.()}catch{}return k}).finally(()=>{knowledgeLoad=null});return knowledgeLoad}
async function waitReady(timeout=8000){const started=Date.now();while(Date.now()-started<timeout){const primary=window.GTHINK_PUBLIC_RESPONDER,secondary=window.GTHINK_PUBLIC_NATIVE_ENGINE;if(primary?.respond&&secondary?.answer&&api()?.speak)return {primary,secondary};await new Promise(r=>setTimeout(r,40))}throw new Error('gthink_dual_heart_not_ready')}
async function secondaryContext(message,probeId,history){const k=await loadKnowledge();if(!k?.contextForTask)return {schema:'gthink.second-kernel.task-packet.unavailable',knowledge:{branches:{},errors:['knowledge_adapter_unavailable']}};try{return await k.contextForTask({taskId:probeId,intent:'parallel_dual_heart_probe',requestedFunction:'compare_primary_and_secondary_same_input',message,text:message,constraints:['same-input','parallel-start','preserve-independent-results','no-result-fusion','public-qa']})}catch(e){return {schema:'gthink.second-kernel.task-packet.error',error:clean(e?.message||e),knowledge:{branches:{},errors:[clean(e?.message||e)]}}}
function resultText(r){return clean(typeof r==='string'?r:r?.text||r?.display)}
async function run(message,{history=[],timeoutMs=18000,restoreUI=true}={}){
 message=clean(message);if(!message)throw new Error('gthink_dual_heart_empty_message');const {primary,secondary}=await waitReady(),probeId=uid('dual-heart'),messageSha256=await sha256(message),ui=snapshotUi();
 const context=await secondaryContext(message,probeId,history),base={schema:'GTHINK_DUAL_HEART_INPUT_V1',probeId,message,messageSha256,history:Array.isArray(history)?history.slice(-12):[],startedAt:new Date().toISOString()};
 const primaryRequest={schema:BLOB_SCHEMA,blobId:`${probeId}-primary`,parentBlobId:probeId,conversationId:probeId,kind:'gateway.request',role:'gateway',from:'GThinkDualHeartProbe',to:'GThinkPrimary',intent:'parallel_probe',text:message,payload:{message,history:base.history,dualHeartProbe:{probeId,messageSha256,heart:'primary'}}};
 const secondaryRequest={schema:BLOB_SCHEMA,blobId:`${probeId}-secondary`,parentBlobId:probeId,conversationId:probeId,kind:'gateway.request',role:'gateway',from:'GThinkDualHeartProbe',to:'GThinkSecondary',intent:'parallel_probe',text:message,payload:{message,history:base.history,secondKernelContext:context,dualHeartProbe:{probeId,messageSha256,heart:'secondary'}}};
 emit('gthink.dual-heart.start',{probeId,messageSha256,messageBytes:new TextEncoder().encode(message).byteLength,hearts:['primary','secondary'],policy:'SAME_INPUT_PARALLEL_SEALED_COMPARE_NO_FUSION'},probeId);
 let pStarted=0,sStarted=0;const launchAt=performance.now();
 const pPromise=(async()=>{pStarted=performance.now();return withTimeout(primary.respond(primaryRequest),timeoutMs,'primary')})();
 const sPromise=(async()=>{sStarted=performance.now();return withTimeout(secondary.answer(secondaryRequest),timeoutMs,'secondary')})();
 const [pSet,sSet]=await Promise.allSettled([pPromise,sPromise]);
 const primaryRecord=pSet.status==='fulfilled'?{ok:true,text:resultText(pSet.value),engine:pSet.value?.engine||null,model:pSet.value?.model||null,transport:pSet.value?.transport||null}:{ok:false,error:clean(pSet.reason?.message||pSet.reason)};
 const secondaryRecord=sSet.status==='fulfilled'?{ok:true,text:resultText(sSet.value),engine:sSet.value?.engine||null,model:sSet.value?.model||null,knowledgeAware:sSet.value?.knowledgeAware===true,conversationIntent:sSet.value?.conversationIntent||null}:{ok:false,error:clean(sSet.reason?.message||sSet.reason)};
 primaryRecord.ok=primaryRecord.ok&&!!primaryRecord.text;secondaryRecord.ok=secondaryRecord.ok&&!!secondaryRecord.text;
 const startDeltaMs=Math.abs(pStarted-sStarted),comparison=primaryRecord.ok&&secondaryRecord.ok?compareTexts(primaryRecord.text,secondaryRecord.text):{score:0,verdict:'INCONCLUSIVE'};
 emit('gthink.dual-heart.primary.sealed',{probeId,messageSha256,...primaryRecord},probeId);
 emit('gthink.dual-heart.secondary.sealed',{probeId,messageSha256,...secondaryRecord,knowledgeBranches:Object.keys(context?.knowledge?.branches||{})},probeId);
 const result={schema:SCHEMA,probeId,message,messageSha256,parallel:{launchAtMs:Number(launchAt.toFixed(3)),primaryStartedAtMs:Number(pStarted.toFixed(3)),secondaryStartedAtMs:Number(sStarted.toFixed(3)),startDeltaMs:Number(startDeltaMs.toFixed(3)),sameTick:startDeltaMs<5},primary:primaryRecord,secondary:secondaryRecord,comparison:{...comparison,noFusion:true,noVote:true,independentSeals:true},bothSucceeded:primaryRecord.ok&&secondaryRecord.ok,completedAt:new Date().toISOString()};
 emit('gthink.dual-heart.compare',{probeId,messageSha256,parallel:result.parallel,primaryOk:primaryRecord.ok,secondaryOk:secondaryRecord.ok,comparison:result.comparison},probeId);
 lastRun=result;if(restoreUI)restoreUi(ui);return result
}
async function runSuite(messages,opts={}){const out=[];for(const message of messages)out.push(await run(message,opts));return {schema:'GTHINK_DUAL_HEART_SUITE_V1',count:out.length,passed:out.filter(x=>x.bothSucceeded).length,runs:out}}
async function status(){let primary=false,secondary=false,knowledge=false;try{primary=!!window.GTHINK_PUBLIC_RESPONDER?.respond;secondary=!!window.GTHINK_PUBLIC_NATIVE_ENGINE?.answer;knowledge=!!(await loadKnowledge())?.contextForTask}catch{}return {schema:SCHEMA,ready:primary&&secondary,primary,secondary,knowledge,sharedStream:api()?.streamUrl||null}}
window.GTHINK_DUAL_HEART_PROBE=Object.freeze({schema:SCHEMA,run,runSuite,status,get lastRun(){return lastRun}});
})();