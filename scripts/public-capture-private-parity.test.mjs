import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto,{webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {publicCaptureGate} from './public-capture-gate-v1.mjs';
import {sealAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';

const ROOT=process.cwd();const script=name=>path.join(ROOT,'scripts',name);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let assertions=0;const ok=(v,m)=>{assert.ok(v,m);assertions++};const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++};
const run=(name,args,{pass=true}={})=>{const r=spawnSync(process.execPath,[script(name),...args],{cwd:ROOT,encoding:'utf8'});if(pass&&r.status!==0)throw new Error(`${name} failed\n${r.stderr}`);if(!pass&&r.status===0)throw new Error(`${name} unexpectedly passed`);return r};
const read=file=>fs.readFile(file,'utf8');const lines=async file=>(await read(file)).split(/\r?\n/).filter(Boolean);
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'public-capture-parity-'));
try{
  // 1. Kernel: write -> exact readback -> index -> current.
  const dir=path.join(tmp,'kernel');const a=Buffer.from('{"event":"A"}\n','utf8');
  const a1=await publicCaptureGate({root:tmp,outDir:dir,rawBytes:a,eventKind:'FIXTURE',eventId:'A'});
  eq(a1.status,'PASS','new capture passes');ok(a1.historyCreated&&a1.indexCreated&&a1.readbackExact,'history/readback/index all proven');eq(a1.indexStatus,'PASS','index readback passes');
  eq((await fs.readFile(path.join(dir,'current.json'))).toString('utf8'),a.toString('utf8'),'current gets exact bytes only after proof');eq((await lines(path.join(dir,'index.ndjson'))).length,1,'one index line');

  // 2. Replay exact: no duplicate index.
  const a2=await publicCaptureGate({root:tmp,outDir:dir,rawBytes:a,eventKind:'FIXTURE',eventId:'A'});ok(a2.replayed&&!a2.indexCreated,'exact replay is idempotent');eq((await lines(path.join(dir,'index.ndjson'))).length,1,'replay does not duplicate index');

  // 3. New event advances current; old replay cannot roll it back.
  const b=Buffer.from('{"event":"B"}\n','utf8');await publicCaptureGate({root:tmp,outDir:dir,rawBytes:b,eventKind:'FIXTURE',eventId:'B'});const currentB=await read(path.join(dir,'current.json'));
  await publicCaptureGate({root:tmp,outDir:dir,rawBytes:a,eventKind:'FIXTURE',eventId:'A'});eq(await read(path.join(dir,'current.json')),currentB,'old replay cannot roll current backward');

  // 4. Same event identity with different payload fails closed.
  let collision=null;try{await publicCaptureGate({root:tmp,outDir:dir,rawBytes:Buffer.from('{"event":"A2"}\n'),eventKind:'FIXTURE',eventId:'A'})}catch(e){collision=e}ok(/EVENT_ID_COLLISION/.test(collision?.message||''),'same event id different payload blocked');

  // 5. Crash recovery: immutable history exists but index absent.
  const crashDir=path.join(tmp,'crash');const crash=Buffer.from('{"event":"CRASH"}\n');const crashSha=sha(crash);await fs.mkdir(path.join(crashDir,'history'),{recursive:true});await fs.writeFile(path.join(crashDir,'history',`${crashSha}.json`),crash);
  const recovered=await publicCaptureGate({root:tmp,outDir:crashDir,rawBytes:crash,eventKind:'FIXTURE',eventId:'CRASH'});ok(recovered.indexRecovered&&recovered.indexCreated,'missing index recovered from exact history');eq((await lines(path.join(crashDir,'index.ndjson'))).length,1,'recovery writes one index line');

  // 6. Tampered history at expected digest path is rejected before index/current.
  const tamperDir=path.join(tmp,'tamper');const wanted=Buffer.from('{"event":"SAFE"}\n');const wantedSha=sha(wanted);await fs.mkdir(path.join(tamperDir,'history'),{recursive:true});await fs.writeFile(path.join(tamperDir,'history',`${wantedSha}.json`),'tampered\n');let tamper=null;
  try{await publicCaptureGate({root:tmp,outDir:tamperDir,rawBytes:wanted,eventKind:'FIXTURE',eventId:'SAFE'})}catch(e){tamper=e}ok(/HISTORY_COLLISION/.test(tamper?.message||''),'tampered history rejected');

  // 7. Request adapter uses same kernel and preserves request collision policy.
  const reqDir=path.join(tmp,'requests'),reqInput=path.join(tmp,'request.json'),reqResult=path.join(tmp,'request-result.json');const req={schema:'GVAULT_PUBLIC_SCOUT_REQUEST_V1',requestId:'REQ-PARITY-1',topic:'parity',url:'https://example.com/a.json',fallbackUrls:[],method:'GET',reason:'test'};
  await fs.writeFile(reqInput,JSON.stringify(req)+'\n');run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult]);const rr=JSON.parse(await read(reqResult));ok(rr.readbackExact&&rr.indexStatus==='PASS','request requires readback and index');eq((await lines(path.join(reqDir,'index.ndjson'))).length,1,'request indexed once');
  await fs.writeFile(reqInput,JSON.stringify({...req,url:'https://example.com/different.json'})+'\n');const reqCollision=run('public-scout-request-ingress.mjs',['--input',reqInput,'--out-dir',reqDir,'--result',reqResult],{pass:false});ok(/PUBLIC_REQUEST_ID_COLLISION|PUBLIC_CAPTURE_EVENT_ID_COLLISION/.test(reqCollision.stderr),'request same id different payload blocked');

  // 8. Agent adapter uses the same capture gate.
  const agentDir=path.join(tmp,'agent'),packetInput=path.join(tmp,'packet.json'),agentResult=path.join(tmp,'agent-result.json');const packet=await sealAgentPublicOutbound({text:'public capture parity',createdAt:'2026-08-30T10:00:00.000Z'});await fs.writeFile(packetInput,JSON.stringify(packet,null,2)+'\n');run('public-scout-agent-ingress.mjs',['--input',packetInput,'--out-dir',agentDir,'--result',agentResult]);const ar=JSON.parse(await read(agentResult));ok(ar.readbackExact&&ar.indexStatus==='PASS','agent ingress requires readback and index');eq((await lines(path.join(agentDir,'index.ndjson'))).length,1,'agent packet indexed once');

  // 9. Public kernel cannot become FIRST_TURN_GATE/private ledger/tool machinery.
  const kernel=await read(script('public-capture-gate-v1.mjs'));for(const forbidden of ['FIRST_TURN_GATE','GVAULT_LEDGER','withGthinkToolEvidence','gthink-tool-dispatcher','mourchoua-commits/Gvault'])ok(!kernel.includes(forbidden),`kernel excludes ${forbidden}`);
  const contract=JSON.parse(await read(path.join(ROOT,'experiments/public-capture-private-parity/contract.v1.json')));eq(contract.requiredInvariants.privateMutationForbidden,true,'contract forbids private mutation');eq(contract.requiredInvariants.toolInvocationClassification,false,'public gate is not tool invocation');eq(contract.separation.publicMayTriggerPrivate,false,'public cannot trigger private');

  // 10. Backfilled indexes match immutable public histories already present on this branch.
  const backfills=[
    ['essai/control-tower/public-scout/requests','PUBLIC_SCOUT_REQUEST','PUBLIC-SCOUT-20260830-FALLBACK-PROBE-R6'],
    ['essai/control-tower/public-scout/agent/outbound-requests','AI_PUBLIC_OUTBOUND_REQUEST','AIPUB-9ddf72d171c77d6d6ec3']
  ];
  for(const [base,kind,id] of backfills){const idx=(await lines(path.join(ROOT,base,'index.ndjson'))).map(JSON.parse);eq(idx.length,1,`${kind} backfill has one row`);eq(idx[0].eventId,id,`${kind} id preserved`);const history=await fs.readFile(path.join(ROOT,base,idx[0].historyFile));eq(sha(history),idx[0].payloadSha256,`${kind} history hash matches index`);eq(history.length,idx[0].utf8Bytes,`${kind} byte count matches index`);}

  console.log(JSON.stringify({schema:'GVAULT_PUBLIC_CAPTURE_PRIVATE_PARITY_TEST_V1',status:'PASS',assertions,privateReference:'6f129c→46ae72',publicGate:'PUBLIC_CAPTURE_GATE',privateMutationAllowed:false},null,2));
}finally{await fs.rm(tmp,{recursive:true,force:true})}
