import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sealAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';

const ROOT=process.cwd();
const script=name=>path.join(ROOT,'scripts',name);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'))}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n','utf8')}
function run(name,args,{ok=true}={}){
  const r=spawnSync(process.execPath,[script(name),...args],{cwd:ROOT,encoding:'utf8'});
  if(ok&&r.status!==0)throw new Error(`${name} failed\nSTDOUT:${r.stdout}\nSTDERR:${r.stderr}`);
  if(!ok&&r.status===0)throw new Error(`${name} unexpectedly passed`);
  return r;
}
function countFiles(dir){return fs.readdir(dir).then(x=>x.filter(n=>n.endsWith('.json')).length)}

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gvault-runner1-parity-'));
let passed=0;
const check=(condition,message)=>{assert.ok(condition,message);passed+=1;};
try{
  // REQUEST INGRESS: history-first, exact replay, no pointer rollback, ID collision fail-closed.
  const reqDir=path.join(tmp,'requests');
  const reqInput=path.join(tmp,'request.json');const reqResult=path.join(tmp,'request-result.json');
  const req1={schema:'GVAULT_PUBLIC_SCOUT_REQUEST_V1',requestId:'REQ-1',topic:'one',url:'https://example.com/a.json',fallbackUrls:[],method:'GET',reason:'test'};
  await writeJson(reqInput,req1);
  run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult]);
  const rr1=await readJson(reqResult);check(rr1.historyCreated===true,'request1 history created');
  const req1Current=await fs.readFile(path.join(reqDir,'current.json'),'utf8');const req1History=await fs.readFile(path.join(reqDir,'history',`${rr1.requestSha256}.json`),'utf8');check(req1Current===req1History,'request current equals immutable history');
  run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult]);
  const rrReplay=await readJson(reqResult);check(rrReplay.replayed===true&&rrReplay.changed===false,'request replay idempotent');
  const req2={...req1,requestId:'REQ-2',topic:'two',url:'https://example.com/b.json'};await writeJson(reqInput,req2);
  run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult]);
  const rr2=await readJson(reqResult);check(rr2.historyCreated===true&&await countFiles(path.join(reqDir,'history'))===2,'second request preserved beside first');
  const currentAfter2=await fs.readFile(path.join(reqDir,'current.json'),'utf8');
  await writeJson(reqInput,req1);run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult]);
  check(await fs.readFile(path.join(reqDir,'current.json'),'utf8')===currentAfter2,'old request replay does not roll current back');
  const collision={...req1,url:'https://example.com/evil-different.json'};await writeJson(reqInput,collision);
  const collisionRun=run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult],{ok:false});check(/PUBLIC_REQUEST_ID_COLLISION/.test(collisionRun.stderr),'same requestId different payload blocked');
  check(await countFiles(path.join(reqDir,'history'))===2,'collision created no third request history');

  // AGENT INGRESS: immutable outbound history + current pointer never rolls backward.
  const outDir=path.join(tmp,'outbound');const packetInput=path.join(tmp,'packet.json');const ingressResult=path.join(tmp,'ingress-result.json');
  const p1=await sealAgentPublicOutbound({text:'message one',createdAt:'2026-08-30T00:00:00.000Z'});const p2=await sealAgentPublicOutbound({text:'message two',createdAt:'2026-08-30T00:01:00.000Z'});
  await writeJson(packetInput,p1);run('public-scout-agent-ingress.mjs',['--input',packetInput,'--out-dir',outDir,'--result',ingressResult]);
  check((await readJson(ingressResult)).historyCreated===true,'agent packet1 history created');
  await writeJson(packetInput,p2);run('public-scout-agent-ingress.mjs',['--input',packetInput,'--out-dir',outDir,'--result',ingressResult]);
  const agentCurrent2=await fs.readFile(path.join(outDir,'current.json'),'utf8');check(await countFiles(path.join(outDir,'history'))===2,'agent packet histories both preserved');
  await writeJson(packetInput,p1);run('public-scout-agent-ingress.mjs',['--input',packetInput,'--out-dir',outDir,'--result',ingressResult]);
  check(await fs.readFile(path.join(outDir,'current.json'),'utf8')===agentCurrent2,'old agent packet replay does not roll current back');

  // MESSAGE PUBLISHER: immutable public message history and stable publishedAt/hash on replay.
  const msgDir=path.join(tmp,'messages');const publishResult=path.join(tmp,'publish-result.json');
  await writeJson(packetInput,p1);run('public-scout-agent-publish.mjs',['--input',packetInput,'--out-dir',msgDir,'--result',publishResult]);
  const m1=await readJson(path.join(msgDir,'history',`${p1.payloadSha256}.json`));
  await writeJson(packetInput,p2);run('public-scout-agent-publish.mjs',['--input',packetInput,'--out-dir',msgDir,'--result',publishResult]);
  const msgLatest2=await fs.readFile(path.join(msgDir,'latest.json'),'utf8');
  await writeJson(packetInput,p1);run('public-scout-agent-publish.mjs',['--input',packetInput,'--out-dir',msgDir,'--result',publishResult]);
  const m1Replay=await readJson(path.join(msgDir,'history',`${p1.payloadSha256}.json`));check(m1Replay.publicMessageSha256===m1.publicMessageSha256&&m1Replay.publishedAt===m1.publishedAt,'message replay reuses exact historical proof');
  check(await fs.readFile(path.join(msgDir,'latest.json'),'utf8')===msgLatest2,'old message replay does not roll latest back');
  const tampered={...m1,publicMessageSha256:'0'.repeat(64)};await writeJson(path.join(msgDir,'history',`${p1.payloadSha256}.json`),tampered);
  const tamperPublish=run('public-scout-agent-publish.mjs',['--input',packetInput,'--out-dir',msgDir,'--result',publishResult],{ok:false});check(/HISTORY_HASH|LATEST_HISTORY/.test(tamperPublish.stderr),'tampered message history rejected');
  await writeJson(path.join(msgDir,'history',`${p1.payloadSha256}.json`),m1);

  // AGENT ACK: exact data commit -> one immutable ACK forever; old replay cannot move latest.
  const ackDir=path.join(tmp,'agent-ack');const ackResult=path.join(tmp,'agent-ack-result.json');const stateInput=path.join(tmp,'state.json');
  await writeJson(stateInput,m1);run('public-scout-agent-build-ack.mjs',['--state',stateInput,'--data-commit','a'.repeat(40),'--out-dir',ackDir,'--result',ackResult]);
  const a1=await readJson(path.join(ackDir,'history',`${'a'.repeat(40)}.json`));
  const m2=await readJson(path.join(msgDir,'history',`${p2.payloadSha256}.json`));await writeJson(stateInput,m2);run('public-scout-agent-build-ack.mjs',['--state',stateInput,'--data-commit','b'.repeat(40),'--out-dir',ackDir,'--result',ackResult]);
  const ackLatest2=await fs.readFile(path.join(ackDir,'latest.json'),'utf8');
  await writeJson(stateInput,m1);run('public-scout-agent-build-ack.mjs',['--state',stateInput,'--data-commit','a'.repeat(40),'--out-dir',ackDir,'--result',ackResult]);
  const a1Replay=await readJson(path.join(ackDir,'history',`${'a'.repeat(40)}.json`));check(a1Replay.ackDigest===a1.ackDigest&&a1Replay.acceptedAt===a1.acceptedAt,'agent ACK replay is byte-stable authority');
  check(await fs.readFile(path.join(ackDir,'latest.json'),'utf8')===ackLatest2,'old agent ACK replay does not roll latest back');
  const badAck={...a1,ackDigest:'f'.repeat(64)};await writeJson(path.join(ackDir,'history',`${'a'.repeat(40)}.json`),badAck);const tamperAck=run('public-scout-agent-build-ack.mjs',['--state',stateInput,'--data-commit','a'.repeat(40),'--out-dir',ackDir,'--result',ackResult],{ok:false});check(/HISTORY_HASH/.test(tamperAck.stderr),'tampered agent ACK history rejected');

  // GENERAL PUBLIC-SCOUT ACK: same replay invariants.
  const generalAckDir=path.join(tmp,'general-ack');const generalResult=path.join(tmp,'general-result.json');const scoutStatePath=path.join(tmp,'scout-state.json');
  const makeScout=(tag)=>{const core={schema:'GVAULT_PUBLIC_SCOUT_LATEST_V1',version:1,status:'PASS',topic:`topic-${tag}`,translationDigest:sha(`translation-${tag}`),sourceBodySha256:sha(`source-${tag}`),integrity:{state:'PASS',rawBodyPublished:false,privateCredentialRequired:false,translatorNetworkUsed:false}};return {...core,publicStateSha256:sha(canonical(core))};};
  const s1=makeScout('1'),s2=makeScout('2');await writeJson(scoutStatePath,s1);run('public-scout-build-ack.mjs',['--state',scoutStatePath,'--data-commit','c'.repeat(40),'--out-dir',generalAckDir,'--result',generalResult]);const ga1=await readJson(path.join(generalAckDir,'history',`${'c'.repeat(40)}.json`));
  await writeJson(scoutStatePath,s2);run('public-scout-build-ack.mjs',['--state',scoutStatePath,'--data-commit','d'.repeat(40),'--out-dir',generalAckDir,'--result',generalResult]);const generalLatest2=await fs.readFile(path.join(generalAckDir,'latest.json'),'utf8');
  await writeJson(scoutStatePath,s1);run('public-scout-build-ack.mjs',['--state',scoutStatePath,'--data-commit','c'.repeat(40),'--out-dir',generalAckDir,'--result',generalResult]);const ga1Replay=await readJson(path.join(generalAckDir,'history',`${'c'.repeat(40)}.json`));check(ga1Replay.ackDigest===ga1.ackDigest&&ga1Replay.acceptedAt===ga1.acceptedAt,'general ACK replay stable');
  check(await fs.readFile(path.join(generalAckDir,'latest.json'),'utf8')===generalLatest2,'old general ACK replay does not roll latest back');

  console.log(JSON.stringify({schema:'GVAULT_PUBLIC_RUNNER1_PARITY_TEST_V1',status:'PASS',assertions:passed,temp:tmp},null,2));
}finally{await fs.rm(tmp,{recursive:true,force:true});}
