(()=>{'use strict';
const SCHEMA='GVAULT_BLOB_URI_V2';
const PREFIX='blob://';
const current=document.currentScript?.src||location.href;
const SCRIPT_BASE=new URL('.',current);
const SITE_ROOT=new URL('../',SCRIPT_BASE);
const OPEN_EVENT='gvault:blob-uri:open';
function fail(uri,error){return Object.freeze({ok:false,schema:SCHEMA,uri:String(uri??''),error})}
function parse(uri){const raw=String(uri??'').trim();if(!raw.startsWith(PREFIX))return fail(raw,'not_blob_uri');const tail=raw.slice(PREFIX.length);const cut=tail.indexOf('/');const scope=(cut<0?tail:tail.slice(0,cut)).trim().toLowerCase();const path=cut<0?'':tail.slice(cut+1);if(!scope)return fail(raw,'missing_scope');return {ok:true,raw,scope,path}}
function publicHref(path){const clean=String(path||'').replace(/^\/+/, '');if(/(^|\/)\.\.?($|\/)/.test(clean))return null;const normalized=clean.replace(/\/+$/,'').toLowerCase();if(normalized==='gthink')return new URL('blob/public/gthink/',SITE_ROOT).href;const url=new URL(clean||'./',SITE_ROOT);if(url.origin!==location.origin)return null;if(!url.pathname.startsWith(SITE_ROOT.pathname))return null;return url.href}
function resolve(uri){const p=parse(uri);if(!p.ok)return p;if(p.scope==='public'){const href=publicHref(p.path);return href?Object.freeze({ok:true,schema:SCHEMA,uri:p.raw,scope:p.scope,kind:'public-url',href,bridge:p.path.replace(/\/+$/,'').toLowerCase()==='gthink'}):fail(p.raw,'public_path_denied')}
if(p.scope==='id'){const id=decodeURIComponent(p.path||'').trim();if(!id)return fail(p.raw,'missing_blob_id');const api=window.GVAULT_AGENT_LIVE_BLOB;const blob=(api?.hearLast?.(128)||[]).find(x=>x?.blobId===id)||null;return blob?Object.freeze({ok:true,schema:SCHEMA,uri:p.raw,scope:p.scope,kind:'blob-record',blob}):fail(p.raw,'blob_not_accessible')}
if(p.scope==='stream'){const name=(p.path||'').replace(/^\/+|\/+$/g,'').toLowerCase();if(name!=='gthink')return fail(p.raw,'stream_not_accessible');const api=window.GVAULT_AGENT_LIVE_BLOB;return Object.freeze({ok:true,schema:SCHEMA,uri:p.raw,scope:p.scope,kind:'stream',name:'gthink',streamUrl:api?.streamUrl||'gvault://blobs/public/gthink/stream'})}
return fail(p.raw,'scope_not_accessible')}
function announce(result){try{window.dispatchEvent(new CustomEvent(OPEN_EVENT,{detail:result}))}catch{}try{window.GVAULT_AGENT_LIVE_BLOB?.speak?.({schema:'GVAULT_UNIVERSAL_BLOB_V1',kind:'blob.uri.open',role:'router',from:'blob-uri',to:'public.bus',intent:'resolve_accessible_blob_uri',payload:result,streamUrl:window.GVAULT_AGENT_LIVE_BLOB?.streamUrl,silent:true})}catch{}return result}
function open(uri,{target='_self'}={}){const result=announce(resolve(uri));if(!result.ok)return result;if(result.kind==='public-url'){if(target==='_self')location.href=result.href;else window.open(result.href,target,'noopener');return result}if(result.kind==='stream'){try{window.GVAULT_AGENT_LIVE_BLOB?.probeResponder?.()}catch{}return result}return result}
function isBlobVirtualHref(value){return typeof value==='string'&&value.trim().startsWith(PREFIX)}
document.addEventListener('click',e=>{const a=e.target?.closest?.('a');const raw=a?.getAttribute?.('href');if(!isBlobVirtualHref(raw))return;e.preventDefault();open(raw,{target:a.target||'_self'})},true);
window.addEventListener('gvault:open-blob-uri',e=>{const uri=e?.detail?.uri??e?.detail;if(isBlobVirtualHref(uri))open(uri,{target:e?.detail?.target||'_self'})});
window.GVAULT_BLOB_URI=Object.freeze({schema:SCHEMA,prefix:PREFIX,siteRoot:SITE_ROOT.href,resolve,open,examples:Object.freeze(['blob://public/gthink/','blob://public/scripts/gvault-agent-live-blob.js','blob://stream/gthink','blob://id/<blobId>'])});
announce(Object.freeze({ok:true,schema:SCHEMA,kind:'ready',uri:'blob://',scopes:['public','stream','id']}));
})();
