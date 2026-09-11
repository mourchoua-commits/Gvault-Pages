import fs from 'node:fs';
import assert from 'node:assert/strict';

const self = JSON.parse(fs.readFileSync('publications/gthink-peer/public-heartbeat.json', 'utf8'));
const peer = JSON.parse(fs.readFileSync('publications/gthink-peer/private-sanitized-heartbeat.json', 'utf8'));
const CORRELATION_ID = 'GTHINK-MUTUAL-OBSERVATION-V1';

assert.equal(self.schema, 'GVAULT_GTHINK_PUBLIC_HEARTBEAT_V1');
assert.equal(self.status, 'READY');
assert.equal(self.visibility, 'PUBLIC');
assert.equal(self.correlationId, CORRELATION_ID);
assert.equal(self.peerContract?.expectedDirection, 'PRIVATE_TO_PUBLIC');
assert.equal(self.peerContract?.requiresSanitized, true);

assert.equal(peer.schema, 'GVAULT_GTHINK_PRIVATE_SANITIZED_HEARTBEAT_V1');
assert.equal(peer.status, 'READY');
assert.equal(peer.visibility, 'PUBLIC_SANITIZED_PROJECTION');
assert.equal(peer.direction, 'PRIVATE_TO_PUBLIC');
assert.equal(peer.sanitized, true);
assert.equal(peer.correlationId, CORRELATION_ID);
assert.equal(peer.fusion, 'DEFERRED');
assert.equal(peer.observation?.peer, 'PUBLIC');
assert.equal(peer.observation?.peerStatus, 'READY');
assert.equal(peer.observation?.autonomyPreserved, true);
assert.equal(peer.proof?.status, 'PASS');
assert.equal(peer.proof?.githubHostedRunnerRequired, false);
assert.equal(peer.proof?.privateRawContentAccessible, false);
assert.equal(peer.runner?.usedAsProof, false);

for (const key of ['rawPrivate', 'verbatim', 'secret', 'token', 'content']) {
  assert.equal(Object.prototype.hasOwnProperty.call(peer, key), false, `forbidden top-level field: ${key}`);
}

assert.ok(peer.observedPublicHeartbeatCommit);
assert.ok(peer.proof?.privateEvidenceCommit);

console.log('PASS public sanitized contract: PRIVATE off-Actions proof is reciprocal, sanitized, autonomous, and fusion-deferred');
