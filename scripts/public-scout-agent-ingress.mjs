import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {verifyAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';
import {publicCaptureGate} from './public-capture-gate-v1.mjs';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/agent-public-outbound.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/agent/outbound-requests'));
const resultPath=path.resolve(arg('--result','/tmp/agent-public-ingress-result.json'));

const rawBytes=await fs.readFile(input);const raw=rawBytes.toString('utf8');
if(rawBytes.length>65536)throw new Error('AI_PUBLIC_INGRESS_TOO_LARGE');
let packet;try{packet=JSON.parse(raw)}catch{throw new Error('AI_PUBLIC_INGRESS_BAD_JSON')}
await verifyAgentPublicOutbound(packet);
const gate=await publicCaptureGate({root:process.cwd(),outDir,rawBytes,eventKind:'AI_PUBLIC_OUTBOUND_REQUEST',eventId:String(packet.packetId)});
const result={schema:'GVAULT_AI_PUBLIC_INGRESS_RESULT_V2',status:gate.status,changed:gate.historyCreated||gate.indexCreated||gate.pointerUpdated||gate.pointerRestored,historyCreated:gate.historyCreated,pointerRestored:gate.pointerRestored,replayed:gate.replayed,packetId:packet.packetId,payloadSha256:packet.payloadSha256,utf8Bytes:gate.utf8Bytes,historyPath:gate.historyPath,currentPath:gate.currentPath,indexPath:gate.indexPath,historyFirst:true,readbackExact:gate.readbackExact,indexStatus:gate.indexStatus,publicCaptureGate:gate};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
