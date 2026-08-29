import assert from 'node:assert/strict';

let refreshCalls=0,timerFn=null,timerArmed=0,timerCleared=0;
const realSetInterval=globalThis.setInterval,realClearInterval=globalThis.clearInterval;
globalThis.setInterval=(fn,ms)=>{assert.equal(ms,30000);timerFn=fn;timerArmed++;return 77};
globalThis.clearInterval=id=>{assert.equal(id,77);timerCleared++;timerFn=null};

class FakeCustomEvent{constructor(type,opts={}){this.type=type;this.detail=opts.detail}}
globalThis.CustomEvent=FakeCustomEvent;
const dispatched=[];
globalThis.window={
  addEventListener(){},
  dispatchEvent(event){dispatched.push(event);return true},
  GVAULT_CONTROL_TOWER:{schema:'GVAULT_CONTROL_TOWER_V3_ENCRYPTED_FEED',refresh(){refreshCalls++;return Promise.resolve()}}
};
globalThis.document={
  readyState:'loading',
  visibilityState:'visible',
  addEventListener(){},
  querySelector(selector){return selector==='#ctOnouObserver'?{}:null}
};

await import(`./onou-observer-v1.mjs?presence-test=${Date.now()}`);
const api=window.GVAULT_CONTROL_TOWER_ONOU_OBSERVER_V1;
assert.ok(api,'browser API must be exposed');
assert.equal(api.getState().observers.length,0);

assert.equal(api.acquire('lens-a'),1);
assert.equal(refreshCalls,1,'0->1 observer transition must request refresh');
assert.equal(timerArmed,1,'first observer must arm heartbeat');
assert.ok(typeof timerFn==='function');

assert.equal(api.acquire('lens-b'),2);
assert.equal(refreshCalls,1,'second observer must not duplicate first-observer refresh');
assert.equal(timerArmed,1,'one shared timer only');

timerFn();
assert.equal(refreshCalls,2,'observed pulse must refresh while visible');

document.visibilityState='hidden';
timerFn();
assert.equal(refreshCalls,2,'hidden document must not refresh on observer pulse');
document.visibilityState='visible';

assert.equal(api.release('lens-a'),1);
assert.equal(timerCleared,0,'remaining observer keeps heartbeat alive');
assert.equal(api.release('lens-b'),0);
assert.equal(timerCleared,1,'last observer leaving must stop heartbeat');
assert.equal(api.getState().observers.length,0);

api.acquire('lens-c');
assert.equal(refreshCalls,3,'new 0->1 transition after sleep must refresh again');
api.releaseAll();
assert.equal(api.getState().observers.length,0);
assert.equal(timerCleared,2);

assert.equal(dispatched.filter(x=>x.type==='gvault:control-tower-refresh-request').length,0,'modern encrypted runtime must use its safe refresh API rather than fallback event');

console.log(JSON.stringify({schema:'GVAULT_ONOU_OBSERVER_PRESENCE_TEST_RESULT_V1',status:'PASS',assertions:18,refreshCalls,timerArmed,timerCleared},null,2));

globalThis.setInterval=realSetInterval;globalThis.clearInterval=realClearInterval;
