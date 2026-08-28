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
  if(/warn|pending|degrad|unproven|gap|orphan|retry|ambigu/.test(s)) return 'warning';
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
    branch:deepPick(r,['branch','ref','head_ref','headBranch']),
    type:event.type
  };
  return Object.entries(candidates)
    .filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()!=='')
    .map(([key,value])=>({key,value:String(value)}));
}

export function extractLineage(event){
  const r=event.raw||{};
  const one=(names)=>{const v=deepPick(r,names);return v===undefined||v===null||String(v).trim()===''?'':String(v)};
  return {
    eventId:event.id,
    sha:event.sha||'',
    workId:one(['workId','work_id','GVAULT-Work-ID','workSpecialId']),
    originWorkId:one(['originWorkId','origin_work_id']),
    parentWorkId:one(['parentWorkId','parent_work_id']),
    ledgerId:one(['ledgerId','ledger_id']),
    projectId:one(['projectId','project_id']),
    project:event.project||one(['project','repository','repo']),
    actionId:one(['actionId','action_id','GVAULT-Action-ID']),
    branch:one(['branch','ref','head_ref','headBranch']),
    parentBranch:one(['parentBranch','parent_branch','baseBranch','base_branch','base_ref']),
    parentEventId:one(['parentEventId','parent_event_id','sourceEventId','source_event_id','derivedFromEventId','derived_from_event_id']),
    parentSha:one(['parentSha','parent_sha','sourceSha','source_sha','derivedFromSha','derived_from_sha']),
    originEventId:one(['originEventId','origin_event_id']),
    relation:one(['relation','lineageRelation','lineage_relation','kind'])
  };
}

function uniq(values){return [...new Set(values.filter(Boolean).map(String))]}
function slug(v){return String(v||'WORK').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'WORK'}

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
    mode:'PRECISE_TRACK',
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

export function buildSwarmContamination(event,label='',note=''){
  const now=new Date().toISOString();
  const lineage=extractLineage(event);
  const seed=(event.engine+'|'+event.id+'|'+now).replace(/[^a-zA-Z0-9]/g,'').slice(-18);
  const workId=lineage.workId || `WS-CT-${now.slice(0,10)}-${slug(label||event.summary||event.id)}`;
  return {
    schema:'GVAULT_CONTROL_TOWER_TRACK_V2',
    trackId:`SWARM-${seed || Date.now()}`,
    mode:'SWARM_CONTAMINATION',
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
    workSpecial:{
      marker:'WORK_SPECIAL',
      workId,
      explicitUserSpecial:true,
      protocol:'SPECIAL_WORKS_CONTINUATION_RULE',
      status:'ACTIVE',
      origin:'CONTROL_TOWER_SWARM_CONTAMINATION'
    },
    propagation:{
      active:true,
      policy:'PROVEN_LINEAGE_ONLY',
      branchSourcePolicy:'EVALUATE_WHEN_AMBIGUOUS',
      newRamifications:true,
      preserveHistoryOnStop:true,
      pendingCandidates:[]
    },
    matches:[{...minimalMatch(event,'SWARM_ORIGIN'),activeMark:true,relationProof:['origin']}]
  };
}

export function minimalMatch(event,kind='MATCH'){
  return {kind,eventId:event.id,at:event.at,engine:event.engine,type:event.type,status:event.status||'',summary:event.summary,sha:event.sha||'',proofRefs:event.proofRefs||[]};
}

function matchedLineages(track,eventsById){
  const list=[];
  for(const m of track.matches||[]){
    const e=eventsById.get(m.eventId);
    if(e) list.push(extractLineage(e));
    else list.push({eventId:m.eventId,sha:m.sha||'',workId:'',originWorkId:'',parentWorkId:'',ledgerId:'',projectId:'',project:'',actionId:'',branch:'',parentBranch:'',parentEventId:'',parentSha:'',originEventId:'',relation:''});
  }
  return list;
}

export function contaminationRelation(track,event,events=[]){
  if(track.mode!=='SWARM_CONTAMINATION') return {match:false,ambiguous:false,proof:[]};
  const byId=new Map(events.map(e=>[e.id,e]));
  const known=matchedLineages(track,byId);
  const cand=extractLineage(event);
  const eventIds=new Set(known.flatMap(x=>[x.eventId,x.originEventId]).filter(Boolean));
  const shas=new Set(known.map(x=>x.sha).filter(Boolean));
  const workIds=new Set(uniq([...known.flatMap(x=>[x.workId,x.originWorkId,x.parentWorkId]),track.workSpecial?.workId]));
  const ledgerIds=new Set(uniq(known.map(x=>x.ledgerId)));
  const actionIds=new Set(uniq(known.map(x=>x.actionId)));
  const projectIds=new Set(uniq(known.map(x=>x.projectId)));
  const projects=new Set(uniq(known.map(x=>x.project)));
  const branches=new Set(uniq(known.map(x=>x.branch)));
  const proof=[];

  if(event.id===track.originEventId) return {match:true,ambiguous:false,proof:['origin']};
  if(cand.parentEventId && eventIds.has(cand.parentEventId)) proof.push('parentEventId');
  if(cand.parentSha && shas.has(cand.parentSha)) proof.push('parentSha');
  if(cand.originEventId && eventIds.has(cand.originEventId)) proof.push('originEventId');
  if(cand.workId && workIds.has(cand.workId)) proof.push('sameWorkId');
  if(cand.parentWorkId && workIds.has(cand.parentWorkId)) proof.push('parentWorkId');
  if(cand.originWorkId && workIds.has(cand.originWorkId)) proof.push('originWorkId');
  if(cand.ledgerId && ledgerIds.has(cand.ledgerId) && ((cand.projectId&&projectIds.has(cand.projectId)) || (cand.actionId&&actionIds.has(cand.actionId)))) proof.push('sameLedger+objectiveAnchor');
  if(cand.actionId && actionIds.has(cand.actionId)) proof.push('sameActionId');

  const projectLinked=(cand.projectId&&projectIds.has(cand.projectId)) || (cand.project&&projects.has(cand.project));

  if(proof.length) return {match:true,ambiguous:false,proof};

  const weak=[];
  if(projectLinked) weak.push('sameProject');
  if(cand.branch && branches.has(cand.branch)) weak.push('sameBranch');
  if(cand.parentBranch && branches.has(cand.parentBranch)) weak.push(projectLinked?'parentBranch+projectNeedsObjectiveProof':'parentBranchWithoutObjectiveProof');
  if(cand.ledgerId && ledgerIds.has(cand.ledgerId)) weak.push('sameLedgerNeedsObjectiveProof');
  return {match:false,ambiguous:weak.length>0,proof:weak};
}

function addPendingCandidate(track,event,relation){
  track.propagation=track.propagation||{};
  const p=track.propagation.pendingCandidates=track.propagation.pendingCandidates||[];
  if(p.some(x=>x.eventId===event.id)) return false;
  p.push({...minimalMatch(event,'RAMIFICATION_PENDING'),reason:'BRANCH_AMBIGUOUS',relationHints:relation.proof});
  return true;
}

function applyContamination(track,events){
  if(track.state!=='ACTIVE'||track.propagation?.active===false) return false;
  let changed=false,progress=true,guard=0;
  const known=new Set((track.matches||[]).map(m=>m.eventId));
  while(progress && guard++<Math.max(2,events.length+1)){
    progress=false;
    for(const e of events){
      if(known.has(e.id)) continue;
      const relation=contaminationRelation(track,e,events);
      if(relation.match){
        track.matches=track.matches||[];
        track.matches.push({...minimalMatch(e,'SWARM_DESCENDANT'),activeMark:true,relationProof:relation.proof,workId:track.workSpecial?.workId||''});
        known.add(e.id);
        track.updatedAt=new Date().toISOString();
        track.lastMatchAt=e.at;
        if(track.propagation?.pendingCandidates) track.propagation.pendingCandidates=track.propagation.pendingCandidates.filter(x=>x.eventId!==e.id);
        progress=true;changed=true;
      }
    }
  }
  for(const e of events){
    if(known.has(e.id)) continue;
    const relation=contaminationRelation(track,e,events);
    if(relation.ambiguous && addPendingCandidate(track,e,relation)) changed=true;
  }
  return changed;
}

export function applyEventsToTracks(tracks,events){
  let changed=false;
  const byId=new Map(events.map(e=>[e.id,e]));
  for(const track of tracks){
    if(track.mode==='SWARM_CONTAMINATION'){
      if(applyContamination(track,events)) changed=true;
      continue;
    }
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

export function setSwarmContaminationActive(track,active){
  if(track?.mode!=='SWARM_CONTAMINATION') return false;
  track.state=active?'ACTIVE':'INACTIVE';
  track.propagation=track.propagation||{};
  track.propagation.active=Boolean(active);
  track.workSpecial=track.workSpecial||{};
  track.workSpecial.status=active?'ACTIVE':'PAUSED';
  track.updatedAt=new Date().toISOString();
  track.syncState='LOCAL_PENDING';
  for(const m of track.matches||[])m.activeMark=Boolean(active);
  return true;
}

export function activeContaminationForEvent(tracks,eventId){
  return (tracks||[]).find(t=>t.mode==='SWARM_CONTAMINATION'&&t.state==='ACTIVE'&&t.propagation?.active!==false&&(t.matches||[]).some(m=>m.eventId===eventId))||null;
}

export function rootContaminationForEvent(tracks,eventId){
  return (tracks||[]).find(t=>t.mode==='SWARM_CONTAMINATION'&&t.originEventId===eventId)||null;
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
