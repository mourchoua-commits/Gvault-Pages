// Deterministic proof for weekly due + SAS autonomous execution.
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,init={}){super(type);this.detail=init.detail}};
globalThis.setInterval=()=>0;

const nodes=new Map();
const node=id=>({id,textContent:'',className:'',innerHTML:'',onclick:null,insertAdjacentElement(_where,el){
  nodes.set('#ctArchiveWeeklyLever',el);
  for(const x of ['ctawlState','ctawlMeta','ctawlCheck','ctawlTest'])nodes.set('#'+x,node(x));
}});
const body=node('body');
globalThis.document={
  visibilityState:'visible',body,
  querySelector(sel){return nodes.get(sel)||null},
  createElement(tag){return node(tag)},
  addEventListener(){},
};
const win=new EventTarget();
globalThis.window=win;
window.document=document;
window.GVAULT_PRIVATE_TOOL_SESSION_V1={getState:()=>({active:false})};
let replayCount=0, replayGate=null;
window.GVAULT_CONTROL_TOWER_SOURCE_UPLOAD_V1={
  getState:()=>({qrspriteKey:'ctqru:test:test',archiveKey:'ctarc:'+'a'.repeat(64)}),
  replay:async()=>{replayCount++; if(replayGate) await replayGate; return {ok:true}}
};

const KEY='gvault.controlTower.archiveWeekly.v1';
const old=new Date(Date.now()-8*24*60*60*1000).toISOString();
localStorage.setItem(KEY,JSON.stringify({schema:'GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_STATE_V1',version:1,armedAt:old,status:'ARMED'}));

await import('./archive-weekly-lever-v1.mjs?test='+Date.now());
await new Promise(r=>setTimeout(r,0));
const api=window.GVAULT_CONTROL_TOWER_ARCHIVE_WEEKLY_LEVER_V1;
assert.ok(api,'API exported');
let s=api.getState();
assert.equal(s.status,'WAITING_FOR_SAS','due without SAS waits');
assert.equal(s.lastCompletedAt,undefined,'waiting must not consume weekly due');
assert.equal(api.isDue(),true,'still due while waiting for SAS');
assert.equal(replayCount,0,'no replay without SAS');

window.GVAULT_PRIVATE_TOOL_SESSION_V1={getState:()=>({active:true})};
window.dispatchEvent(new Event('gvault:private-tool-session-active'));
await new Promise(r=>setTimeout(r,0));
s=api.getState();
assert.equal(s.status,'CHECKPOINT_OK_REFRESH_REQUESTED','SAS activation auto-runs due work');
assert.equal(replayCount,1,'SAS activation replays local encrypted QRSprite automatically');
assert.equal(api.isDue(),false,'successful automatic run advances weekly due');

const stale=new Date(Date.now()-8*24*60*60*1000).toISOString();
localStorage.setItem(KEY,JSON.stringify({...api.getState(),lastCompletedAt:stale,status:'ARMED'}));
let release;
replayGate=new Promise(r=>{release=r});
const p1=api.run('INTERVAL_CATCHUP',false);
await new Promise(r=>setTimeout(r,0));
const p2=await api.run('SAS_ACTIVE_CATCHUP',false);
assert.equal(p2.status,'ALREADY_RUNNING','timer/SAS collision is deduplicated');
release();
await p1;
replayGate=null;
assert.equal(replayCount,2,'collision produced only one additional replay');

const p3=await api.run('INTERVAL_CATCHUP',false);
assert.equal(p3.status,'NOT_DUE','fresh state does not rerun');
assert.equal(replayCount,2,'NOT_DUE causes no replay');

console.log('CONTROL_TOWER_WEEKLY_LEVER_TEST PASS 12 assertions');
