import assert from 'node:assert/strict';
import {createLocalGThinkBananaAdapter,LOCAL_GTHINK_BANANA_SCHEMA} from './local-gthink-banana-adapter.mjs';

let seq=0;const emitted=[];
const runtime={
  async sendAgentMessage(message){
    return {text:`local:${message}`,routeId:'route-001',correlationId:'corr-001',routeTrace:{method:'GTHINK',status:'PASS'}};
  }
};
const adapter=createLocalGThinkBananaAdapter({
  resolveRuntimeWindow:()=>runtime,
  emit:b=>emitted.push(b),
  id:p=>`${p}-${++seq}`,
  now:()=>`2026-09-01T20:30:${String(seq).padStart(2,'0')}Z`
});
const out=await adapter.ask('bonjour');
assert.equal(adapter.schema,LOCAL_GTHINK_BANANA_SCHEMA);
assert.equal(adapter.usesRemoteProvider,false);
assert.equal(adapter.silent,true);
assert.equal(adapter.muted,false);
assert.equal(out.ok,true);
assert.equal(out.text,'local:bonjour');
assert.equal(out.blob.agentSide.display,'local:bonjour');
assert.equal(out.blob.otherSide.display,'banane');
assert.equal(out.blob.localAgent,true);
assert.equal(out.blob.provider,'GVAULT_AGENT_LOCAL_GTHINK');
assert.equal(out.blob.actionsAuthorized,false);
assert.equal(out.blob.agentSide.routeTrace.method,'GTHINK');
assert.ok(emitted.some(b=>b.type==='input.capture'));
assert.ok(emitted.some(b=>b.type==='runtime.resolve'&&b.payload.available===true));
assert.ok(emitted.some(b=>b.type==='gthink.route.entry'&&b.payload.methodAuthority==='GVAULT_METHOD_ROUTER'));
assert.ok(emitted.some(b=>b.type==='gthink.route.exit'&&b.payload.routeId==='route-001'));
assert.ok(emitted.some(b=>b.type==='banana.verify'&&b.payload.literal==='banane'));
assert.ok(emitted.some(b=>b.type==='banana.turn.pass'&&b.payload.remoteProvider===false));
assert.ok(emitted.every(b=>b.silent===true&&b.muted===false));

const missing=createLocalGThinkBananaAdapter({resolveRuntimeWindow:()=>null});
const noRuntime=await missing.ask('x');
assert.equal(noRuntime.ok,false);
assert.equal(noRuntime.error,'runtime_unavailable');

const noSend=createLocalGThinkBananaAdapter({resolveRuntimeWindow:()=>({})});
const noSendOut=await noSend.ask('x');
assert.equal(noSendOut.ok,false);
assert.equal(noSendOut.error,'send_agent_message_unavailable');

const empty=createLocalGThinkBananaAdapter({resolveRuntimeWindow:()=>runtime});
const emptyOut=await empty.ask('   ');
assert.equal(emptyOut.ok,false);
assert.equal(emptyOut.error,'empty_message');

console.log('PASS 25/25');
