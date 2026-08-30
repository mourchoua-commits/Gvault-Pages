import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {sealAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';
import {writeSealedPacketToPrivateOutbox} from '../essai/control-tower/public-scout-agent-private-writer-v1.mjs';

const files=new Map(),calls=[];let seq=0;
const jsonResponse=(status,data=null)=>({status,ok:status>=200&&status<300,async json(){return data},async text(){return data?JSON.stringify(data):''}});
function decode(content){return JSON.parse(Buffer.from(content,'base64').toString('utf8'))}
async function fetchMock(url,init={}){
  const u=new URL(url),marker='/contents/',i=u.pathname.indexOf(marker);assert.ok(i>=0);
  const filePath=decodeURIComponent(u.pathname.slice(i+marker.length));
  calls.push({method:init.method||'GET',filePath,headers:init.headers||{},body:init.body||null});
  if((init.method||'GET')==='GET')return files.has(filePath)?jsonResponse(200,files.get(filePath)):jsonResponse(404,{message:'not found'});
  assert.equal(init.method,'PUT');
  const body=JSON.parse(init.body);assert.equal(body.branch,'experiment/power-ranger-public-scout-20260830');
  const sha=`blob-${++seq}`;const packet=decode(body.content);files.set(filePath,{sha,content:body.content,encoding:'base64'});
  return jsonResponse(200,{content:{sha},commit:{sha:`commit-${seq}`},packetId:packet.packetId});
}

const packet=await sealAgentPublicOutbound({text:'Message public depuis le SAS privé.',createdAt:'2026-08-30T01:35:00Z'});
await assert.rejects(()=>writeSealedPacketToPrivateOutbox(packet,{sasToken:'',fetchImpl:fetchMock}),/SAS_PRIVATE_WRITER_CLOSED/);
assert.equal(calls.length,0);
const first=await writeSealedPacketToPrivateOutbox(packet,{sasToken:'test-sas',fetchImpl:fetchMock});
assert.equal(first.status,'PRIVATE_OUTBOX_STORED');
assert.equal(first.pendingPath,`ops/public-scout/agent-outbox/pending/${packet.packetId}.json`);
assert.equal(first.currentPath,'ops/public-scout/agent-outbox/current.json');
assert.equal(files.size,2);
assert.equal(decode(files.get(first.pendingPath).content).payloadSha256,packet.payloadSha256);
assert.equal(decode(files.get(first.currentPath).content).packetId,packet.packetId);
assert.ok(calls.every(x=>x.filePath.startsWith('ops/public-scout/agent-outbox/')));
assert.ok(calls.every(x=>x.headers.Authorization==='Bearer test-sas'));
const putsBefore=calls.filter(x=>x.method==='PUT').length;
const second=await writeSealedPacketToPrivateOutbox(packet,{sasToken:'test-sas',fetchImpl:fetchMock});
assert.equal(second.status,'PRIVATE_OUTBOX_ALREADY_CURRENT');
assert.equal(calls.filter(x=>x.method==='PUT').length,putsBefore);
const tampered={...packet,text:'altéré'};const callsBefore=calls.length;
await assert.rejects(()=>writeSealedPacketToPrivateOutbox(tampered,{sasToken:'test-sas',fetchImpl:fetchMock}),/HASH_MISMATCH/);
assert.equal(calls.length,callsBefore);
console.log(JSON.stringify({schema:'GVAULT_AI_PRIVATE_WRITER_TEST_V1',status:'PASS',assertions:13,packetId:packet.packetId,paths:[first.pendingPath,first.currentPath]},null,2));
