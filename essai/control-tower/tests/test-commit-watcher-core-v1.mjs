import assert from 'node:assert/strict';
import {parseSnapshotCommit,classifyIngestion,retryDelayMs} from '../commit-watcher-core-v1.mjs';

let pass=0;
const test=(name,fn)=>{fn();pass++;console.log('PASS',name)};
const sha='a'.repeat(40),prefix='b'.repeat(16),head=prefix+'c'.repeat(48);

test('parse snapshot prefix',()=>{const x=parseSnapshotCommit({sha,commit:{message:`observability: snapshot ${prefix} blob=deadbeef`}});assert.equal(x.sha,sha);assert.equal(x.snapshotPrefix,prefix)});
test('reject bad commit sha',()=>assert.equal(parseSnapshotCommit({sha:'bad',commit:{message:'x'}}),null));
test('same commit ack without resync',()=>assert.deepEqual(classifyIngestion({previousSha:sha,commit:{sha,snapshotPrefix:prefix},vfsResult:null}),{status:'SAME',ack:true,retry:false}));
test('busy never ack',()=>assert.equal(classifyIngestion({commit:{sha,snapshotPrefix:prefix},vfsResult:{ok:false,busy:true}}).ack,false));
test('pages propagation mismatch never ack',()=>{const v=classifyIngestion({commit:{sha,snapshotPrefix:prefix},vfsResult:{ok:true,headChain:'c'.repeat(64)}});assert.equal(v.status,'PAGES_HEAD_NOT_PROPAGATED');assert.equal(v.ack,false);assert.equal(v.retry,true)});
test('matching propagated head ack',()=>{const v=classifyIngestion({commit:{sha,snapshotPrefix:prefix},vfsResult:{ok:true,headChain:head}});assert.equal(v.status,'INGESTED');assert.equal(v.ack,true)});
test('commit without prefix can ack successful VFS sync',()=>{const v=classifyIngestion({commit:{sha,snapshotPrefix:null},vfsResult:{ok:true,headChain:head}});assert.equal(v.ack,true)});
test('propagation retry is short',()=>assert.equal(retryDelayMs({status:'PAGES_HEAD_NOT_PROPAGATED',propagationMs:30000}),30000));
test('rate-limit honors reset horizon',()=>{const now=1_000_000,resetSec=(now+600000)/1000;assert.equal(retryDelayMs({status:'RATE_LIMIT',rateResetEpochSec:resetSec,nowMs:now,errorMs:300000}),605000)});

console.log(JSON.stringify({schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCHER_CORE_TEST_V1',pass,total:9}));
if(pass!==9)process.exit(1);
