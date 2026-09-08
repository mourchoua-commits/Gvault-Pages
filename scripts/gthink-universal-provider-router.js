(()=>{'use strict';
const SCHEMA='GTHINK_UNIVERSAL_PROVIDER_ROUTER_V2';
const VERSION='2.0.0';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=2',SCRIPT_BASE).href;
const TOOLBUS_URL=new URL('gthink-universal-tool-bus.js?v=1',SCRIPT_BASE).href;
let federationLoad=null,toolBusLoad=null;
const wrappedTargets=new WeakSet();
function clean(v){return String(v??'').trim()}
function loadGlobal(url,attr,test){
 return new Promise(resolve=>{
  if(test())return resolve(test());
  const existing=document.querySelector(`script[${attr}]`);
  if(existing){const start=Date.now(),tick=()=>test()?resolve(test()):Date.now()-start>7000?resolve(null):setTimeout(tick,35);tick();return}
  const s=document.createElement('script');s.src=url;s.async=false;s.setAttribute(attr,'1');s.onload=()=>resolve(test()||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)
 });
}
function loadFederation(){
 if(window.GTHINK_PROVIDER_FEDERATION?.ask)return Promise.resolve(window.GTHINK_PROVIDER_FEDERATION);
 if(federationLoad)return federationLoad;
 federationLoad=loadGlobal(FEDERATION_URL,'data-gthink-provider-federation-v2',()=>window.GTHINK_PROVIDER_FEDERATION?.ask?window.GTHINK_PROVIDER_FEDERATION:null).finally(()=>{federationLoad=null});
 return federationLoad;
}
function loadToolBus(){
 if(window.GTHINK_UNIVERSAL_TOOL_BUS?.execute)return Promise.resolve(window.GTHINK_UNIVERSAL_TOOL_BUS);
 if(toolBusLoad)return toolBusLoad;
 toolBusLoad=loadGlobal(TOOLBUS_URL,'data-gthink-provider-toolbus-v1',()=>window.GTHINK_UNIVERSAL_TOOL_BUS?.execute?window.GTHINK_UNIVERSAL_TOOL_BUS:null).finally(()=>{toolBusLoad=null});
 return toolBusLoad;
}
function synthetic(target,text,meta={}){
 const ResponseCtor=target.Response||Response,HeadersCtor=target.Headers||Headers;
 const headers=new HeadersCtor({'content-type':'application/json'});
 return new ResponseCtor(JSON.stringify({schema:'GVAULT_AGENT_CHAT_RESPONSE_V2',ok:true,text,engine:'gthink-provider-federation-v2',model:meta.model||null,provider:meta.provider||null,webGrounded:meta.webGrounded===true,sources:meta.sources||[],toolCalls:meta.toolCalls||0,actionsAuthorized:false,externalPublicOnly:true}),{status:200,headers});
}
function connectionText(result,live){
 if(live||result?.needsConnection==='openrouter')return 'Cette demande a besoin du web actuel. Connecte OpenRouter avec ☁ IA ; ensuite tu continues dans ce même dialogue.';
 return 'Le relais externe n’est pas autorisé dans cette session. Tu peux continuer en local, ou connecter Hugging Face/OpenRouter avec ☁ IA pour le renfort.';
}
function installFetch(target){
 if(!target||wrappedTargets.has(target))return true;
 let nativeFetch;try{nativeFetch=target.fetch.bind(target)}catch{return false}
 const wrapped=async function(input,init){
  let isChat=false,message='',history=[];
  try{
   const url=typeof input==='string'?input:String(input?.url||'');
   const method=String(init?.method||input?.method||'GET').toUpperCase();
   isChat=method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url);
   if(isChat&&typeof init?.body==='string'){const body=JSON.parse(init.body);message=clean(body?.message);history=Array.isArray(body?.history)?body.history.slice(-12):[]}
  }catch{}
  if(isChat&&message){
   const federation=await loadFederation();
   const live=federation?.needsLiveWeb?.(message)===true;
   if(federation?.shouldFederate?.(message)&&(federation?.hasCloud?.()||live)){
    try{
     const result=await federation.ask(message,history,{surface:'vault-agent-light-fetch',toolBus:true});
     if(result?.ok&&clean(result.text))return synthetic(target,clean(result.text),result);
     if(result?.needsConnection&&live)return synthetic(target,connectionText(result,true),{provider:null,webGrounded:false});
    }catch{}
   }
  }
  return nativeFetch(input,init);
 };
 try{target.fetch=wrapped;wrappedTargets.add(target);target.__GTHINK_UNIVERSAL_PROVIDER_ROUTER_V2=true;return true}catch{return false}
}
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b}
async function refreshPanel(){
 const statusEl=document.getElementById('gthinkProviderStatus');if(!statusEl)return;
 const [federation,bus]=await Promise.all([loadFederation(),loadToolBus()]);
 if(!federation){statusEl.textContent='Fédération indisponible';return}
 let s=null;try{s=await federation.status()}catch{}
 const hf=s?.huggingFace?.connected?'HF ✓':'HF ○',or=s?.openRouter?.connected?'WEB ✓':'WEB ○',local=s?.local?.eligible?'LOCAL ✓':'LOCAL ○';
 const count=bus?.publicToolNames?.().length||s?.toolBus?.tools?.length||0;
 statusEl.textContent=`${hf} · ${or} · ${local} · OUTILS ${count}`;
}
function installUI(){
 if(document.getElementById('gthinkProviderCloud'))return;
 const style=document.createElement('style');style.id='gthinkProviderCloudStyle';style.textContent='#gthinkProviderCloud{position:fixed;right:max(10px,env(safe-area-inset-right));top:max(72px,calc(env(safe-area-inset-top) + 72px));z-index:2147483000;font:900 10px/1 ui-monospace,monospace;color:#baffc7;background:rgba(3,12,6,.9);border:1px solid rgba(97,255,133,.45);border-radius:999px;padding:9px 11px;box-shadow:0 8px 28px rgba(0,0,0,.35)}#gthinkProviderPanel{position:fixed;right:max(10px,env(safe-area-inset-right));top:max(112px,calc(env(safe-area-inset-top) + 112px));z-index:2147483001;width:min(300px,calc(100vw - 20px));padding:12px;border:1px solid rgba(97,255,133,.35);border-radius:14px;background:rgba(3,10,5,.96);color:#c9ffd4;box-shadow:0 12px 40px rgba(0,0,0,.5);font:700 10px/1.45 ui-monospace,monospace;display:none}#gthinkProviderPanel.open{display:block}#gthinkProviderPanel b{display:block;margin-bottom:7px}#gthinkProviderStatus{color:#8dd99d;margin-bottom:9px}#gthinkProviderPanel .actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}#gthinkProviderPanel button{border:1px solid rgba(97,255,133,.3);background:#071009;color:#c9ffd4;border-radius:10px;padding:8px;font:800 9px ui-monospace,monospace}#gthinkProviderPanel small{display:block;margin-top:8px;color:#6ea57b;line-height:1.35}';(document.head||document.documentElement).appendChild(style);
 const cloud=document.createElement('button');cloud.id='gthinkProviderCloud';cloud.type='button';cloud.textContent='☁ IA';cloud.title='Renfort IA et Tool Bus publics';document.body.appendChild(cloud);
 const panel=document.createElement('div');panel.id='gthinkProviderPanel';panel.innerHTML='<b>RENFORT IA PUBLIC</b><div id="gthinkProviderStatus">Lecture…</div><div class="actions"></div><small>LIGHT reste la surface. GThink choisit la route ; le Tool Bus exécute seulement les capacités publiques autorisées. Tokens en session uniquement. Les actions privées exigent un relais sécurisé séparé.</small>';document.body.appendChild(panel);
 const actions=panel.querySelector('.actions');
 actions.appendChild(button('Hugging Face',async()=>{const f=await loadFederation();await f?.connect?.('huggingface')}));
 actions.appendChild(button('OpenRouter',async()=>{const f=await loadFederation();await f?.connect?.('openrouter')}));
 actions.appendChild(button('Déconnecter',async()=>{const f=await loadFederation();await f?.disconnect?.();await refreshPanel()}));
 actions.appendChild(button('Actualiser',()=>refreshPanel()));
 cloud.addEventListener('click',()=>{panel.classList.toggle('open');void refreshPanel()});void refreshPanel();
}
function install(){
 installFetch(window);
 try{const frame=document.getElementById('gvaultRuntime');if(frame?.contentWindow)installFetch(frame.contentWindow)}catch{}
 if(document.body)installUI();
}
void Promise.all([loadToolBus(),loadFederation()]).then(()=>install());
install();let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>600)clearInterval(timer)},150);window.addEventListener('pageshow',install);
window.GTHINK_UNIVERSAL_PROVIDER_ROUTER=Object.freeze({schema:SCHEMA,version:VERSION,install,status:async()=>{const [f,b]=await Promise.all([loadFederation(),loadToolBus()]);return{schema:SCHEMA,version:VERSION,federation:await f?.status?.(),toolBus:b?.publicToolNames?.()||[],windowFetch:wrappedTargets.has(window)}}});
})();