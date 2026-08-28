import {normalizeEvent,sortEvents,dedupeEvents,buildTrack,buildSwarmContamination,applyEventsToTracks,extractAnchors,safeString,activeContaminationForEvent,rootContaminationForEvent,setSwarmContaminationActive} from './core-v2.mjs';

const OWNER='mourchoua-commits', PRIVATE_REPO='Gvault';
const API=`https://api.github.com/repos/${OWNER}/${PRIVATE_REPO}`;
const VIGIE_BRANCH='vigie-state', MAIN_BRANCH='main';
const TRACK_PATH='modules/vigie/control_tower_tracks.json';
const LOCAL_TRACK_KEY='gvault.controlTower.tracks.v2';
const POLL_MS=30000;
let token='',events=[],tracks=[],selected=null,mode='LIVE',search='',pollTimer=null,lastRefresh=null,remoteTrackSha=null;

const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function log(line,cls=''){const box=$('#terminalLog');const p=document.createElement('div');p.className=cls;p.textContent=`${new Date().toLocaleTimeString()}  ${line}`;box.appendChild(p);box.scrollTop=box.scrollHeight}
function setStatus(text,kind=''){const n=$('#connectionState');n.textContent=text;n.dataset.kind=kind}
function b64decode(s){const bin=atob(String(s||'').replace(/\n/g,''));const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
function b64encode(s){const bytes=new TextEncoder().encode(s);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin)}
function authHeaders(){if(!token)throw new Error('SAS fermé');return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`}}
async function api(path,opts={}){const r=await fetch(path.startsWith('http')?path:API+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})},cache:'no-store'});if(!r.ok){const t=await r.text().catch(()=>String(r.status));const e=new Error(`GitHub HTTP ${r.status} · ${t.slice(0,180)}`);e.status=r.status;throw e}return r.status===204?null:r.json()}
async function readText(path,branch=MAIN_BRANCH,optional=false){try{const x=await api(`/contents/${path}?ref=${encodeURIComponent(branch)}&ts=${Date.now()}`);return {text:b64decode(x.content),sha:x.sha}}catch(e){if(optional&&e.status===404)return {text:'',sha:null};throw e}}
async function readJson(path,branch=MAIN_BRANCH,optional=false){const x=await readText(path,branch,optional);return x.text?{data:JSON.parse(x.text),sha:x.sha}:{data:null,sha:null}}
function parseNdjson(text){return String(text||'').split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){return {schema:'PARSE_ERROR',line:i+1,error:e.message}}})}

const stateSources=[
  ['continuity','ops/continuity/control-plane.json'],
  ['actions-capacity','ops/actions-capacity/state.json'],
  ['ci-budget','ops/ci-budget/policy.json'],
  ['ci-workflow-classes','ops/ci-budget/workflow-classes.json'],
  ['project-review','ops/project-review/contract.v1.json'],
  ['method-router','ops/method-router/contract.v1.json'],
  ['changelog-provenance','ops/changelog-provenance/retroactive-integrity.json'],
  ['changelog-versions','ops/changelog-provenance/versions.json'],
  ['swarm-watch','modules/swarm/watch_registry.json']
];

async function loadVigie(){
  const paths=['events.ndjson','public_intake_events.ndjson','public_stream.ndjson','blob_index.ndjson'];
  const parts=await Promise.all(paths.map(p=>readText(`modules/vigie/${p}`,VIGIE_BRANCH,true)));
  const names=['vigie','private-intake','public-stream','blob-index']; let out=[];
  parts.forEach((p,idx)=>parseNdjson(p.text).forEach((raw,i)=>out.push(normalizeEvent(raw,names[idx],`vigie-state/${paths[idx]}`,i))));
  const latest=await readJson('modules/vigie/latest_report.json',VIGIE_BRANCH,true);if(latest.data)out.push(normalizeEvent(latest.data,'vigie-report','vigie-state/latest_report.json',0));
  return out;
}

async function loadStates(){
  const out=[];
  for(const [engine,path] of stateSources){
    try{const x=await readJson(path,MAIN_BRANCH,true);if(x.data)out.push(normalizeEvent({...x.data,_sourcePath:path,_blobSha:x.sha},engine,`main/${path}`,0))}catch(e){out.push(normalizeEvent({type:'adapter_error',status:'warning',message:e.message,path},engine,`main/${path}`,0))}
  }
  return out;
}

async function loadSwarmState(){
  let out=[];
  for(const dir of ['modules/swarm/state','modules/swarm/control']){
    try{
      const list=await api(`/contents/${dir}?ref=main&ts=${Date.now()}`);
      for(const f of (Array.isArray(list)?list:[]).filter(x=>x.type==='file'&&/\.json$/i.test(x.name)).slice(0,40)){
        try{const x=await readJson(f.path,MAIN_BRANCH,true);if(x.data)out.push(normalizeEvent({...x.data,_sourcePath:f.path,_blobSha:x.sha},'swarm',`main/${f.path}`,out.length))}catch{}
      }
    }catch{}
  }
  return out;
}

async function loadConversationLedger(){
  const commits=await api('/commits?sha=main&per_page=100');
  return commits.filter(c=>/^(CVL-|FIRST_TURN_GATE)/.test(c.commit?.message||'')).map((c,i)=>normalizeEvent({
    event_id:c.sha,created_at:c.commit?.committer?.date,type:/^CVL-/.test(c.commit?.message||'')?'conversation_event':'first_turn_gate',
    status:'PASS',message:c.commit?.message,sha:c.sha,html_url:c.html_url,
    ledgerId:(c.commit?.message.match(/CVL-[a-f0-9]+/i)||[])[0]||'',
    ordinal:Number((c.commit?.message.match(/ordinal=(\d+)/)||[])[1]||(/FIRST_TURN_GATE/.test(c.commit?.message||'')?1:0)),
    role:(c.commit?.message.match(/role=([^\s]+)/)||[])[1]||'user',
    surface:(c.commit?.message.match(/surface=([^\s]+)/)||[])[1]||'user_message'
  },'conversation-ledger','main/commits',i));
}

async function loadGitActivity(){
  const commits=await api('/commits?sha=main&per_page=60');
  return commits.map((c,i)=>normalizeEvent({event_id:c.sha,created_at:c.commit?.committer?.date,type:'git_commit',status:'observed',message:(c.commit?.message||'').split('\n')[0],sha:c.sha,html_url:c.html_url},'git','main/commits',i));
}

function loadLocalTracks(){try{const x=JSON.parse(localStorage.getItem(LOCAL_TRACK_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function saveLocalTracks(){localStorage.setItem(LOCAL_TRACK_KEY,JSON.stringify(tracks))}
async function loadRemoteTracks(){
  const x=await readJson(TRACK_PATH,VIGIE_BRANCH,true);remoteTrackSha=x.sha;
  if(x.data?.tracks&&Array.isArray(x.data.tracks))return x.data.tracks;return [];
}
async function saveRemoteTracks(){
  const workSpecialBindings=tracks.filter(t=>t.mode==='SWARM_CONTAMINATION').map(t=>({trackId:t.trackId,state:t.state,workId:t.workSpecial?.workId||'',marker:'WORK_SPECIAL',originEventId:t.originEventId,propagationActive:t.propagation?.active!==false}));
  const payload=JSON.stringify({schema:'GVAULT_CONTROL_TOWER_TRACK_REGISTRY_V2',updatedAt:new Date().toISOString(),tracks,workSpecialBindings},null,2)+'\n';
  const body={message:'control-tower: sync tracked signals',content:b64encode(payload),branch:VIGIE_BRANCH};if(remoteTrackSha)body.sha=remoteTrackSha;
  const r=await api(`/contents/${TRACK_PATH}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  remoteTrackSha=r?.content?.sha||remoteTrackSha;
  tracks.forEach(t=>t.syncState='PRIVATE_SYNCED');saveLocalTracks();renderTracks();return true;
}
async function syncTracks(){saveLocalTracks();try{await saveRemoteTracks();log('TRACK registry synchronisé dans vigie-state','ok')}catch(e){tracks.forEach(t=>{if(t.syncState!=='PRIVATE_SYNCED')t.syncState='LOCAL_PENDING'});saveLocalTracks();log('TRACK local conservé · sync privée en attente: '+e.message,'warn')}}

async function refresh(){
  if(!token)return;
  setStatus('SYNC…','busy'); const start=performance.now();
  try{
    const groups=await Promise.all([loadVigie(),loadStates(),loadSwarmState(),loadConversationLedger(),loadGitActivity()]);
    events=sortEvents(dedupeEvents(groups.flat()));
    const changed=applyEventsToTracks(tracks,events);if(changed)await syncTracks();
    lastRefresh=new Date(); renderAll(); setStatus(`LIVE · ${events.length} événements`,'ok');
    log(`refresh PASS · ${events.length} événements · ${tracks.length} suivis · ${Math.round(performance.now()-start)} ms`,'ok');
  }catch(e){setStatus('DEGRADED','bad');log('refresh FAIL · '+e.message,'bad')}
}

function filteredEvents(){
  let x=events;
  if(mode==='ALERTES')x=x.filter(e=>['critical','warning'].includes(e.severity));
  if(mode==='SUIVIS'){
    const ids=new Set(tracks.flatMap(t=>(t.matches||[]).map(m=>m.eventId)));x=x.filter(e=>ids.has(e.id));
  }
  if(search.trim()){const q=search.toLowerCase();x=x.filter(e=>safeString(e).toLowerCase().includes(q))}
  return x;
}
function engineCounts(){const m={};for(const e of events)m[e.engine]=(m[e.engine]||0)+1;return m}
function renderEngines(){const m=engineCounts();$('#engineList').innerHTML=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<button data-engine="${esc(k)}"><span>${esc(k)}</span><b>${v}</b></button>`).join('')||'<div class="empty">aucun moteur chargé</div>';document.querySelectorAll('[data-engine]').forEach(b=>b.onclick=()=>{$('#search').value=b.dataset.engine;search=b.dataset.engine;renderEvents()})}
function severityGlyph(s){return s==='critical'?'◆':s==='warning'?'▲':s==='ok'?'●':'·'}
function renderEvents(){const x=filteredEvents();$('#eventCount').textContent=x.length;const contaminated=new Set(tracks.filter(t=>t.mode==='SWARM_CONTAMINATION'&&t.state==='ACTIVE'&&t.propagation?.active!==false).flatMap(t=>(t.matches||[]).map(m=>m.eventId)));const roots=new Map(tracks.filter(t=>t.mode==='SWARM_CONTAMINATION').map(t=>[t.originEventId,t]));$('#eventList').innerHTML=x.slice(0,500).map(e=>{const marked=contaminated.has(e.id),root=roots.get(e.id);return `<article class="event ${e.severity} ${selected?.id===e.id?'selected':''} ${marked?'contaminated':''}" data-eid="${esc(e.id)}"><button class="eventMain" data-open="${esc(e.id)}"><div class="eventTop"><span class="sev">${severityGlyph(e.severity)}</span><b>${esc(e.engine)}</b>${marked?'<span class="workMark">WORK</span>':''}<time>${esc(formatTime(e.at))}</time></div><div class="summary">${esc(e.summary)}</div><div class="meta">${esc(e.type)}${e.status?' · '+esc(e.status):''}${e.project?' · '+esc(e.project):''}</div></button><button class="tagBtn" title="Tag / suivre" data-tag="${esc(e.id)}">⌖</button><button class="swarmBtn ${marked?'active':''} ${root&&root.state!=='ACTIVE'?'paused':''}" title="SWARM contamination · propager Work sur la ramification" data-swarm="${esc(e.id)}">☣</button></article>`}).join('')||'<div class="empty">aucun événement pour ce filtre</div>';
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>selectEvent(b.dataset.open));document.querySelectorAll('[data-tag]').forEach(b=>b.onclick=e=>{e.stopPropagation();openTrackDialog(b.dataset.tag)});document.querySelectorAll('[data-swarm]').forEach(b=>b.onclick=e=>{e.stopPropagation();void toggleSwarmFromEvent(b.dataset.swarm)});
}
function formatTime(v){const d=new Date(v);return Number.isNaN(+d)?String(v).slice(0,19):d.toLocaleString()}
function selectEvent(id){selected=events.find(e=>e.id===id)||null;renderEvents();renderDetail()}
function renderDetail(){const e=selected;if(!e){$('#detail').innerHTML='<div class="empty big">Sélectionne un événement pour descendre jusqu’à sa preuve.</div>';return}const anchors=extractAnchors(e),sw=activeContaminationForEvent(tracks,e.id),root=rootContaminationForEvent(tracks,e.id);$('#detail').innerHTML=`<div class="detailHead"><div><span class="badge ${e.severity}">${esc(e.severity)}</span><h2>${esc(e.engine)}</h2></div><div class="detailActions"><button id="detailTrack">TAG / SUIVRE</button><button id="detailSwarm" class="${sw?'active':''}">${sw?'☣ CONTAMINATION ACTIVE':root?'☣ RÉACTIVER':'☣ SWARM'}</button></div></div><h3>${esc(e.summary)}</h3>${sw?`<div class="swarmBanner">WORK_SPECIAL · ${esc(sw.workSpecial?.workId||sw.trackId)} · ramification suivie</div>`:''}<dl><dt>ID</dt><dd>${esc(e.id)}</dd><dt>TYPE</dt><dd>${esc(e.type)}</dd><dt>STATUT</dt><dd>${esc(e.status||'—')}</dd><dt>DATE</dt><dd>${esc(formatTime(e.at))}</dd><dt>SHA</dt><dd>${esc(e.sha||'—')}</dd></dl><section><b>ANCRES DE SUIVI DÉTECTÉES</b><div class="chips">${anchors.map(a=>`<span>${esc(a.key)}=${esc(a.value)}</span>`).join('')||'<i>aucune ancre stable</i>'}</div></section><section><b>PREUVES</b>${(e.proofRefs||[]).map(p=>`<div class="proof">${esc(p)}</div>`).join('')||'<i>aucune référence explicite</i>'}</section><section><b>ÉVÉNEMENT BRUT</b><pre>${esc(JSON.stringify(e.raw,null,2))}</pre></section>`;$('#detailTrack').onclick=()=>openTrackDialog(e.id);$('#detailSwarm').onclick=()=>void toggleSwarmFromEvent(e.id)}
function renderTracks(){const box=$('#trackList');box.innerHTML=tracks.map(t=>{const swarm=t.mode==='SWARM_CONTAMINATION',pending=t.propagation?.pendingCandidates?.length||0;return `<article class="track ${swarm?'swarmTrack':''} ${t.state==='ACTIVE'?'active':''}"><div class="trackTop"><b>${esc(t.trackId)}</b><span>${esc(t.syncState||'LOCAL')}</span></div><h3>${swarm?'☣ ':''}${esc(t.label)}</h3><div class="trackMeta">${esc(t.engine)} · ${(t.matches||[]).length} événement(s) · ${esc(t.state)}${swarm?` · WORK ${esc(t.workSpecial?.workId||'')}`:''}${pending?` · ${pending} ambiguë(s)`:''}</div><div class="chips">${(t.anchors||[]).map(a=>`<span>${esc(a.key)}=${esc(a.value)}</span>`).join('')}</div><div class="trackActions"><button data-showtrack="${esc(t.trackId)}">TIMELINE</button><button data-paused="${esc(t.trackId)}">${swarm?(t.state==='ACTIVE'?'STOP CONTAMINATION':'RÉACTIVER'):(t.state==='ACTIVE'?'PAUSE':'REPRENDRE')}</button></div></article>`}).join('')||'<div class="empty">aucune information taguée</div>';document.querySelectorAll('[data-showtrack]').forEach(b=>b.onclick=()=>showTrack(b.dataset.showtrack));document.querySelectorAll('[data-paused]').forEach(b=>b.onclick=()=>toggleTrack(b.dataset.paused))}
function showTrack(id){const t=tracks.find(x=>x.trackId===id);if(!t)return;$('#trackTimelineTitle').textContent=`${t.trackId} · ${t.label}`;const pending=(t.propagation?.pendingCandidates||[]);$('#trackTimeline').innerHTML=(t.mode==='SWARM_CONTAMINATION'?`<div class="swarmBanner">WORK_SPECIAL · ${esc(t.workSpecial?.workId||'—')} · propagation ${t.state==='ACTIVE'?'ACTIVE':'STOPPÉE'} · ${pending.length} ramification(s) ambiguë(s) non propagée(s)</div>`:'')+(t.matches||[]).slice().sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)).map(m=>`<div class="timelineItem ${m.kind==='SWARM_DESCENDANT'?'swarmItem':''}"><time>${esc(formatTime(m.at))}</time><b>${esc(m.engine)} · ${esc(m.type)}${m.kind?' · '+esc(m.kind):''}</b><p>${esc(m.summary)}</p><small>${esc(m.sha||m.eventId)}${m.relationProof?.length?' · '+esc(m.relationProof.join('+')):''}</small></div>`).join('')+(pending.length?`<h3>RAMIFICATIONS AMBIGUËS · BRANCHE SOURCE REQUISE</h3>${pending.map(m=>`<div class="timelineItem pending"><b>${esc(m.engine)} · ${esc(m.type)}</b><p>${esc(m.summary)}</p><small>${esc((m.relationHints||[]).join('+'))}</small></div>`).join('')}`:'');if(!$('#trackTimeline').innerHTML)$('#trackTimeline').innerHTML='<div class="empty">aucun match</div>';$('#trackModal').showModal()}
async function toggleTrack(id){const t=tracks.find(x=>x.trackId===id);if(!t)return;if(t.mode==='SWARM_CONTAMINATION')setSwarmContaminationActive(t,t.state!=='ACTIVE');else{t.state=t.state==='ACTIVE'?'PAUSED':'ACTIVE';t.updatedAt=new Date().toISOString();t.syncState='LOCAL_PENDING'}if(t.state==='ACTIVE')applyEventsToTracks([t],events);renderAll();await syncTracks()}
async function toggleSwarmFromEvent(id){const e=events.find(x=>x.id===id);if(!e)return;let t=rootContaminationForEvent(tracks,id)||activeContaminationForEvent(tracks,id);if(t){const next=t.state!=='ACTIVE';setSwarmContaminationActive(t,next);if(next)applyEventsToTracks([t],events);log(`${next?'SWARM réactivé':'SWARM stoppé'} ${t.trackId} · historique conservé`,next?'ok':'warn')}else{t=buildSwarmContamination(e,e.summary.slice(0,80),'Marquage ramifié depuis Control Tower');tracks.unshift(t);applyEventsToTracks([t],events);log(`SWARM contamination créée ${t.trackId} · WORK_SPECIAL ${t.workSpecial?.workId||''}`,'ok')}saveLocalTracks();renderAll();await syncTracks()}
function openTrackDialog(id){const e=events.find(x=>x.id===id);if(!e)return;selected=e;$('#trackLabel').value=e.summary.slice(0,80);$('#trackNote').value='';$('#trackOrigin').textContent=`${e.engine} · ${e.id}`;const anchors=extractAnchors(e).filter(a=>a.key!=='type');$('#trackAnchors').innerHTML=anchors.map((a,i)=>`<label><input type="checkbox" checked data-anchor-idx="${i}"> ${esc(a.key)} = ${esc(a.value)}</label>`).join('')||'<i>Aucune ancre stable : le tag suivra au minimum l’événement d’origine.</i>';$('#trackDialog').dataset.eventId=id;$('#trackDialog').showModal()}
async function confirmTrack(){const id=$('#trackDialog').dataset.eventId,e=events.find(x=>x.id===id);if(!e)return;const t=buildTrack(e,$('#trackLabel').value,$('#trackNote').value);const all=extractAnchors(e).filter(a=>a.key!=='type');const selectedIdx=[...document.querySelectorAll('[data-anchor-idx]:checked')].map(n=>Number(n.dataset.anchorIdx));t.anchors=selectedIdx.map(i=>all[i]).filter(Boolean);tracks.unshift(t);saveLocalTracks();$('#trackDialog').close();renderTracks();renderEvents();log(`TAG créé ${t.trackId} · ${t.anchors.length} ancre(s)`,'ok');await syncTracks()}
function renderKpis(){const alerts=events.filter(e=>['critical','warning'].includes(e.severity)).length;$('#kEvents').textContent=events.length;$('#kAlerts').textContent=alerts;$('#kEngines').textContent=Object.keys(engineCounts()).length;$('#kTracks').textContent=tracks.filter(t=>t.state==='ACTIVE').length;$('#lastRefresh').textContent=lastRefresh?lastRefresh.toLocaleTimeString():'—'}
function renderAll(){renderKpis();renderEngines();renderEvents();renderDetail();renderTracks()}

function setMode(m){mode=m;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));renderEvents()}
async function connect(){token=$('#token').value.trim();$('#token').value='';if(!token)return;setStatus('AUTH…','busy');try{await api('');setStatus('AUTH OK','ok');log('SAS privé ouvert · token mémoire uniquement','ok');const local=loadLocalTracks();let remote=[];try{remote=await loadRemoteTracks()}catch(e){log('registre TRACK distant indisponible: '+e.message,'warn')}const merged=new Map();[...remote,...local].forEach(t=>merged.set(t.trackId,t));tracks=[...merged.values()];renderTracks();await refresh();pollTimer=setInterval(refresh,POLL_MS)}catch(e){token='';setStatus('AUTH FAIL','bad');log('auth FAIL · '+e.message,'bad')}}
function lock(){token='';if(pollTimer)clearInterval(pollTimer);pollTimer=null;setStatus('VERROUILLÉ','');events=[];selected=null;renderAll();log('SAS fermé · aucune donnée privée conservée en mémoire','warn')}

function runCommand(line){const [cmd,...args]=line.trim().split(/\s+/);if(!cmd)return;const q=args.join(' ');log('> '+line,'cmd');switch(cmd.toLowerCase()){
  case 'help':log('help · live · alerts · tracks · engines · search <texte> · engine <nom> · track <TRACK-ID> · swarm <event-id> · refresh · status · clear');break;
  case 'live':setMode('LIVE');break;case 'alerts':setMode('ALERTES');break;case 'tracks':setMode('SUIVIS');break;
  case 'engines':log(Object.entries(engineCounts()).map(([k,v])=>`${k}:${v}`).join(' · '));break;
  case 'search':search=q;$('#search').value=q;renderEvents();break;
  case 'engine':search=q;$('#search').value=q;renderEvents();break;
  case 'track':if(q)showTrack(q);else log('usage: track TRACK-...','warn');break;
  case 'swarm':if(q)void toggleSwarmFromEvent(q);else if(selected)void toggleSwarmFromEvent(selected.id);else log('usage: swarm <event-id> ou sélectionner un événement','warn');break;
  case 'refresh':void refresh();break;
  case 'status':log(`${$('#connectionState').textContent} · events=${events.length} · tracks=${tracks.length} · poll=${POLL_MS/1000}s`);break;
  case 'clear':$('#terminalLog').innerHTML='';break;
  default:log('commande inconnue · help','warn');
}}

document.addEventListener('DOMContentLoaded',()=>{
  tracks=loadLocalTracks();renderAll();
  $('#connect').onclick=connect;$('#lock').onclick=lock;$('#refresh').onclick=()=>refresh();
  $('#search').oninput=e=>{search=e.target.value;renderEvents()};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('#trackCancel').onclick=()=>$('#trackDialog').close();$('#trackConfirm').onclick=confirmTrack;$('#trackTimelineClose').onclick=()=>$('#trackModal').close();
  $('#terminalForm').onsubmit=e=>{e.preventDefault();const i=$('#terminalInput');runCommand(i.value);i.value=''};
  window.GVAULT_CONTROL_TOWER={schema:'GVAULT_CONTROL_TOWER_V2',setToken:async t=>{token=String(t||'');await refresh()},refresh,lock,getState:()=>({events:events.length,tracks:tracks.length,lastRefresh})};
  window.addEventListener('pagehide',()=>{token='';if(pollTimer)clearInterval(pollTimer)});
  log('CONTROL TOWER V2 prêt · ouvre le SAS pour lire le Gvault privé');
});
