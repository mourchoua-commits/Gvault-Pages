import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {publicCaptureGate} from './public-capture-gate-v1.mjs';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/public-scout-request.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/requests'));
const resultPath=path.resolve(arg('--result','/tmp/public-scout-request-ingress-result.json'));
const SECRET_PATTERNS=[/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/i,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/i,/\bsk-[A-Za-z0-9_-]{16,}\b/i,/\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/i];
const hasSecret=text=>SECRET_PATTERNS.some(re=>re.test(String(text||'')));
async function readText(file){try{return await fs.readFile(file,'utf8')}catch(error){if(error?.code==='ENOENT')return null;throw error}}

const rawBytes=await fs.readFile(input);const raw=rawBytes.toString('utf8');
if(rawBytes.length>65536)throw new Error('PUBLIC_REQUEST_TOO_LARGE');
if(hasSecret(raw))throw new Error('PUBLIC_REQUEST_SECRET_PATTERN');
let request;try{request=JSON.parse(raw)}catch{throw new Error('PUBLIC_REQUEST_BAD_JSON')}
if(request?.schema!=='GVAULT_PUBLIC_SCOUT_REQUEST_V1')throw new Error('PUBLIC_REQUEST_SCHEMA');
if(!String(request.requestId||'').trim()||String(request.requestId).length>160)throw new Error('PUBLIC_REQUEST_ID_REQUIRED');
if(String(request.method||'GET').toUpperCase()!=='GET')throw new Error('PUBLIC_REQUEST_GET_ONLY');
const urls=[request.url,...(Array.isArray(request.fallbackUrls)?request.fallbackUrls:[])].filter(Boolean);
if(!urls.length||urls.length>8)throw new Error('PUBLIC_REQUEST_SOURCE_COUNT');
for(const value of urls){const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password)throw new Error('PUBLIC_REQUEST_URL_POLICY')}

// Migration guard: pre-index history can still expose a same-ID/different-payload collision.
const historyDir=path.join(outDir,'history');await fs.mkdir(historyDir,{recursive:true});
for(const name of await fs.readdir(historyDir)){
  if(!name.endsWith('.json'))continue;
  const existingRaw=await readText(path.join(historyDir,name));if(existingRaw===null)continue;
  let existing;try{existing=JSON.parse(existingRaw)}catch{throw new Error('PUBLIC_REQUEST_EXISTING_HISTORY_BAD_JSON')}
  if(String(existing?.requestId||'')===String(request.requestId)&&existingRaw!==raw)throw new Error('PUBLIC_REQUEST_ID_COLLISION');
}

const gate=await publicCaptureGate({root:process.cwd(),outDir,rawBytes,eventKind:'PUBLIC_SCOUT_REQUEST',eventId:String(request.requestId)});
const result={schema:'GVAULT_PUBLIC_SCOUT_REQUEST_INGRESS_RESULT_V2',status:gate.status,changed:gate.historyCreated||gate.indexCreated||gate.pointerUpdated||gate.pointerRestored,historyCreated:gate.historyCreated,pointerRestored:gate.pointerRestored,replayed:gate.replayed,requestId:String(request.requestId),requestSha256:gate.payloadSha256,utf8Bytes:gate.utf8Bytes,historyPath:gate.historyPath,currentPath:gate.currentPath,indexPath:gate.indexPath,historyFirst:true,idCollisionChecked:true,readbackExact:gate.readbackExact,indexStatus:gate.indexStatus,publicCaptureGate:gate};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
