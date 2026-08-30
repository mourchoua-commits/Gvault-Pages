import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {verifyAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';
const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','essai/control-tower/public-scout/agent/outbound-requests/current.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/agent/messages'));
const resultPath=path.resolve(arg('--result','/tmp/gvault-ai-public-message-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
const canonical=value=>JSON.stringify(stable(value));
const packet=JSON.parse(await fs.readFile(input,'utf8'));
await verifyAgentPublicOutbound(packet);
const signal=`PR1:VT:TX:OK:${packet.payloadSha256.slice(0,12)}`;
const ranger={color:'VIOLET',phase:'AGENT_TX',integrity:'PASS',signal,message:`Power Ranger Violet — transmet la réponse de l’agent. Intégrité GVault: PASS. Le Megazord a trouvé le bouton « envoyer », victoire administrative. [${signal}]`};
let previous=null;try{previous=JSON.parse(await fs.readFile(path.join(outDir,'latest.json'),'utf8'))}catch{}
const changed=previous?.packet?.payloadSha256!==packet.payloadSha256;
const publishedAt=changed?new Date().toISOString():(previous?.publishedAt||packet.createdAt);
const core={schema:'GVAULT_AI_PUBLIC_MESSAGE_V1',version:1,status:'PASS',packet,publishedAt,integrity:{state:'PASS',packetVerified:true,rawPrivateDataPublished:false,secretPatternRejectedUpstream:true},ranger};
const publicMessageSha256=sha256(Buffer.from(canonical(core),'utf8'));
const state={...core,publicMessageSha256};
if(changed||!previous){await fs.mkdir(path.join(outDir,'history'),{recursive:true});await fs.writeFile(path.join(outDir,'latest.json'),JSON.stringify(state,null,2)+'\n');await fs.writeFile(path.join(outDir,'history',`${packet.payloadSha256}.json`),JSON.stringify(state,null,2)+'\n')}
const result={schema:'GVAULT_AI_PUBLIC_MESSAGE_BUILD_RESULT_V1',status:'PASS',changed,packetId:packet.packetId,payloadSha256:packet.payloadSha256,publicMessageSha256,commitSubject:ranger.message,allowedWritePrefix:'essai/control-tower/public-scout/agent/messages/'};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
