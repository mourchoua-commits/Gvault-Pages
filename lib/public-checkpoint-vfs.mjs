const DB_NAME = 'gvault-public-vfs-v1';
const DB_VERSION = 1;
const STATE_STORE = 'checkpoint-state';
const BLOB_STORE = 'checkpoint-blobs';
const INTERVAL = 6;
const queues = new Map();

export function isCheckpointDue(count, interval = INTERVAL) {
  return Number.isInteger(count) && count > 0 && Number.isInteger(interval) && interval > 0 && count % interval === 0;
}

export function checkpointWindow(count, interval = INTERVAL) {
  if (!isCheckpointDue(count, interval)) return null;
  return { from: count - interval + 1, to: count };
}

export function normalizeProvenEvent(event = {}, assignedOrdinal) {
  const normalized = {
    ordinal: Number.isInteger(event.ordinal) ? event.ordinal : assignedOrdinal,
    role: String(event.role ?? ''),
    surface: String(event.surface ?? ''),
    commitSha: String(event.commitSha ?? ''),
    contentSha256: String(event.contentSha256 ?? ''),
    content: String(event.content ?? ''),
    capturedAt: String(event.capturedAt ?? ''),
  };
  if (!normalized.commitSha || !normalized.contentSha256) throw new Error('proven event requires commitSha and contentSha256');
  return normalized;
}

export function buildCheckpoint({ ledgerId, count, events, createdAt = new Date().toISOString() } = {}) {
  const window = checkpointWindow(count);
  if (!window) return null;
  if (!ledgerId) throw new Error('ledgerId required');
  if (!Array.isArray(events) || events.length !== INTERVAL) throw new Error('checkpoint requires exactly six events');
  return {
    schema: 'GVAULT_PUBLIC_CHECKPOINT_V1',
    ledgerId: String(ledgerId),
    checkpointNumber: count / INTERVAL,
    fromEvent: window.from,
    toEvent: window.to,
    createdAt,
    events,
  };
}

export function opaqueCheckpointKey(checkpoint) {
  if (!checkpoint || checkpoint.schema !== 'GVAULT_PUBLIC_CHECKPOINT_V1') throw new Error('invalid checkpoint');
  const tail = checkpoint.events.at(-1)?.contentSha256 || '';
  if (!/^[a-f0-9]{32,}$/i.test(tail)) throw new Error('invalid contentSha256');
  return `${tail.slice(0, 32).toLowerCase()}${Number(checkpoint.toEvent).toString(36).padStart(2, '0')}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export function openPublicCheckpointDb(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function ingestUnlocked(event, { indexedDBImpl = globalThis.indexedDB } = {}) {
  const ledgerId = String(event?.ledgerId ?? '');
  if (!ledgerId) throw new Error('ledgerId required');
  const db = await openPublicCheckpointDb(indexedDBImpl);
  try {
    const readTx = db.transaction(STATE_STORE, 'readonly');
    const readDone = transactionDone(readTx);
    const current = (await requestResult(readTx.objectStore(STATE_STORE).get(ledgerId))) || { count: 0, pending: [], recentCommitShas: [] };
    await readDone;

    if (current.recentCommitShas.includes(String(event.commitSha ?? ''))) {
      return { status: 'DUPLICATE', ledgerId, count: current.count, checkpointKey: current.lastCheckpointKey || null };
    }

    const count = current.count + 1;
    const normalized = normalizeProvenEvent(event, count);
    const pending = [...current.pending, normalized];
    const recentCommitShas = [...current.recentCommitShas, normalized.commitSha].slice(-18);
    const checkpoint = buildCheckpoint({ ledgerId, count, events: pending });
    const checkpointKey = checkpoint ? opaqueCheckpointKey(checkpoint) : null;
    const nextState = {
      count,
      pending: checkpoint ? [] : pending,
      recentCommitShas,
      lastCommitSha: normalized.commitSha,
      lastCheckpointKey: checkpointKey || current.lastCheckpointKey || null,
      updatedAt: new Date().toISOString(),
    };

    const writeTx = db.transaction([STATE_STORE, BLOB_STORE], 'readwrite');
    const writeDone = transactionDone(writeTx);
    writeTx.objectStore(STATE_STORE).put(nextState, ledgerId);
    if (checkpoint) writeTx.objectStore(BLOB_STORE).put(checkpoint, checkpointKey);
    await writeDone;
    return checkpoint
      ? { status: 'CHECKPOINT_STORED', ledgerId, count, checkpointKey, fromEvent: checkpoint.fromEvent, toEvent: checkpoint.toEvent }
      : { status: 'BUFFERED', ledgerId, count, remaining: INTERVAL - (count % INTERVAL) };
  } finally {
    db.close();
  }
}

export function ingestPublicCheckpointEvent(event, options = {}) {
  const ledgerId = String(event?.ledgerId ?? '');
  const previous = queues.get(ledgerId) || Promise.resolve();
  const run = previous.catch(() => {}).then(() => ingestUnlocked(event, options));
  queues.set(ledgerId, run);
  const cleanup = () => { if (queues.get(ledgerId) === run) queues.delete(ledgerId); };
  run.then(cleanup, cleanup);
  return run;
}

export async function listPublicCheckpointKeys({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openPublicCheckpointDb(indexedDBImpl);
  try {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    const done = transactionDone(tx);
    const keys = await requestResult(tx.objectStore(BLOB_STORE).getAllKeys());
    await done;
    return keys.map(String);
  } finally {
    db.close();
  }
}

export async function readPublicCheckpoint(key, { indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openPublicCheckpointDb(indexedDBImpl);
  try {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    const done = transactionDone(tx);
    const value = (await requestResult(tx.objectStore(BLOB_STORE).get(String(key)))) || null;
    await done;
    return value;
  } finally {
    db.close();
  }
}

export async function getPublicCheckpointState(ledgerId, { indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openPublicCheckpointDb(indexedDBImpl);
  try {
    const tx = db.transaction(STATE_STORE, 'readonly');
    const done = transactionDone(tx);
    const value = (await requestResult(tx.objectStore(STATE_STORE).get(String(ledgerId)))) || null;
    await done;
    return value;
  } finally {
    db.close();
  }
}
