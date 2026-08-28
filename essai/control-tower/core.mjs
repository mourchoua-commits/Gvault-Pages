export const STRONG_ANCHORS = ['ledgerId','workId','projectId','actionId','project','workflow','issue','pullRequest'];
export const WEAK_ANCHORS = ['branch','ref','type'];

export function safeString(v){
  if(v===null||v===undefined) return '';
  if(typeof v==='string') return v;
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  try{return JSON.stringify(v)}catch{return String(v)}
}

export function deepPick(obj,names,maxDepth=4){
  const wanted=new Set(names.map(x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'')));
  const seen=new Set();
  function walk(v,depth){
    if(v===null||v===undefined||depth>maxDepth) return undefined;
    if(typeof v!=='object') return undefined;
    if(seen.has(v)) return undefined; seen.add(v);
    for(const [k,val] of Object.entries(v)){
      const nk=k.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(wanted.has(nk) && (typeof val==='string'||typeof val==='number'||typeof val==='boolean')) return val;
    }
    for(const val of Object.values(v)){
      if(val && typeof val==='object'){
        const hit=walk(val,depth+1); if(hit!==undefined) return hit;
      }
    }
    return undefined;
  }
  return walk(obj,0);
}

export function normalizeSeverity(v){
  const s=safeString(v).toLowerCase();
  if(/critical|fatal|panic|security|failed|failure|error/.test(s)) return 'critical';
  if(/warn|pending|degrad|unproven|gap|orphan|retry/.test(s)) return 'warning';
  if(/pass|success|ok|healthy|active|synced/.test(s)) return 'ok';
  return 'info';
}

export function normalizeEvent(raw,engine='unknown',source='unknown',fallbackIndex=0){
  const at=deepPick(raw,['capturedAt','created_at','createdAt','updatedAt','updated_at','timestamp','time','date','at']) || new Date(0).toISOString();
  const type=deepPick(raw,['event_type','eventType','type','kind','schema','status']) || 'event';
  const status=deepPick(raw,['status','state','verification','conclusion','result']) || '';
  const severity=normalizeSeverity(deepPick(raw,['severity','level','status','state','conclusion','result']) || type);
  const summary=deepPick(raw,['summary','message','title','name','description','intent','question']) || safeString(type);
  const eventId=deepPick(raw,['event_id','eventId','id','sha','commitSha','node_id']) || `${engine}:${fallbackIndex}:${safeString(at)}`;
  const project=deepPick(raw,['project','projectId','project_id','repository','repo','scope']) || '';
  const sha=deepPick(raw,['commitSha','commit_sha','sha','head_sha','blobSha','blob_sha']) || '';
  const proof=deepPick(raw,['proofRef','proof_ref','url','html_url','path','filename']) || '';
  return {
    id:String(eventId), at:String(at), engine:String(engine), source:String(source),
    severity, type:String(type), status:String(status), summary:String(summary),
    project:String(project), sha:String(sha), proofRefs: proof ? [String(proof)] : [], raw
  };
}

export function extractAnchors(event){
  const r=event.raw||{};
  const candidates={
    ledgerId:deepPick(r,['ledgerId','ledger_id']),
    workId:deepPick(r,['workId','work_id','GVAULT-Work-ID','workSpecialId']),
    projectId:deepPick(r,['projectId','project_id']),
    actionId:deepPick(r,['actionId','action_id','GVAULT-Action-ID']),
    project:event.project || deepPick(r,['project','repository','repo']),
    workflow:deepPick(r,['workflow','workflow_name','workflowName','job']),
    issue:deepPick(r,['issue','issue_number','issueNumber']),
    pullRequest:deepPick(r,['pull_request','pullRequest','pr','pr_number']),
    branch:deepPick(r,['branch','ref','head_ref','base_ref']),
    type:event.type
  };
  return Object.entries(candidates)
    .filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()!=='')
    .map(([key,value])=>({key,value:String(value)}));
}

export function trackMatchScore(track,event){
  const anchors=extractAnchors(event);
  const map=new Map(anchors.map(a=>[a.key,a.value]));
  let score=0, matched=[];
  for(const a of track.anchors||[]){
    if(map.get(a.key)===a.value){
      const pts=STRONG_ANCHORS.includes(a.key)?100:(a.key==='branch'||a.key==='ref'?70:20);
      score+=pts; matched.push(a.key);
    }
  }
  if(track.engine && track.engine===event.engine) score+=20;
  if(track.originType && track.originType===event.type) score+=15;
  return {score,matched,match:score>=100};
}

export function buildTrack(event,label='',note=''){
  const now=new Date().toISOString();
  const seed=(event.engine+'|'+event.id+'|'+now).replace(/[^a-zA-Z0-9]/g,'').slice(-18);
  return {
    schema:'GVAULT_CONTROL_TOWER_TRACK_V1',
    trackId:`TRACK-${seed || Date.now()}`,
    state:'ACTIVE',
    label:label.trim() || event.summary.slice(0,80),
    note:note.trim(),
    engine:event.engine,
    originEventId:event.id,
    originType:event.type,
    originSha:event.sha||'',
    anchors:extractAnchors(event).filter(a=>a.key!=='type'),
    createdAt:now,
    updatedAt:now,
    lastMatchAt:event.at,
    syncState:'LOCAL_PENDING',
    matches:[minimalMatch(event,'ORIGIN')]
  };
}

export function minimalMatch(event,kind='MATCH'){
  return {kind,eventId:event.id,at:event.at,engine:event.engine,type:event.type,status:event.status||'',summary:event.summary,sha:event.sha||'',proofRefs:event.proofRefs||[]};
}

export function applyEventsToTracks(tracks,events){
  let changed=false;
  const byId=new Map(events.map(e=>[e.id,e]));
  for(const track of tracks){
    if(track.state!=='ACTIVE') continue;
    const known=new Set((track.matches||[]).map(m=>m.eventId));
    for(const e of events){
      if(known.has(e.id)) continue;
      const m=trackMatchScore(track,e);
      if(m.match){
        track.matches=track.matches||[];
        track.matches.push({...minimalMatch(e),score:m.score,matchedAnchors:m.matched});
        track.updatedAt=new Date().toISOString();
        track.lastMatchAt=e.at;
        changed=true;
      }
    }
    if(!track.matches?.length && byId.has(track.originEventId)){
      track.matches=[minimalMatch(byId.get(track.originEventId),'ORIGIN')]; changed=true;
    }
  }
  return changed;
}

export function sortEvents(events){
  return [...events].sort((a,b)=>{
    const ta=Date.parse(a.at)||0,tb=Date.parse(b.at)||0;
    return tb-ta || String(b.id).localeCompare(String(a.id));
  });
}

export function dedupeEvents(events){
  const m=new Map();
  for(const e of events){
    const key=`${e.engine}|${e.id}`;
    if(!m.has(key)) m.set(key,e);
  }
  return [...m.values()];
}
