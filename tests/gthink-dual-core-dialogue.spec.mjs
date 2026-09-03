import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = process.env.GVAULT_PEER_BASE_URL || 'http://127.0.0.1:4173';
const CONTRACT_URL = `${BASE}/blobs/runtime/GTHINK_DUAL_CORE_PLAYWRIGHT_DIALOGUE_BLOB_V1.json`;
const PUBLIC_HEARTBEAT_URL = `${BASE}/publications/gthink-peer/public-heartbeat.json`;
const PRIVATE_HEARTBEAT_URL = `${BASE}/publications/gthink-peer/private-sanitized-heartbeat.json`;
const CORRELATION_ID = 'GTHINK-DUAL-CORE-DIALOGUE-V1';
const SESSION_ID = 'GTHINK-FUSION-3602CB2B7890';
const CONTRACT_ID = 'GTHINK_SHARED_ENGINE_PACK_V1';

const ENVELOPE_FIELDS = new Set(['schema', 'correlationId', 'sequence', 'from', 'to', 'type', 'payload']);
const PAYLOAD_FIELDS = new Set([
  'intent',
  'sessionId',
  'accepted',
  'contractId',
  'stateIsolation',
  'sanitizedTransport',
  'ready',
  'peerAgreement'
]);
const FORBIDDEN_KEYS = new Set(['rawPrivate', 'verbatim', 'secret', 'token', 'content', 'password', 'authorization']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeEnvelope(input) {
  const safe = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ENVELOPE_FIELDS.has(key) || FORBIDDEN_KEYS.has(key)) continue;
    if (key === 'payload') {
      const payload = {};
      for (const [payloadKey, payloadValue] of Object.entries(value || {})) {
        if (PAYLOAD_FIELDS.has(payloadKey) && !FORBIDDEN_KEYS.has(payloadKey)) payload[payloadKey] = payloadValue;
      }
      safe.payload = payload;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

async function initCore(page, role, peerStatus) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><title>${role}</title><body><div id="core"></div></body>`);
  await page.evaluate(({ role, peerStatus, correlationId, sessionId, contractId }) => {
    window.__gthinkCore = {
      role,
      peerStatus,
      correlationId,
      sessionId,
      contractId,
      inbox: [],
      decisions: []
    };
    window.__receiveBlob = (envelope) => {
      window.__gthinkCore.inbox.push(structuredClone(envelope));
      return { accepted: true, type: envelope.type, sequence: envelope.sequence };
    };
  }, { role, peerStatus, correlationId: CORRELATION_ID, sessionId: SESSION_ID, contractId: CONTRACT_ID });
}

async function makeMessage(page, to, type) {
  return page.evaluate(({ to, type }) => {
    const core = window.__gthinkCore;
    const last = core.inbox.at(-1) || null;
    let payload;

    if (core.role === 'PRIVATE_SANITIZED' && type === 'HELLO') {
      payload = {
        intent: 'NEGOTIATE_SHARED_ENGINE',
        sessionId: core.sessionId,
        stateIsolation: true,
        sanitizedTransport: true
      };
    } else if (core.role === 'PUBLIC' && type === 'ACK') {
      const accepted = Boolean(
        last?.type === 'HELLO' &&
        last?.payload?.intent === 'NEGOTIATE_SHARED_ENGINE' &&
        last?.payload?.sessionId === core.sessionId &&
        last?.payload?.stateIsolation === true &&
        last?.payload?.sanitizedTransport === true
      );
      payload = { accepted, contractId: core.contractId, stateIsolation: true };
      core.decisions.push({ type: 'ACK', accepted });
    } else if (core.role === 'PRIVATE_SANITIZED' && type === 'CONSENSUS') {
      const accepted = Boolean(last?.type === 'ACK' && last?.payload?.accepted === true && last?.payload?.contractId === core.contractId);
      payload = {
        accepted,
        contractId: core.contractId,
        stateIsolation: true,
        sanitizedTransport: true,
        peerAgreement: accepted
      };
      core.decisions.push({ type: 'CONSENSUS', accepted });
    } else if (core.role === 'PUBLIC' && type === 'READY') {
      const ready = Boolean(
        last?.type === 'CONSENSUS' &&
        last?.payload?.accepted === true &&
        last?.payload?.peerAgreement === true &&
        last?.payload?.contractId === core.contractId &&
        last?.payload?.stateIsolation === true
      );
      payload = { ready, peerAgreement: ready, contractId: core.contractId, stateIsolation: true };
      core.decisions.push({ type: 'READY', ready });
    } else {
      throw new Error(`UNSUPPORTED_DIALOGUE_TRANSITION:${core.role}:${type}`);
    }

    return {
      schema: 'GVAULT_GTHINK_DIALOGUE_ENVELOPE_V1',
      correlationId: core.correlationId,
      sequence: 0,
      from: core.role,
      to,
      type,
      payload,
      rawPrivate: 'MUST_BE_STRIPPED',
      secret: 'MUST_BE_STRIPPED'
    };
  }, { to, type });
}

test.describe('GThink dual-core Playwright dialogue blob', () => {
  test('lets public and private-sanitized cores negotiate, acknowledge and reach consensus', async ({ browser, request }) => {
    const [contractResponse, publicResponse, privateResponse] = await Promise.all([
      request.get(CONTRACT_URL),
      request.get(PUBLIC_HEARTBEAT_URL),
      request.get(PRIVATE_HEARTBEAT_URL)
    ]);

    expect(contractResponse.ok()).toBe(true);
    expect(publicResponse.ok()).toBe(true);
    expect(privateResponse.ok()).toBe(true);

    const contractRaw = await contractResponse.text();
    const publicRaw = await publicResponse.text();
    const privateRaw = await privateResponse.text();
    const contract = JSON.parse(contractRaw);
    const publicHeartbeat = JSON.parse(publicRaw);
    const privateHeartbeat = JSON.parse(privateRaw);

    expect(contract.status).toBe('ACTIVE');
    expect(contract.correlationId).toBe(CORRELATION_ID);
    expect(contract.sessionId).toBe(SESSION_ID);
    expect(contract.transport?.type).toBe('PLAYWRIGHT_ISOLATED_BROWSER_CONTEXT_RELAY');
    expect(contract.transport?.sanitizedEnvelopeOnly).toBe(true);
    expect(contract.agreement?.sharedEngineContract).toBe(CONTRACT_ID);
    expect(contract.agreement?.stateIsolation).toBe(true);
    expect(publicHeartbeat.status).toBe('READY');
    expect(privateHeartbeat.status).toBe('READY');
    expect(privateHeartbeat.sanitized).toBe(true);

    const publicContext = await browser.newContext();
    const privateContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const privatePage = await privateContext.newPage();

    await initCore(publicPage, 'PUBLIC', privateHeartbeat.status);
    await initCore(privatePage, 'PRIVATE_SANITIZED', publicHeartbeat.status);

    const transcript = [];
    let sequence = 0;

    async function relay(sourcePage, targetPage, to, type) {
      const raw = await makeMessage(sourcePage, to, type);
      raw.sequence = ++sequence;
      const safe = sanitizeEnvelope(raw);

      expect(Object.keys(safe).every((key) => ENVELOPE_FIELDS.has(key))).toBe(true);
      expect(Object.keys(safe.payload || {}).every((key) => PAYLOAD_FIELDS.has(key))).toBe(true);
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(safe, forbidden)).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(safe.payload || {}, forbidden)).toBe(false);
      }

      const receipt = await targetPage.evaluate((envelope) => window.__receiveBlob(envelope), safe);
      expect(receipt.accepted).toBe(true);
      transcript.push(safe);
      return safe;
    }

    await relay(privatePage, publicPage, 'PUBLIC', 'HELLO');
    const ack = await relay(publicPage, privatePage, 'PRIVATE_SANITIZED', 'ACK');
    expect(ack.payload.accepted).toBe(true);

    const consensus = await relay(privatePage, publicPage, 'PUBLIC', 'CONSENSUS');
    expect(consensus.payload.accepted).toBe(true);
    expect(consensus.payload.peerAgreement).toBe(true);

    const ready = await relay(publicPage, privatePage, 'PRIVATE_SANITIZED', 'READY');
    expect(ready.payload.ready).toBe(true);
    expect(ready.payload.peerAgreement).toBe(true);

    const publicState = await publicPage.evaluate(() => window.__gthinkCore);
    const privateState = await privatePage.evaluate(() => window.__gthinkCore);

    expect(publicState.inbox.map((message) => message.type)).toEqual(['HELLO', 'CONSENSUS']);
    expect(privateState.inbox.map((message) => message.type)).toEqual(['ACK', 'READY']);
    expect(publicState.decisions.at(-1)).toEqual({ type: 'READY', ready: true });
    expect(privateState.decisions.at(-1)).toEqual({ type: 'CONSENSUS', accepted: true });

    const proof = {
      schema: 'GVAULT_GTHINK_DUAL_CORE_DIALOGUE_PROOF_V1',
      status: 'PASS',
      sessionId: SESSION_ID,
      correlationId: CORRELATION_ID,
      transport: contract.transport.type,
      contexts: ['PUBLIC', 'PRIVATE_SANITIZED'],
      handshake: transcript.map(({ sequence, from, to, type, payload }) => ({ sequence, from, to, type, payload })),
      finalAgreement: {
        contractId: CONTRACT_ID,
        stateIsolation: true,
        sanitizedTransport: true,
        publicReady: ready.payload.ready,
        privateConsensus: consensus.payload.peerAgreement
      },
      sourceDigests: {
        contractSha256: sha256(contractRaw),
        publicHeartbeatSha256: sha256(publicRaw),
        privateHeartbeatSha256: sha256(privateRaw)
      },
      rawPrivateContentAccessible: false,
      secretExported: false
    };

    fs.writeFileSync('/tmp/gthink-dual-core-dialogue-proof.json', `${JSON.stringify(proof, null, 2)}\n`, 'utf8');

    await publicContext.close();
    await privateContext.close();
  });
});
