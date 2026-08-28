const cfg=window.__GVAULT_PRIVATE_TOOL_SESSION_CONFIG__||{};
const origin=location.origin;
let secret='',poll=null,accepted=false;
const $=s=>document.querySelector(s);
const state=()=>$(cfg.stateSelector||'#connectionState');
const input=()=>$(cfg.inputSelector||'#token');
const openBtn=()=>$(cfg.openSelector||'#connect');
const notice=()=>$(cfg.noticeSelector||'#feedWaitNotice');
function setState(text,kind=''){const n=state();if(!n)return;n.textContent=text;if('dataset'in n)n.dataset.kind=kind;if(cfg.stateKindClass){n.className=cfg.stateKindClass(kind)}}
function showNotice(text){const n=notice();if(!n)return;n.hidden=false;n.textContent=text}
function getProof(){try{return JSON.parse(sessionStorage.getItem(cfg.entryKey)||'null')}catch{return null}}
function validNonce(){const q=new URLSearchParams(location.search).get('sas_nonce'),p=getProof();return q||p?.nonce||''}
async function feedReady(){try{const r=await fetch(cfg.manifestUrl+'?probe='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)return false;const m=await r.json();return m.schema==='GVAULT_CONTROL_TOWER_ENCRYPTED_FEED_V1'}catch{return false}}
async function tryOpen(){if(!secret)return;const ready=await feedReady();if(!ready){setState('SAS GVAULT ✓ · FEED EN ATTENTE','warn');showNotice('SAS GVAULT VALIDÉ · feed chiffré encore indisponible. Aucun mot de passe supplémentaire n’est requis.');return}const i=input(),b=openBtn();if(!i||!b)return;setState('SAS GVAULT ✓ · CONNEXION…','busy');i.value=secret;b.disabled=false;b.click();i.value='';if(poll){clearInterval(poll);poll=null}}
function acceptPassword(v){if(accepted)return;const s=String(v||'');if(!s)return;accepted=true;secret=s;window.__GVAULT_INHERITED_SAS_ACTIVE__=true;setState('SAS GVAULT ✓ · SESSION HÉRITÉE','ok');void tryOpen();poll=setInterval(()=>void tryOpen(),30000);window.addEventListener('pagehide',()=>{secret='';window.__GVAULT_INHERITED_SAS_ACTIVE__=false;if(poll)clearInterval(poll)},{once:true})}
function request(){const nonce=validNonce();if(!nonce||!window.opener){setState('SESSION SAS INDISPONIBLE','bad');return}window.opener.postMessage({schema:'GVAULT_PRIVATE_TOOL_SAS_REQUEST_V1',tool:cfg.tool,nonce},origin)}
window.addEventListener('message',ev=>{if(ev.origin!==origin||ev.source!==window.opener)return;const d=ev.data||{},nonce=validNonce();if(d.schema!=='GVAULT_PRIVATE_TOOL_SAS_SESSION_V1'||d.tool!==cfg.tool||d.nonce!==nonce||typeof d.password!=='string'||!d.password)return;acceptPassword(d.password);window.opener?.postMessage({schema:'GVAULT_PRIVATE_TOOL_SAS_ACCEPTED_V1',tool:cfg.tool,nonce},origin)})
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{request();setTimeout(request,350);setTimeout(request,1200)},{once:true});else{request();setTimeout(request,350);setTimeout(request,1200)}
