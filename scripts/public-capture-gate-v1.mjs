import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const LOCK_NAME='.public-capture-gate.lock';
const INDEX_NAME='index.ndjson';
const HISTORY_DIR='history';
const MAX_LOCK_WAIT_MS=750;
const LOCK_STALE_MS=30_000;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const sha256Bytes=value=>crypto.createHash('sha256').update(Buffer.isBuffer(value)?value:Buffer.from(value)).digest('hex');
async function readBytes(file){try{return await fs.readFile(file)}catch(error){if(error?.code==='ENOENT')return null;throw error}}
async function readText(file){const b=await readBytes(file);return b===null?null:b.toString('utf8')}
function rel(root,file){return path.relative(root,file).replace(/\\/g,'/')}
function validId(value){const s=String(value??'').trim();return s.length>0&&s.length<=200&&!/[\u0000-\u001f\u007f]/.test(s)}
function parseIndex(raw){return String(raw||'').split(/\r?\n/).filter(Boolean).map((line,index)=>{try{return JSON.parse(line)}catch{throw new Error(`PUBLIC_CAPTURE_INDEX_BAD_JSON:${index+1}`)}})}

async function acquireLock(outDir){
  const lockPath=path.join(outDir,LOCK_NAME);const started=Date.now();
  while(true){
    try{const handle=await fs.open(lockPath,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()})+'\n','utf8');await handle.close();return lockPath;}
    catch(error){
      if(error?.code!=='EEXIST')throw error;
      try{const stat=await fs.stat(lockPath);if(Date.now()-stat.mtimeMs>LOCK_STALE_MS){await fs.unlink(lockPath);continue;}}catch(readError){if(readError?.code==='ENOENT')continue;throw readError}
      if(Date.now()-started>=MAX_LOCK_WAIT_MS)throw new Error('PUBLIC_CAPTURE_BUSY');
      await sleep(20);
    }
  }
}
async function releaseLock(lockPath){try{await fs.unlink(lockPath)}catch(error){if(error?.code!=='ENOENT')throw error}}

export async function publicCaptureGate({root=process.cwd(),outDir,rawBytes,eventKind,eventId,historyKey=null,historyExtension='.json'}={}){
  if(!outDir)throw new Error('PUBLIC_CAPTURE_OUT_DIR_REQUIRED');
  if(!validId(eventKind))throw new Error('PUBLIC_CAPTURE_EVENT_KIND_REQUIRED');
  if(!validId(eventId))throw new Error('PUBLIC_CAPTURE_EVENT_ID_REQUIRED');
  const raw=Buffer.isBuffer(rawBytes)?rawBytes:Buffer.from(rawBytes??'');if(raw.length===0)throw new Error('PUBLIC_CAPTURE_EMPTY');
  const captureSha256=sha256Bytes(raw);const storageKey=String(historyKey||captureSha256).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(storageKey))throw new Error('PUBLIC_CAPTURE_HISTORY_KEY_INVALID');
  const resolvedOut=path.resolve(root,outDir);const historyDir=path.join(resolvedOut,HISTORY_DIR);const indexPath=path.join(resolvedOut,INDEX_NAME);const currentPath=path.join(resolvedOut,'current.json');
  await fs.mkdir(historyDir,{recursive:true});const lockPath=await acquireLock(resolvedOut);
  try{
    const historyName=`${storageKey}${historyExtension}`;const historyPath=path.join(historyDir,historyName);
    let historyCreated=false,replayed=false,indexCreated=false,indexRecovered=false,pointerUpdated=false,pointerRestored=false;
    const existingHistory=await readBytes(historyPath);
    if(existingHistory!==null){
      if(existingHistory.length!==raw.length||sha256Bytes(existingHistory)!==captureSha256||!existingHistory.equals(raw))throw new Error('PUBLIC_CAPTURE_HISTORY_COLLISION');
      replayed=true;
    }else{
      try{await fs.writeFile(historyPath,raw,{flag:'wx'});historyCreated=true;}
      catch(error){if(error?.code!=='EEXIST')throw error;const raced=await readBytes(historyPath);if(raced===null||raced.length!==raw.length||sha256Bytes(raced)!==captureSha256||!raced.equals(raw))throw new Error('PUBLIC_CAPTURE_HISTORY_RACE_COLLISION');replayed=true;}
    }

    // Best private-capture invariant: write alone is never PASS.
    const readback=await readBytes(historyPath);
    if(readback===null||readback.length!==raw.length||sha256Bytes(readback)!==captureSha256||!readback.equals(raw))throw new Error('PUBLIC_CAPTURE_READBACK_MISMATCH');

    const rows=parseIndex(await readText(indexPath));const expectedHistory=`${HISTORY_DIR}/${historyName}`;
    const sameIdentity=rows.filter(row=>row?.eventKind===eventKind&&String(row?.eventId)===String(eventId));
    if(sameIdentity.some(row=>(row.captureSha256||row.payloadSha256)!==captureSha256||row.utf8Bytes!==raw.length||row.historyFile!==expectedHistory))throw new Error('PUBLIC_CAPTURE_EVENT_ID_COLLISION');
    const sameExact=sameIdentity.filter(row=>(row.captureSha256||row.payloadSha256)===captureSha256);
    if(sameExact.length>1)throw new Error('PUBLIC_CAPTURE_DUPLICATE_INDEX_IDENTITY');

    const indexRecord={schema:'GVAULT_PUBLIC_CAPTURE_INDEX_V1',version:1,eventKind:String(eventKind),eventId:String(eventId),captureSha256,payloadSha256:captureSha256,storageKey,utf8Bytes:raw.length,historyFile:expectedHistory,visibility:'PUBLIC',privateMutationAllowed:false,toolInvocation:false};
    if(sameExact.length===0){await fs.appendFile(indexPath,JSON.stringify(indexRecord)+'\n','utf8');indexCreated=true;indexRecovered=!historyCreated;}

    const verifiedRows=parseIndex(await readText(indexPath)).filter(row=>row?.eventKind===eventKind&&String(row?.eventId)===String(eventId));
    if(verifiedRows.length!==1||(verifiedRows[0].captureSha256||verifiedRows[0].payloadSha256)!==captureSha256)throw new Error('PUBLIC_CAPTURE_INDEX_READBACK_MISMATCH');

    const current=await readBytes(currentPath);
    if(historyCreated){await fs.writeFile(currentPath,raw);pointerUpdated=true;}
    else if(current===null){await fs.writeFile(currentPath,raw);pointerRestored=true;}

    return {schema:'GVAULT_PUBLIC_CAPTURE_GATE_RESULT_V1',version:1,status:'PASS',classification:'PUBLIC_INGRESS_PERSISTENCE_PREREQUISITE',eventKind:String(eventKind),eventId:String(eventId),captureSha256,payloadSha256:captureSha256,storageKey,utf8Bytes:raw.length,historyCreated,replayed,indexCreated,indexRecovered,pointerUpdated,pointerRestored,readbackExact:true,indexStatus:'PASS',historyPath:rel(root,historyPath),indexPath:rel(root,indexPath),currentPath:rel(root,currentPath),publicOnly:true,privateMutationAllowed:false,firstTurnGate:false,gthinkInvocation:false,toolInvocation:false,invariant:'PUBLIC_EVENT -> IMMUTABLE_HISTORY -> EXACT_READBACK -> APPEND_ONLY_INDEX -> CURRENT_POINTER -> DOWNSTREAM'};
  } finally {await releaseLock(lockPath);}
}
