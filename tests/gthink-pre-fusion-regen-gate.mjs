import fs from 'node:fs';
import assert from 'node:assert/strict';

const observer = JSON.parse(fs.readFileSync('blobs/runtime/PUBLIC_PEER_OBSERVER_BLOB_V1.json', 'utf8'));
const publicHeartbeat = JSON.parse(fs.readFileSync('publications/gthink-peer/public-heartbeat.json', 'utf8'));
const privateHeartbeat = JSON.parse(fs.readFileSync('publications/gthink-peer/private-sanitized-heartbeat.json', 'utf8'));

const correlationId = 'GTHINK-MUTUAL-OBSERVATION-V1';

assert.equal(observer.status, 'ACTIVE');
assert.equal(observer.correlationId, correlationId);
assert.equal(observer.autonomy.peerRequiredForExecution, false);
assert.equal(Object.prototype.hasOwnProperty.call(observer, 'fusion'), false, 'pre-fusion observer must not contain fusion state');

assert.equal(publicHeartbeat.status, 'READY');
assert.equal(publicHeartbeat.correlationId, correlationId);
assert.equal(publicHeartbeat.peerContract.expectedDirection, 'PRIVATE_TO_PUBLIC');
assert.equal(publicHeartbeat.peerContract.requiresSanitized, true);

assert.equal(privateHeartbeat.status, 'READY');
assert.equal(privateHeartbeat.sanitized, true);
assert.equal(privateHeartbeat.correlationId, correlationId);
assert.equal(privateHeartbeat.observation.peer, 'PUBLIC');
assert.equal(privateHeartbeat.observation.peerStatus, 'READY');
assert.equal(privateHeartbeat.observation.autonomyPreserved, true);

for (const forbidden of ['rawPrivate', 'verbatim', 'secret', 'token', 'content']) {
  assert.equal(Object.prototype.hasOwnProperty.call(privateHeartbeat, forbidden), false, `forbidden private field: ${forbidden}`);
}

console.log('PASS pre-fusion fertile heartbeat: mutual observation + confirmed exchange + autonomy preserved');
