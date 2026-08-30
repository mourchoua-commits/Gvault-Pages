import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {verifyAgentPublicOutbound} from '../essai/control-tower/public-scout-agent-core-v1.mjs';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/agent-public-outbound.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/agent/outbound-requests'));
const resultPath=path.resolve(arg('--result','/tmp/agent-public-ingress-result.json'));
async function readText(file){try{return await fs.readFile(file,'utf8')}catch(error){if(error?.code==='ENOENT')return null;throw error}}

const raw=await fs.readFile(input,'utf8');
if(Buffer.byteLength(raw,'utf8')>65536)throw new Error('AI_PUBLIC_INGRESS_TOO_LARGE');
let packet;try{packet=JSON.parse(raw)}catch{throw new Error('AI_PUBLIC_INGRESS_BAD_JSON')}
await verifyAgentPublicOutbound(packet);
const historyDir=path.join(outDir,'history');
const historyPath=path.join(historyDir,`${packet.payloadSha256}.json`);
const currentPath=path.join(outDir,'current.json');
await fs.mkdir(historyDir,{recursive:true});
let historical=await readText(historyPath);
let historyCreated=false,pointerRestored=false,replayed=false;
if(historical!==null){
  let stored;try{stored=JSON.parse(historical)}catch{throw new Error('AI_PUBLIC_INGRESS_HISTORY_BAD_JSON')}
  await verifyAgentPublicOutbound(stored);
  if(stored.packetId!==packet.packetId||stored.payloadSha256!==packet.payloadSha256||historical!==raw)throw new Error('AI_PUBLIC_INGRESS_HISTORY_COLLISION');
  replayed=true;
  const current=await readText(currentPath);
  if(current===null){await fs.writeFile(currentPath,raw,'utf8');pointerRestored=true;}
  // Historical replay never replaces a different current packet.
}else{
  try{await fs.writeFile(historyPath,raw,{encoding:'utf8',flag:'wx'});historyCreated=true;}
  catch(error){if(error?.code!=='EEXIST')throw error;historical=await readText(historyPath);if(historical!==raw)throw new Error('AI_PUBLIC_INGRESS_HISTORY_RACE_COLLISION');replayed=true;}
  if(historyCreated)await fs.writeFile(currentPath,raw,'utf8');
}
const result={schema:'GVAULT_AI_PUBLIC_INGRESS_RESULT_V1',status:'PASS',changed:historyCreated||pointerRestored,historyCreated,pointerRestored,replayed,packetId:packet.packetId,payloadSha256:packet.payloadSha256,utf8Bytes:Buffer.byteLength(raw,'utf8'),historyPath:path.relative(process.cwd(),historyPath).replace(/\\/g,'/'),currentPath:path.relative(process.cwd(),currentPath).replace(/\\/g,'/'),historyFirst:true};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
