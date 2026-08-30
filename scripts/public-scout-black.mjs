import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const sha256=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const requestPath=path.resolve(arg('--request','essai/control-tower/public-scout/requests/current.json'));
const policyPath=path.resolve(arg('--policy','essai/control-tower/public-scout/sources.json'));
const outPath=path.resolve(arg('--out','/tmp/gvault-public-scout-black.raw.json'));
const [request,policy]=await Promise.all([fs.readFile(requestPath,'utf8').then(JSON.parse),fs.readFile(policyPath,'utf8').then(JSON.parse)]);

function blockedHost(host){
  const h=String(host||'').toLowerCase();
  if(!h)return true;
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)||h.includes(':'))return true;
  return (policy.forbiddenHostFragments||[]).some(x=>h===String(x).toLowerCase()||h.endsWith(String(x).toLowerCase()));
}
function validateUrl(value){
  const u=new URL(String(value||''));
  if(policy.httpsOnly!==false&&u.protocol!=='https:')throw new Error('PUBLIC_SCOUT_HTTPS_REQUIRED');
  if(u.username||u.password)throw new Error('PUBLIC_SCOUT_URL_CREDENTIALS_FORBIDDEN');
  if(blockedHost(u.hostname))throw new Error('PUBLIC_SCOUT_HOST_BLOCKED');
  if(!(policy.allowedHosts||[]).map(x=>String(x).toLowerCase()).includes(u.hostname.toLowerCase()))throw new Error(`PUBLIC_SCOUT_HOST_NOT_ALLOWLISTED: ${u.hostname}`);
  const port=u.port?Number(u.port):443;
  if(!(policy.allowedPorts||[443]).includes(port))throw new Error('PUBLIC_SCOUT_PORT_FORBIDDEN');
  return u;
}
function acceptedType(value=''){
  const t=String(value).split(';')[0].trim().toLowerCase();
  return (policy.acceptedContentTypes||[]).some(rule=>String(rule).endsWith('/')?t.startsWith(String(rule)):t===String(rule));
}
async function fetchBounded(initial){
  let u=validateUrl(initial);
  const redirects=Number(policy.maxRedirects??2);
  for(let n=0;n<=redirects;n++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(policy.timeoutMs||10000));
    let response;
    try{response=await fetch(u,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json,text/plain,text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.1','User-Agent':'GVAULT-Public-Scout-Black/1.0'}});}finally{clearTimeout(timer)}
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw new Error('PUBLIC_SCOUT_REDIRECT_WITHOUT_LOCATION');
      if(n===redirects)throw new Error('PUBLIC_SCOUT_REDIRECT_LIMIT');
      u=validateUrl(new URL(location,u).href);continue;
    }
    if(!response.ok)throw new Error(`PUBLIC_SCOUT_HTTP_${response.status}`);
    const type=response.headers.get('content-type')||'';
    if(!acceptedType(type))throw new Error(`PUBLIC_SCOUT_CONTENT_TYPE_REJECTED: ${type}`);
    const declared=Number(response.headers.get('content-length')||0);
    const max=Number(policy.maxBodyBytes||262144);
    if(declared>max)throw new Error(`PUBLIC_SCOUT_BODY_TOO_LARGE_DECLARED: ${declared}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>max)throw new Error(`PUBLIC_SCOUT_BODY_TOO_LARGE: ${bytes.length}`);
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('PUBLIC_SCOUT_UTF8_REQUIRED')}
    return {url:u.href,status:response.status,contentType:type,bytes,text,headers:{etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified'),date:response.headers.get('date'),cacheControl:response.headers.get('cache-control')}};
  }
  throw new Error('PUBLIC_SCOUT_REDIRECT_FAILURE');
}

if(request.schema!=='GVAULT_PUBLIC_SCOUT_REQUEST_V1')throw new Error('PUBLIC_SCOUT_REQUEST_SCHEMA');
if(String(request.method||'GET').toUpperCase()!=='GET')throw new Error('PUBLIC_SCOUT_GET_ONLY');
if(policy.credentialsAllowed!==false)throw new Error('PUBLIC_SCOUT_POLICY_MUST_FORBID_CREDENTIALS');
const result=await fetchBounded(request.url);
const bodySha256=sha256(result.bytes);
const envelope={
  schema:'GVAULT_PUBLIC_SCOUT_BLACK_RAW_V1',
  version:1,
  request:{requestId:String(request.requestId||''),topic:String(request.topic||'public-research').slice(0,120),url:result.url,method:'GET'},
  fetch:{status:result.status,contentType:result.contentType,utf8Bytes:result.bytes.length,bodySha256,fetchedAt:new Date().toISOString(),safeHeaders:result.headers},
  body:textSafe(result.text),
  trust:'UNTRUSTED_PUBLIC_INPUT',
  translationPerformed:false,
  credentialsObservedByScanner:false
};
function textSafe(v){return String(v??'')}
await fs.mkdir(path.dirname(outPath),{recursive:true});
await fs.writeFile(outPath,JSON.stringify(envelope,null,2)+'\n','utf8');
console.log(JSON.stringify({schema:envelope.schema,status:'PASS',requestId:envelope.request.requestId,host:new URL(result.url).hostname,utf8Bytes:result.bytes.length,bodySha256,translationPerformed:false,credentialsObservedByScanner:false},null,2));
