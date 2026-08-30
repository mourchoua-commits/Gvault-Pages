import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/gvault-public-scout-black.raw.json'));
const output=path.resolve(arg('--out','/tmp/gvault-public-scout-white.translated.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const cap=(value,n=240)=>clean(value).slice(0,n);
const SECRET_PATTERNS=[
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi
];
function redact(value){let out=String(value??'');for(const re of SECRET_PATTERNS)out=out.replace(re,'[REDACTED]');return out;}
function stripHtml(value){return redact(String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function canonical(value){return JSON.stringify(stable(value));}
function safeUrl(value){try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:null}catch{return null}}

const raw=JSON.parse(await fs.readFile(input,'utf8'));
if(raw.schema!=='GVAULT_PUBLIC_SCOUT_BLACK_RAW_V1')throw new Error('PUBLIC_SCOUT_WHITE_INPUT_SCHEMA');
if(raw.translationPerformed!==false)throw new Error('PUBLIC_SCOUT_BLACK_MUST_NOT_TRANSLATE');
const body=String(raw.body??'');
const bodySha256=sha256(Buffer.from(body,'utf8'));
if(bodySha256!==raw.fetch?.bodySha256)throw new Error('PUBLIC_SCOUT_BLACK_BODY_HASH_MISMATCH');
if(Buffer.byteLength(body,'utf8')!==raw.fetch?.utf8Bytes)throw new Error('PUBLIC_SCOUT_BLACK_BODY_BYTES_MISMATCH');

let facts=[],summary='';
const contentType=String(raw.fetch?.contentType||'').toLowerCase();
if(contentType.includes('json')){
  let parsed;try{parsed=JSON.parse(body)}catch{throw new Error('PUBLIC_SCOUT_WHITE_JSON_PARSE')}
  if(Array.isArray(parsed)&&parsed.every(x=>x&&typeof x==='object'&&('sha'in x||'commit'in x))){
    facts=parsed.slice(0,20).map((x,index)=>({
      kind:'public_git_commit',
      index,
      id:cap(x.sha,40),
      at:cap(x.commit?.committer?.date||x.commit?.author?.date,40),
      summary:cap(redact(String(x.commit?.message||'').split(/\r?\n/)[0]),180),
      url:safeUrl(x.html_url)
    }));
    summary=`${facts.length} commit(s) public(s) observé(s)`+(facts[0]?.summary?` · dernier: ${facts[0].summary}`:'');
  }else if(parsed&&typeof parsed==='object'){
    const entries=Object.entries(parsed).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,24);
    facts=entries.map(([key,value])=>({kind:'public_json_scalar',key:cap(key,80),value:cap(redact(value),180)}));
    summary=`objet JSON public · ${facts.length} champ(s) scalaire(s) retenu(s)`;
  }else{
    summary='JSON public observé · structure non scalaire';
  }
}else{
  const text=cap(stripHtml(body),800);
  facts=text?[{kind:'public_text_excerpt',excerpt:text}]:[];
  summary=text?`texte public observé · ${text.slice(0,180)}`:'texte public vide';
}
const translationBase={
  schema:'GVAULT_PUBLIC_SCOUT_WHITE_TRANSLATION_V1',
  version:1,
  requestId:cap(raw.request?.requestId,120),
  topic:cap(raw.request?.topic,120),
  sourceUrl:safeUrl(raw.request?.selectedUrl||raw.request?.url||raw.request?.requestedUrl),
  scanSourceIndex:Number.isInteger(raw.request?.sourceIndex)?raw.request.sourceIndex:null,
  scanAttemptCount:Array.isArray(raw.attempts)?raw.attempts.length:1,
  sourceBodySha256:raw.fetch.bodySha256,
  sourceUtf8Bytes:raw.fetch.utf8Bytes,
  sourceContentType:cap(raw.fetch.contentType,120),
  sourceFetchedAt:cap(raw.fetch.fetchedAt,60),
  translatedAt:new Date().toISOString(),
  summary:cap(redact(summary),500),
  facts,
  integrity:'PASS',
  sourceTrust:'UNTRUSTED_PUBLIC_INPUT',
  outputTrust:'SANITIZED_PUBLIC_SCHEMA',
  rawBodyPublished:false,
  networkUsed:false,
  credentialsRequired:false
};
const serialized=canonical(translationBase);
for(const re of SECRET_PATTERNS){re.lastIndex=0;if(re.test(serialized))throw new Error('PUBLIC_SCOUT_WHITE_REDACTION_FAIL')}
const translationDigest=sha256(Buffer.from(serialized,'utf8'));
const translated={...translationBase,translationDigest};
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(translated,null,2)+'\n','utf8');
console.log(JSON.stringify({schema:translated.schema,status:'PASS',requestId:translated.requestId,facts:facts.length,sourceUrl:translated.sourceUrl,scanSourceIndex:translated.scanSourceIndex,scanAttemptCount:translated.scanAttemptCount,sourceBodySha256:translated.sourceBodySha256,translationDigest,rawBodyPublished:false,networkUsed:false},null,2));
