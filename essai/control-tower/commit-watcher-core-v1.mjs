const SHA40=/^[a-f0-9]{40}$/i;
const PREFIX=/^[a-f0-9]{12,64}$/i;

export function parseSnapshotCommit(row){
  const sha=String(row?.sha||'').toLowerCase();
  if(!SHA40.test(sha)) return null;
  const message=String(row?.commit?.message||'');
  const raw=(message.match(/observability:\s*snapshot\s+([a-f0-9]{12,64})/i)||[])[1]||'';
  const snapshotPrefix=PREFIX.test(raw)?raw.toLowerCase():null;
  return {sha,message,snapshotPrefix};
}

export function classifyIngestion({previousSha='',commit,vfsResult}={}){
  if(!commit||!SHA40.test(String(commit.sha||''))) return {status:'INVALID_COMMIT',ack:false,retry:false};
  if(previousSha&&String(previousSha).toLowerCase()===String(commit.sha).toLowerCase()) return {status:'SAME',ack:true,retry:false};
  if(!vfsResult) return {status:'VFS_NO_RESULT',ack:false,retry:true};
  if(vfsResult.busy) return {status:'VFS_BUSY',ack:false,retry:true};
  if(!vfsResult.ok) return {status:String(vfsResult.error||'VFS_SYNC_FAILED'),ack:false,retry:true};
  const prefix=commit.snapshotPrefix?String(commit.snapshotPrefix).toLowerCase():null;
  const head=vfsResult.headChain?String(vfsResult.headChain).toLowerCase():null;
  if(prefix&&(!head||!head.startsWith(prefix))) return {status:'PAGES_HEAD_NOT_PROPAGATED',ack:false,retry:true};
  return {status:'INGESTED',ack:true,retry:false};
}

export function retryDelayMs({status='',rateResetEpochSec=0,nowMs=Date.now(),propagationMs=30000,errorMs=300000}={}){
  if(status==='PAGES_HEAD_NOT_PROPAGATED'||status==='VFS_BUSY'||status==='VFS_NO_RESULT'||status==='VFS_NOT_READY') return Math.max(5000,Number(propagationMs)||30000);
  if(status==='RATE_LIMIT'){
    const until=(Number(rateResetEpochSec)||0)*1000-Number(nowMs||0)+5000;
    return Math.max(Number(errorMs)||300000,until);
  }
  return Math.max(5000,Number(errorMs)||300000);
}

export const COMMIT_WATCHER_CORE_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCHER_CORE_V1'});
