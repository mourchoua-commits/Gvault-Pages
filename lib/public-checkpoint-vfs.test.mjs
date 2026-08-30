import assert from 'node:assert/strict';
import {
  buildCheckpoint,
  checkpointWindow,
  isCheckpointDue,
  normalizeProvenEvent,
  opaqueCheckpointKey,
} from './public-checkpoint-vfs.mjs';

assert.equal(isCheckpointDue(1), false);
assert.equal(isCheckpointDue(5), false);
assert.equal(isCheckpointDue(6), true);
assert.equal(isCheckpointDue(7), false);
assert.equal(isCheckpointDue(12), true);
assert.equal(isCheckpointDue(18), true);
assert.deepEqual(checkpointWindow(6), { from: 1, to: 6 });
assert.deepEqual(checkpointWindow(12), { from: 7, to: 12 });
assert.equal(checkpointWindow(11), null);

const events = Array.from({ length: 6 }, (_, i) => normalizeProvenEvent({
  ledgerId: 'CVL-0123456789ab',
  role: i % 2 ? 'assistant' : 'user',
  surface: i % 2 ? 'assistant_final' : 'user_message',
  commitSha: String(i + 1).padStart(40, 'a'),
  contentSha256: String(i + 1).padStart(64, 'b'),
  content: `message-${i + 1}`,
}, i + 1));

const cp = buildCheckpoint({ ledgerId: 'CVL-0123456789ab', count: 6, events, createdAt: '2026-08-31T00:00:00.000Z' });
assert.equal(cp.schema, 'GVAULT_PUBLIC_CHECKPOINT_V1');
assert.equal(cp.checkpointNumber, 1);
assert.equal(cp.fromEvent, 1);
assert.equal(cp.toEvent, 6);
assert.equal(cp.events.length, 6);
assert.equal(cp.events[5].content, 'message-6');
assert.match(opaqueCheckpointKey(cp), /^[a-f0-9]{34}$/);
assert.equal(buildCheckpoint({ ledgerId: 'CVL-0123456789ab', count: 5, events }), null);

console.log('public-checkpoint-vfs cadence/build: PASS');
