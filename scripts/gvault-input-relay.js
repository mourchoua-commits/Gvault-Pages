(()=>{'use strict';
const SCHEMA='GVAULT_PUBLIC_INPUT_RELAY_V1',KID='d5416a7acbedf38a',PUB='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApW7lxQsvo//ste2UvTRYVpKIsnBhLYl/w/3/rdwVSVoPhTVJFe53lY2YkysXnS5Q09K9Lp0R7ktIStY5CQ2ill/I/fR335WaP+u3PCch7gpBgQDAHpYcQ6cN3EZoydgKKkXWa9DEAMfpj1u9YveO+Hwe0U8yHCPcpxHzdelEW6peu073ba3SJ3ojsfqlH8hUDLIX9khPmfq9lhXsi6Jh0BQyvR9kn3rGwdjMjVo5BgsNwas8j/7E8vMqrSyfm33KZtPfHXgCxOK6HX4uFRDJduA7p8fC2IxuDVZKcInPc81aJjhkgsW++ch3kGzEItXZ1DLq5zfWO+k+WDdGmJ4G1wIDAQAB',QKEY='gvault.publicInputRelay.queue.v1';
const enc=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sensitive=/pass(word|phrase)?|token|secret|authorization|api[-_ ]?key|sas/i;
function safeTarget(el){if(!el)return false;const t=String(el.type||'').toLowerCase(),n=[el.name,el.id,el.autocomplete,el.getAttribute?.('aria-label')].filter(Boolean).join(' ');return t!=='password'&&!sensitive.test(n)}
function endpoint(){const x=window.GVAULT_DATAPASSIV_INGEST_URL||window.GVAULT_INGRESS_BASE_URL;return x?String(x).replace(/\/+$/,'')+(String(x).includes('/v1/datapassiv')?'':'/v1/datapassiv'):null}
async function pubKey(){return crypto.subtle.importKey('spki',unb64(PUB),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt'])}
async function sha(buf){return hex(await crypto.subtle.digest('SHA-256',buf))}
function queue(){try{return JSON.parse(localStorage.getItem(QKEY)||'[]')}catch{return []}}
function save(q){try{localStorage.setItem(QKEY,JSON.stringify(q.slice(-500)))}catch{}}
async function seal(content,meta={}){content=String(content??'');if(!content.trim())return null;
 const contentSha=await sha(enc.encode(content));const id='pir-'+Date.now().toString(36)+'-'+crypto.getRandomValues(new Uint32Array(2)).join('-');
 const event={schema:SCHEMA,id,createdAt:new Date().toISOString(),surface:String(meta.surface||'public'),sessionId:String(meta.sessionId||sessionStorage.getItem('gvault.inputRelay.session')||''),content,contentSha256:contentSha,location:location.pathname};
 let sid=event.sessionId;if(!sid){sid=crypto.randomUUID?.()||id;try{sessionStorage.setItem('gvault.inputRelay.session',sid)}catch{}event.sessionId=sid}
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const raw=await crypto.subtle.exportKey('raw',aes);const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,enc.encode(JSON.stringify(event)));const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},await pubKey(),raw);
 return {schema:'GVAULT_DATAPASSIV_CAPSULE_V1',kind:SCHEMA,id,epoch:new Date().toISOString().slice(0,10).replaceAll('-',''),createdAt:event.createdAt,eventCount:1,kid:KID,ciphertext:b64(cipher),wrappedKey:b64(wrapped),iv:b64(iv),ciphertextSha256:await sha(cipher)}
}
async function flush(){const ep=endpoint();if(!ep)return false;let q=queue(),keep=[];for(const c of q){try{const r=await fetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c),cache:'no-store',credentials:'omit'});if(!r.ok)keep.push(c)}catch{keep.push(c)}}save(keep);return keep.length===0}
async function capture(content,meta={}){const c=await seal(content,meta);if(!c)return null;const q=queue();if(!q.some(x=>x.id===c.id||x.ciphertextSha256===c.ciphertextSha256))q.push(c);save(q);await flush();return c.id}
function readEditable(el){if(!el||!safeTarget(el))return '';if(el.isContentEditable)return el.innerText||el.textContent||'';return typeof el.value==='string'?el.value:''}
document.addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement))return;const els=[...f.querySelectorAll('textarea,input,[contenteditable="true"]')].filter(safeTarget);const text=els.map(readEditable).filter(Boolean).join('\n');if(text)capture(text,{surface:/agent|chat|prompt/i.test(f.id+' '+f.className)?'agent':'form'})},true);
document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing)return;const el=e.target;if(!safeTarget(el))return;const text=readEditable(el);if(text)capture(text,{surface:/agent|chat|prompt/i.test((el.id||'')+' '+(el.className||''))?'agent':'enter'})},true);
document.addEventListener('click',e=>{const b=e.target?.closest?.('button,[role="button"]');if(!b)return;const hint=[b.textContent,b.title,b.getAttribute('aria-label'),b.id,b.className].filter(Boolean).join(' ');if(!/send|envoyer|submit|ask|prompt|agent|message/i.test(hint))return;const root=b.closest('form')||document;const el=root.querySelector?.('textarea:focus,input:focus,[contenteditable="true"]:focus')||document.activeElement;const text=readEditable(el);if(text)capture(text,{surface:/agent|chat|prompt/i.test(hint)?'agent':'button'})},true);
window.addEventListener('online',flush);setInterval(flush,60000);
window.GVAULT_PUBLIC_INPUT_RELAY=Object.freeze({schema:SCHEMA,capture,flush,status:()=>({queued:queue().length,endpoint:Boolean(endpoint()),kid:KID})});
flush();
})();