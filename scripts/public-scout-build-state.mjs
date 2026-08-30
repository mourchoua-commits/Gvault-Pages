import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const arg=(name,fallback=null)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]!==undefined?process.argv[i+1]:fallback};
const input=path.resolve(arg('--input','/tmp/gvault-public-scout-white.translated.json'));
const outDir=path.resolve(arg('--out-dir','essai/control-tower/public-scout/data'));
const buildResultPath=path.resolve(arg('--build-result','/tmp/gvault-public-scout-build-result.json'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
const jokeLists={
  BLACK:['le Megazord passe le radar, les paquets font profil bas.','radar allumé, même les octets marchent droit.','le boss public vient de perdre une chaussette réseau.'],
  WHITE:['le boss parlait JSON, mauvaise idée.','les octets ont trouvé un interprète en armure.','le Megazord traduit sans apprendre les secrets du monstre.'],
  PUBLISH:['le Megazord pose la mise à jour sans rayer la tour.','publication propre, cape du Megazord repassée.','le boss a essayé de déplacer HEAD, il a été prié de patienter.']
};
const joke=(kind,seed)=>{const list=jokeLists[kind];const n=parseInt(sha256(Buffer.from(`${kind}|${seed}`,'utf8')).slice(0,8),16);return list[n%list.length]};
const signal=(color,phase,integrity,digest)=>`PR1:${color}:${phase}:${integrity}:${String(digest).slice(0,12)}`;

const translated=JSON.parse(await fs.readFile(input,'utf8'));
if(translated.schema!=='GVAULT_PUBLIC_SCOUT_WHITE_TRANSLATION_V1')throw new Error('PUBLIC_SCOUT_PUBLISH_INPUT_SCHEMA');
const {translationDigest,...withoutDigest}=translated;
const expectedDigest=sha256(Buffer.from(canonical(withoutDigest),'utf8'));
if(expectedDigest!==translationDigest)throw new Error('PUBLIC_SCOUT_TRANSLATION_DIGEST_MISMATCH');
if(translated.integrity!=='PASS'||translated.rawBodyPublished!==false||translated.networkUsed!==false)throw new Error('PUBLIC_SCOUT_TRANSLATION_POLICY_FAIL');
const sourceDigest=String(translated.sourceBodySha256||'');
if(!/^[a-f0-9]{64}$/i.test(sourceDigest)||!/^[a-f0-9]{64}$/i.test(translationDigest))throw new Error('PUBLIC_SCOUT_DIGEST_TYPE');

let previous=null;try{previous=JSON.parse(await fs.readFile(path.join(outDir,'latest.json'),'utf8'))}catch{}
const changed=previous?.translationDigest!==translationDigest;
const publishedAt=changed?new Date().toISOString():(previous?.publishedAt||translated.translatedAt);
const blackSignal=signal('BK','S','OK',sourceDigest);
const whiteSignal=signal('WH','T','OK',translationDigest);
const publishSignal=signal('WH','P','OK',translationDigest);
const blackMessage=`Power Ranger Noir — scanne le flux public. Intégrité GVault: PASS. ${joke('BLACK',sourceDigest)} [${blackSignal}]`;
const whiteMessage=`Power Ranger Blanc — traduit les signaux. Intégrité GVault: PASS. ${joke('WHITE',translationDigest)} [${whiteSignal}]`;
const publishMessage=`Power Ranger Blanc — met la tour à jour. Intégrité GVault: PASS. ${joke('PUBLISH',translationDigest)} [${publishSignal}]`;
const observerEvents=[
  {id:`public-scout-black-${sourceDigest.slice(0,16)}`,engine:'public-scout-black',type:'public_scan',status:'PASS',severity:'ok',at:translated.sourceFetchedAt,summary:blackMessage,sha:sourceDigest,proofRefs:[`body-sha256:${sourceDigest}`]},
  {id:`public-scout-white-${translationDigest.slice(0,16)}`,engine:'public-scout-white',type:'public_translation',status:'PASS',severity:'ok',at:translated.translatedAt,summary:whiteMessage,sha:translationDigest,proofRefs:[`translation-sha256:${translationDigest}`]},
  ...(translated.facts||[]).slice(0,40).map((fact,index)=>({id:`public-scout-fact-${translationDigest.slice(0,12)}-${index}`,engine:'public-scout',type:String(fact.kind||'public_fact'),status:'observed',severity:'ok',at:fact.at||translated.translatedAt,summary:String(fact.summary||fact.excerpt||`${fact.key||'fact'}=${fact.value??''}`).slice(0,500),sha:fact.id||translationDigest,proofRefs:[`translation-sha256:${translationDigest}`],raw:fact}))
];
const core={
  schema:'GVAULT_PUBLIC_SCOUT_LATEST_V1',version:1,status:'PASS',requestId:translated.requestId,topic:translated.topic,sourceUrl:translated.sourceUrl,sourceBodySha256:sourceDigest,translationDigest,publishedAt,integrity:{state:'PASS',rawBodyPublished:false,privateCredentialRequired:false,translatorNetworkUsed:false},rangers:{black:{color:'BLACK',phase:'SCAN',signal:blackSignal,message:blackMessage},white:{color:'WHITE',phase:'TRANSLATE',signal:whiteSignal,message:whiteMessage},publisher:{color:'WHITE',phase:'PUBLISH',signal:publishSignal,message:publishMessage}},observerEvents,privateAckHint:{authority:'PUBLIC_HEAD_CONTAINING_TRANSLATION_DIGEST',translationDigest,sourceBodySha256:sourceDigest}
};
const publicStateSha256=sha256(Buffer.from(canonical(core),'utf8'));
const latest={...core,publicStateSha256};
if(changed||!previous){
  await fs.mkdir(path.join(outDir,'history'),{recursive:true});
  await fs.writeFile(path.join(outDir,'latest.json'),JSON.stringify(latest,null,2)+'\n','utf8');
  await fs.writeFile(path.join(outDir,'history',`${translationDigest}.json`),JSON.stringify(latest,null,2)+'\n','utf8');
}
const buildResult={schema:'GVAULT_PUBLIC_SCOUT_BUILD_RESULT_V1',status:'PASS',changed,translationDigest,sourceBodySha256:sourceDigest,publicStateSha256,commitSubject:publishMessage,allowedWritePrefix:'essai/control-tower/public-scout/data/'};
await fs.writeFile(buildResultPath,JSON.stringify(buildResult,null,2)+'\n','utf8');
console.log(JSON.stringify(buildResult,null,2));
