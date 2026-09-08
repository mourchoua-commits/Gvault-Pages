(()=>{'use strict';
const ext=globalThis.browser||globalThis.chrome;
const HOST_ID='gthink-navigator-host-v1';
if(document.getElementById(HOST_ID))return;
function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function visibleText(limit=14000){
 const body=document.body;if(!body)return'';
 const text=clean(body.innerText||'').replace(/\n{3,}/g,'\n\n');
 return text.slice(0,limit);
}
function selectionText(){try{return clean(window.getSelection()?.toString()).slice(0,6000)}catch{return''}}
function pageContext(mode='auto'){
 const selection=selectionText();
 const useSelection=mode==='selection'||(mode==='auto'&&selection);
 return{title:document.title,url:location.href,selection:useSelection?selection:'',text:useSelection?'':visibleText(),mode:useSelection?'selection':'page'};
}
function linksSnapshot(limit=60){
 const out=[];for(const a of document.querySelectorAll('a[href]')){
  const text=clean(a.innerText||a.textContent);const href=a.href;
  if(!href||(!text&&!a.getAttribute('aria-label')))continue;
  const r=a.getBoundingClientRect();if(r.width<1||r.height<1)continue;
  out.push({text:text||clean(a.getAttribute('aria-label')),href});if(out.length>=limit)break;
 }
 return out;
}
function findText(query){
 const q=clean(query);if(!q)return{ok:false,error:'empty_query'};
 const walker=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT,{acceptNode(node){const p=node.parentElement;if(!p)return NodeFilter.FILTER_REJECT;if(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return clean(node.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
 let node;const nq=norm(q);
 while(node=walker.nextNode()){
  const raw=node.nodeValue||'',idx=norm(raw).indexOf(nq);if(idx<0)continue;
  const sourceLower=raw.toLocaleLowerCase('fr-FR'),qLower=q.toLocaleLowerCase('fr-FR');let start=sourceLower.indexOf(qLower);if(start<0)start=0;
  const range=document.createRange();range.setStart(node,Math.min(start,raw.length));range.setEnd(node,Math.min(start+Math.max(q.length,1),raw.length));
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);node.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});
  return{ok:true,found:true,text:clean(raw).slice(0,300)};
 }
 return{ok:true,found:false};
}
function scrollPage(direction,amount='page'){
 const h=window.innerHeight||700,delta=amount==='small'?Math.round(h*.35):Math.round(h*.85);
 if(direction==='top')window.scrollTo({top:0,behavior:'smooth'});
 else if(direction==='bottom')window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});
 else window.scrollBy({top:direction==='up'?-delta:delta,behavior:'smooth'});
 return{ok:true,direction,scrollY:window.scrollY};
}
function openLink(query){
 const q=norm(query);if(!q)return{ok:false,error:'empty_query'};
 const links=[...document.querySelectorAll('a[href]')].map(a=>({a,text:norm(a.innerText||a.textContent||a.getAttribute('aria-label')),href:a.href}));
 let hit=links.find(x=>x.href===query)||links.find(x=>x.text===q)||links.find(x=>x.text.includes(q));
 if(!hit)return{ok:false,error:'link_not_found'};
 const href=hit.href;if(!/^https?:/i.test(href))return{ok:false,error:'unsupported_link_scheme'};
 location.assign(href);return{ok:true,navigating:true,href,text:clean(hit.a.innerText||hit.a.textContent)};
}
const host=document.createElement('div');host.id=HOST_ID;host.setAttribute('data-gthink-navigator','1');document.documentElement.appendChild(host);
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>:host{all:initial}.orb{position:fixed;right:16px;bottom:18px;z-index:2147483647;width:48px;height:48px;border-radius:50%;border:1px solid #61ff85;background:#041008;color:#baffc7;box-shadow:0 0 0 2px rgba(97,255,133,.08),0 8px 28px rgba(0,0,0,.45),0 0 22px rgba(97,255,133,.25);font:900 18px monospace}.panel{position:fixed;right:12px;bottom:76px;z-index:2147483647;width:min(390px,calc(100vw - 24px));max-height:min(620px,72vh);display:none;grid-template-rows:auto 1fr auto;background:rgba(2,8,4,.97);color:#d3ffdc;border:1px solid rgba(97,255,133,.4);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);font:13px/1.45 ui-monospace,monospace;overflow:hidden}.panel.open{display:grid}.head{padding:10px 12px;border-bottom:1px solid rgba(97,255,133,.2);display:flex;align-items:center;gap:8px}.head b{flex:1}.tag{font-size:10px;color:#75c887}.close{background:none;border:0;color:#9dffad;font:700 18px monospace}.feed{padding:12px;overflow:auto;min-height:110px}.msg{margin:0 0 10px;padding:8px 10px;border:1px solid rgba(97,255,133,.15);border-radius:11px;white-space:pre-wrap;overflow-wrap:anywhere}.user{margin-left:24px;background:rgba(97,255,133,.07)}.assistant{margin-right:24px;background:rgba(255,255,255,.025)}.composer{padding:10px;border-top:1px solid rgba(97,255,133,.2)}textarea{box-sizing:border-box;width:100%;min-height:64px;max-height:150px;resize:vertical;background:#010302;color:#d3ffdc;border:1px solid rgba(97,255,133,.32);border-radius:10px;padding:9px;font:13px/1.4 ui-monospace,monospace}.row{display:flex;gap:7px;align-items:center;margin-top:7px}.row button{border:1px solid rgba(97,255,133,.28);background:#071009;color:#c9ffd4;border-radius:9px;padding:7px 9px;font:700 11px monospace}.send{margin-left:auto;background:#174c24!important}.hint{font-size:9px;color:#6ea57b;margin-top:6px}.status{font-size:10px;color:#8ad99a}</style><button class="orb" title="GThink Navigator">◉</button><section class="panel"><div class="head"><b>GThink · Navigator</b><span class="tag">LIGHT hors du Vault</span><button class="close">×</button></div><div class="feed"><div class="msg assistant">Je suis là sur cette page. Rien n’est envoyé tant que tu ne m’envoies pas une demande.</div></div><div class="composer"><textarea placeholder="Demande-moi ce que tu veux faire ou comprendre ici…"></textarea><div class="row"><button data-mode="auto">AUTO</button><button data-mode="selection">SÉLECTION</button><button data-mode="page">PAGE</button><span class="status">contexte auto</span><button class="send">ENVOYER</button></div><div class="hint">Le contexte de la page n’est joint qu’au moment de l’envoi. Les actions de navigation restent limitées aux outils autorisés.</div></div></section>`;
const $=s=>root.querySelector(s),orb=$('.orb'),panel=$('.panel'),close=$('.close'),feed=$('.feed'),input=$('textarea'),status=$('.status');let mode='auto',pending=false;
function setOpen(v){panel.classList.toggle('open',v);if(v)setTimeout(()=>input.focus(),0)}
function add(role,text){const d=document.createElement('div');d.className=`msg ${role}`;d.textContent=clean(text);feed.appendChild(d);feed.scrollTop=feed.scrollHeight;return d}
function setPending(v){pending=v;$('.send').disabled=v;status.textContent=v?'GThink travaille…':`contexte ${mode}`}
async function ask(message,override={}){
 const q=clean(message);if(!q||pending)return;setOpen(true);add('user',q);input.value='';setPending(true);
 try{
  const context=pageContext(override.contextMode||mode);
  if(override.selection)context.selection=override.selection;
  const result=await ext.runtime.sendMessage({type:'gthink.navigator.ask',request:{message:q,context,source:'inline-panel'}});
  if(result?.ok&&clean(result.text))add('assistant',result.text);
  else if(result?.needsConnection)add('assistant','Le cœur Gvault est joignable mais le renfort externe demande une autorisation. Ouvre le Vault et connecte ☁ IA une fois.');
  else add('assistant',`Je n’ai pas réussi à joindre le cœur Gvault${result?.error?` : ${result.error}`:''}.`);
 }catch(error){add('assistant',`Relais indisponible : ${clean(error?.message||error)}.`)}finally{setPending(false)}
}
orb.addEventListener('click',()=>setOpen(!panel.classList.contains('open')));close.addEventListener('click',()=>setOpen(false));$('.send').addEventListener('click',()=>void ask(input.value));input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask(input.value)}});for(const b of root.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{mode=b.dataset.mode;status.textContent=`contexte ${mode}`});
ext.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 const run=async()=>{
  if(message?.type==='gthink.navigator.toggle'){setOpen(!panel.classList.contains('open'));return{ok:true}}
  if(message?.type==='gthink.navigator.show'){setOpen(true);if(message.prefill)input.value=message.prefill;if(message.pending)setPending(true);return{ok:true}}
  if(message?.type==='gthink.navigator.result'){setOpen(true);setPending(false);const r=message.result||{};add('assistant',r.ok&&r.text?r.text:`Je n’ai pas obtenu de réponse${r.error?` : ${r.error}`:''}.`);return{ok:true}}
  if(message?.type==='gthink.navigator.tool.execute'){
   const tool=clean(message.tool),args=message.args||{};
   if(tool==='navigator_page_snapshot')return{ok:true,...pageContext(args.mode||'auto'),links:linksSnapshot(30)};
   if(tool==='navigator_list_links')return{ok:true,links:linksSnapshot(Math.min(Number(args.limit)||40,80))};
   if(tool==='navigator_find_text')return findText(args.query);
   if(tool==='navigator_scroll')return scrollPage(args.direction,args.amount);
   if(tool==='navigator_open_link')return openLink(args.query);
   return{ok:false,error:'navigator_tool_unknown'};
  }
  return null;
 };
 Promise.resolve(run()).then(sendResponse).catch(error=>sendResponse({ok:false,error:clean(error?.message||error)}));return true;
});
})();