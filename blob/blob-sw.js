(()=>{'use strict';
const SCHEMA='GVAULT_BLOB_BRIDGE_SW_V3';
const ROUTE_ID='blob-public-gthink-v3';
const VIRTUAL_URI='blob://public/gthink';
const scopeUrl=new URL(self.registration.scope);
const repoRoot=new URL('../',scopeUrl);
const virtualPath=new URL('public/gthink/',scopeUrl).pathname;
const gthinkBase=new URL('gthink/',repoRoot);
const gthinkIndex=new URL('gthink/index.html',repoRoot);
const hops=['https-entry-blob','virtual-uri-blob','service-worker-router-blob','gthink-document-blob','gthink-stream-blob'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function isVirtualGthink(url){
  if(url.origin!==scopeUrl.origin)return false;
  const p=url.pathname;
  return p===virtualPath||p===virtualPath+'index.html';
}
function injectRoute(html,requestUrl){
  const base=`<base href="${gthinkBase.href}">`;
  const route=JSON.stringify({schema:SCHEMA,routeId:ROUTE_ID,virtualUri:VIRTUAL_URI,browserHref:requestUrl,targetHref:gthinkBase.href,hops});
  const bridge=`<script>window.GVAULT_BLOB_ROUTE=Object.freeze(${route});window.dispatchEvent(new CustomEvent('gvault:blob-route-ready',{detail:window.GVAULT_BLOB_ROUTE}));<\/script>`;
  let out=String(html||'');
  out=out.replace(/gthink-turn-relay\.js\?v=\d+/g,'gthink-turn-relay.js?v=3');
  if(!/<base\b/i.test(out))out=out.replace(/<head([^>]*)>/i,`<head$1>${base}`);
  if(/<\/head>/i.test(out))out=out.replace(/<\/head>/i,`${bridge}</head>`);
  else out=bridge+out;
  return out;
}
function errorDocument(message){
  const direct=gthinkBase.href;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blob route indisponible</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070b;color:#fff;font:16px system-ui;padding:24px}main{max-width:560px}a{color:#9fc0ff}</style><main><h1>Route blob indisponible</h1><p>${String(message||'Erreur de route')}</p><p><a href="${direct}">Ouvrir GThink directement</a></p></main>`;
}
async function serveVirtual(request){
  const incoming=new URL(request.url);
  const target=new URL(gthinkIndex.href);
  target.searchParams.set('via','blob-route-v3');
  target.searchParams.set('route',ROUTE_ID);
  const response=await fetch(target.href,{cache:'no-store',credentials:'omit',redirect:'follow'});
  if(!response.ok){
    return new Response(errorDocument('GThink HTTP '+response.status),{status:502,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
  const html=injectRoute(await response.text(),incoming.href);
  return new Response(html,{status:200,statusText:'OK',headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store, max-age=0',
    'x-gvault-blob-route':ROUTE_ID,
    'x-gvault-blob-schema':SCHEMA,
    'x-gvault-blob-hop':hops.join('>')
  }});
}
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  const url=new URL(event.request.url);
  if(!isVirtualGthink(url))return;
  event.respondWith(serveVirtual(event.request).catch(error=>new Response(errorDocument(error?.message||error),{status:502,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})));
});
})();
