(()=>{'use strict';
const SCHEMA='GVAULT_AGENT_LIVE_BLOB_CLIENT_V1';
const CONFIG_URL='./scripts/gvault-agent-gateway.json';
const CHAT_PATH='/api/vault/chat';
const HISTORY_MAX=12;
const boundWindows=new WeakSet(),boundFrames=new WeakSet();
let config=null,configAt=0,history=[],panel=null;

function sessionId(){
 let id='';try{id=sessionStorage.getItem('gvault.agent.live.session.v1')||''}catch{}
 if(!id){id='gas-'+(crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);try{sessionStorage.setItem('gvault.agent.live.session.v1',id)}catch{}}
 return id;
}
function clean(v){return String(v||'').replace(/\/+$/,'')}
function isChatUrl(input,w=window){try{return new URL(typeof input==='string'?input:input?.url,w.location.href).pathname===CHAT_PATH}catch{return false}}
function emit(type,detail={}){try{window.dispatchEvent(new CustomEvent(type,{detail:{schema:SCHEMA,at:new Date().toISOString(),...detail}}))}catch{}}
async function loadConfig(force=false){
 if(!force&&config&&Date.now()-configAt<30000)return config;
 try{const r=await fetch(CONFIG_URL+'?ts='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('CONFIG_HTTP_'+r.status);const c=await r.json();if(c?.schema!=='GVAULT_AGENT_GATEWAY_CONFIG_V1')throw new Error('CONFIG_SCHEMA');config=c;configAt=Date.now();if(c.baseUrl)window.GVAULT_INGRESS_BASE_URL=clean(c.baseUrl);return c}catch(e){config={schema:'GVAULT_AGENT_GATEWAY_CONFIG_V1',status:'UNAVAILABLE',baseUrl:null,error:String(e?.message||e)};configAt=Date.now();return config}
}
async function endpoint(){const direct=clean(window.GVAULT_AGENT_CHAT_ENDPOINT||'');if(direct)return direct;const base=clean(window.GVAULT_INGRESS_BASE_URL||'');if(base)return base+CHAT_PATH;const c=await loadConfig();return c?.baseUrl?clean(c.baseUrl)+CHAT_PATH:null}
function remember(role,content){if(!content)return;history.push({role,content:String(content)});if(history.length>HISTORY_MAX)history=history.slice(-HISTORY_MAX)}
function renderBlob(blob){
 if(!blob)return;
 for(const root of [document,...[...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch{return null}}).filter(Boolean)]){
  try{const a=root.querySelector('[data-blob-agent-side]'),b=root.querySelector('[data-blob-other-side]');if(a)a.textContent=blob.agentSide?.display||'';if(b)b.textContent=blob.otherSide?.display||'banane'}catch{}
 }
 if(panel){panel.querySelector('[data-direct-answer]').textContent=blob.agentSide?.display||'';panel.querySelector('[data-direct-banana]').textContent=blob.otherSide?.display||'banane'}
 emit('gvault:agent-direct-blob',{blob});
}
async function ask(message,{historyOverride=null}={}){
 message=String(message??'').trim();if(!message)return {ok:false,error:'empty_message'};
 const ep=await endpoint();if(!ep)return {ok:false,error:'gateway_pending'};
 const prior=Array.isArray(historyOverride)?historyOverride:history.slice(-HISTORY_MAX);
 let r;try{r=await fetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,sessionId:sessionId(),history:prior}),cache:'no-store',credentials:'omit'})}catch(e){return {ok:false,error:'network_error',detail:String(e?.message||e)}}
 let data=null;try{data=await r.json()}catch{}
 if(!r.ok||data?.schema!=='GVAULT_AGENT_CHAT_RESPONSE_V1')return {ok:false,error:data?.error||`HTTP_${r.status}`,detail:data?.detail||null};
 remember('user',message);remember('assistant',data.text);renderBlob(data.blob);return data;
}
function bindWindow(w){
 if(!w||boundWindows.has(w))return;boundWindows.add(w);
 let native;try{native=w.fetch.bind(w)}catch{return}
 w.fetch=async function(input,init){
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(method!=='POST'||!isChatUrl(input,w))return native(input,init);
  const ep=await endpoint();if(!ep)return native(input,init);
  let body={};try{body=typeof init?.body==='string'?JSON.parse(init.body):{}}catch{}
  const message=typeof body?.message==='string'?body.message:'';if(!message.trim())return native(input,init);
  const nextBody={...body,message,sessionId:body.sessionId||sessionId(),history:Array.isArray(body.history)?body.history:history.slice(-HISTORY_MAX)};
  const response=await native(ep,{...init,method:'POST',headers:{...(init?.headers||{}),'content-type':'application/json'},body:JSON.stringify(nextBody),cache:'no-store',credentials:'omit'});
  try{const data=await response.clone().json();if(response.ok&&data?.schema==='GVAULT_AGENT_CHAT_RESPONSE_V1'){remember('user',message);remember('assistant',data.text);renderBlob(data.blob)}}catch{}
  return response;
 };
}
function bindFrame(frame){if(!frame||boundFrames.has(frame))return;boundFrames.add(frame);const bind=()=>{try{bindWindow(frame.contentWindow)}catch{}};frame.addEventListener('load',bind);bind()}
function scanFrames(){for(const f of document.querySelectorAll('iframe'))bindFrame(f)}
function runtimeReady(){const f=document.querySelector('#gvaultRuntime');return !!f?.classList?.contains('ready')}
function buildPanel(){
 if(panel)return panel;
 const host=document.createElement('section');host.id='gvaultAgentDirectBlob';host.innerHTML=`<button type="button" data-direct-toggle aria-label="Canal agent direct">DIRECT</button><div data-direct-panel hidden><header><b>BLOB DIRECT</b><button type="button" data-direct-close>×</button></header><div data-direct-state>gateway…</div><textarea data-direct-input rows="3" placeholder="Parler directement à l’agent"></textarea><button type="button" data-direct-send>ENVOYER</button><div class="directSides"><div><small>CÔTÉ AGENT</small><output data-direct-answer>—</output></div><div><small>AUTRE CÔTÉ</small><output data-direct-banana>banane</output></div></div></div>`;
 const style=document.createElement('style');style.textContent=`#gvaultAgentDirectBlob{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));z-index:2147483400;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;display:none}#gvaultAgentDirectBlob.ready{display:block}#gvaultAgentDirectBlob>[data-direct-toggle]{min-height:38px;border:1px solid #61ff85;border-radius:999px;background:#071009;color:#baffc7;padding:0 12px;font:900 8px monospace;box-shadow:0 8px 24px #0008}#gvaultAgentDirectBlob>[data-direct-panel]{width:min(92vw,360px);margin-bottom:8px;border:1px solid #31553a;border-radius:12px;background:#050a06f2;color:#c9ffd4;padding:10px;box-shadow:0 18px 60px #000b}#gvaultAgentDirectBlob header{display:flex;justify-content:space-between;align-items:center;gap:8px}#gvaultAgentDirectBlob header button{min-width:32px;min-height:32px;border:1px solid #31553a;background:#071009;color:#c9ffd4;border-radius:8px}#gvaultAgentDirectBlob textarea{width:100%;margin:8px 0;min-height:70px;resize:vertical;border:1px solid #31553a;border-radius:8px;background:#010302;color:#c9ffd4;padding:8px;font:12px monospace}#gvaultAgentDirectBlob [data-direct-send]{width:100%;min-height:38px;border:1px solid #61ff85;border-radius:8px;background:#0b1b0e;color:#baffc7;font:900 9px monospace}#gvaultAgentDirectBlob [data-direct-state]{margin-top:5px;color:#6ea57b;font-size:7px}.directSides{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.directSides>div{min-width:0;border:1px solid #203b27;border-radius:8px;padding:7px;background:#020604}.directSides small{display:block;color:#6ea57b;font-size:6px;margin-bottom:5px}.directSides output{display:block;max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:8px;line-height:1.4}`;document.head.appendChild(style);document.body.appendChild(host);panel=host;
 const pane=host.querySelector('[data-direct-panel]'),toggle=host.querySelector('[data-direct-toggle]'),close=host.querySelector('[data-direct-close]'),send=host.querySelector('[data-direct-send]'),input=host.querySelector('[data-direct-input]'),state=host.querySelector('[data-direct-state]');
 toggle.addEventListener('click',()=>{pane.hidden=!pane.hidden;if(!pane.hidden)input.focus()});close.addEventListener('click',()=>{pane.hidden=true});
 const submit=async()=>{const text=input.value.trim();if(!text)return;send.disabled=true;state.textContent='envoi…';const out=await ask(text);send.disabled=false;if(out.ok){input.value='';state.textContent=`direct · ${out.model||'modèle'} · ${String(out.correlationId||'').slice(0,18)}`}else state.textContent='indisponible · '+(out.error||'erreur')};
 send.addEventListener('click',submit);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit()}});
 void loadConfig().then(c=>{state.textContent=c?.baseUrl?'gateway prêt':'gateway en attente'});return host;
}
function visibility(){const p=buildPanel();p.classList.toggle('ready',runtimeReady())}

bindWindow(window);scanFrames();buildPanel();visibility();
new MutationObserver(()=>{scanFrames();visibility()}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
setInterval(visibility,1200);
window.addEventListener('online',()=>void loadConfig(true));
window.GVAULT_AGENT_LIVE_BLOB=Object.freeze({schema:SCHEMA,ask,reloadConfig:()=>loadConfig(true),status:async()=>{const c=await loadConfig();return {configured:!!(await endpoint()),config:c,historyItems:history.length,sessionId:sessionId()}}});
})();
