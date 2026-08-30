import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {verifyAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const statePath=path.resolve(arg('--state','essai/control-tower/public-scout/agent/messages/latest.json'));
const dataCommit=String(arg('--data-commit','')).trim().toLowerCase();
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/agent/ack'));
const resultPath=path.resolve(arg('--result','/tmp/gvault-ai-public-ack-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
const canonical=value=>JSON.stringify(stable(value));
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
function verifyAckDigest(ack){const {ackDigest,...core}=ack||{};if(!/^[a-f0-9]{64}$/i.test(ackDigest||'')||sha256(Buffer.from(canonical(core),'utf8'))!==ackDigest)throw new Error('AI_PUBLIC_ACK_HISTORY_HASH_MISMATCH');}
function verifyHistoricalAck(ack,state){
  verifyAckDigest(ack);
  if(ack.schema!=='GVAULT_AI_PUBLIC_MESSAGE_ACK_V1'||ack.status!=='ACKNOWLEDGED_PUBLIC_AI_MESSAGE'||ack.authority!=='PUBLIC_ACK_REFERENCES_EXACT_AI_MESSAGE_COMMIT'||ack.rawPrivateDataPublished!==false)throw new Error('AI_PUBLIC_ACK_HISTORY_POLICY');
  if(ack.dataCommitSha!==dataCommit||ack.packetId!==state.packet.packetId||ack.payloadSha256!==state.packet.payloadSha256||ack.publicMessageSha256!==state.publicMessageSha256)throw new Error('AI_PUBLIC_ACK_HISTORY_COLLISION');
  return ack;
}

if(!/^[a-f0-9]{40}$/.test(dataCommit))throw new Error('AI_PUBLIC_ACK_DATA_COMMIT_TYPE');
const state=JSON.parse(await fs.readFile(statePath,'utf8'));
if(state.schema!=='GVAULT_AI_PUBLIC_MESSAGE_V1'||state.status!=='PASS'||state.integrity?.state!=='PASS')throw new Error('AI_PUBLIC_ACK_STATE_POLICY');
await verifyAgentPublicOutbound(state.packet);
const {publicMessageSha256,...stateCore}=state;
if(sha256(Buffer.from(canonical(stateCore),'utf8'))!==publicMessageSha256)throw new Error('AI_PUBLIC_ACK_MESSAGE_HASH_MISMATCH');

const historyDir=path.join(outDir,'history');
const historyPath=path.join(historyDir,`${dataCommit}.json`);
const latestPath=path.join(outDir,'latest.json');
await fs.mkdir(historyDir,{recursive:true});
let historical=await readJson(historyPath);
let latest=await readJson(latestPath);
let ack,historyCreated=false,pointerRestored=false,replayed=false;

if(historical){
  ack=verifyHistoricalAck(historical,state);
  replayed=true;
  if(!latest){await fs.writeFile(latestPath,JSON.stringify(ack,null,2)+'\n','utf8');pointerRestored=true;}
  else if(latest.dataCommitSha===dataCommit){verifyHistoricalAck(latest,state);if(latest.ackDigest!==ack.ackDigest)throw new Error('AI_PUBLIC_ACK_LATEST_HISTORY_DIVERGENCE');}
  // If latest points elsewhere, an old replay must not move the pointer backwards.
}else{
  const signal=`PR1:RD:A:OK:${state.packet.payloadSha256.slice(0,12)}`;
  const base={schema:'GVAULT_AI_PUBLIC_MESSAGE_ACK_V1',version:1,status:'ACKNOWLEDGED_PUBLIC_AI_MESSAGE',packetId:state.packet.packetId,payloadSha256:state.packet.payloadSha256,publicMessageSha256,dataCommitSha:dataCommit,acceptedAt:new Date().toISOString(),authority:'PUBLIC_ACK_REFERENCES_EXACT_AI_MESSAGE_COMMIT',rawPrivateDataPublished:false,ranger:{color:'RED',phase:'ACK',integrity:'PASS',signal,message:`Power Ranger Rouge — accuse réception du message IA. Intégrité GVault: PASS. Le Megazord a signé le bordereau sans manger le stylo. [${signal}]`}};
  ack={...base,ackDigest:sha256(Buffer.from(canonical(base),'utf8'))};
  try{await fs.writeFile(historyPath,JSON.stringify(ack,null,2)+'\n',{encoding:'utf8',flag:'wx'});historyCreated=true;}
  catch(error){if(error?.code!=='EEXIST')throw error;historical=await readJson(historyPath);ack=verifyHistoricalAck(historical,state);replayed=true;}
  if(historyCreated)await fs.writeFile(latestPath,JSON.stringify(ack,null,2)+'\n','utf8');
}

const changed=historyCreated||pointerRestored;
const result={schema:'GVAULT_AI_PUBLIC_MESSAGE_ACK_RESULT_V1',status:'PASS',changed,historyCreated,pointerRestored,replayed,packetId:state.packet.packetId,payloadSha256:state.packet.payloadSha256,publicMessageSha256,dataCommitSha:dataCommit,ackDigest:ack.ackDigest,commitSubject:ack.ranger.message};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
