import assert from 'node:assert/strict';
import {createFullSaveActionPipeline,ACTION_BLOB_SCHEMA} from './full-save-action-pipeline.mjs';

let seq=0;const ids=p=>`${p}-${++seq}`;const emitted=[];
const pipeline=createFullSaveActionPipeline({
 id:ids,
 now:()=>`2026-09-01T20:00:${String(seq).padStart(2,'0')}Z`,
 emit:b=>emitted.push(b),
 snapshot:async()=>({configured:true,status:'READY',silent:true,muted:false}),
 ask:async message=>({ok:true,text:`réponse:${message}`,model:'gpt-5.6-sol',correlationId:'c1',blob:{agentSide:{display:`réponse:${message}`},otherSide:{display:'banane'},actionsAuthorized:false}})
});
const out=await pipeline.turn('bonjour');
assert.equal(out.ok,true);
assert.equal(out.result.text,'réponse:bonjour');
assert.equal(out.result.blob.otherSide.display,'banane');
assert.equal(pipeline.schema,ACTION_BLOB_SCHEMA);
assert.ok(emitted.length>=12);
assert.ok(emitted.every(b=>b.silent===true));
assert.ok(emitted.every(b=>b.muted===false));
const actions=emitted.filter(b=>b.type==='action.start').map(b=>b.payload.action);
for(const expected of ['snapshot.before','input.capture','agent.direct.ask','agent.response.require_ok','banana.verify','snapshot.after'])assert.ok(actions.includes(expected),expected);
assert.ok(emitted.some(b=>b.type==='fullsave.turn.pass'));
assert.ok(emitted.some(b=>b.type==='action.pass'&&b.payload.action==='banana.verify'));

const bad=[];
const failure=createFullSaveActionPipeline({id:p=>`${p}-bad-${bad.length+1}`,emit:b=>bad.push(b),snapshot:async()=>({}),ask:async()=>({ok:true,blob:{otherSide:{display:'pomme'}}})});
const failed=await failure.turn('test');
assert.equal(failed.ok,false);
assert.match(failed.error,/banana_mismatch/);
assert.ok(bad.some(b=>b.type==='action.error'&&b.payload.action==='banana.verify'));
assert.ok(bad.some(b=>b.type==='fullsave.turn.error'));
console.log(`PASS ${18 + actions.length}/24`);
