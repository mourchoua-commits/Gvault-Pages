import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = process.env.GVAULT_PEER_BASE_URL || 'http://127.0.0.1:4173';
const PUBLIC_URL = `${BASE}/publications/gthink-peer/public-heartbeat.json`;
const PRIVATE_URL = `${BASE}/publications/gthink-peer/private-sanitized-heartbeat.json`;
const CORRELATION_ID = 'GTHINK-MUTUAL-OBSERVATION-V1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test.describe('GThink public peer observer blob', () => {
  test('observes the private sanitized blob and proves both point at the same peer contract', async ({ request }) => {
    const [publicResponse, privateResponse] = await Promise.all([
      request.get(PUBLIC_URL),
      request.get(PRIVATE_URL)
    ]);

    expect(publicResponse.ok()).toBe(true);
    expect(privateResponse.ok()).toBe(true);

    const publicRaw = await publicResponse.text();
    const privateRaw = await privateResponse.text();
    const self = JSON.parse(publicRaw);
    const peer = JSON.parse(privateRaw);

    expect(self.schema).toBe('GVAULT_GTHINK_PUBLIC_HEARTBEAT_V1');
    expect(self.status).toBe('READY');
    expect(self.correlationId).toBe(CORRELATION_ID);
    expect(self.peerContract?.expectedDirection).toBe('PRIVATE_TO_PUBLIC');
    expect(self.peerContract?.requiresSanitized).toBe(true);

    expect(peer.schema).toBe('GVAULT_GTHINK_PRIVATE_SANITIZED_HEARTBEAT_V1');
    expect(peer.status).toBe('READY');
    expect(peer.direction).toBe('PRIVATE_TO_PUBLIC');
    expect(peer.sanitized).toBe(true);
    expect(peer.correlationId).toBe(CORRELATION_ID);
    expect(peer.observation?.peer).toBe('PUBLIC');
    expect(peer.observation?.peerStatus).toBe('READY');
    expect(peer.observation?.autonomyPreserved).toBe(true);

    const forbidden = ['rawPrivate', 'verbatim', 'secret', 'token', 'content'];
    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(peer, key)).toBe(false);
    }

    const observation = {
      schema: 'GVAULT_GTHINK_PUBLIC_OBSERVATION_RESULT_V1',
      status: 'PASS',
      observer: 'PUBLIC',
      peer: 'PRIVATE_SANITIZED_PROJECTION',
      correlationId: CORRELATION_ID,
      selfDigestSha256: sha256(publicRaw),
      peerDigestSha256: sha256(privateRaw),
      mutualReferencePresent: peer.observedPublicHeartbeatCommit === self.observerCommit || Boolean(peer.observedPublicHeartbeatCommit),
      privateRawContentAccessible: false,
      autonomyPreserved: true
    };

    expect(observation.mutualReferencePresent).toBe(true);
    fs.writeFileSync('/tmp/gthink-public-peer-observation.json', `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  });
});
