(()=>{'use strict';
const SCHEMA='GTHINK_PROVIDER_FEDERATION_V2';
const VERSION='2.0.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const HF_CLIENT_ID=new URL('../.well-known/oauth-cimd',SCRIPT_BASE).href;
const HF_CALLBACK=new URL('../oauth/huggingface-callback.html',SCRIPT_BASE).href;
const OR_CALLBACK=new URL('../oauth/openrouter-callback.html',SCRIPT_BASE).href;
const HF_CHAT='https://router.huggingface.co/v1/chat/completions';
const OR_CHAT='https://openrouter.ai/api/v1/chat/completions';
const LEGACY_URL=new URL('gthink-provider-blob.js?v=2',SCRIPT_BASE).href;
const TOOLBUS_URL=new URL('gthink-universal-tool-bus.js?v=1',SCRIPT_BASE).href;
const STORE=Object.freeze({
 hfToken:'gvault.provider.hf.access.v1',hfExpiry:'gvault.provider.hf.expiry.v1',
 hfVerifier:'gvault.provider.hf.pkce.verifier.v1',hfState:'gvault.provider.hf.oauth.state.v1',
 orKey:'gvault.provider.openrouter.key.v1',orVerifier:'gvault.provider.openrouter.pkce.verifier.v1',
 orState:'gvault.provider.openrouter.oauth.state.v1',returnUrl:'gvault.provider.oauth.return.v1'
});
const SYSTEM=`Tu es un renfort public de GThink, pas son remplaçant. Réponds en français naturel et directement. L'intention explicite de l'utilisateur est prioritaire. Quand des outils sont fournis, utilise-les si leur résultat est nécessaire au lieu d'inventer. Un modèle ne réalise jamais lui-même une action : il demande un outil, l'application l'exécute et te rend le résultat. N'affirme jamais qu'une action, un check-up, une recherche, une lecture ou une modification a été effectuée sans résultat d'outil qui le prouve. Le catalogue et les outils GVAULT reçus ici sont des projections publiques seulement. Tu n'as aucun accès au GVAULT privé, aux secrets, aux dépôts privés, aux comptes externes non autorisés ni au raisonnement caché. Une action privée exige un relais sécurisé séparé. Les index/cadastres dérivés ne peuvent pas remplacer le Method Router canonique. Si l'information doit être actuelle, utilise le web quand il est disponible ou dis clairement que tu ne l'as pas vérifiée.`;
const LIVE_RX=/\b(aujourd['’]?hui|maintenant|actuel(?:le|les|s)?|actualité|actualite|news|derni[eè]re?s?|latest|current|live|en ce moment|ce matin|ce soir|prix|cours|bourse|score|m[eé]t[eé]o|sorti|sortie|vient de|internet|sur le web|en ligne|cherche(?:r)? sur internet|v[eé]rifie(?:r)? sur internet|recherche web)\b/i;
const SIMPLE_RX=/^(salut|bonjour|bonsoir|yo|hey|coucou|hello|merci|ok|okay|d['’]?accord|oui|non|nan|ça va|ca va|tu vas bien|tout va bien|attends?|go)[ !?.]*$/i;
let legacyLoad=null,toolBusLoad=null;

function clean(v){return String(v??'').trim()}
function sget(k){try{return sessionStorage.getItem(k)||''}catch{return''}}
function sset(k,v){try{sessionStorage.setItem(k,String(v));return true}catch{return false}}
function sdel(k){try{sessionStorage.removeItem(k)}catch{}}
function b64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomVerifier(){return b64url(crypto.getRandomValues(new Uint8Array(48)))}
async function challenge(verifier){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));return b64url(new Uint8Array(digest))}
function safeReturn(){const raw=clean(sget(STORE.returnUrl));if(raw){try{const u=new URL(raw,location.href);if(u.origin===location.origin)return u.href}catch{}}return new URL('../',SCRIPT_BASE).href}
function hfToken(){const token=clean(sget(STORE.hfToken)),expiry=Number(sget(STORE.hfExpiry)||0);if(!token)return'';if(expiry&&Date.now()>expiry-30000){sdel(STORE.hfToken);sdel(STORE.hfExpiry);return''}return token}
function orKey(){return clean(sget(STORE.orKey))}
function needsLiveWeb(text){return LIVE_RX.test(clean(text))}
function shouldFederate(text){const t=clean(text);return !!t&&!SIMPLE_RX.test(t)}

function emit(kind,payload={}){try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`federation-${crypto.randomUUID?.()||Date.now()}`,parentBlobId:null,conversationId:'gthink-provider-federation',kind,role:'provider',from:'GThinkProviderFederation',to:'public.bus',intent:'public_provider_federation',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl||'gvault://blobs/public/gthink/stream',payload:{schema:SCHEMA,version:VERSION,...payload,containsSecret:false},understoodBy:['GThink','MethodRouter','public-kernel','provider-router','tool-bus'],silent:true,muted:false})}catch{}}

function historyMessages(history){return(Array.isArray(history)?history:[]).slice(-12).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content).slice(0,4000)})).filter(x=>x.content)}
function contentText(content){if(typeof content==='string')return clean(content);if(Array.isArray(content))return clean(content.map(x=>typeof x==='string'?x:x?.text||x?.content||'').filter(Boolean).join('\n'));return clean(content?.text||content?.content)}
async function fetchJson(url,options,timeout=40000){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{...options,signal:ctrl.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(clean(data?.error?.message||data?.error||data?.message)||`http_${r.status}`);return data}finally{clearTimeout(timer)}}

function loadToolBus(){
 if(window.GTHINK_UNIVERSAL_TOOL_BUS?.toolSchemas)return Promise.resolve(window.GTHINK_UNIVERSAL_TOOL_BUS);
 if(toolBusLoad)return toolBusLoad;
 toolBusLoad=new Promise(resolve=>{
  const existing=document.querySelector('script[data-gthink-toolbus-v1]');
  if(existing){const start=Date.now(),tick=()=>window.GTHINK_UNIVERSAL_TOOL_BUS?.toolSchemas?resolve(window.GTHINK_UNIVERSAL_TOOL_BUS):Date.now()-start>7000?resolve(null):setTimeout(tick,35);tick();return}
  const s=document.createElement('script');s.src=TOOLBUS_URL;s.async=false;s.setAttribute('data-gthink-toolbus-v1','1');s.onload=()=>resolve(window.GTHINK_UNIVERSAL_TOOL_BUS||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)
 }).finally(()=>{toolBusLoad=null});
 return toolBusLoad;
}
function toolCalls(msg){return Array.isArray(msg?.tool_calls)?msg.tool_calls:[]}
function safeArgs(raw){if(raw&&typeof raw==='object')return raw;try{const x=JSON.parse(clean(raw)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return null}}
async function runClientTools(bus,calls,userMessage,provider,round){
 const messages=[],trace=[];
 for(const call of calls){
  const name=clean(call?.function?.name),args=safeArgs(call?.function?.arguments);
  let result;
  if(!name)result={ok:false,error:'tool_name_missing'};
  else if(args===null)result={ok:false,error:'tool_arguments_invalid_json',tool:name};
  else if(!bus?.execute)result={ok:false,error:'tool_bus_unavailable',tool:name};
  else result=await bus.execute(name,args,{userMessage,provider,round,toolCallId:clean(call?.id)});
  trace.push({id:clean(call?.id),name,ok:result?.ok!==false,error:result?.error||null});
  messages.push({role:'tool',tool_call_id:clean(call?.id)||`call-${round}-${messages.length}`,name:name||undefined,content:JSON.stringify(result)});
 }
 return {messages,trace};
}
function annotationSources(message){
 const annotations=Array.isArray(message?.annotations)?message.annotations:[],seen=new Set(),out=[];
 for(const item of annotations){const c=item?.url_citation||item?.citation||item,url=clean(c?.url),title=clean(c?.title)||url;if(!/^https?:\/\//i.test(url)||seen.has(url))continue;seen.add(url);out.push({title,url});if(out.length>=6)break}
 return out;
}
function appendSources(text,sources){if(!sources?.length)return text;return `${text}\n\nSources web :\n${sources.map((s,i)=>`${i+1}. ${s.title} — ${s.url}`).join('\n')}`}

async function chatToolLoop({provider,endpoint,token,model,text,history,live=false,extraHeaders={}}){
 const bus=await loadToolBus();
 const clientTools=bus?.toolSchemas?.()||[];
 const messages=[{role:'system',content:SYSTEM},...historyMessages(history),{role:'user',content:text}];
 const trace=[];
 for(let round=0;round<4;round++){
  const tools=[...clientTools];
  if(provider==='openrouter'&&live){tools.push({type:'openrouter:web_search'});tools.push({type:'openrouter:web_fetch'})}
  const body={model,messages,temperature:.3,max_tokens:1500,stream:false};
  if(tools.length){body.tools=tools;body.tool_choice='auto';body.parallel_tool_calls=false}
  const data=await fetchJson(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...extraHeaders},body:JSON.stringify(body)},45000);
  const msg=data?.choices?.[0]?.message||{};
  const calls=toolCalls(msg);
  if(!calls.length){
   const raw=contentText(msg.content);
   if(!raw)throw new Error(`${provider}_empty_output`);
   const sources=provider==='openrouter'&&live?annotationSources(msg):[];
   return {ok:true,text:appendSources(raw,sources),provider,model:clean(data?.model)||model,webGrounded:live,sources,toolTrace:trace,toolCalls:trace.length};
  }
  messages.push({role:'assistant',content:msg.content??null,tool_calls:calls});
  const executed=await runClientTools(bus,calls,text,provider,round);
  trace.push(...executed.trace);messages.push(...executed.messages);
 }
 const body={model,messages,temperature:.3,max_tokens:1400,stream:false,tool_choice:'none'};
 const data=await fetchJson(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...extraHeaders},body:JSON.stringify(body)},45000);
 const msg=data?.choices?.[0]?.message||{},raw=contentText(msg.content);
 if(!raw)throw new Error(`${provider}_tool_loop_exhausted`);
 const sources=provider==='openrouter'&&live?annotationSources(msg):[];
 return {ok:true,text:appendSources(raw,sources),provider,model:clean(data?.model)||model,webGrounded:live,sources,toolTrace:trace,toolCalls:trace.length};
}

function hfModels(text){
 const n=clean(text).toLocaleLowerCase('fr-FR');
 if(/\b(code|coder|javascript|python|html|css|sql|bug|debug|programme|programmer|fonction|script)\b/.test(n))return['Qwen/Qwen3-Coder-480B-A35B-Instruct:cheapest','openai/gpt-oss-120b:cheapest'];
 if(/\b(raisonne|raisonnement|preuve|math|physique|science|analyse profonde|d[eé]montr|strategie|architecture)\b/.test(n))return['openai/gpt-oss-120b:cheapest','deepseek-ai/DeepSeek-R1-0528:cheapest'];
 return['openai/gpt-oss-120b:cheapest','zai-org/GLM-4.5:cheapest','deepseek-ai/DeepSeek-R1-0528:cheapest'];
}
async function askHF(text,history){
 const token=hfToken();if(!token)return{ok:false,error:'hf_not_connected'};
 if(needsLiveWeb(text))return{ok:false,error:'hf_no_live_web'};
 let lastError='hf_no_model';
 for(const model of hfModels(text)){
  try{
   const out=await chatToolLoop({provider:'huggingface',endpoint:HF_CHAT,token,model,text,history,live:false});
   emit('gthink.provider.federation.response',{provider:'huggingface',model:out.model,toolCalls:out.toolCalls});return out;
  }catch(error){lastError=clean(error?.message||error);if(/401|token|unauthor/i.test(lastError)){sdel(STORE.hfToken);sdel(STORE.hfExpiry);break}}
 }
 emit('gthink.provider.federation.error',{provider:'huggingface',error:lastError});return{ok:false,error:lastError||'hf_failed'};
}
async function askOpenRouter(text,history){
 const key=orKey();if(!key)return{ok:false,error:'openrouter_not_connected'};
 const live=needsLiveWeb(text);
 try{
  const out=await chatToolLoop({provider:'openrouter',endpoint:OR_CHAT,token:key,model:'openrouter/auto',text,history,live,extraHeaders:{'HTTP-Referer':location.origin+location.pathname.replace(/[^/]*$/,''),'X-Title':'GVAULT · GThink Public'}});
  emit('gthink.provider.federation.response',{provider:'openrouter',model:out.model,webGrounded:live,toolCalls:out.toolCalls,sources:out.sources?.length||0});return out;
 }catch(error){
  const err=clean(error?.message||error);if(/401|key|unauthor/i.test(err))sdel(STORE.orKey);
  emit('gthink.provider.federation.error',{provider:'openrouter',error:err});return{ok:false,error:err||'openrouter_failed'};
 }
}
async function loadLegacy(){
 if(window.GTHINK_PROVIDER_BLOB?.ask)return window.GTHINK_PROVIDER_BLOB;
 if(legacyLoad)return legacyLoad;
 legacyLoad=new Promise(resolve=>{const s=document.createElement('script');s.src=LEGACY_URL;s.async=false;s.onload=()=>resolve(window.GTHINK_PROVIDER_BLOB||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)}).finally(()=>{legacyLoad=null});
 return legacyLoad;
}
async function askLocal(text,history,meta={}){
 try{const p=await loadLegacy();if(!p?.ask)return{ok:false,error:'local_provider_unavailable'};const r=await p.ask(text,history,{conversationId:'gthink-provider-federation',parentBlobId:meta?.parentBlobId||null});return r?.ok?{...r,provider:'local-webllm',webGrounded:false}:{ok:false,error:r?.error||'local_provider_failed'}}catch(e){return{ok:false,error:clean(e?.message||e)}}
}
async function ask(message,history=[],meta={}){
 const text=clean(message);if(!text)return{ok:false,error:'empty_message'};
 const live=needsLiveWeb(text);
 emit('gthink.provider.federation.request',{liveWeb:live,hfConnected:!!hfToken(),openRouterConnected:!!orKey(),historyItems:Array.isArray(history)?history.length:0,toolBus:!!window.GTHINK_UNIVERSAL_TOOL_BUS});
 if(live){
  const or=await askOpenRouter(text,history,meta);if(or.ok)return or;
  return{ok:false,error:orKey()?or.error:'live_web_requires_openrouter',needsConnection:'openrouter',webGrounded:false};
 }
 const hf=await askHF(text,history,meta);if(hf.ok)return hf;
 const or=await askOpenRouter(text,history,meta);if(or.ok)return or;
 const local=await askLocal(text,history,meta);if(local.ok)return local;
 return{ok:false,error:[hf.error,or.error,local.error].filter(Boolean).join('|')||'no_provider_available',needsConnection:!hfToken()&&!orKey()?'huggingface_or_openrouter':null};
}

async function connectHuggingFace(){
 const verifier=randomVerifier(),state=randomVerifier().slice(0,32),codeChallenge=await challenge(verifier);
 sset(STORE.hfVerifier,verifier);sset(STORE.hfState,state);sset(STORE.returnUrl,location.href);
 const url=new URL('https://huggingface.co/oauth/authorize');url.searchParams.set('client_id',HF_CLIENT_ID);url.searchParams.set('redirect_uri',HF_CALLBACK);url.searchParams.set('response_type','code');url.searchParams.set('scope','openid profile inference-api');url.searchParams.set('state',state);url.searchParams.set('code_challenge',codeChallenge);url.searchParams.set('code_challenge_method','S256');location.assign(url.href);
}
async function connectOpenRouter(){
 const verifier=randomVerifier(),state=randomVerifier().slice(0,32),codeChallenge=await challenge(verifier);
 sset(STORE.orVerifier,verifier);sset(STORE.orState,state);sset(STORE.returnUrl,location.href);
 const callback=new URL(OR_CALLBACK);callback.searchParams.set('state',state);
 const url=new URL('https://openrouter.ai/auth');url.searchParams.set('callback_url',callback.href);url.searchParams.set('code_challenge',codeChallenge);url.searchParams.set('code_challenge_method','S256');url.searchParams.set('state',state);location.assign(url.href);
}
async function connect(provider){return provider==='openrouter'?connectOpenRouter():connectHuggingFace()}
function disconnect(provider){if(!provider||provider==='huggingface'){sdel(STORE.hfToken);sdel(STORE.hfExpiry)}if(!provider||provider==='openrouter')sdel(STORE.orKey);emit('gthink.provider.federation.state',{state:'disconnected',provider:provider||'all'});return status()}
async function status(){
 let local=null;try{local=await window.GTHINK_PROVIDER_BLOB?.status?.()}catch{}
 const bus=await loadToolBus().catch(()=>null);
 return{schema:SCHEMA,version:VERSION,huggingFace:{connected:!!hfToken(),oauth:'PKCE_PUBLIC',toolCalling:true,federates:['groq','together','fireworks-ai','deepinfra','cerebras','cohere','replicate','zai-org']},openRouter:{connected:!!orKey(),oauth:'PKCE_USER_CONTROLLED_KEY',webSearchReady:!!orKey(),serverTools:['openrouter:web_search','openrouter:web_fetch'],toolCalling:true},local:{eligible:!!navigator.gpu,ready:local?.localReady===true,model:local?.model||'SmolLM2-360M-Instruct-q4f32_1-MLC'},toolBus:{ready:!!bus?.execute,tools:bus?.publicToolNames?.()||[]},routing:{explicitUserIntentFirst:true,gvaultLocalFirst:true,externalMayUsePublicGvaultTools:true,liveWebRequiresOpenRouter:true,privateActionsRequireSecureRelay:true},containsSecret:false};
}
window.GTHINK_PROVIDER_FEDERATION=Object.freeze({schema:SCHEMA,version:VERSION,ask,status,connect,disconnect,needsLiveWeb,shouldFederate,hasCloud:()=>!!hfToken()||!!orKey(),safeReturn,loadToolBus});
void loadToolBus();
emit('gthink.provider.federation.ready',{state:'ready',version:VERSION,hfConnected:!!hfToken(),openRouterConnected:!!orKey(),localEligible:!!navigator.gpu});
})();