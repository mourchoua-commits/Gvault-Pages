const VERSION='gvault-shell-v1-20260828';
const SHELL_CACHE=`${VERSION}-shell`;
const API_CACHE=`${VERSION}-public-api`;
const SCOPE=self.registration.scope;
const u=p=>new URL(p,SCOPE).href;

const SHELL=[
  './',
  './index.html',
  './essai/private-tool-session-v1.mjs',
  './essai/control-tower/v2.html',
  './essai/control-tower/index.html',
  './essai/control-tower/app-v4.mjs',
  './essai/control-tower/core-v2.mjs',
  './essai/control-tower/encrypted-vfs-v2.mjs',
  './essai/control-tower/source-controls-v1.mjs',
  './essai/control-tower/source-router-v1.mjs',
  './essai/control-tower/public-live-v1.mjs',
  './essai/control-tower/transport-truth-v1.mjs',
  './essai/control-tower/commit-watcher-v1.mjs',
  './essai/control-tower/commit-watcher-core-v1.mjs',
  './essai/gadmin/',
  './essai/gadmin/index.html',
  './essai/gadmin/app.mjs',
  './essai/gadmin/sas-feedback-v2.mjs'
].map(u);

const BASELINE='https://raw.githubusercontent.com/mourchoua-commits/Gvault-Pages/fb5ab4a1d9e7f8d1dc382ce3ac89248c4c44a07d/index.html';
const isPrivateData=url=>url.origin===new URL(SCOPE).origin&&url.pathname.includes('/essai/control-tower/data/');
const isGitHubPublicApi=url=>url.origin==='https://api.github.com'&&/^\/repos\/mourchoua-commits\/(?:Gvault-Pages|GvaultStable)(?:\/|$)/.test(url.pathname);
const isBaseline=url=>url.href.split('?')[0]===BASELINE;
const isGood=r=>!!r&&r.ok&&r.status>=200&&r.status<400;

async function putSafe(cacheName,key,response){
  if(!isGood(response))return;
  try{const c=await caches.open(cacheName);await c.put(key,response.clone())}catch{}
}
async function cached(cacheName,request){
  const c=await caches.open(cacheName);
  return c.match(request,{ignoreSearch:true});
}
async function networkWithTimeout(request,ms=4500){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),ms);
  try{return await fetch(request,{signal:ctrl.signal})}finally{clearTimeout(timer)}
}
async function networkFirst(request,cacheName=SHELL_CACHE,ms=4500){
  try{
    const r=await networkWithTimeout(request,ms);
    if(isGood(r)){void putSafe(cacheName,request,r);return r}
    const old=await cached(cacheName,request);
    if(old){void announce('CACHE_FALLBACK',{url:request.url,status:r.status});return old}
    return r;
  }catch(e){
    const old=await cached(cacheName,request);
    if(old){void announce('CACHE_FALLBACK',{url:request.url,error:String(e&&e.name||e)});return old}
    throw e;
  }
}
async function staleWhileRevalidate(request){
  const c=await caches.open(SHELL_CACHE);
  const old=await c.match(request,{ignoreSearch:true});
  const fresh=fetch(request).then(r=>{if(isGood(r))void c.put(request,r.clone());return r}).catch(()=>null);
  if(old)return old;
  const r=await fresh;
  if(r)return r;
  throw new Error('OFFLINE_NO_CACHE');
}
async function announce(type,detail={}){
  try{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const c of clients)c.postMessage({schema:'GVAULT_SW_EVENT_V1',type,at:new Date().toISOString(),...detail})}catch{}
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const c=await caches.open(SHELL_CACHE);
    for(const url of [...SHELL,BASELINE]){
      try{const r=await fetch(url,{cache:'reload'});if(isGood(r))await c.put(url,r.clone())}catch{}
    }
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('gvault-shell-v1-')&&!k.startsWith(VERSION)).map(k=>caches.delete(k)));
    await self.clients.claim();
    await announce('READY',{version:VERSION});
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(isPrivateData(url))return; // encrypted snapshot/VFS path owns its own policy
  if(isGitHubPublicApi(url)){event.respondWith(networkFirst(req,API_CACHE,7000));return}
  if(isBaseline(url)){event.respondWith(networkFirst(req,SHELL_CACHE,5000));return}
  if(url.origin!==new URL(SCOPE).origin)return;
  if(req.mode==='navigate'){event.respondWith(networkFirst(req,SHELL_CACHE,3500));return}
  if(['script','style','worker','font'].includes(req.destination)){event.respondWith(staleWhileRevalidate(req));return}
  event.respondWith(networkFirst(req,SHELL_CACHE,4500));
});

self.addEventListener('message',event=>{
  const d=event.data||{};
  if(d.schema!=='GVAULT_SW_COMMAND_V1')return;
  if(d.command==='STATUS')event.source?.postMessage({schema:'GVAULT_SW_STATUS_V1',version:VERSION,scope:SCOPE});
  if(d.command==='REFRESH_SHELL')event.waitUntil((async()=>{for(const url of [...SHELL,BASELINE]){try{const r=await fetch(url,{cache:'reload'});if(isGood(r))await putSafe(SHELL_CACHE,url,r)}catch{}}await announce('SHELL_REFRESHED',{version:VERSION})})());
});
