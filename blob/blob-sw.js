(()=>{'use strict';
const SCHEMA='GVAULT_BLOB_BRIDGE_SW_V1';
const URI='blob://public/gthink';
const scopeUrl=new URL(self.registration.scope);
const repoRoot=new URL('../',scopeUrl);
const virtualPath=new URL('public/gthink/',scopeUrl).pathname;
const realGthink=new URL('gthink/',repoRoot);
const chain=['address-blob','service-worker-blob','document-proxy-blob','gthink-stream-blob'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function isVirtualGthink(url){return url.origin===scopeUrl.origin&&(url.pathname===virtualPath||url.pathname===virtualPath+'index.html')}
function injectBridge(html){const base=`<base href="${realGthink.href}">`;
const bridge=`<script>window.GVAULT_BLOB_ADDRESS=Object.freeze({schema:'${SCHEMA}',uri:'${URI}',hops:${JSON.stringify(chain)},virtualHref:location.href,realHref:${JSON.stringify(realGthink.href)}});window.dispatchEvent(new CustomEvent('gvault:blob-address-ready',{detail:window.GVAULT_BLOB_ADDRESS}));<\/script>`;
let out=String(html||'');
if(!/<base\b/i.test(out))out=out.replace(/<head([^>]*)>/i,`<head$1>${base}`);
return out.replace(/<\/head>/i,`${bridge}</head>`)}
async function serveVirtual(request){
const target=new URL(realGthink.href);const incoming=new URL(request.url);
for(const [k,v] of incoming.searchParams)target.searchParams.set(k,v);
target.searchParams.set('via','blob-sw');target.searchParams.set('blob_uri',URI);
const response=await fetch(target.href,{cache:'no-store',credentials:'same-origin',redirect:'follow'});
if(!response.ok)return response;
const html=injectBridge(await response.text());
const headers=new Headers(response.headers);headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');headers.set('x-gvault-blob-bridge',SCHEMA);headers.set('x-gvault-blob-hop',chain.join('>'));headers.delete('content-length');
return new Response(html,{status:200,statusText:'OK',headers})}
self.addEventListener('fetch',event=>{const request=event.request;if(request.mode!=='navigate')return;const url=new URL(request.url);if(!isVirtualGthink(url))return;event.respondWith(serveVirtual(request).catch(()=>fetch(realGthink.href,{cache:'no-store'})))});
})();
