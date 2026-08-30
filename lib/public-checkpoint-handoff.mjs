import {
  getPublicCheckpointState,
  ingestPublicCheckpointEvent,
  listPublicCheckpointKeys,
  readPublicCheckpoint,
} from './public-checkpoint-vfs.mjs';

export const HANDOFF_SCHEMA = Object.freeze({
  INGEST: 'GVAULT_PUBLIC_CHECKPOINT_INGEST_V1',
  LIST: 'GVAULT_PUBLIC_CHECKPOINT_LIST_V1',
  GET: 'GVAULT_PUBLIC_CHECKPOINT_GET_V1',
  STATE: 'GVAULT_PUBLIC_CHECKPOINT_STATE_V1',
  RESULT: 'GVAULT_PUBLIC_CHECKPOINT_RESULT_V1',
});

function reply(target, origin, requestId, payload) {
  if (!target?.postMessage) return;
  const safeOrigin = origin && origin !== 'null' ? origin : '*';
  target.postMessage({ schema: HANDOFF_SCHEMA.RESULT, requestId, ...payload }, safeOrigin);
}

export function installPublicCheckpointHandoff(targetWindow = globalThis.window) {
  if (!targetWindow?.addEventListener) return () => {};
  if (targetWindow.__GVAULT_PUBLIC_CHECKPOINT_HANDOFF_INSTALLED__) return targetWindow.__GVAULT_PUBLIC_CHECKPOINT_HANDOFF_INSTALLED__;

  const directApi = Object.freeze({
    ingest: ingestPublicCheckpointEvent,
    list: listPublicCheckpointKeys,
    read: readPublicCheckpoint,
    state: getPublicCheckpointState,
  });
  targetWindow.GVaultPublicCheckpointVFS = directApi;

  const listener = async (event) => {
    const data = event.data || {};
    if (!Object.values(HANDOFF_SCHEMA).includes(data.schema) || data.schema === HANDOFF_SCHEMA.RESULT) return;
    const requestId = String(data.requestId || '');
    try {
      if (data.schema === HANDOFF_SCHEMA.INGEST) {
        const value = await directApi.ingest(data.event);
        reply(event.source, event.origin, requestId, { ok: true, value });
      } else if (data.schema === HANDOFF_SCHEMA.LIST) {
        const value = await directApi.list();
        reply(event.source, event.origin, requestId, { ok: true, value });
      } else if (data.schema === HANDOFF_SCHEMA.GET) {
        const value = await directApi.read(data.key);
        reply(event.source, event.origin, requestId, { ok: true, value });
      } else if (data.schema === HANDOFF_SCHEMA.STATE) {
        const value = await directApi.state(data.ledgerId);
        reply(event.source, event.origin, requestId, { ok: true, value });
      }
    } catch (error) {
      reply(event.source, event.origin, requestId, { ok: false, error: String(error?.message || error) });
    }
  };
  targetWindow.addEventListener('message', listener);
  targetWindow.addEventListener('gvault:proven-conversation-event', (event) => {
    directApi.ingest(event.detail).catch((error) => console.warn('PUBLIC_CHECKPOINT_PENDING', error));
  });
  const uninstall = () => targetWindow.removeEventListener('message', listener);
  targetWindow.__GVAULT_PUBLIC_CHECKPOINT_HANDOFF_INSTALLED__ = uninstall;
  return uninstall;
}

if (typeof window !== 'undefined') installPublicCheckpointHandoff(window);
