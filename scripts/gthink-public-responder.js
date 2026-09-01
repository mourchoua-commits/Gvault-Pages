(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_RESPONDER_V3';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThink';
const CHANNELS=['gvault.public.blobs.v2','gvault.public.blobs.v1'];
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const PROVIDER_URL=new URL('gthink-provider-blob.js?v=1',SCRIPT_BASE).href;
const HELP=`Je suis GThink sur le stream public GVAULT.\n\nJe reçois les blobs de conversation, garde le fil court de la session et tente d'abord le blob provider distant sécurisé. Si ce provider n'est pas disponible, je peux utiliser un moteur de langage natif du navigateur ou mes réponses locales de secours. La clé du modèle distant n'est jamais placée dans la page publique.`;
let attached=false,heartbeat=null,providerLoad=null;
const bridgeChannels=[];
const handledRequests=new Set();
function uid(prefix='blob'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function clean(value){return String(value??'').trim()}
function lower(value){return clean(value).toLocaleLowerCase('fr-FR')}
function lastHistory(request){return Array.isArray(request?.payload?.history)?request.payload.history.slice(-12):[]}
function recentContext(history){return history.slice(-4).map(x=>`${x?.role==='assistant'?'GThink':'Toi'}: ${clean(x?.content)}`).filter(Boolean).join('\n')}
function isGreeting(t){return /^(salut|bonjour|bonsoir|yo|hey|coucou|hello|wesh|re)[ !?.]*$/i.test(t)}
function isIdentity(t){return /(qui es[- ]?tu|t'es qui|tu es qui|c'est qui gthink|qu.?est[- ]?ce que gthink)/i.test(t)}
function isStatus(t){return /(statut|status|stream|listener|répondant|responder|provider|ça marche|ca marche|fonctionne|fonctionnel)/i.test(t)}
function isHelp(t){return /^(aide|help|commandes?|capacités?|capacit[eé]s?)[ !?.]*$/i.test(t)}
function isThanks(t){return /^(merci|thanks|thx|nickel|parfait|ok merci)[ !?.]*$/i.test(t)}
function simpleMath(text){
 const raw=text.replace(/,/g,'.').replace(/[×x]/g,'*').replace(/÷/g,'/');
 const m=raw.match(/(?:combien fait|calcule|calcul|=)?\s*(-?\d+(?:\.\d+)?(?:\s*[+\-*/%]\s*-?\d+(?:\.\d+)?)+)\s*\??$/i);
 if(!m||!/^[\d\s.+\-*/%]+$/.test(m[1]))return null;
 try{const value=Function(`"use strict";return (${m[1]})`)();return Number.isFinite(value)?`${m[1].replace(/\s+/g,' ')} = ${value}`:null}catch{return null}
}
async function ensureProvider(){
 if(window.GTHINK_PROVIDER_BLOB?.ask)return window.GTHINK_PROVIDER_BLOB;
 if(!providerLoad){providerLoad=new Promise(resolve=>{const s=document.createElement('script');s.src=PROVIDER_URL;s.async=false;s.dataset.gthinkProviderBlob='V1';s.onload=()=>resolve(window.GTHINK_PROVIDER_BLOB||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)}).finally(()=>{providerLoad=null})}
 return providerLoad;
}
async function tryProvider(message,history,request){
 const provider=await ensureProvider();if(!provider?.ask)return null;
 try{const out=await provider.ask(message,history,{parentBlobId:request?.blobId||null,conversationId:request?.conversationId||null});return out?.ok&&clean(out.text)?out:null}catch{return null}
}
async function tryNativeModel(message,history){
 const prompt=`Tu es GThink, l'entité publique de GVAULT qui interprète les blobs de conversation et répond en français. Réponds directement, clairement et sans prétendre avoir accès à des données privées non fournies.\n\nContexte récent:\n${recentContext(history)||'(aucun)'}\n\nMessage:\n${message}`;
 try{if(window.LanguageModel?.create){const session=await window.LanguageModel.create({systemPrompt:'Tu es GThink. Réponds en français, directement et factuellement.'});try{return clean(await session.prompt(prompt))}finally{try{session.destroy?.()}catch{}}}}catch{}
 try{const lm=window.ai?.languageModel;if(lm?.create){const session=await lm.create({systemPrompt:'Tu es GThink. Réponds en français, directement et factuellement.'});try{return clean(await session.prompt(prompt))}finally{try{session.destroy?.()}catch{}}}}catch{}
 try{if(typeof window.applyAgentModel==='function'){const result=await window.applyAgentModel({message,history,persona:'GThink',surface:'gthink-public'});return clean(result?.text||result)}}catch{}
 return '';
}
async function localReply(message,history,api){
 const t=clean(message),l=lower(t);
 if(isGreeting(t))return 'Oui. Je t’écoute.';
 if(isIdentity(t))return 'Je suis GThink. Je reçois ton blob utilisateur, j’interprète la demande et je renvoie ma réponse sur le stream public GVAULT.';
 if(isHelp(t))return HELP;
 if(isThanks(t))return 'Avec plaisir.';
 const math=simpleMath(t);if(math)return math;
 if(/^(quelle heure|il est quelle heure|heure actuelle)/i.test(l))return `Il est ${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date())} sur cet appareil.`;
 if(/^(quel jour|quelle date|date actuelle|on est quel jour)/i.test(l))return `Nous sommes le ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'full'}).format(new Date())} sur cet appareil.`;
 if(isStatus(t)){
  let stream='inconnu',listener='inconnu',provider='inconnu';
  try{const s=await api.status();stream=s.transportReady?'prêt':'indisponible';listener=s.responderReady?'actif':'inactif'}catch{}
  try{const p=await (await ensureProvider())?.status?.();provider=p?.configured?'raccordé':'non raccordé'}catch{}
  return `Stream GThink : ${stream}. Listener : ${listener}. Blob provider : ${provider}.`;
 }
 if(/^(répète|repete|redis)( |$)/i.test(l)){const prev=[...history].reverse().find(x=>x?.role==='assistant'&&clean(x?.content));return prev?clean(prev.content):'Je n’ai pas encore de réponse précédente dans cette session.'}
 if(/^(résume|resume) (notre|la) (conversation|discussion)/i.test(l)){const ctx=recentContext(history);return ctx?`Fil récent :\n${ctx}`:'Il n’y a pas encore assez d’échanges dans cette session pour faire un résumé.'}
 return `J’ai reçu ton blob : « ${t.length>420?t.slice(0,417)+'…':t} ». Le stream fonctionne, mais le blob provider distant n’a pas répondu et aucun moteur de langage natif n’est disponible sur ce navigateur.`;
}
async function responder(request){
 const message=clean(request?.payload?.message||request?.text);if(!message)return {text:'Je n’ai reçu aucun texte à interpréter.'};
 const history=lastHistory(request);
 const remote=await tryProvider(message,history,request);
 if(remote)return {schema:SCHEMA,text:remote.text,engine:remote.engine||'gthink-provider-blob',model:remote.model||null,correlationId:remote.correlationId||null,chroma:null};
 const native=await tryNativeModel(message,history);
 if(native)return {schema:SCHEMA,text:native,engine:'browser-language-model',chroma:null};
 const api=window.GVAULT_AGENT_LIVE_BLOB;
 return {schema:SCHEMA,text:await localReply(message,history,api),engine:'gthink-local-fallback',chroma:null};
}
function readyBlob(){const api=window.GVAULT_AGENT_LIVE_BLOB;if(!api?.speak)return;api.speak({schema:BLOB_SCHEMA,blobId:uid('gthink-listener'),parentBlobId:null,conversationId:'gthink-public-listener',kind:'gthink.listener.ready',role:'gthink',from:NAME,to:'public.bus',intent:'announce_responder_ready',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:api.streamUrl,text:'GThink listener ready',payload:{state:'listener_ready',name:NAME,mode:'blob-provider-orchestrator',schema:SCHEMA,streamUrl:api.streamUrl,providerBlob:window.GTHINK_PROVIDER_BLOB?.schema||null},understoodBy:['GThink','public-kernel','gateway-adapter','public-ui'],silent:true,muted:false})}
function postBridgeResponse(request,result){
 const text=typeof result==='string'?result:clean(result?.text||result?.display);if(!text)return;
 const response={schema:BLOB_SCHEMA,blobId:uid('gthink-response'),parentBlobId:request.blobId||null,conversationId:request.conversationId||'gthink-public',kind:'gateway.response',role:'gthink',from:NAME,to:'public-kernel',intent:'reply',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:request.streamUrl||window.GVAULT_AGENT_LIVE_BLOB?.streamUrl,text,display:text,chroma:result?.chroma||null,understoodBy:['GThink','public-kernel','gateway-adapter','public-ui'],silent:true,muted:false,payload:{text,requestBlobId:request.blobId,response:result,transport:'blob-channel-bridge'}};
 for(const ch of bridgeChannels){try{ch.postMessage(response)}catch{}}
}
async function handleBridgeRequest(request){
 if(!request||request.schema!==BLOB_SCHEMA||request.kind!=='gateway.request'||!request.blobId||handledRequests.has(request.blobId))return;
 handledRequests.add(request.blobId);if(handledRequests.size>256)handledRequests.delete(handledRequests.values().next().value);
 try{postBridgeResponse(request,await responder(request))}catch(e){const error={schema:BLOB_SCHEMA,blobId:uid('gthink-error'),parentBlobId:request.blobId,conversationId:request.conversationId||'gthink-public',kind:'error',role:'gthink',from:NAME,to:'public-ui',intent:'report_error',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl,text:String(e?.message||e),payload:{error:String(e?.message||e),requestBlobId:request.blobId,transport:'blob-channel-bridge'},understoodBy:['GThink','public-kernel','public-ui'],silent:true,muted:false};for(const ch of bridgeChannels){try{ch.postMessage(error)}catch{}}}
}
function attachBridge(){if(bridgeChannels.length)return;for(const name of CHANNELS){try{const ch=new BroadcastChannel(name);ch.onmessage=e=>void handleBridgeRequest(e.data);bridgeChannels.push(ch)}catch{}}}
function attach(){
 if(attached)return true;const api=window.GVAULT_AGENT_LIVE_BLOB;if(!api?.registerResponder)return false;
 attachBridge();api.registerResponder(responder,NAME);readyBlob();heartbeat=setInterval(readyBlob,8000);attached=true;void ensureProvider();
 window.GTHINK_PUBLIC_RESPONDER=Object.freeze({schema:SCHEMA,name:NAME,engine:'provider-native-local',attached:true,transport:'blob-channel-bridge',get providerBlob(){return window.GTHINK_PROVIDER_BLOB?.schema||null}});return true;
}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>200)clearInterval(timer)},50)}
})();
