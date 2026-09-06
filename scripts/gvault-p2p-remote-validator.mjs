#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REQUEST_SCHEMA = 'GVAULT_P2P_REMOTE_VALIDATION_REQUEST_V1';
export const RECEIPT_SCHEMA = 'GVAULT_P2P_REMOTE_VALIDATION_RECEIPT_V1';
export const CAPSULE_SCHEMA = 'GVAULT_P2P_VALIDATION_CAPSULE_V1';
export const PEER_ID = 'GVAULT_PAGES_PUBLIC_RUNNER_BLOB';

export const SUITES = Object.freeze({
  VERBATIM_INGRESS_V2: Object.freeze({
    suiteId: 'VERBATIM_INGRESS_V2',
    argv: Object.freeze([
      'node', '--test',
      'scripts/gvault-verbatim-ingress.test.mjs',
      'scripts/gvault-verbatim-reference-registry-ingress.test.mjs',
      'tests/gvault-verbatim-ingress-v2.test.mjs',
      'tests/gvault-p2p-validation-protocol.test.mjs'
    ]),
    requiredManifestPaths: Object.freeze([
      'scripts/gvault-verbatim-ingress.mjs',
      'scripts/gvault-verbatim-reference-registry.mjs',
      'scripts/gvault-verbatim-side-ref-reader.mjs',
      'scripts/gvault-p2p-validation-protocol.mjs',
      'scripts/gvault-verbatim-ingress.test.mjs',
      'scripts/gvault-verbatim-reference-registry-ingress.test.mjs',
      'tests/gvault-verbatim-ingress-v2.test.mjs',
      'tests/gvault-p2p-validation-protocol.test.mjs'
    ])
  })
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function suiteDigestSha256(suiteId) {
  const suite = SUITES[suiteId];
  if (!suite) throw new Error('SUITE_NOT_ALLOWLISTED');
  return sha256(Buffer.from(stable({ suiteId: suite.suiteId, argv: suite.argv }), 'utf8'));
}

export function validateRequest(request) {
  const errors = [];
  if (request?.schema !== REQUEST_SCHEMA) errors.push('REQUEST_SCHEMA_INVALID');
  if (request?.protocolVersion !== 1) errors.push('PROTOCOL_VERSION_INVALID');
  if (!SUITES[request?.suiteId]) errors.push('SUITE_NOT_ALLOWLISTED');
  if (!/^[a-f0-9]{64}$/.test(String(request?.targetCommitSha256 || ''))) errors.push('TARGET_HASH_INVALID');
  if (!/^P2PVAL-[a-f0-9]{24}$/.test(String(request?.requestId || ''))) errors.push('REQUEST_ID_INVALID');
  if (request?.targetRefDisclosure !== 'SHA256_ONLY') errors.push('TARGET_DISCLOSURE_INVALID');
  if (request?.privateContentRequestedForPublication !== false) errors.push('PRIVATE_PUBLICATION_REQUEST_FORBIDDEN');
  if (SUITES[request?.suiteId] && request?.suiteCommandDigestSha256 !== suiteDigestSha256(request.suiteId)) errors.push('SUITE_DIGEST_MISMATCH');
  return { status: errors.length ? 'INVALID' : 'PASS', errors };
}

export function findTargetCommitByDigest({ root, targetCommitSha256 }) {
  const raw = execFileSync('git', ['-C', root, 'rev-list', '--all'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  for (const commitSha of raw.split(/\r?\n/)) {
    if (!commitSha) continue;
    if (sha256(Buffer.from(commitSha, 'utf8')) === targetCommitSha256) return commitSha;
  }
  return null;
}

function countTap(text, label) {
  const re = new RegExp(`^# ${label} (\\d+)\\s*$`, 'm');
  const match = String(text || '').match(re);
  return match ? Number(match[1]) : null;
}

export function capsuleDigestSha256(capsule) {
  const { capsuleSha256, ...core } = capsule || {};
  return sha256(Buffer.from(stable(core), 'utf8'));
}

export function validateCapsule({ request, capsule }) {
  const errors = [];
  const requestCheck = validateRequest(request);
  if (requestCheck.status !== 'PASS') errors.push(...requestCheck.errors.map(x => `REQUEST:${x}`));
  if (capsule?.schema !== CAPSULE_SCHEMA) errors.push('CAPSULE_SCHEMA_INVALID');
  if (capsule?.protocolVersion !== 1) errors.push('CAPSULE_PROTOCOL_VERSION_INVALID');
  if (capsule?.requestId !== request?.requestId) errors.push('CAPSULE_REQUEST_ID_MISMATCH');
  if (capsule?.suiteId !== request?.suiteId) errors.push('CAPSULE_SUITE_ID_MISMATCH');
  if (capsule?.suiteCommandDigestSha256 !== request?.suiteCommandDigestSha256) errors.push('CAPSULE_SUITE_DIGEST_MISMATCH');
  if (capsule?.targetCommitSha256 !== request?.targetCommitSha256) errors.push('CAPSULE_TARGET_MISMATCH');
  if (capsule?.attestationMode !== 'PRIVATE_MANIFEST_HASH_ONLY') errors.push('CAPSULE_ATTESTATION_MODE_INVALID');
  if (capsule?.privateSourceIncluded !== false) errors.push('CAPSULE_PRIVATE_SOURCE_FLAG');
  if (capsule?.privateCommitShaIncluded !== false) errors.push('CAPSULE_PRIVATE_COMMIT_FLAG');
  if (!/^[a-f0-9]{64}$/.test(String(capsule?.capsuleSha256 || ''))) errors.push('CAPSULE_DIGEST_MISSING');
  else if (capsuleDigestSha256(capsule) !== capsule.capsuleSha256) errors.push('CAPSULE_DIGEST_MISMATCH');

  const manifest = Array.isArray(capsule?.fileManifest) ? capsule.fileManifest : [];
  const seen = new Set();
  for (const entry of manifest) {
    const p = String(entry?.path || '');
    if (!p || seen.has(p)) errors.push('CAPSULE_MANIFEST_PATH_INVALID_OR_DUPLICATE');
    seen.add(p);
    if (!/^[a-f0-9]{40}$/.test(String(entry?.gitBlobSha || ''))) errors.push(`CAPSULE_BLOB_SHA_INVALID:${p}`);
    if (!Number.isInteger(entry?.utf8Bytes) || entry.utf8Bytes < 0) errors.push(`CAPSULE_BYTES_INVALID:${p}`);
  }
  const suite = SUITES[request?.suiteId];
  if (suite) {
    for (const required of suite.requiredManifestPaths) {
      if (!seen.has(required)) errors.push(`CAPSULE_REQUIRED_PATH_MISSING:${required}`);
    }
  }
  return { status: errors.length ? 'INVALID' : 'PASS', errors, manifestCount: manifest.length };
}

export function receiptDigestSha256(receipt) {
  const { receiptSha256, ...core } = receipt || {};
  return sha256(Buffer.from(stable(core), 'utf8'));
}

export function finalizeReceipt(core) {
  return { ...core, receiptSha256: receiptDigestSha256(core) };
}

function baseReceipt(request, { executionMode, assuranceLevel, observedAt = new Date().toISOString() } = {}) {
  return {
    schema: RECEIPT_SCHEMA,
    protocolVersion: 1,
    peerId: PEER_ID,
    requestId: request?.requestId || null,
    suiteId: request?.suiteId || null,
    suiteCommandDigestSha256: request?.suiteCommandDigestSha256 || null,
    targetCommitSha256: request?.targetCommitSha256 || null,
    executionMode,
    assuranceLevel,
    privateContentPublished: false,
    privateCommitShaPublished: false,
    observedAt
  };
}

export function capabilityFailureReceipt(request, reason = 'PRIVATE_READ_CAPABILITY_MISSING') {
  return finalizeReceipt({
    ...baseReceipt(request, { executionMode: 'PRIVATE_CLONE_REMOTE_EXECUTOR', assuranceLevel: 'REMOTE_EXACT_PRIVATE_COMMIT_EXECUTION' }),
    status: 'FAIL',
    reason,
    tests: { exitCode: 126, passed: 0, failed: 1, outputSha256: sha256(Buffer.from(reason, 'utf8')) }
  });
}

export function executeCapsuleValidation({ request, capsule }) {
  const check = validateCapsule({ request, capsule });
  const status = check.status === 'PASS' ? 'PASS' : 'FAIL';
  const output = JSON.stringify({ errors: check.errors, manifestCount: check.manifestCount });
  return finalizeReceipt({
    ...baseReceipt(request, { executionMode: 'CAPSULE_ATTESTATION', assuranceLevel: 'REMOTE_PROTOCOL_AND_MANIFEST_ATTESTATION' }),
    status,
    reason: status === 'PASS' ? 'CAPSULE_PROTOCOL_AND_MANIFEST_VALIDATED' : 'CAPSULE_VALIDATION_FAILED',
    capsuleSha256: capsule?.capsuleSha256 || null,
    tests: {
      exitCode: status === 'PASS' ? 0 : 123,
      passed: status === 'PASS' ? 1 + check.manifestCount : 0,
      failed: check.errors.length,
      outputSha256: sha256(Buffer.from(output, 'utf8'))
    },
    capsuleErrors: check.errors
  });
}

export function executeValidation({ request, privateRoot }) {
  const requestCheck = validateRequest(request);
  if (requestCheck.status !== 'PASS') {
    return finalizeReceipt({
      ...baseReceipt(request, { executionMode: 'PRIVATE_CLONE_REMOTE_EXECUTOR', assuranceLevel: 'REMOTE_EXACT_PRIVATE_COMMIT_EXECUTION' }),
      status: 'FAIL',
      reason: 'REQUEST_INVALID',
      requestErrors: requestCheck.errors,
      tests: { exitCode: 125, passed: 0, failed: 1, outputSha256: sha256(Buffer.from(requestCheck.errors.join(','), 'utf8')) }
    });
  }

  const targetCommit = findTargetCommitByDigest({ root: privateRoot, targetCommitSha256: request.targetCommitSha256 });
  if (!targetCommit) {
    return finalizeReceipt({
      ...baseReceipt(request, { executionMode: 'PRIVATE_CLONE_REMOTE_EXECUTOR', assuranceLevel: 'REMOTE_EXACT_PRIVATE_COMMIT_EXECUTION' }),
      status: 'FAIL',
      reason: 'TARGET_COMMIT_NOT_FOUND',
      tests: { exitCode: 124, passed: 0, failed: 1, outputSha256: sha256(Buffer.from('TARGET_COMMIT_NOT_FOUND', 'utf8')) }
    });
  }

  execFileSync('git', ['-C', privateRoot, 'checkout', '--quiet', '--detach', targetCommit], { stdio: ['ignore', 'ignore', 'pipe'] });
  const suite = SUITES[request.suiteId];
  const run = spawnSync(suite.argv[0], suite.argv.slice(1), {
    cwd: privateRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = String(run.stdout || '');
  const stderr = String(run.stderr || '');
  const combined = `${stdout}\n${stderr}`;
  const exitCode = Number.isInteger(run.status) ? run.status : 127;
  const parsedPassed = countTap(stdout, 'pass');
  const parsedFailed = countTap(stdout, 'fail');
  const passed = parsedPassed ?? 0;
  const failed = parsedFailed ?? (exitCode === 0 ? 0 : 1);
  const status = exitCode === 0 && failed === 0 ? 'PASS' : 'FAIL';

  return finalizeReceipt({
    ...baseReceipt(request, { executionMode: 'PRIVATE_CLONE_REMOTE_EXECUTOR', assuranceLevel: 'REMOTE_EXACT_PRIVATE_COMMIT_EXECUTION' }),
    status,
    reason: status === 'PASS' ? 'ALLOWLISTED_SUITE_PASSED' : 'ALLOWLISTED_SUITE_FAILED',
    tests: {
      exitCode,
      passed,
      failed,
      outputSha256: sha256(Buffer.from(combined, 'utf8'))
    }
  });
}

function argValue(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

function writeReceipt(file, receipt) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function cli() {
  const argv = process.argv.slice(2);
  const requestFile = argValue(argv, '--request');
  const receiptFile = argValue(argv, '--receipt');
  if (!requestFile || !receiptFile) throw new Error('REQUEST_AND_RECEIPT_PATH_REQUIRED');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const capsuleFile = argValue(argv, '--capsule');
  const receipt = capsuleFile
    ? executeCapsuleValidation({ request, capsule: JSON.parse(fs.readFileSync(capsuleFile, 'utf8')) })
    : argv.includes('--capability-fail')
      ? capabilityFailureReceipt(request)
      : executeValidation({ request, privateRoot: argValue(argv, '--private-root') });
  writeReceipt(receiptFile, receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, executionMode: receipt.executionMode, assuranceLevel: receipt.assuranceLevel, requestId: receipt.requestId, peerId: receipt.peerId, receiptSha256: receipt.receiptSha256 })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) cli();
