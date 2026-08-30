import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/public-scout-request.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/requests'));
const resultPath=path.resolve(arg('--result','/tmp/public-scout-request-ingress-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const SECRET_PATTERNS=[/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/i,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/i,/\bsk-[A-Za-z0-9_-]{16,}\b/i,/\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/i];
const hasSecret=text=>SECRET_PATTERNS.some(re=>re.test(String(text||'')));
async function readText(file){try{return await fs.readFile(file,'utf8')}catch(error){if(error?.code==='ENOENT')return null;throw error}}

const raw=await fs.readFile(input,'utf8');
if(Buffer.byteLength(raw,'utf8')>65536)throw new Error('PUBLIC_REQUEST_TOO_LARGE');
if(hasSecret(raw))throw new Error('PUBLIC_REQUEST_SECRET_PATTERN');
let request;try{request=JSON.parse(raw)}catch{throw new Error('PUBLIC_REQUEST_BAD_JSON')}
if(request?.schema!=='GVAULT_PUBLIC_SCOUT_REQUEST_V1')throw new Error('PUBLIC_REQUEST_SCHEMA');
if(!String(request.requestId||'').trim()||String(request.requestId).length>160)throw new Error('PUBLIC_REQUEST_ID_REQUIRED');
if(String(request.method||'GET').toUpperCase()!=='GET')throw new Error('PUBLIC_REQUEST_GET_ONLY');
const urls=[request.url,...(Array.isArray(request.fallbackUrls)?request.fallbackUrls:[])].filter(Boolean);
if(!urls.length||urls.length>8)throw new Error('PUBLIC_REQUEST_SOURCE_COUNT');
for(const value of urls){const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password)throw new Error('PUBLIC_REQUEST_URL_POLICY')}

const historyDir=path.join(outDir,'history');
await fs.mkdir(historyDir,{recursive:true});
const requestSha256=sha256(Buffer.from(raw,'utf8'));
const historyPath=path.join(historyDir,`${requestSha256}.json`);
const currentPath=path.join(outDir,'current.json');
for(const name of await fs.readdir(historyDir)){
  if(!name.endsWith('.json'))continue;
  const existingRaw=await readText(path.join(historyDir,name));if(existingRaw===null)continue;
  let existing;try{existing=JSON.parse(existingRaw)}catch{throw new Error('PUBLIC_REQUEST_EXISTING_HISTORY_BAD_JSON')}
  if(String(existing?.requestId||'')===String(request.requestId)&&existingRaw!==raw)throw new Error('PUBLIC_REQUEST_ID_COLLISION');
}
let historical=await readText(historyPath);
let historyCreated=false,pointerRestored=false,replayed=false;
if(historical!==null){
  if(sha256(Buffer.from(historical,'utf8'))!==requestSha256||historical!==raw)throw new Error('PUBLIC_REQUEST_HISTORY_COLLISION');
  replayed=true;
  const current=await readText(currentPath);
  if(current===null){await fs.writeFile(currentPath,raw,'utf8');pointerRestored=true;}
  // Existing historical replay never moves a non-empty current pointer backwards.
}else{
  try{await fs.writeFile(historyPath,raw,{encoding:'utf8',flag:'wx'});historyCreated=true;}
  catch(error){if(error?.code!=='EEXIST')throw error;historical=await readText(historyPath);if(historical!==raw)throw new Error('PUBLIC_REQUEST_HISTORY_RACE_COLLISION');replayed=true;}
  if(historyCreated)await fs.writeFile(currentPath,raw,'utf8');
}
const result={schema:'GVAULT_PUBLIC_SCOUT_REQUEST_INGRESS_RESULT_V1',status:'PASS',changed:historyCreated||pointerRestored,historyCreated,pointerRestored,replayed,requestId:String(request.requestId),requestSha256,utf8Bytes:Buffer.byteLength(raw,'utf8'),historyPath:path.relative(process.cwd(),historyPath).replace(/\\/g,'/'),currentPath:path.relative(process.cwd(),currentPath).replace(/\\/g,'/'),historyFirst:true,idCollisionChecked:true};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
