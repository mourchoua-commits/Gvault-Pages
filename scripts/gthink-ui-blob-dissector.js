(()=>{'use strict';
const SCHEMA='GTHINK_UI_BLOB_DISSECTOR_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const registry=new Map();
let seq=0,api=null,attached=false;
const TARGETS=[
 ['body','surface'],['main','main'],['main > header','header'],['main > header > strong','title'],['#status','status'],
 ['#gthinkKernelChoice','kernel-selector'],['#gthinkKernelChoice button[data-kernel-mode="primary"]','kernel-primary'],['#gthinkKernelChoice button[data-kernel-mode="secondary"]','kernel-secondary'],
 ['#gvaultThemeControl','theme-selector'],['#gvaultThemeControl .gvThemeBlobLabel','theme-label'],['#gvaultThemeSelect','theme-choice'],['#gvaultThemeSelect option','theme-option'],['#gvaultThemeCycle','theme-cycle'],
 ['#stream','stream'],['#userBlob','user-blob'],['#userBlob .label','user-label'],['#userText','user-text'],['#userBlob .composer','composer'],['#input','input'],['#send','send'],
 ['#gthinkBlob','response-blob'],['#answerLabel','response-label'],['#gatewayTrace','gateway-trace'],['#responseWordFlow','response-word-flow'],['#answer','answer'],['#foot','stream-uri']
];
function uid(role){return `ui:${role}:${(++seq).toString(36)}:${crypto.randomUUID?.()||Date.now().toString(36)}`}
function roleFor(el,fallback='element'){return el?.dataset?.blobRole||fallback}
function nearestParent(el){let p=el.parentElement;while(p){const id=p.dataset?.gvaultUiBlobId;if(id)return id;p=p.parentElement}return null}
function emit(el,record){if(!api?.speak)return;api.speak({schema:BLOB_SCHEMA,blobId:`register:${record.blobId}`,parentBlobId:record.parentBlobId,conversationId:'gthink-ui-blobs',kind:'gthink.ui.blob.register',role:'ui-blob-registry',from:'GThinkUIBlobDissector',to:'public.bus',intent:'register_visible_ui_as_blob',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:api.streamUrl,payload:{schema:SCHEMA,uiBlobId:record.blobId,parentUiBlobId:record.parentBlobId,uiRole:record.role,tag:el.tagName?.toLowerCase()||null,domId:el.id||null,interactive:el.matches?.('button,input,textarea,select,option,a')||false,themeId:el.dataset?.themeId||null,kernelMode:el.dataset?.kernelMode||null},understoodBy:['GThink','public-ui','GThinkUIBlobDissector'],silent:true,muted:false})}
function register(el,role='element'){if(!(el instanceof Element))return null;let id=el.dataset.gvaultUiBlobId;if(id&&registry.has(id))return registry.get(id);const r=roleFor(el,role);id=id||uid(r);el.dataset.gvaultUiBlobId=id;el.dataset.gvaultUiBlobRole=r;const record={blobId:id,role:r,parentBlobId:nearestParent(el),element:el};registry.set(id,record);emit(el,record);return record}
function scan(root=document){for(const [selector,role] of TARGETS){let nodes=[];try{if(root instanceof Element&&root.matches(selector))nodes.push(root);nodes.push(...root.querySelectorAll(selector))}catch{}for(const el of nodes)register(el,role)}document.body?.setAttribute('data-ui-blob-count',String(registry.size));window.dispatchEvent(new CustomEvent('gthink:ui-blob-count',{detail:{count:registry.size,schema:SCHEMA}}));return registry.size}
function snapshot(){return [...registry.values()].filter(r=>r.element?.isConnected).map(r=>({blobId:r.blobId,parentBlobId:r.parentBlobId,role:r.role,domId:r.element.id||null,tag:r.element.tagName?.toLowerCase()||null}))}
function attach(){api=window.GVAULT_AGENT_LIVE_BLOB;if(!document.body)return false;scan(document);const observer=new MutationObserver(muts=>{for(const m of muts)for(const n of m.addedNodes)if(n instanceof Element)scan(n);for(const [id,r] of registry)if(!r.element?.isConnected)registry.delete(id);document.body?.setAttribute('data-ui-blob-count',String(registry.size))});observer.observe(document.body,{childList:true,subtree:true});attached=true;window.GTHINK_UI_BLOB_DISSECTOR=Object.freeze({schema:SCHEMA,get count(){return registry.size},scan,snapshot,get attached(){return attached}});return true}
if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>240)clearInterval(timer)},25)}
})();