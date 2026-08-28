import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const target=String(process.argv[2]||'HEAD');
const root=process.cwd();
const outDir=path.join(root,'essai/control-tower/commit-capsules');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sha256=v=>crypto.createHash('sha256').update(String(v),'utf8').digest('hex');
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)}

const meta=git('show','-s','--format=%H%x1f%P%x1f%cI%x1f%B',target).split('\x1f');
const commitSha=meta[0].trim();
const parents=meta[1].trim().split(/\s+/).filter(Boolean);
const parentSha=parents[0]||'GENESIS';
if(!/^[a-f0-9]{40}$/i.test(commitSha))throw new Error('GIT_COMMIT_SHA_TYPE');
if(parentSha!=='GENESIS'&&!/^[a-f0-9]{40}$/i.test(parentSha))throw new Error('GIT_PARENT_SHA_TYPE');
const committedAt=meta[2].trim();
const message=meta.slice(3).join('\x1f').trim();
const subject=message.split(/\r?\n/)[0]||'commit';
const intent=(message.match(/GVAULT-Intent:\s*(.+)/i)||[])[1]?.trim()||'';
const workSpecial=(message.match(/WORK_SPECIAL:\s*(.+)/i)||[])[1]?.trim()||'';
const raw=git('diff-tree','--no-commit-id','--numstat','-r',commitSha);
const files=raw?raw.split(/\r?\n/).filter(Boolean).map(line=>{const [a,d,...p]=line.split('\t');return {path:p.join('\t'),additions:a==='-'?0:Number(a||0),deletions:d==='-'?0:Number(d||0)}}):[];
const additions=files.reduce((n,x)=>n+x.additions,0),deletions=files.reduce((n,x)=>n+x.deletions,0),magnitude=additions+deletions;
const sampleMode=magnitude>=400||files.length>=20?'FULL':magnitude>=80||files.length>=8?'WIDE':'MICRO';
const pulse={schema:'GVAULT_CONTROL_TOWER_COMMIT_PULSE_V1',sampleMode,changedFiles:files.length,additions,deletions,magnitude,committedAt,parentSha};
const pulseDigest=sha256(canonical(pulse));
const pulseKey=`CTP1:${commitSha}:${pulseDigest.slice(0,16)}`;
const summary={subject,intent,workSpecial,changedFiles:files.length,additions,deletions,paths:files.slice(0,24).map(x=>x.path)};
const functionImageVersion='1.0.0';
const translation={schema:'GVAULT_CONTROL_TOWER_COMMIT_IMAGE_V1',commitSha,parentSha,committedAt,summary,pulse,functionImageVersion,reconstruction:{lookup:`commit-capsules/${commitSha}.json`,vfsKey:pulseKey,rule:'NEXT_COMMIT_CARRIES_PREVIOUS_COMMIT_IMAGE'}};
const translationSha256=sha256(canonical(translation));
const typedKeys={
  commit:`gitc:${commitSha}`,
  parent:parentSha==='GENESIS'?'gitc:GENESIS':`gitc:${parentSha}`,
  pulse:`ctp1:${commitSha}:${pulseDigest.slice(0,16)}`,
  translation:`cttrans:${translationSha256}`,
  functionImage:`ctfunc:${functionImageVersion}`
};
const capsulePath=`commit-capsules/${commitSha}.json`;
const capsule={schema:'GVAULT_CONTROL_TOWER_COMMIT_CAPSULE_V1',version:1,commitSha,parentSha,committedAt,summary,pulse,pulseKey,functionImageVersion,translationSha256,typedKeys,translation,capsulePath};
const latest={schema:'GVAULT_CONTROL_TOWER_COMMIT_CAPSULE_LATEST_V1',commitSha,parentSha,pulseKey,functionImageVersion,translationSha256,typedKeys,capsulePath,committedAt};
await fs.mkdir(outDir,{recursive:true});
await fs.writeFile(path.join(outDir,`${commitSha}.json`),JSON.stringify(capsule,null,2)+'\n');
await fs.writeFile(path.join(outDir,'latest.json'),JSON.stringify(latest,null,2)+'\n');
console.log(JSON.stringify({commitSha,parentSha,pulseKey,typedKeys,summary,translationSha256},null,2));
