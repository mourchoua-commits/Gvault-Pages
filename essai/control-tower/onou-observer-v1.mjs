const ONOU_PATHS=Object.freeze({
  entry:'modules/onou/gthink_entry.json',
  index:'modules/onou/index.json',
  versionsManifest:'modules/onou/versions_manifest.json',
  versionsPrefix:'modules/onou/versions/',
  shaIndex:'modules/onou/sha-capsules/index.json'
});

export function firstRecord(source){
  return Array.isArray(source?.records)&&source.records.length?source.records[0]:null;
}

function sourceByPath(feed,path){
  return (feed?.sources||[]).find(s=>String(s?.path||'')===path)||null;
}

function versionSources(feed){
  return (feed?.sources||[]).filter(s=>String(s?.path||'').startsWith(ONOU_PATHS.versionsPrefix));
}

function versionOrder(v){
  const seq=Number(v?.sequence_after_genesis_v1??v?.sequence??0);
  const day=Date.parse(String(v?.effective_day||v?.day||''))||0;
  return [seq,day];
}

function latestVersionFromFeed(feed,index,manifest){
  const rows=versionSources(feed).flatMap(s=>(s.records||[]).map(record=>({record,path:s.path,engine:s.engine||'onou-versions'}))).filter(x=>x.record&&typeof x.record==='object');
  rows.sort((a,b)=>{const A=versionOrder(a.record),B=versionOrder(b.record);return B[0]-A[0]||B[1]-A[1]||String(b.path).localeCompare(String(a.path));});
  if(rows[0])return rows[0];
  const declared=[...(manifest?.versions||[]),...(index?.daily_versions||[])].sort((a,b)=>Number(b?.sequence||0)-Number(a?.sequence||0)||String(b?.effective_day||b?.day||'').localeCompare(String(a?.effective_day||a?.day||'')));
  return declared[0]?{record:declared[0],path:declared[0].github_path||declared[0].path||null,engine:'onou-versions-manifest'}:null;
}

export function deriveOnouState(feed){
  const entry=firstRecord(sourceByPath(feed,ONOU_PATHS.entry));
  const index=firstRecord(sourceByPath(feed,ONOU_PATHS.index));
  const manifest=firstRecord(sourceByPath(feed,ONOU_PATHS.versionsManifest));
  const shaIndex=firstRecord(sourceByPath(feed,ONOU_PATHS.shaIndex));
  const latest=latestVersionFromFeed(feed,index,manifest);
  const canonical=index?.canonical_artifacts?.[0]||null;
  const latestRecord=latest?.record||null;
  const content=typeof latestRecord?.content==='string'?latestRecord.content:'';
  const sourceRefs=[
    entry?ONOU_PATHS.entry:null,
    index?ONOU_PATHS.index:null,
    manifest?ONOU_PATHS.versionsManifest:null,
    latest?.path||null,
    shaIndex?ONOU_PATHS.shaIndex:null
  ].filter(Boolean);
  const available=!!(entry||index||manifest||latestRecord||shaIndex);
  return {
    schema:'GVAULT_ONOU_SCREEN_STATE_V1',
    available,
    canonicalName:String(entry?.canonical_name||'ONOU'),
    canonicalArtifactId:String(entry?.canonical_artifact_id||canonical?.id||manifest?.genesis?.id||''),
    canonicalStatus:String(canonical?.status||manifest?.genesis?.status||''),
    canonicalPurpose:String(entry?.purpose||''),
    latest:{
      effectiveDay:String(latestRecord?.effective_day||latestRecord?.day||''),
      sequence:Number(latestRecord?.sequence_after_genesis_v1??latestRecord?.sequence??0),
      status:String(latestRecord?.status||''),
      path:latest?.path||null,
      source:latestRecord?.source||null,
      content
    },
    shaLocators:{
      count:Number(shaIndex?.count||0),
      generatedAt:String(shaIndex?.generated_at||''),
      status:String(shaIndex?.status||''),
      latestRefresh:Array.isArray(shaIndex?.refreshes)&&shaIndex.refreshes.length?shaIndex.refreshes[shaIndex.refreshes.length-1]:null
    },
    provenance:{
      sourceRefs,
      feedGeneratedAt:feed?.generatedAt||null,
      mainCommit:feed?.source?.mainCommit||null,
      effectiveMainCommit:feed?.source?.effectiveMainCommit||feed?.source?.effectiveSourceHeads?.main||null,
      registryVersion:feed?.sourceCoverage?.registryVersion||feed?.inputProfile?.registryVersion||null
    }
  };
}

export function fingerprintInput(state){
  return {
    canonicalArtifactId:state?.canonicalArtifactId||'',
    canonicalStatus:state?.canonicalStatus||'',
    latest:{effectiveDay:state?.latest?.effectiveDay||'',sequence:state?.latest?.sequence||0,status:state?.latest?.status||'',path:state?.latest?.path||null,content:state?.latest?.content||''},
    shaLocators:{count:state?.shaLocators?.count||0,generatedAt:state?.shaLocators?.generatedAt||'',status:state?.shaLocators?.status||''},
    registryVersion:state?.provenance?.registryVersion||null,
    effectiveMainCommit:state?.provenance?.effectiveMainCommit||null
  };
}

export async function fingerprintState(state){
  const raw=new TextEncoder().encode(JSON.stringify(fingerprintInput(state)));
  if(globalThis.crypto?.subtle){
    const digest=await globalThis.crypto.subtle.digest('SHA-256',raw);
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  let h=2166136261;for(const b of raw){h^=b;h=Math.imul(h,16777619)}return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`;
}

function observationFrom(state,fingerprint,reason,observers){
  return {
    schema:'GVAULT_ONOU_SCREEN_OBSERVATION_V1',
    observedAt:new Date().toISOString(),
    reason,
    authority:'OBSERVATION_ONLY',
    target:'ONOU',
    observerCount:observers,
    fingerprint,
    canonical:{name:state.canonicalName,id:state.canonicalArtifactId,status:state.canonicalStatus,purpose:state.canonicalPurpose},
    latest:{effectiveDay:state.latest.effectiveDay,sequence:state.latest.sequence,status:state.latest.status,path:state.latest.path,source:state.latest.source,visibleText:state.latest.content},
    shaLocators:state.shaLocators,
    provenance:state.provenance,
    interpretationPolicy:'STRUCTURED_SOURCE_FIELDS_FIRST_NO_SCREEN_GUESS_REQUIRED',
    sourceMutation:false,
    createsOnouVersion:false
  };
}

const browser=typeof window!=='undefined'&&typeof document!=='undefined';
let lastFeed=null,lastState=deriveOnouState(null),lastFingerprint='',lastObservation=null,watchTimer=null;
const observers=new Set();
const $=s=>browser?document.querySelector(s):null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ensureUi(){
  if(!browser||$('#ctOnouObserver'))return;
  const host=$('#ctSourceArchiveHealth')||$('#ctAdaptiveViews')||$('#ctPulse')||$('.kpis')||document.body;
  const n=document.createElement('section');
  n.id='ctOnouObserver';
  n.innerHTML=`<style>#ctOnouObserver{margin:0 10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);font:9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden}.ctonHead{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:9px;border-bottom:1px solid var(--line)}.ctonHead b{color:var(--accent);margin-right:auto}.ctonState{font-size:8px;color:var(--muted)}.ctonState.watch{color:var(--ok)}.ctonBody{display:grid;grid-template-columns:minmax(190px,280px) 1fr;gap:8px;padding:9px}.ctonMeta{display:grid;grid-template-columns:100px 1fr;gap:5px;font-size:8px}.ctonMeta dt{color:var(--muted)}.ctonMeta dd{margin:0;word-break:break-word}.ctonText{margin:0;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--panel2);font-size:8px;line-height:1.45}.ctonMissing{color:var(--warn);padding:10px}.ctonRefs{padding:0 9px 9px;color:var(--muted);font-size:7px;word-break:break-all}@media(max-width:620px){.ctonBody{grid-template-columns:1fr}}</style><div class="ctonHead"><b>ONOU · OBSERVER</b><span id="ctOnouWatch" class="ctonState">DORMANT</span><span id="ctOnouFp" class="ctonState">—</span></div><div id="ctOnouBody"></div><div id="ctOnouRefs" class="ctonRefs"></div>`;
  host.insertAdjacentElement('afterend',n);
}

function render(){
  if(!browser)return;
  ensureUi();
  const watch=$('#ctOnouWatch'),fp=$('#ctOnouFp'),body=$('#ctOnouBody'),refs=$('#ctOnouRefs');
  if(watch){watch.textContent=observers.size?`WATCHED · ${observers.size}`:'DORMANT';watch.className='ctonState '+(observers.size?'watch':'');}
  if(fp)fp.textContent=lastFingerprint?`fp ${lastFingerprint.slice(0,12)}`:'fp —';
  if(!lastState.available){if(body)body.innerHTML='<div class="ctonMissing">ONOU ABSENT DU FEED COURANT · aucune donnée synthétisée.</div>';if(refs)refs.textContent='';return;}
  if(body)body.innerHTML=`<div class="ctonBody"><dl class="ctonMeta"><dt>CANONIQUE</dt><dd>${esc(lastState.canonicalArtifactId||'—')}</dd><dt>ÉTAT GENESIS</dt><dd>${esc(lastState.canonicalStatus||'—')}</dd><dt>VERSION</dt><dd>${esc(lastState.latest.effectiveDay||'—')} · #${esc(lastState.latest.sequence||'—')}</dd><dt>STATUT</dt><dd>${esc(lastState.latest.status||'—')}</dd><dt>SHA LOCATORS</dt><dd>${esc(lastState.shaLocators.count)} · ${esc(lastState.shaLocators.status||'—')}</dd><dt>FEED</dt><dd>${esc(lastState.provenance.feedGeneratedAt||'—')}</dd></dl><pre class="ctonText">${esc(lastState.latest.content||'Version ONOU référencée mais contenu non présent dans ce feed.')}</pre></div>`;
  if(refs)refs.textContent=`sources · ${(lastState.provenance.sourceRefs||[]).join(' · ')}`;
}

async function acceptFeed(feed,reason='feed-decrypted'){
  lastFeed=feed||null;
  const next=deriveOnouState(lastFeed),fp=await fingerprintState(next),changed=fp!==lastFingerprint;
  lastState=next;
  if(changed){
    lastFingerprint=fp;
    lastObservation=observationFrom(next,fp,reason,observers.size);
    if(browser)window.dispatchEvent(new CustomEvent('gvault:onou-screen-observation',{detail:structuredClone(lastObservation)}));
  }
  render();
  return {changed,fingerprint:fp,state:structuredClone(next)};
}

function requestSafeRefresh(reason){
  if(!browser)return false;
  const ct=window.GVAULT_CONTROL_TOWER;
  if(ct?.schema==='GVAULT_CONTROL_TOWER_V3_ENCRYPTED_FEED'&&typeof ct.refresh==='function'){
    Promise.resolve(ct.refresh()).catch(error=>window.dispatchEvent(new CustomEvent('gvault:onou-refresh-failed',{detail:{reason,error:String(error?.message||error)}})));
    return true;
  }
  window.dispatchEvent(new CustomEvent('gvault:control-tower-refresh-request',{detail:{schema:'GVAULT_CONTROL_TOWER_REFRESH_REQUEST_V1',reason,source:'ONOU_OBSERVER',readonly:true}}));
  return false;
}

function armWatch(){
  if(!browser||watchTimer||!observers.size)return;
  watchTimer=setInterval(()=>{if(observers.size&&document.visibilityState!=='hidden')requestSafeRefresh('onou-observed-pulse')},30000);
}
function disarmWatch(){if(watchTimer){clearInterval(watchTimer);watchTimer=null}}

function acquire(id='lens'){
  const before=observers.size;observers.add(String(id||'lens'));
  if(browser&&before===0&&observers.size===1)requestSafeRefresh('onou-first-observer');
  armWatch();render();return observers.size;
}
function release(id='lens'){
  observers.delete(String(id||'lens'));if(!observers.size)disarmWatch();render();return observers.size;
}
function releaseAll(){observers.clear();disarmWatch();render()}

if(browser){
  window.addEventListener('gvault:control-tower-feed-decrypted',e=>void acceptFeed(e.detail?.feed||null,'feed-decrypted'));
  window.addEventListener('gvault:private-tool-session-expired',()=>{lastFeed=null;lastState=deriveOnouState(null);lastFingerprint='';lastObservation=null;releaseAll();render()});
  window.addEventListener('gvault:lens-observer-presence',e=>{const d=e.detail||{};if(String(d.target||'').toUpperCase()!=='ONOU')return;(d.active===false?release:acquire)(d.observerId||d.id||'lens')});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  window.addEventListener('pagehide',releaseAll,{once:true});
  window.GVAULT_CONTROL_TOWER_ONOU_OBSERVER_V1=Object.freeze({
    schema:'GVAULT_CONTROL_TOWER_ONOU_OBSERVER_V1',
    acquire,release,releaseAll,
    refresh:()=>requestSafeRefresh('onou-observer-api'),
    ingest:feed=>acceptFeed(feed,'api-ingest'),
    getState:()=>({observers:[...observers],fingerprint:lastFingerprint,onou:structuredClone(lastState),lastObservation:structuredClone(lastObservation)})
  });
}
