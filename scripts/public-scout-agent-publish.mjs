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
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
function verifyStoredMessage(state,packet){
  if(state?.schema!=='GVAULT_AI_PUBLIC_MESSAGE_V1'||state?.status!=='PASS')throw new Error('AI_PUBLIC_HISTORY_SCHEMA');
  if(state?.packet?.packetId!==packet.packetId||state?.packet?.payloadSha256!==packet.payloadSha256)throw new Error('AI_PUBLIC_HISTORY_PACKET_COLLISION');
  const {publicMessageSha256,...core}=state;
  if(!/^[a-f0-9]{64}$/i.test(publicMessageSha256||'')||sha256(Buffer.from(canonical(core),'utf8'))!==publicMessageSha256)throw new Error('AI_PUBLIC_HISTORY_HASH_COLLISION');
  return state;
}

const packet=JSON.parse(await fs.readFile(input,'utf8'));
await verifyAgentPublicOutbound(packet);
const historyDir=path.join(outDir,'history');
const historyPath=path.join(historyDir,`${packet.payloadSha256}.json`);
const latestPath=path.join(outDir,'latest.json');
await fs.mkdir(historyDir,{recursive:true});

let latest=await readJson(latestPath);
let historical=await readJson(historyPath);
let state,historyCreated=false,pointerRestored=false,replayed=false;

if(historical){
  state=verifyStoredMessage(historical,packet);
  replayed=true;
  if(!latest){
    await fs.writeFile(latestPath,JSON.stringify(state,null,2)+'\n','utf8');
    pointerRestored=true;
  }else if(latest?.packet?.payloadSha256===packet.payloadSha256){
    verifyStoredMessage(latest,packet);
    if(latest.publicMessageSha256!==state.publicMessageSha256)throw new Error('AI_PUBLIC_LATEST_HISTORY_DIVERGENCE');
  }
  // If another newer packet is latest, an old replay must never move the pointer backwards.
}else{
  const signal=`PR1:VT:TX:OK:${packet.payloadSha256.slice(0,12)}`;
  const ranger={color:'VIOLET',phase:'AGENT_TX',integrity:'PASS',signal,message:`Power Ranger Violet — transmet la réponse de l’agent. Intégrité GVault: PASS. Le Megazord a trouvé le bouton « envoyer », victoire administrative. [${signal}]`};
  const core={schema:'GVAULT_AI_PUBLIC_MESSAGE_V1',version:1,status:'PASS',packet,publishedAt:new Date().toISOString(),integrity:{state:'PASS',packetVerified:true,rawPrivateDataPublished:false,secretPatternRejectedUpstream:true},ranger};
  state={...core,publicMessageSha256:sha256(Buffer.from(canonical(core),'utf8'))};
  try{
    await fs.writeFile(historyPath,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    historyCreated=true;
  }catch(error){
    if(error?.code!=='EEXIST')throw error;
    historical=await readJson(historyPath);
    state=verifyStoredMessage(historical,packet);
    replayed=true;
  }
  if(historyCreated){
    await fs.writeFile(latestPath,JSON.stringify(state,null,2)+'\n','utf8');
  }
}

const changed=historyCreated||pointerRestored;
const result={schema:'GVAULT_AI_PUBLIC_MESSAGE_BUILD_RESULT_V1',status:'PASS',changed,historyCreated,pointerRestored,replayed,packetId:packet.packetId,payloadSha256:packet.payloadSha256,publicMessageSha256:state.publicMessageSha256,commitSubject:state.ranger.message,allowedWritePrefix:'essai/control-tower/public-scout/agent/messages/'};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
