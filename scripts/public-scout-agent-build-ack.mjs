import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {verifyAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';
const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const statePath=path.resolve(arg('--state','essai/control-tower/public-scout/agent/messages/latest.json'));
const dataCommit=String(arg('--data-commit',''));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/agent/ack'));
const resultPath=path.resolve(arg('--result','/tmp/gvault-ai-public-ack-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
const canonical=value=>JSON.stringify(stable(value));
if(!/^[a-f0-9]{40}$/i.test(dataCommit))throw new Error('AI_PUBLIC_ACK_DATA_COMMIT_TYPE');
const state=JSON.parse(await fs.readFile(statePath,'utf8'));
if(state.schema!=='GVAULT_AI_PUBLIC_MESSAGE_V1'||state.status!=='PASS'||state.integrity?.state!=='PASS')throw new Error('AI_PUBLIC_ACK_STATE_POLICY');
await verifyAgentPublicOutbound(state.packet);
const {publicMessageSha256,...core}=state;
if(sha256(Buffer.from(canonical(core),'utf8'))!==publicMessageSha256)throw new Error('AI_PUBLIC_ACK_MESSAGE_HASH_MISMATCH');
const signal=`PR1:RD:A:OK:${state.packet.payloadSha256.slice(0,12)}`;
const base={schema:'GVAULT_AI_PUBLIC_MESSAGE_ACK_V1',version:1,status:'ACKNOWLEDGED_PUBLIC_AI_MESSAGE',packetId:state.packet.packetId,payloadSha256:state.packet.payloadSha256,publicMessageSha256,dataCommitSha:dataCommit,acceptedAt:new Date().toISOString(),authority:'PUBLIC_ACK_REFERENCES_EXACT_AI_MESSAGE_COMMIT',rawPrivateDataPublished:false,ranger:{color:'RED',phase:'ACK',integrity:'PASS',signal,message:`Power Ranger Rouge — accuse réception du message IA. Intégrité GVault: PASS. Le Megazord a signé le bordereau sans manger le stylo. [${signal}]`}};
const ackDigest=sha256(Buffer.from(canonical(base),'utf8'));
const ack={...base,ackDigest};
let previous=null;try{previous=JSON.parse(await fs.readFile(path.join(outDir,'latest.json'),'utf8'))}catch{}
const changed=previous?.ackDigest!==ackDigest;
if(changed||!previous){await fs.mkdir(path.join(outDir,'history'),{recursive:true});await fs.writeFile(path.join(outDir,'latest.json'),JSON.stringify(ack,null,2)+'\n');await fs.writeFile(path.join(outDir,'history',`${dataCommit}.json`),JSON.stringify(ack,null,2)+'\n')}
const result={schema:'GVAULT_AI_PUBLIC_MESSAGE_ACK_RESULT_V1',status:'PASS',changed,packetId:state.packet.packetId,payloadSha256:state.packet.payloadSha256,publicMessageSha256,dataCommitSha:dataCommit,ackDigest,commitSubject:ack.ranger.message};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
