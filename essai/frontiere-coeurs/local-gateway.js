/* C-BORDER/1 · liaison locale volontaire entre deux pages publiques.
 * Transport BroadcastChannel, sans réseau, stockage, secret, texte ni code libre.
 * Ne connecte ni GThink privé ni les trois cœurs réels.
 */
(function (global) {
  "use strict";
  const API = "GVAULT_LOCAL_GATEWAY_V1";
  const CHANNEL = "gvault-c-border-pages-local-v1";
  const NEEDS = Object.freeze({
    HEART_TICK: "HELLO",
    LETTER_POINT: "CAPABILITY",
    LANGUAGE_CONCEPT: "CAPABILITY",
    OPAQUE_UNKNOWN: "EVIDENCE_REF",
    BOUNDARY_CHECK: "EVIDENCE_REF",
    PROVENANCE_CHECK: "EVIDENCE_REF",
    CONSENT_REQUIRED: "STOP",
    LOAD_LIMIT: "STOP"
  });
  const CORES = ["GTHINK_PUBLIC", "GTHINK_PRIVATE", "GTHINK_IMAGE"];
  const KINDS = ["HELLO", "CAPABILITY", "EVIDENCE_REF", "ACK", "STOP"];
  const MAX_SEEN = 128;

  function parseFrame(value) {
    if (typeof value !== "string" || !value || value.length > 150 ||
        /[^\x21-\x7e]/.test(value)) return null;
    const parts = value.split("|");
    if (parts.length !== 6 || parts[0] !== "C-BORDER/1" ||
        !CORES.includes(parts[1]) || !CORES.includes(parts[2]) ||
        parts[1] === parts[2] || !KINDS.includes(parts[3]) ||
        !/^[0-9a-f]{16}$/.test(parts[4]) || !/^[123]$/.test(parts[5])) return null;
    return {from:parts[1],to:parts[2],kind:parts[3],nonce:parts[4],ttl:+parts[5]};
  }
  function exactFields(value, fields) {
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join("|") === fields.slice().sort().join("|");
  }
  function parseSignal(data) {
    if (!exactFields(data, ["schema","frame","need","phase"]) ||
        data.schema !== API || !Object.prototype.hasOwnProperty.call(NEEDS,data.need) ||
        !["TIC","TAC"].includes(data.phase)) return null;
    const frame = parseFrame(data.frame);
    if (!frame || frame.ttl !== 1 || frame.from !== "GTHINK_PUBLIC" ||
        frame.to !== "GTHINK_IMAGE" || frame.kind !== NEEDS[data.need]) return null;
    return {frame,need:data.need,phase:data.phase};
  }
  function parseReceipt(data) {
    if (!exactFields(data,["schema","nonce","status"]) ||
        data.schema !== "GVAULT_LOCAL_PAGE_RECEIPT_V1" ||
        !/^[0-9a-f]{16}$/.test(data.nonce) ||
        data.status !== "LOCAL_PAGE_RECEIVED") return null;
    return data;
  }
  function makeSignal(need, phase) {
    if (!Object.prototype.hasOwnProperty.call(NEEDS,need) ||
        !["TIC","TAC"].includes(phase)) throw Error("CLASS_OR_PHASE_DENIED");
    if (!global.crypto?.getRandomValues) throw Error("SECURE_RANDOM_UNAVAILABLE");
    const bytes = new Uint8Array(8);
    global.crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
    const frame = ["C-BORDER/1","GTHINK_PUBLIC","GTHINK_IMAGE",NEEDS[need],nonce,"1"].join("|");
    const signal = {schema:API,frame,need,phase};
    if (!parseSignal(signal)) throw Error("FRAME_VALIDATION_FAILED");
    return signal;
  }
  function openPort(role, callbacks={}) {
    if (!["ALPHABET","GATEWAY"].includes(role)) throw Error("ROLE_DENIED");
    if (typeof global.BroadcastChannel !== "function") throw Error("BROADCAST_CHANNEL_UNAVAILABLE");
    const channel = new global.BroadcastChannel(CHANNEL);
    const seen = new Set();
    const sent = new Set();
    let closed = false;
    let volume=0, windowStart=0;

    channel.onmessage = ({data}) => {
      if (closed) return;
      if (role === "GATEWAY") {
        if (parseReceipt(data)) return; // Acknowledge only another page, not a new request.
        const valid = parseSignal(data);
        if (!valid || seen.has(valid.frame.nonce)) {
          callbacks.onRejected?.("INVALID_OR_DUPLICATE");
          return;
        }
        seen.add(valid.frame.nonce);
        if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
        callbacks.onSignal?.(valid);
        channel.postMessage({
          schema:"GVAULT_LOCAL_PAGE_RECEIPT_V1",
          nonce:valid.frame.nonce,
          status:"LOCAL_PAGE_RECEIVED"
        });
      } else {
        const receipt = parseReceipt(data);
        if (!receipt || !sent.has(receipt.nonce)) return;
        sent.delete(receipt.nonce);
        callbacks.onReceipt?.(receipt);
      }
    };
    channel.onmessageerror = () => callbacks.onRejected?.("CLONE_ERROR");
    return {
      send(need,phase) {
        if (closed || role !== "ALPHABET") throw Error("SENDER_PORT_NOT_OPEN");
        const now = Date.now();
        if (now - windowStart >= 1000) {windowStart=now;volume=0;}
        if (++volume > 32) {callbacks.onDropped?.("LOCAL_BURST_LIMIT");return null;}
        const signal = makeSignal(need,phase);
        const nonce = parseFrame(signal.frame).nonce;
        sent.add(nonce);
        if (sent.size > MAX_SEEN) sent.delete(sent.values().next().value);
        channel.postMessage(signal);
        return nonce;
      },
      close() {
        if (closed) return;
        closed=true;channel.onmessage=null;channel.onmessageerror=null;
        channel.close();seen.clear();sent.clear();
      }
    };
  }
  global.GVaultLocalGateway = Object.freeze({
    schema:API,channel:CHANNEL,needs:NEEDS,parseFrame,parseSignal,
    parseReceipt,makeSignal,openPort
  });
})(window);
