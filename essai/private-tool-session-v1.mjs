const cfg=window.__GVAULT_PRIVATE_TOOL_SESSION_CONFIG__||{};
const origin=location.origin;
let secret='',poll=null,accepted=false,denied=false;
const $=s=>document.querySelector(s);
const state=()=>$(cfg.stateSelector||'#connectionState');
const input=()=>$(cfg.inputSelector||'#token');
const openBtn=()=>$(cfg.openSelector||'#connect');
const notice=()=>$(cfg.noticeSelector||'#feedWaitNotice');
const nonce=()=>new URLSearchParams(location.search).get('sas_nonce')||'';
document.documentElement.style.visibility='hidden';
function setState(text,kind=''){const n=state();if(!n)return;n.textContent=text;if('dataset'in n)n.dataset.kind=kind;if(cfg.stateKindClass)n.className=cfg.stateKindClass(kind)}
function showNotice(text){const n=notice();if(!n)return;n.hidden=false;n.textContent=text}
async function feedReady(){try{const r=await fetch(cfg.manifestUrl+'?probe='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)return false;const m=await r.json();return m.schema==='GVAULT_CONTROL_TOWER_ENCRYPTED_FEED_V1'}catch{return false}}
function deny(reason='SESSION SAS ABSENTE'){if(accepted||denied)return;denied=true;secret='';if(poll)clearInterval(poll);document.body.innerHTML=`<div style="padding:20px;color:#e88989;font:12px ui-monospace,monospace">${reason} · repasse par le SAS principal GVAULT</div>`;document.documentElement.style.visibility='visible';setTimeout(()=>location.replace('../../?private-tool=locked'),900)}
async function tryOpen(){if(!secret)return;const ready=await feedReady();if(!ready){setState('SAS GVAULT ✓ · FEED EN ATTENTE','warn');showNotice('SAS PRINCIPAL VALIDÉ ✓ · feed chiffré encore indisponible. Aucun mot de passe supplémentaire n’est requis.');return}const i=input(),b=openBtn();if(!i||!b)return;setState('SAS GVAULT ✓ · CONNEXION…','busy');i.value=secret;b.disabled=false;b.click();i.value='';if(poll){clearInterval(poll);poll=null}}
function acceptPassword(v){if(accepted||denied)return;const s=String(v||'');if(!s)return;accepted=true;secret=s;clearTimeout(gateTimer);window.__GVAULT_INHERITED_SAS_ACTIVE__=true;document.documentElement.style.visibility='visible';setState('SAS GVAULT ✓ · SESSION HÉRITÉE','ok');void tryOpen();poll=setInterval(()=>void tryOpen(),30000);window.addEventListener('pagehide',()=>{secret='';window.__GVAULT_INHERITED_SAS_ACTIVE__=false;if(poll)clearInterval(poll)},{once:true})}
function request(){const n=nonce();if(!n||n.length<32||!window.opener||window.opener.closed){deny('ACCÈS VERROUILLÉ');return}window.opener.postMessage({schema:'GVAULT_PRIVATE_TOOL_SAS_REQUEST_V1',tool:cfg.tool,nonce:n},origin)}
window.addEventListener('message',ev=>{if(ev.origin!==origin||ev.source!==window.opener||denied)return;const d=ev.data||{},n=nonce();if(d.schema!=='GVAULT_PRIVATE_TOOL_SAS_SESSION_V1'||d.tool!==cfg.tool||d.nonce!==n||typeof d.password!=='string'||!d.password)return;acceptPassword(d.password);window.opener?.postMessage({schema:'GVAULT_PRIVATE_TOOL_SAS_ACCEPTED_V1',tool:cfg.tool,nonce:n},origin)})
const gateTimer=setTimeout(()=>deny('SESSION SAS NON CONFIRMÉE'),5000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{request();setTimeout(request,250);setTimeout(request,800);setTimeout(request,1800)},{once:true});else{request();setTimeout(request,250);setTimeout(request,800);setTimeout(request,1800)}
