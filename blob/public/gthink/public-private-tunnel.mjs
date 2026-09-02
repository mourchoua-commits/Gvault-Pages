const SCHEMA = 'gvault.public-private-tunnel.v1';
const ROUTE_ID = 'gthink-boundary';
const MAX_PAYLOAD_BYTES = 65536;
const MAX_LIFETIME_MS = 60000;

export const TUNNEL_HOPS = Object.freeze([
  'outside-surface-blob',
  'outside-matter-blob-01',
  'outside-matter-blob-02',
  'outside-matter-blob-03',
  'boundary-contact-blob',
  'private-gate-blob'
]);

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value));
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 indisponible: tunnel fermé.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomTunnelId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `tun-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function assertKind(kind) {
  const allowed = ['message', 'state_snapshot', 'artifact_descriptor', 'trace_summary'];
  if (!allowed.includes(kind)) throw new Error(`Type de blob refusé: ${kind}`);
}

export async function digTowardPrivate({ kind = 'message', payload, lifetimeMs = 30000 } = {}) {
  assertKind(kind);
  if (payload === undefined) throw new Error('Payload requis.');
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1000 || lifetimeMs > MAX_LIFETIME_MS) {
    throw new Error(`lifetimeMs doit être compris entre 1000 et ${MAX_LIFETIME_MS}.`);
  }

  const payloadText = typeof payload === 'string' ? payload : stableJson(payload);
  const payloadBytes = utf8Bytes(payloadText);
  if (payloadBytes.byteLength > MAX_PAYLOAD_BYTES) throw new Error('Payload trop volumineux: tunnel fermé.');

  const tunnelId = randomTunnelId();
  const payloadSha256 = await sha256Hex(payloadBytes);
  const issuedAtMs = Date.now();
  let previousHopSha256 = 'GENESIS';
  const hops = [];

  for (let ordinal = 0; ordinal < TUNNEL_HOPS.length; ordinal += 1) {
    const id = TUNNEL_HOPS[ordinal];
    const material = { tunnelId, routeId: ROUTE_ID, ordinal, id, previousHopSha256, payloadSha256 };
    const hopSha256 = await sha256Hex(utf8Bytes(material));
    hops.push(Object.freeze({ ordinal, id, previousHopSha256, hopSha256 }));
    previousHopSha256 = hopSha256;
  }

  return Object.freeze({
    schema: SCHEMA,
    tunnelId,
    routeId: ROUTE_ID,
    kind,
    sourceZone: 'outside',
    destinationZone: 'private-boundary',
    payloadEncoding: 'utf-8',
    payloadSize: payloadBytes.byteLength,
    payloadSha256,
    payload: payloadText,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + lifetimeMs).toISOString(),
    hops: Object.freeze(hops),
    finalHopSha256: previousHopSha256
  });
}

export async function handoffAtPrivateGate(envelope, boundaryAdapter) {
  if (!envelope || envelope.schema !== SCHEMA || envelope.routeId !== ROUTE_ID) {
    throw new Error('Enveloppe de tunnel invalide.');
  }
  if (typeof boundaryAdapter !== 'function') {
    throw new Error('Aucun sas privé raccordé: le tunnel s’arrête à la frontière.');
  }
  return boundaryAdapter(envelope);
}

export function getTunnelContract() {
  return Object.freeze({
    schema: SCHEMA,
    routeId: ROUTE_ID,
    direction: 'outside->private-boundary',
    hops: TUNNEL_HOPS,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    maxLifetimeMs: MAX_LIFETIME_MS,
    arbitraryUrlAllowed: false,
    credentialsInPublicLayer: false
  });
}

if (typeof window !== 'undefined') {
  window.GVAULT_PUBLIC_PRIVATE_TUNNEL = Object.freeze({ digTowardPrivate, handoffAtPrivateGate, getTunnelContract });
  window.dispatchEvent(new CustomEvent('gvault:public-private-tunnel-ready', { detail: getTunnelContract() }));
}
