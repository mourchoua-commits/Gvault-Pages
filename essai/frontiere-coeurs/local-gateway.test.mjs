import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./local-gateway.js', import.meta.url), 'utf8');

function harness() {
  const peers = [];
  let nonceIndex = 1;
  class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.closed = false; peers.push(this); }
    postMessage(value) {
      if (this.closed) throw Error('CHANNEL_CLOSED');
      for (const peer of peers) {
        if (peer !== this && peer.name === this.name && !peer.closed)
          peer.onmessage?.({ data: JSON.parse(JSON.stringify(value)) });
      }
    }
    close() { this.closed = true; }
  }
  function createPage() {
    const win = {
      BroadcastChannel: FakeBroadcastChannel,
      crypto: {
        getRandomValues(bytes) {
          const n = nonceIndex++;
          for (let i = 0; i < bytes.length; i++)
            bytes[i] = (n * 17 + i * 31) & 255;
          return bytes;
        }
      }
    };
    runInNewContext(source, { window: win }, { timeout: 1000 });
    return win.GVaultLocalGateway;
  }
  return { createPage, FakeBroadcastChannel };
}

test('one explicit local sender and receiver pass all eight need classes without raw content', () => {
  const { createPage } = harness();
  const sender = createPage(), receiver = createPage();
  assert.equal(Object.keys(sender.needs).length, 8);
  const arrivals = [], replies = [], rejected = [];
  const rx = receiver.openPort('GATEWAY', {
    onSignal: signal => arrivals.push(signal),
    onRejected: error => rejected.push(error)
  });
  const tx = sender.openPort('ALPHABET', { onReceipt: receipt => replies.push(receipt) });
  for (const need of Object.keys(sender.needs)) {
    const nonce = tx.send(need, 'TIC');
    assert.match(nonce, /^[0-9a-f]{16}$/);
  }
  assert.equal(arrivals.length, 8);
  assert.equal(replies.length, 8);
  assert.deepEqual(arrivals.map(x=>x.need), Object.keys(sender.needs));
  assert.ok(arrivals.every(x=>x.frame.ttl === 1 && x.frame.from === 'GTHINK_PUBLIC'
    && x.frame.to === 'GTHINK_IMAGE'));
  assert.ok(replies.every(x=>x.status === 'LOCAL_PAGE_RECEIVED'));
  assert.equal(rejected.length, 0);
  const before = arrivals.length;
  rx.close();
  tx.send('LETTER_POINT','TAC');
  assert.equal(arrivals.length, before);
  tx.close();
});

test('invalid classes, extra text, replay and logical private destination fail closed', () => {
  const { createPage, FakeBroadcastChannel } = harness();
  const api=createPage(), receiver=createPage();
  const good=api.makeSignal('HEART_TICK','TIC');
  assert.equal(api.parseSignal({ ...good, privateText: 'should-not-pass' }), null);
  assert.equal(api.parseSignal({ ...good, need:'RAW_CONVERSATION' }), null);
  assert.equal(api.parseSignal({
    ...good, frame:good.frame.replace('GTHINK_IMAGE','GTHINK_PRIVATE')
  }), null);
  assert.equal(api.parseSignal({
    ...good, frame:good.frame.replace(/\|1$/, '|3')
  }), null);
  assert.throws(()=>api.makeSignal('RAW_CONVERSATION','TIC'),/CLASS_OR_PHASE_DENIED/);
  let accepted=0,rejected=0;
  const rx=receiver.openPort('GATEWAY',{
    onSignal:()=>accepted++,onRejected:()=>rejected++
  });
  const intruder=new FakeBroadcastChannel(api.channel);
  intruder.postMessage(good);
  intruder.postMessage(good); // Same nonce = replay.
  intruder.postMessage({...good,need:'UNKNOWN'});
  intruder.postMessage({schema:'GVAULT_LOCAL_PAGE_RECEIPT_V1',nonce:'0000000000000000',status:'LOCAL_PAGE_RECEIVED'});
  assert.equal(accepted,1);
  assert.equal(rejected,2);
  rx.close();intruder.close();
});

test('local burst limit rejects excess without buffering or remote retry', () => {
  const {createPage}=harness();
  const api=createPage();
  let count=0,dropped=0;
  const rx=createPage().openPort('GATEWAY',{onSignal:()=>count++});
  const tx=api.openPort('ALPHABET',{onDropped:()=>dropped++});
  for(let i=0;i<40;i++)tx.send('HEART_TICK',i%2?'TIC':'TAC');
  assert.equal(count,32);
  assert.equal(dropped,8);
  tx.close();rx.close();
});

test('no implicit connection and no real heart authentication', () => {
  const {createPage}=harness();
  const api=createPage();
  assert.equal(api.parseReceipt({
    schema:'GVAULT_LOCAL_PAGE_RECEIPT_V1',
    nonce:'0123456789abcdef',
    status:'LOCAL_PAGE_RECEIVED'
  }).status,'LOCAL_PAGE_RECEIVED');
  assert.equal(api.parseReceipt({
    schema:'GVAULT_LOCAL_PAGE_RECEIPT_V1',
    nonce:'0123456789abcdef',
    status:'REMOTE_HEART_ACK'
  }),null);
  assert.throws(()=>api.openPort('GTHINK_PRIVATE'),/ROLE_DENIED/);
  assert.equal(api.parseFrame('C-BORDER/1|GTHINK_PUBLIC|GTHINK_PUBLIC|HELLO|0123456789abcdef|1'),null);
});
