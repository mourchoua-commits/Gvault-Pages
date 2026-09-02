(()=>{'use strict';
const SCHEMA='GVAULT_BLOB_BRIDGE_SW_V4';
const ROUTE_ID='blob-public-gthink-v4';
const VIRTUAL_URI='blob://public/gthink';
const TERMINAL_404='http-404-blob';
const scopeUrl=new URL(self.registration.scope);
const repoRoot=new URL('../',scopeUrl);
const virtualPath=new URL('public/gthink/',scopeUrl).pathname;
const gthinkBase=new URL('gthink/',repoRoot);
const gthinkIndex=new URL('gthink/index.html',repoRoot);
const hops=['https-entry-blob','virtual-uri-blob','service-worker-router-blob','gthink-document-blob','upstream-fetch-blob','http-status-blob','gthink-stream-blob'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function isVirtualGthink(url){
  if(url.origin!==scopeUrl.origin)return false;
  const p=url.pathname;
  return p===virtualPath||p===virtualPath+'index.html';
}
function injectRoute(html,requestUrl,status){
  const base=`<base href="${gthinkBase.href}">`;
  const route=JSON.stringify({schema:SCHEMA,routeId:ROUTE_ID,virtualUri:VIRTUAL_URI,browserHref:requestUrl,targetHref:gthinkBase.href,hops,upstreamStatus:status,stopCondition:'HTTP_404',terminal404:TERMINAL_404});
  const bridge=`<script>window.GVAULT_BLOB_ROUTE=Object.freeze(${route});window.dispatchEvent(new CustomEvent('gvault:blob-route-ready',{detail:window.GVAULT_BLOB_ROUTE}));<\/script>`;
  let out=String(html||'');
  out=out.replace(/gthink-turn-relay\.js\?v=\d+/g,'gthink-turn-relay.js?v=4');
  if(!/<base\b/i.test(out))out=out.replace(/<head([^>]*)>/i,`<head$1>${base}`);
  if(/<\/head>/i.test(out))out=out.replace(/<\/head>/i,`${bridge}</head>`);
  else out=bridge+out;
  return out;
}
function errorDocument(message,terminal){
  const direct=gthinkBase.href;
  const terminalLine=terminal?`<p><strong>Blob terminal :</strong> ${terminal}</p>`:'';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · Blob terminal</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070b;color:#fff;font:16px system-ui;padding:24px}main{max-width:560px;text-align:center}.code{font:900 clamp(72px,22vw,148px)/.9 ui-monospace,monospace;letter-spacing:-.08em}.blob{margin:22px auto;padding:26px;border-radius:47% 53% 55% 45%/52% 43% 57% 48%;background:radial-gradient(circle at 30% 20%,#5367ff,#1d2844 52%,#080b11 82%);box-shadow:0 24px 70px #0009,inset 0 1px #ffffff38}a{color:#b9caff}code{font-family:ui-monospace,monospace}</style><main><div class="code">404</div><div class="blob"><h1>HTTP 404 atteint</h1><p>${String(message||'Cible introuvable')}</p>${terminalLine}<p><code>HTTPS → blobs → ${TERMINAL_404}</code></p></div><p><a href="${direct}">Ouvrir GThink directement</a></p></main>`;
}
function headersFor(routeHops,status,terminal){
  const h={
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store, max-age=0',
    'x-gvault-blob-route':ROUTE_ID,
    'x-gvault-blob-schema':SCHEMA,
    'x-gvault-blob-hop':routeHops.join('>'),
    'x-gvault-upstream-status':String(status)
  };
  if(terminal)h['x-gvault-blob-terminal']=terminal;
  return h;
}
function terminal404(message){
  const routeHops=[...hops.slice(0,-1),TERMINAL_404];
  return new Response(errorDocument(message||'Arrêt au premier HTTP 404 · la cible suivante est introuvable.',TERMINAL_404),{status:404,statusText:'Not Found',headers:headersFor(routeHops,404,TERMINAL_404)});
}
async function serveVirtual(request){
  const incoming=new URL(request.url);
  if(incoming.searchParams.get('show404')==='1')return terminal404('404 de démonstration demandé · arrêt volontaire au blob terminal.');
  const target=new URL(gthinkIndex.href);
  target.searchParams.set('via','blob-route-v4');
  target.searchParams.set('route',ROUTE_ID);
  const response=await fetch(target.href,{cache:'no-store',credentials:'omit',redirect:'follow'});
  const status=response.status;
  if(status===404)return terminal404();
  if(!response.ok){
    return new Response(errorDocument('GThink HTTP '+status,'http-error-blob'),{status:502,headers:headersFor(hops,status,'http-error-blob')});
  }
  const html=injectRoute(await response.text(),incoming.href,status);
  return new Response(html,{status:200,statusText:'OK',headers:headersFor(hops,status,'')});
}
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  const url=new URL(event.request.url);
  if(!isVirtualGthink(url))return;
  event.respondWith(serveVirtual(event.request).catch(error=>new Response(errorDocument(error?.message||error,'transport-error-blob'),{status:502,headers:headersFor(hops,0,'transport-error-blob')})));
});
})();
