(()=>{'use strict';
const SCHEMA='GTHINK_UNIVERSAL_PROVIDER_ROUTER_V1';
const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
const FEDERATION_URL=new URL('gthink-provider-federation.js?v=1',SCRIPT_BASE).href;
let federationLoad=null;
const wrappedTargets=new WeakSet();
function clean(v){return String(v??'').trim()}
function loadFederation(){
 if(window.GTHINK_PROVIDER_FEDERATION?.ask)return Promise.resolve(window.GTHINK_PROVIDER_FEDERATION);
 if(federationLoad)return federationLoad;
 federationLoad=new Promise(resolve=>{
   const existing=document.querySelector('script[data-gthink-provider-federation-v1]');
   if(existing){const started=Date.now(),tick=()=>window.GTHINK_PROVIDER_FEDERATION?.ask?resolve(window.GTHINK_PROVIDER_FEDERATION):Date.now()-started>5000?resolve(null):setTimeout(tick,30);tick();return}
   const s=document.createElement('script');s.src=FEDERATION_URL;s.async=false;s.setAttribute('data-gthink-provider-federation-v1','1');s.onload=()=>resolve(window.GTHINK_PROVIDER_FEDERATION||null);s.onerror=()=>resolve(null);(document.head||document.documentElement).appendChild(s)
 }).finally(()=>{federationLoad=null});
 return federationLoad;
}
function synthetic(target,text,meta={}){const ResponseCtor=target.Response||Response,HeadersCtor=target.Headers||Headers;const headers=new HeadersCtor({'content-type':'application/json'});return new ResponseCtor(JSON.stringify({schema:'GVAULT_AGENT_CHAT_RESPONSE_V2',ok:true,text,engine:'gthink-provider-federation',model:meta.model||null,provider:meta.provider||null,webGrounded:meta.webGrounded===true,sources:meta.sources||[],actionsAuthorized:false,externalPublicOnly:true}),{status:200,headers})}
function connectionText(result,live){if(live||result?.needsConnection==='openrouter')return 'Pour cette demande, il me faut le web actuel. Connecte OpenRouter avec ☁ IA et je pourrai lancer la recherche web sans inventer.';return 'Pour les demandes générales hors GVAULT, connecte Hugging Face ou OpenRouter avec ☁ IA. Hugging Face me donne accès à plusieurs fournisseurs de modèles ; OpenRouter ajoute notamment la recherche web.'}
function installFetch(target){
 if(!target||wrappedTargets.has(target))return true;
 let nativeFetch;try{nativeFetch=target.fetch.bind(target)}catch{return false}
 const wrapped=async function(input,init){
   let isChat=false,message='',history=[];
   try{
     const url=typeof input==='string'?input:String(input?.url||'');
     const method=String(init?.method||input?.method||'GET').toUpperCase();
     isChat=method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url);
     if(isChat&&typeof init?.body==='string'){
       const body=JSON.parse(init.body);message=clean(body?.message);history=Array.isArray(body?.history)?body.history.slice(-10):[];
     }
   }catch{}
   if(isChat&&message){
     const federation=await loadFederation();
     if(federation?.shouldFederate?.(message)){
       try{
         const result=await federation.ask(message,history,{surface:'vault-agent-light'});
         if(result?.ok&&clean(result.text))return synthetic(target,clean(result.text),result);
         if(result?.needsConnection)return synthetic(target,connectionText(result,federation.needsLiveWeb?.(message)),{provider:null,webGrounded:false});
       }catch{}
     }
   }
   return nativeFetch(input,init);
 };
 try{target.fetch=wrapped;wrappedTargets.add(target);target.__GTHINK_UNIVERSAL_PROVIDER_ROUTER_V1=true;return true}catch{return false}
}
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b}
async function refreshPanel(){const statusEl=document.getElementById('gthinkProviderStatus');if(!statusEl)return;const federation=await loadFederation();if(!federation){statusEl.textContent='Fédération indisponible';return}let s=null;try{s=await federation.status()}catch{}const hf=s?.huggingFace?.connected?'HF ✓':'HF ○',or=s?.openRouter?.connected?'WEB ✓':'WEB ○',local=s?.local?.eligible?'LOCAL ✓':'LOCAL ○';statusEl.textContent=`${hf} · ${or} · ${local}`}
function installUI(){
 if(document.getElementById('gthinkProviderCloud'))return;
 const style=document.createElement('style');style.id='gthinkProviderCloudStyle';style.textContent='#gthinkProviderCloud{position:fixed;right:max(10px,env(safe-area-inset-right));top:max(72px,calc(env(safe-area-inset-top) + 72px));z-index:2147483000;font:900 10px/1 ui-monospace,monospace;color:#baffc7;background:rgba(3,12,6,.9);border:1px solid rgba(97,255,133,.45);border-radius:999px;padding:9px 11px;box-shadow:0 8px 28px rgba(0,0,0,.35)}#gthinkProviderPanel{position:fixed;right:max(10px,env(safe-area-inset-right));top:max(112px,calc(env(safe-area-inset-top) + 112px));z-index:2147483001;width:min(300px,calc(100vw - 20px));padding:12px;border:1px solid rgba(97,255,133,.35);border-radius:14px;background:rgba(3,10,5,.96);color:#c9ffd4;box-shadow:0 12px 40px rgba(0,0,0,.5);font:700 10px/1.45 ui-monospace,monospace;display:none}#gthinkProviderPanel.open{display:block}#gthinkProviderPanel b{display:block;margin-bottom:7px}#gthinkProviderStatus{color:#8dd99d;margin-bottom:9px}#gthinkProviderPanel .actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}#gthinkProviderPanel button{border:1px solid rgba(97,255,133,.3);background:#071009;color:#c9ffd4;border-radius:10px;padding:8px;font:800 9px ui-monospace,monospace}#gthinkProviderPanel small{display:block;margin-top:8px;color:#6ea57b;line-height:1.35}';(document.head||document.documentElement).appendChild(style);
 const cloud=document.createElement('button');cloud.id='gthinkProviderCloud';cloud.type='button';cloud.textContent='☁ IA';cloud.title='Fournisseurs IA publics';document.body.appendChild(cloud);
 const panel=document.createElement('div');panel.id='gthinkProviderPanel';panel.innerHTML='<b>RENFORT IA PUBLIC</b><div id="gthinkProviderStatus">Lecture…</div><div class="actions"></div><small>Tokens gardés seulement dans cette session. Aucun secret n’est écrit dans GVAULT. Les routes privées restent hors d’accès.</small>';document.body.appendChild(panel);
 const actions=panel.querySelector('.actions');actions.appendChild(button('Hugging Face',async()=>{const f=await loadFederation();await f?.connect?.('huggingface')}));actions.appendChild(button('OpenRouter',async()=>{const f=await loadFederation();await f?.connect?.('openrouter')}));actions.appendChild(button('Déconnecter',async()=>{const f=await loadFederation();await f?.disconnect?.();await refreshPanel()}));actions.appendChild(button('Actualiser',()=>refreshPanel()));
 cloud.addEventListener('click',()=>{panel.classList.toggle('open');void refreshPanel()});void refreshPanel();
}
function install(){installFetch(window);try{const frame=document.getElementById('gvaultRuntime');if(frame?.contentWindow)installFetch(frame.contentWindow)}catch{}if(document.body)installUI()}
void loadFederation().then(()=>install());install();let tries=0;const timer=setInterval(()=>{tries++;install();if(tries>600)clearInterval(timer)},150);window.addEventListener('pageshow',install);
window.GTHINK_UNIVERSAL_PROVIDER_ROUTER=Object.freeze({schema:SCHEMA,install,status:async()=>{const f=await loadFederation();return {schema:SCHEMA,federation:await f?.status?.(),windowFetch:wrappedTargets.has(window)}}});
})();
