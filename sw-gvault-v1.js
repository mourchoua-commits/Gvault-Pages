const VERSION='gvault-shell-v1-20260902-gthink-client-private-v2';
const SHELL_CACHE=`${VERSION}-shell`;
const API_CACHE=`${VERSION}-public-api`;
const SCOPE=self.registration.scope;
const u=p=>new URL(p,SCOPE).href;

const GTHINK_SHELL=[
  './gthink/',
  './gthink/index.html',
  './scripts/gvault-agent-live-blob.js',
  './scripts/gvault-agent-gateway.json',
  './scripts/gthink-public-private-bridge.js',
  './scripts/gthink-client-private-worker.js',
  './scripts/gthink-mini-listener-swarm.js',
  './scripts/gthink-prelistener-stream-blob.js',
  './scripts/gthink-throughput-guard.js',
  './scripts/gthink-public-responder.js',
  './scripts/gthink-turn-relay.js',
  './scripts/gvault-person-blob.js',
  './blobs/public/gthink-controller-kernel-v1.json',
  './blobs/public/gthink-universal-blob-protocol-v1.json'
].map(u);
const SHELL=[
  './','./index.html','./scripts/gvault-input-relay.js','./scripts/gvault-input-relay-key.v2.json','./scripts/gvault-public-agent-conversation.js',
  ...GTHINK_SHELL,
  './essai/private-tool-session-v1.mjs','./essai/control-tower/v2.html','./essai/control-tower/index.html','./essai/gadmin/','./essai/gadmin/index.html'
].map(x=>typeof x==='string'&&/^https?:/.test(x)?x:u(x));
const BASELINE='https://raw.githubusercontent.com/mourchoua-commits/Gvault-Pages/fb5ab4a1d9e7f8d1dc382ce3ac89248c4c44a07d/index.html';
const scopeOrigin=new URL(SCOPE).origin;
const isPrivateData=url=>url.origin===scopeOrigin&&url.pathname.includes('/essai/control-tower/data/');
const isGitHubPublicApi=url=>url.origin==='https://api.github.com'&&/^\/repos\/mourchoua-commits\/(?:Gvault-Pages|GvaultStable)(?:\/|$)/.test(url.pathname);
const isBaseline=url=>url.href.split('?')[0]===BASELINE;
const isGThinkPath=url=>url.origin===scopeOrigin&&url.pathname.includes('/Gvault-Pages/gthink');
const isGThinkCritical=url=>url.origin===scopeOrigin&&/(?:^|\/)(?:gvault-agent-live-blob|gthink-public-private-bridge|gthink-client-private-worker|gthink-mini-listener-swarm|gthink-prelistener-stream-blob|gthink-throughput-guard|gthink-public-responder|gthink-turn-relay|gvault-person-blob)\.js$/i.test(url.pathname);
const isGatewayConfig=url=>url.origin===scopeOrigin&&/(?:^|\/)gvault-agent-gateway\.json$/i.test(url.pathname);
const isAuthCritical=url=>{if(url.origin!==scopeOrigin)return false;const p=url.pathname;return /(?:^|\/)manifest\.json$/i.test(p)||/(?:^|\/)release-index\.json$/i.test(p)||/\.bin$/i.test(p)||p.includes('/previews/')||p.includes('/private-catalog/')};
const isGood=r=>!!r&&r.ok&&r.status>=200&&r.status<400;
async function putSafe(cacheName,key,response){if(!isGood(response))return;try{const c=await caches.open(cacheName);await c.put(key,response.clone())}catch{}}
async function cached(cacheName,request){const c=await caches.open(cacheName);return c.match(request,{ignoreSearch:true})}
async function networkWithTimeout(request,ms=4500){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),ms);try{return await fetch(request,{signal:ctrl.signal,cache:'no-store'})}finally{clearTimeout(timer)}}
async function networkFirst(request,cacheName=SHELL_CACHE,ms=4500){try{const r=await networkWithTimeout(request,ms);if(isGood(r)){void putSafe(cacheName,request,r);return r}const old=await cached(cacheName,request);if(old){void announce('CACHE_FALLBACK',{url:request.url,status:r.status});return old}return r}catch(e){const old=await cached(cacheName,request);if(old){void announce('CACHE_FALLBACK',{url:request.url,error:String(e&&e.name||e)});return old}throw e}}
async function staleWhileRevalidate(request){const c=await caches.open(SHELL_CACHE),old=await c.match(request,{ignoreSearch:false});const fresh=fetch(request).then(r=>{if(isGood(r))void c.put(request,r.clone());return r}).catch(()=>null);if(old)return old;const r=await fresh;if(r)return r;throw new Error('OFFLINE_NO_CACHE')}
async function injectInputRelay(response){if(!isGood(response))return response;const type=String(response.headers.get('content-type')||'');if(!/text\/html/i.test(type))return response;let html;try{html=await response.clone().text()}catch{return response}if(html.includes('data-gvault-public-input-relay="V3"'))return response;const tag='<script data-gvault-public-input-relay="V3" src="./scripts/gvault-input-relay.js?v=4"></script>',documentEnd=/<\/body>\s*<\/html>\s*$/i;if(!documentEnd.test(html))return response;html=html.replace(documentEnd,tag+'</body>\n</html>');const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers})}
async function announce(type,detail={}){try{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const c of clients)c.postMessage({schema:'GVAULT_SW_EVENT_V1',type,at:new Date().toISOString(),...detail})}catch{}}
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil((async()=>{const c=await caches.open(SHELL_CACHE);for(const url of SHELL){try{const r=await fetch(url,{cache:'reload'});if(isGood(r))await c.put(url,r.clone())}catch{}}})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gvault-shell-v1-')&&!k.startsWith(VERSION)).map(k=>caches.delete(k)));await self.clients.claim();await announce('READY',{version:VERSION,inputRelay:'GVAULT_PUBLIC_INPUT_RELAY_V3',inputRelayMode:'EXPLICIT_ONLY',blobFallback:'DURABLE_LOCAL_QUEUE',agentLiveBlob:'GVAULT_AGENT_LIVE_BLOB_CLIENT_V6',gthinkMiniSwarm:'GTHINK_MINI_LISTENER_SWARM_V6_PRIVATE_RELAY',gthinkThroughputGuard:'GTHINK_THROUGHPUT_GUARD_V3_PRIVATE_BRIDGE',gthinkPublicPrivateBridge:'GTHINK_PUBLIC_PRIVATE_BRIDGE_CLIENT_V2_LOCAL_PRIVATE_FALLBACK',gthinkClientPrivateWorker:'GTHINK_CLIENT_PRIVATE_WORKER_V1',gthinkOfflineOnly:true})})())});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(isPrivateData(url)||isAuthCritical(url))return;if(isGitHubPublicApi(url)){event.respondWith(networkFirst(req,API_CACHE,7000));return}if(isBaseline(url)){event.respondWith(networkFirst(req,SHELL_CACHE,5000));return}if(url.origin!==scopeOrigin)return;if(req.mode==='navigate'){if(isGThinkPath(url)){event.respondWith(networkFirst(req,SHELL_CACHE,3500));return}event.respondWith(networkFirst(req,SHELL_CACHE,3500).then(injectInputRelay));return}if(isGThinkCritical(url)||isGatewayConfig(url)){event.respondWith(networkFirst(req,SHELL_CACHE,5000));return}if(['script','style','worker','font'].includes(req.destination)){event.respondWith(staleWhileRevalidate(req));return}event.respondWith(networkFirst(req,SHELL_CACHE,4500))});
self.addEventListener('message',event=>{const d=event.data||{};if(d.schema!=='GVAULT_SW_COMMAND_V1')return;if(d.command==='STATUS')event.source?.postMessage({schema:'GVAULT_SW_STATUS_V1',version:VERSION,scope:SCOPE,inputRelay:'GVAULT_PUBLIC_INPUT_RELAY_V3',inputRelayMode:'EXPLICIT_ONLY',blobFallback:'DURABLE_LOCAL_QUEUE',agentLiveBlob:'GVAULT_AGENT_LIVE_BLOB_CLIENT_V6',gthinkMiniSwarm:'GTHINK_MINI_LISTENER_SWARM_V6_PRIVATE_RELAY',gthinkThroughputGuard:'GTHINK_THROUGHPUT_GUARD_V3_PRIVATE_BRIDGE',gthinkPublicPrivateBridge:'GTHINK_PUBLIC_PRIVATE_BRIDGE_CLIENT_V2_LOCAL_PRIVATE_FALLBACK',gthinkClientPrivateWorker:'GTHINK_CLIENT_PRIVATE_WORKER_V1',gthinkOfflineOnly:true});if(d.command==='REFRESH_SHELL')event.waitUntil((async()=>{for(const url of SHELL){try{const r=await fetch(url,{cache:'reload'});if(isGood(r))await putSafe(SHELL_CACHE,url,r)}catch{}}await announce('SHELL_REFRESHED',{version:VERSION})})())});
