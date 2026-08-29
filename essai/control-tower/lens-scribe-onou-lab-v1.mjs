const browser=typeof window!=='undefined'&&typeof document!=='undefined';
const OBSERVER_ID='lens-scribe-onou-lab';
const $=s=>browser?document.querySelector(s):null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=false,last=null;

function mount(){
  if(!browser||$('#ctLensScribeOnouLab'))return;
  const host=$('#ctOnouObserver')||$('#ctSourceArchiveHealth')||$('#ctAdaptiveViews')||$('.kpis')||document.body;
  const n=document.createElement('section');n.id='ctLensScribeOnouLab';
  n.innerHTML=`<style>#ctLensScribeOnouLab{margin:0 10px 12px;border:1px dashed var(--line);border-radius:10px;background:var(--panel);padding:9px;font:8px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}#ctLensScribeOnouLab b{color:var(--accent)}#ctLensScribeState{color:var(--muted);margin-left:7px}#ctLensScribeState.live{color:var(--ok)}#ctLensScribeText{margin-top:7px;white-space:pre-wrap;line-height:1.45;color:var(--muted)}</style><b>LENS SCRIBE · LAB</b><span id="ctLensScribeState">ATTENTE</span><div id="ctLensScribeText">Aucune observation ONOU reçue.</div>`;
  host.insertAdjacentElement('afterend',n);render();
}

function render(){
  if(!browser)return;mount();const st=$('#ctLensScribeState'),tx=$('#ctLensScribeText');
  if(st){st.textContent=active?'OBSERVE ONOU':'INACTIF';st.className=active?'live':'';}
  if(!tx)return;if(!last){tx.textContent='Aucune observation ONOU reçue.';return;}
  const x=last;
  tx.innerHTML=`ONOU ${esc(x.canonical?.id||'—')} · ${esc(x.latest?.effectiveDay||'—')} · ${esc(x.latest?.status||'—')}<br>SHA locators ${esc(x.shaLocators?.count??0)} · fingerprint ${esc(String(x.fingerprint||'').slice(0,12))}<br>autorité ${esc(x.authority||'—')} · sourceMutation=${esc(x.sourceMutation)} · createsOnouVersion=${esc(x.createsOnouVersion)}`;
}

function presence(on=true){
  if(!browser)return;active=!!on;
  window.dispatchEvent(new CustomEvent('gvault:lens-observer-presence',{detail:{schema:'GVAULT_LENS_OBSERVER_PRESENCE_V1',observerId:OBSERVER_ID,target:'ONOU',active}}));
  render();
}

function transcribe(observation){
  last=structuredClone(observation||null);render();
  if(!browser||!last)return;
  window.dispatchEvent(new CustomEvent('gvault:control-tower-lens-transcription',{detail:{
    schema:'GVAULT_CONTROL_TOWER_LENS_TRANSCRIPTION_V1',
    producedAt:new Date().toISOString(),
    agent:'LENS_SCRIBE_LAB_DETERMINISTIC',
    target:'ONOU',
    mode:'STRUCTURED_TRANSCRIPTION_NO_INFERENCE',
    observation:last,
    text:`ONOU ${last.canonical?.id||'unknown'} · ${last.latest?.effectiveDay||'unknown'} · ${last.latest?.status||'unknown'} · SHA locators ${last.shaLocators?.count??0}`
  }}));
}

if(browser){
  window.addEventListener('gvault:onou-screen-observation',e=>transcribe(e.detail));
  window.addEventListener('gvault:private-tool-session-active',e=>{if(e.detail?.tool==='control-tower')presence(true)});
  window.addEventListener('gvault:private-tool-session-expired',()=>{presence(false);last=null;render()});
  window.addEventListener('pagehide',()=>presence(false),{once:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  window.GVAULT_LENS_SCRIBE_ONOU_LAB_V1=Object.freeze({schema:'GVAULT_LENS_SCRIBE_ONOU_LAB_V1',observe:()=>presence(true),sleep:()=>presence(false),getState:()=>({active,last:structuredClone(last)})});
}
