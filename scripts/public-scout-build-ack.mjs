import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const statePath=path.resolve(arg('--state','essai/control-tower/public-scout/data/latest.json'));
const dataCommitSha=String(arg('--data-commit','')).trim().toLowerCase();
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/ack'));
const resultPath=path.resolve(arg('--result','/tmp/gvault-public-scout-ack-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
const jokeList=['le Megazord tamponne le reçu et retourne au hangar.','reçu validé, aucun kaiju n’a été écrasé dans le commit.','le boss peut maintenant faire la queue au guichet continuité.'];
const joke=seed=>jokeList[parseInt(sha256(Buffer.from(seed,'utf8')).slice(0,8),16)%jokeList.length];
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
function verifyAckDigest(ack){const {ackDigest,...core}=ack||{};if(!/^[a-f0-9]{64}$/i.test(ackDigest||'')||sha256(Buffer.from(canonical(core),'utf8'))!==ackDigest)throw new Error('PUBLIC_SCOUT_ACK_HISTORY_HASH_MISMATCH');}
function verifyHistoricalAck(ack,state){
  verifyAckDigest(ack);
  if(ack.schema!=='GVAULT_PUBLIC_SCOUT_PUBLIC_ACK_V1'||ack.status!=='ACKNOWLEDGED_PUBLIC_STATE'||ack.authority!=='PUBLIC_ACK_REFERENCES_EXACT_DATA_COMMIT'||ack.rawBodyPublished!==false||ack.privateDataPublished!==false)throw new Error('PUBLIC_SCOUT_ACK_HISTORY_POLICY');
  if(ack.dataCommitSha!==dataCommitSha||ack.translationDigest!==state.translationDigest||ack.publicStateSha256!==state.publicStateSha256||ack.sourceBodySha256!==state.sourceBodySha256)throw new Error('PUBLIC_SCOUT_ACK_HISTORY_COLLISION');
  return ack;
}

if(!/^[a-f0-9]{40}$/.test(dataCommitSha))throw new Error('PUBLIC_SCOUT_ACK_DATA_COMMIT_TYPE');
const state=JSON.parse(await fs.readFile(statePath,'utf8'));
if(state.schema!=='GVAULT_PUBLIC_SCOUT_LATEST_V1'||state.status!=='PASS')throw new Error('PUBLIC_SCOUT_ACK_STATE_SCHEMA');
if(state.integrity?.rawBodyPublished!==false||state.integrity?.privateCredentialRequired!==false||state.integrity?.translatorNetworkUsed!==false)throw new Error('PUBLIC_SCOUT_ACK_STATE_POLICY');
const {publicStateSha256,...stateCore}=state;
const computedState=sha256(Buffer.from(canonical(stateCore),'utf8'));
if(computedState!==publicStateSha256)throw new Error('PUBLIC_SCOUT_ACK_STATE_HASH_MISMATCH');
if(!/^[a-f0-9]{64}$/i.test(state.translationDigest||'')||!/^[a-f0-9]{64}$/i.test(state.sourceBodySha256||''))throw new Error('PUBLIC_SCOUT_ACK_DIGEST_TYPE');

const historyDir=path.join(outDir,'history');
const historyPath=path.join(historyDir,`${dataCommitSha}.json`);
const latestPath=path.join(outDir,'latest.json');
await fs.mkdir(historyDir,{recursive:true});
let historical=await readJson(historyPath);
let latest=await readJson(latestPath);
let ack,historyCreated=false,pointerRestored=false,replayed=false;

if(historical){
  ack=verifyHistoricalAck(historical,state);
  replayed=true;
  if(!latest){await fs.writeFile(latestPath,JSON.stringify(ack,null,2)+'\n','utf8');pointerRestored=true;}
  else if(latest.dataCommitSha===dataCommitSha){verifyHistoricalAck(latest,state);if(latest.ackDigest!==ack.ackDigest)throw new Error('PUBLIC_SCOUT_ACK_LATEST_HISTORY_DIVERGENCE');}
  // If latest points elsewhere, old replay is historical evidence only; never roll the pointer back.
}else{
  const signal=`PR1:RD:A:OK:${state.translationDigest.slice(0,12)}`;
  const message=`Power Ranger Rouge — confirme la prise en compte. Intégrité GVault: PASS. ${joke(`${dataCommitSha}|${state.translationDigest}`)} [${signal}]`;
  const core={schema:'GVAULT_PUBLIC_SCOUT_PUBLIC_ACK_V1',version:1,status:'ACKNOWLEDGED_PUBLIC_STATE',translationDigest:state.translationDigest,sourceBodySha256:state.sourceBodySha256,publicStateSha256,dataCommitSha,acceptedAt:new Date().toISOString(),authority:'PUBLIC_ACK_REFERENCES_EXACT_DATA_COMMIT',rawBodyPublished:false,privateDataPublished:false,ranger:{color:'RED',phase:'ACK',integrity:'PASS',signal,message}};
  ack={...core,ackDigest:sha256(Buffer.from(canonical(core),'utf8'))};
  try{await fs.writeFile(historyPath,JSON.stringify(ack,null,2)+'\n',{encoding:'utf8',flag:'wx'});historyCreated=true;}
  catch(error){if(error?.code!=='EEXIST')throw error;historical=await readJson(historyPath);ack=verifyHistoricalAck(historical,state);replayed=true;}
  if(historyCreated)await fs.writeFile(latestPath,JSON.stringify(ack,null,2)+'\n','utf8');
}

const changed=historyCreated||pointerRestored;
const result={schema:'GVAULT_PUBLIC_SCOUT_ACK_BUILD_RESULT_V1',status:'PASS',changed,historyCreated,pointerRestored,replayed,dataCommitSha,translationDigest:state.translationDigest,publicStateSha256,ackDigest:ack.ackDigest,commitSubject:ack.ranger.message,allowedWritePrefix:'essai/control-tower/public-scout/ack/'};
await fs.writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
