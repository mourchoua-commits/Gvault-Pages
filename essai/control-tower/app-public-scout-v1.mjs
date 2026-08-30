import './app.mjs';
import {startPublicScoutObserver,toControlTowerRawEvents} from './public-scout-observer-v1.mjs';

let current=null,controller=null;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensurePanel(){
  let panel=document.querySelector('#publicScoutPanel');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='publicScoutPanel';
  panel.className='tracksWrap';
  panel.innerHTML='<div class="paneTitle">PUBLIC SCOUT · NOIR / BLANC / ROUGE <span id="publicScoutProof">EN ATTENTE</span></div><div id="publicScoutBody" class="tracks"><div class="track"><div class="trackMeta">Le Megazord attend son radar public.</div></div></div>';
  const anchor=document.querySelector('.kpis')||document.querySelector('main')||document.body.firstChild;
  if(anchor?.parentNode)anchor.parentNode.insertBefore(panel,anchor.nextSibling);else document.body.appendChild(panel);
  return panel;
}
function render(state){
  ensurePanel();current=state;
  const proof=document.querySelector('#publicScoutProof'),body=document.querySelector('#publicScoutBody');
  if(!proof||!body)return;
  proof.textContent='PROUVÉ · '+String(state.publicDataCommitSha||'').slice(0,12);
  const cards=[];
  for(const key of ['black','white','publisher']){
    const ranger=state.rangers?.[key];if(!ranger)continue;
    cards.push(`<article class="track"><div class="trackTop"><b>${esc(key.toUpperCase())}</b><span>${esc(ranger.signal||'')}</span></div><h3>${esc(ranger.message||'')}</h3><div class="trackMeta">intégrité ${esc(state.integrity?.state||'UNKNOWN')} · ${esc(state.observerProof||'')}</div></article>`);
  }
  const facts=(state.observerEvents||[]).filter(x=>x.engine==='public-scout').slice(0,6);
  if(facts.length)cards.push(`<article class="track"><div class="trackTop"><b>INFOS PUBLIQUES</b><span>${facts.length}</span></div>${facts.map(x=>`<div class="trackMeta" style="margin-top:6px">${esc(x.summary||'')}</div>`).join('')}</article>`);
  cards.push(`<article class="track"><div class="trackTop"><b>PREUVE</b><span>ACK</span></div><div class="trackMeta">data commit ${esc(state.publicDataCommitSha||'—')}</div><div class="trackMeta">state ${esc(state.publicStateSha256||'—')}</div><div class="trackMeta">ack ${esc(state.publicAck?.ackDigest||'—')}</div></article>`);
  body.innerHTML=cards.join('');
}
function renderError(error){
  ensurePanel();const proof=document.querySelector('#publicScoutProof'),body=document.querySelector('#publicScoutBody');
  if(proof)proof.textContent='DEGRADED';
  if(body)body.innerHTML=`<article class="track"><h3>Power Ranger Rouge — garde la porte.</h3><div class="trackMeta">${esc(String(error?.message||error||'preuve publique indisponible'))}</div></article>`;
}
function start(){ensurePanel();controller=startPublicScoutObserver({onUpdate:render,onError:renderError});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.GVAULT_CONTROL_TOWER_PUBLIC_SCOUT=Object.freeze({schema:'GVAULT_CONTROL_TOWER_PUBLIC_SCOUT_BRIDGE_V1',refresh:()=>controller?.refresh?.(),getState:()=>current?structuredClone(current):null,getEvents:()=>current?toControlTowerRawEvents(current):[],stop:()=>controller?.stop?.()});
