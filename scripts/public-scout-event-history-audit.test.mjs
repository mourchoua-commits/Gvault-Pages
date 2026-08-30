import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const REQUEST_DIR='essai/control-tower/public-scout/requests/history';
const MESSAGE_DIR='essai/control-tower/public-scout/agent/messages/history';
const OUTBOUND_DIR='essai/control-tower/public-scout/agent/outbound-requests/history';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
const canonical=v=>JSON.stringify(stable(v));
const git=args=>{const r=spawnSync('git',args,{cwd:ROOT,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim()};
async function jsonFiles(dir){return (await fs.readdir(path.join(ROOT,dir))).filter(n=>n.endsWith('.json')).sort();}
async function raw(rel){return fs.readFile(path.join(ROOT,rel));}
async function json(rel){return JSON.parse(await fs.readFile(path.join(ROOT,rel),'utf8'))}
function provenance(rel){const c=git(['log','--diff-filter=A','-1','--format=%H','--',rel]);assert.match(c,/^[a-f0-9]{40}$/i);return c;}

let assertions=0;const ok=(v,m)=>{assert.ok(v,m);assertions+=1};
const requestFiles=await jsonFiles(REQUEST_DIR),messageFiles=await jsonFiles(MESSAGE_DIR),outboundFiles=await jsonFiles(OUTBOUND_DIR);
ok(requestFiles.length>=1,'request history required');ok(messageFiles.length>=2,'message history expected');ok(outboundFiles.length>=1,'outbound history required');
const requestIds=new Set(),packetIds=new Set(),events=[];
for(const name of requestFiles){
  const rel=`${REQUEST_DIR}/${name}`,bytes=await raw(rel),x=JSON.parse(bytes.toString('utf8')),digest=sha(bytes);
  ok(name===`${digest}.json`,`request filename binds exact bytes ${name}`);ok(x.schema==='GVAULT_PUBLIC_SCOUT_REQUEST_V1','request schema');ok(!requestIds.has(x.requestId),'unique requestId');requestIds.add(x.requestId);events.push({ingressEventId:`PUBLIC_REQUEST:${x.requestId}`,role:'user',surface:'user_message',sha256:digest,bytes:bytes.length,commit:provenance(rel),rel});
}
for(const name of messageFiles){
  const rel=`${MESSAGE_DIR}/${name}`,bytes=await raw(rel),x=JSON.parse(bytes.toString('utf8')),packet=x.packet||{};
  const {payloadSha256,packetId,...packetCore}=packet,expected=sha(Buffer.from(canonical(packetCore),'utf8'));ok(payloadSha256===expected&&packetId===`AIPUB-${expected.slice(0,20)}`,'agent packet hash/id');
  ok(name===`${payloadSha256}.json`,'message history filename binds payload');const {publicMessageSha256,...messageCore}=x;ok(publicMessageSha256===sha(Buffer.from(canonical(messageCore),'utf8')),'public message hash');ok(!packetIds.has(packetId),'unique packetId');packetIds.add(packetId);events.push({ingressEventId:`PUBLIC_AGENT_MESSAGE:${packetId}`,role:'assistant',surface:'assistant_final',sha256:sha(bytes),bytes:bytes.length,commit:provenance(rel),rel});
}
ok(new Set(events.map(e=>e.ingressEventId)).size===events.length,'all semantic ingress IDs unique');
const latestRequest=await raw('essai/control-tower/public-scout/requests/current.json');ok(requestFiles.some(async()=>true),'request history non-empty');ok(requestFiles.some(name=>name===`${sha(latestRequest)}.json`),'request current points to exact history bytes');
const latestMessage=await json('essai/control-tower/public-scout/agent/messages/latest.json');const latestMessageRaw=await raw('essai/control-tower/public-scout/agent/messages/latest.json');const messageHistoryRaw=await raw(`${MESSAGE_DIR}/${latestMessage.packet.payloadSha256}.json`);ok(Buffer.compare(latestMessageRaw,messageHistoryRaw)===0,'message latest is exact history copy');
const outboundCurrent=await json('essai/control-tower/public-scout/agent/outbound-requests/current.json');const outboundCurrentRaw=await raw('essai/control-tower/public-scout/agent/outbound-requests/current.json');const outboundHistoryRaw=await raw(`${OUTBOUND_DIR}/${outboundCurrent.payloadSha256}.json`);ok(Buffer.compare(outboundCurrentRaw,outboundHistoryRaw)===0,'outbound current is exact history copy');
const order=git(['rev-list','--reverse','HEAD']).split(/\r?\n/).filter(Boolean);const orderMap=new Map(order.map((c,i)=>[c,i+1]));events.sort((a,b)=>(orderMap.get(a.commit)||1e15)-(orderMap.get(b.commit)||1e15)||a.rel.localeCompare(b.rel));
ok(events.every((e,i)=>i===0||(orderMap.get(events[i-1].commit)||0)<=(orderMap.get(e.commit)||0)),'events deterministically orderable by provenance');
console.log(JSON.stringify({schema:'GVAULT_PUBLIC_EVENT_HISTORY_AUDIT_V1',status:'PASS',assertions,eventCount:events.length,requestCount:requestFiles.length,messageCount:messageFiles.length,outboundCount:outboundFiles.length,events:events.map((e,i)=>({observedSequenceCandidate:i+1,...e}))},null,2));
