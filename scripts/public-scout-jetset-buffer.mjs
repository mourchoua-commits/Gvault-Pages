#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const root=path.resolve(arg('--root',process.cwd()));
const configPath=path.resolve(root,arg('--config','essai/control-tower/public-scout/agent/jetset/config.json'));
const outputPath=path.resolve(root,arg('--output','essai/control-tower/public-scout/agent/jetset/buffer.latest.json'));
const requestDir=path.resolve(root,'essai/control-tower/public-scout/requests/history');
const messageDir=path.resolve(root,'essai/control-tower/public-scout/agent/messages/history');
const SECRET_RE=/(?:gh[pousr]_|github_pat_|Bearer\s+[A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9_-]{16,}|(?:password|passwd|secret|token)\s*[:=]\s*[^\s,;}]+)/ig;
const SECRET_TEST_RE=/(?:gh[pousr]_|github_pat_|Bearer\s+[A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9_-]{16,}|(?:password|passwd|secret|token)\s*[:=]\s*[^\s,;}]+)/i;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const canonical=v=>JSON.stringify(stable(v));
const sha256=s=>crypto.createHash('sha256').update(Buffer.from(String(s),'utf8')).digest('hex');
const safeText=(value,max)=>String(value??'').replace(SECRET_RE,'[REDACTED]').slice(0,max);
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function files(dir){try{return (await fs.readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return []}}
function when(x,fallback){const t=Date.parse(x);return Number.isFinite(t)?t:fallback;}
function requestEntry(x,file,max){if(x?.schema!=='GVAULT_PUBLIC_SCOUT_REQUEST_V1'||!x.requestId)return null;const excerpt=safeText([x.topic,x.reason].filter(Boolean).join(' — '),max);return {kind:'PUBLIC_REQUEST',id:String(x.requestId),at:null,excerpt,digest:sha256(excerpt),source:`requests/history/${file}`};}
function messageEntry(x,file,max){const p=x?.packet||{};if(x?.schema!=='GVAULT_AI_PUBLIC_MESSAGE_V1'||x?.status!=='PASS'||p.visibility!=='PUBLIC_ONLY'||p.rawPrivateDataAllowed!==false||!p.packetId)return null;const excerpt=safeText(p.text,max);return {kind:'PUBLIC_AGENT_MESSAGE',id:String(p.packetId),replyTo:p.replyTo||null,at:p.createdAt||x.publishedAt||null,excerpt,digest:sha256(excerpt),source:`agent/messages/history/${file}`};}

const config=await json(configPath);
if(config?.schema!=='GVAULT_JETSET_BUFFER_CONFIG_V1')throw new Error('JETSET_CONFIG_SCHEMA');
const requestedNeed=String(config.need||'AUTO').toUpperCase();const caps=config.capacities||{LOW:4,NORMAL:8,HIGH:12};const absoluteMax=Math.max(1,Math.min(12,Number(config.absoluteMax)||12));const maxExcerpt=Math.max(120,Math.min(1600,Number(config.maxExcerptChars)||900));
const rows=[];
for(const f of await files(requestDir)){const full=path.join(requestDir,f);const x=await json(full);const e=requestEntry(x,f,maxExcerpt);if(e){const st=await fs.stat(full);e.at=x.createdAt||x.requestedAt||new Date(st.mtimeMs).toISOString();rows.push(e);}}
for(const f of await files(messageDir)){const full=path.join(messageDir,f);const x=await json(full);const e=messageEntry(x,f,maxExcerpt);if(e){const st=await fs.stat(full);e.at=e.at||new Date(st.mtimeMs).toISOString();rows.push(e);}}
rows.sort((a,b)=>when(a.at,0)-when(b.at,0)||a.id.localeCompare(b.id));
const lastMessage=[...rows].reverse().find(x=>x.kind==='PUBLIC_AGENT_MESSAGE');
const need=requestedNeed==='AUTO'?(lastMessage?.replyTo?'HIGH':rows.length<=4?'LOW':'NORMAL'):requestedNeed;
if(!['LOW','NORMAL','HIGH'].includes(need))throw new Error(`JETSET_NEED_INVALID:${requestedNeed}`);
const capacity=Math.max(1,Math.min(absoluteMax,Number(caps[need]??caps.NORMAL??8)));
const selected=rows.slice(-capacity);
const core={schema:'GVAULT_JETSET_PUBLIC_BUFFER_V1',version:1,status:'PASS',teamName:'JetSet',need,capacity,entryCount:selected.length,publicOnly:true,sanitizedOnly:true,rawPrivateDataAllowed:false,rebuildable:true,entries:selected};
const existing=await (async()=>{try{return JSON.parse(await fs.readFile(outputPath,'utf8'))}catch{return null}})();
const existingCore=existing?Object.fromEntries(Object.entries(existing).filter(([k])=>k!=='generatedAt')):null;
if(SECRET_TEST_RE.test(JSON.stringify(core)))throw new Error('JETSET_SECRET_PATTERN_AFTER_SANITIZE');
if(existingCore&&canonical(existingCore)===canonical(core)){console.log(JSON.stringify({status:'REPLAY_SUPPRESSED',need,capacity,entryCount:selected.length,changed:false,output:outputPath},null,2));}
else{const state={...core,generatedAt:new Date().toISOString()};await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,JSON.stringify(state,null,2)+'\n','utf8');console.log(JSON.stringify({status:'PASS',need,capacity,entryCount:selected.length,changed:true,output:outputPath},null,2));}
