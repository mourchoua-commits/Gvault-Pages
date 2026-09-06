#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REQUEST_SCHEMA = 'GVAULT_P2P_REMOTE_VALIDATION_REQUEST_V1';
export const RECEIPT_SCHEMA = 'GVAULT_P2P_REMOTE_VALIDATION_RECEIPT_V1';
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

export function receiptDigestSha256(receipt) {
  const { receiptSha256, ...core } = receipt || {};
  return sha256(Buffer.from(stable(core), 'utf8'));
}

export function finalizeReceipt(core) {
  return { ...core, receiptSha256: receiptDigestSha256(core) };
}

function baseReceipt(request, observedAt = new Date().toISOString()) {
  return {
    schema: RECEIPT_SCHEMA,
    protocolVersion: 1,
    peerId: PEER_ID,
    requestId: request?.requestId || null,
    suiteId: request?.suiteId || null,
    suiteCommandDigestSha256: request?.suiteCommandDigestSha256 || null,
    targetCommitSha256: request?.targetCommitSha256 || null,
    executionMode: 'PRIVATE_CLONE_REMOTE_EXECUTOR',
    privateContentPublished: false,
    privateCommitShaPublished: false,
    observedAt
  };
}

export function capabilityFailureReceipt(request, reason = 'PRIVATE_READ_CAPABILITY_MISSING') {
  return finalizeReceipt({
    ...baseReceipt(request),
    status: 'FAIL',
    reason,
    tests: { exitCode: 126, passed: 0, failed: 1, outputSha256: sha256(Buffer.from(reason, 'utf8')) }
  });
}

export function executeValidation({ request, privateRoot }) {
  const requestCheck = validateRequest(request);
  if (requestCheck.status !== 'PASS') {
    return finalizeReceipt({
      ...baseReceipt(request),
      status: 'FAIL',
      reason: 'REQUEST_INVALID',
      requestErrors: requestCheck.errors,
      tests: { exitCode: 125, passed: 0, failed: 1, outputSha256: sha256(Buffer.from(requestCheck.errors.join(','), 'utf8')) }
    });
  }

  const targetCommit = findTargetCommitByDigest({ root: privateRoot, targetCommitSha256: request.targetCommitSha256 });
  if (!targetCommit) {
    return finalizeReceipt({
      ...baseReceipt(request),
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
    ...baseReceipt(request),
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
  const receipt = argv.includes('--capability-fail')
    ? capabilityFailureReceipt(request)
    : executeValidation({ request, privateRoot: argValue(argv, '--private-root') });
  writeReceipt(receiptFile, receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, requestId: receipt.requestId, peerId: receipt.peerId, receiptSha256: receipt.receiptSha256 })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) cli();
