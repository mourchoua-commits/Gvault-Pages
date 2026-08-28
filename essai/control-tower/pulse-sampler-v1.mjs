import {computePulse} from './pulse-core-v1.mjs';

const KEY='gvault.controlTower.pulse.state.v1';
let state=readState();
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readState(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}}
function writeState(v){state=v;try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}}
function currentEvents(){try{return window.GVAULT_CONTROL_TOWER_PUBLIC_LIVE_V1?.getEvents?.()||[]}catch{return []}}
function currentHead(events){const first=events.find(e=>e?.sha);if(first?.sha)return String(first.sha);try{return String(window.GVAULT_CONTROL_TOWER_COMMIT_WATCHER_V1?.getState?.().lastCommit||'')}catch{return ''}}
function observe(){
  const all=currentEvents().slice().sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
  const n=Math.max(1,Number(state.sampleSize||4));
  const sample=all.slice(0,n);
  return {
    totalEvents:all.length,
    headSha:currentHead(all),
    newestAt:sample[0]?.at||null,
    engines:[...new Set(sample.map(e=>e.engine).filter(Boolean))],
    fragment:sample.map(e=>({id:e.id||'',engine:e.engine||'',sha:e.sha||'',at:e.at||''}))
  };
}
function ensureUi(){
  if($('#ctPulse'))return;
  const anchor=$('#ctPublicLive')||$('#ctSourceRouter')||document.querySelector('.kpis')||document.body;
  const n=document.createElement('section');
  n.id='ctPulse';
  n.innerHTML=`<style>#ctPulse{margin:0 10px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);font:9px ui-monospace,monospace;overflow:hidden}.ctpHead{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--line)}.ctpHead b{color:var(--accent);margin-right:auto}.ctpMode{border:1px solid var(--line);border-radius:999px;padding:3px 6px}.ctpGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:8px}.ctpCell{border:1px solid var(--line);border-radius:8px;padding:7px;background:var(--panel2)}.ctpCell b{display:block;font-size:13px}.ctpCell span{color:var(--muted);font-size:7px}.ctpNote{padding:0 8px 8px;color:var(--muted);line-height:1.45}.ctpWarn{color:var(--warn)}@media(max-width:620px){.ctpGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><div class="ctpHead"><b>PULSE · PRISE DE POULS</b><span id="ctpMode" class="ctpMode">—</span><button id="ctpNow">PRÉLEVER</button></div><div class="ctpGrid"><div class="ctpCell"><b id="ctpPred">—</b><span>Δ PRÉDIT</span></div><div class="ctpCell"><b id="ctpObs">—</b><span>Δ OBSERVÉ</span></div><div class="ctpCell"><b id="ctpDiff">—</b><span>ÉCART</span></div><div class="ctpCell"><b id="ctpConf">—</b><span>CONFIANCE</span></div></div><div id="ctpNote" class="ctpNote">Aucun prélèvement encore.</div>`;
  anchor.insertAdjacentElement('afterend',n);
  $('#ctpNow').onclick=()=>takePulse('manual');
}
function render(){
  ensureUi();
  if(!state?.samples)return;
  $('#ctpMode').textContent=`${state.mode} · n=${state.sampleSize}`;
  $('#ctpPred').textContent=`${state.prediction.eventDelta>=0?'+':''}${state.prediction.eventDelta}`;
  $('#ctpObs').textContent=`${state.observation.eventDelta>=0?'+':''}${state.observation.eventDelta}`;
  $('#ctpDiff').textContent=`${state.difference.deltaResidual>=0?'+':''}${state.difference.deltaResidual}`;
  $('#ctpConf').textContent=`${Math.round((state.prediction.confidence||0)*100)}%`;
  const miss=state.difference.changeMiss?' · changement prévu/observé divergent':'';
  const cls=state.mode==='FULL_SYNC_RECOMMENDED'?'ctpWarn':'';
  $('#ctpNote').className='ctpNote '+cls;
  $('#ctpNote').innerHTML=`Pouls #${state.samples} · fragment ${state.sampleSize} max · ${esc((state.observation.engines||[]).join(', ')||'aucun moteur')} · résidu=${state.difference.residualScore}${miss}. La prédiction n’est jamais une autorité : seul le prochain prélèvement confirme.`;
}
function takePulse(reason='event'){
  const obs=observe();
  const next=computePulse(state,obs);
  next.reason=reason;
  next.fragment=obs.fragment;
  writeState(next);
  render();
  window.dispatchEvent(new CustomEvent('gvault:control-tower-pulse',{detail:structuredClone(next)}));
  if(next.mode==='FULL_SYNC_RECOMMENDED')window.dispatchEvent(new CustomEvent('gvault:control-tower-pulse-escalation',{detail:{mode:next.mode,residual:next.difference.residualScore,reason}}));
  return next;
}

ensureUi();render();
window.addEventListener('gvault:control-tower-public-live',()=>takePulse('public-live'));
window.addEventListener('gvault:control-tower-vfs-ingested',()=>takePulse('vfs-ingested'));
window.addEventListener('gvault:control-tower-new-public-commit',()=>takePulse('commit-head'));
setTimeout(()=>takePulse('boot'),1600);
window.GVAULT_CONTROL_TOWER_PULSE_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_PULSE_V1',sample:()=>takePulse('manual-api'),getState:()=>structuredClone(state)});
