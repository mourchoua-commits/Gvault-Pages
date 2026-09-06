import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  capabilityFailureReceipt,
  findTargetCommitByDigest,
  receiptDigestSha256,
  sha256,
  suiteDigestSha256,
  validateRequest
} from '../scripts/gvault-p2p-remote-validator.mjs';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function requestFor(commitSha) {
  return {
    schema: 'GVAULT_P2P_REMOTE_VALIDATION_REQUEST_V1',
    protocolVersion: 1,
    suiteId: 'VERBATIM_INGRESS_V2',
    suiteCommandDigestSha256: suiteDigestSha256('VERBATIM_INGRESS_V2'),
    targetCommitSha256: sha256(Buffer.from(commitSha, 'utf8')),
    requestedAt: '2026-09-06T19:11:30Z',
    nonce: 'c7f4c98178d24ecfa57e67dd2b1a9831',
    targetRefDisclosure: 'SHA256_ONLY',
    privateContentRequestedForPublication: false,
    requestId: 'P2PVAL-d154a08c09fc9558b0ca86fe'
  };
}

test('finds exact private commit from one-way public digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2p-peer-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(root, 'x.txt'), 'one\n');
  git(root, 'add', 'x.txt');
  git(root, 'commit', '-qm', 'one');
  const first = git(root, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'x.txt'), 'two\n');
  git(root, 'commit', '-qam', 'two');
  const found = findTargetCommitByDigest({ root, targetCommitSha256: sha256(Buffer.from(first, 'utf8')) });
  assert.equal(found, first);
});

test('rejects arbitrary suite injection', () => {
  const request = requestFor('a'.repeat(40));
  request.suiteId = 'RUN_ANYTHING';
  const result = validateRequest(request);
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.includes('SUITE_NOT_ALLOWLISTED'));
});

test('capability failure produces a self-verifying fail receipt', () => {
  const request = requestFor('b'.repeat(40));
  const receipt = capabilityFailureReceipt(request);
  assert.equal(receipt.status, 'FAIL');
  assert.equal(receipt.privateContentPublished, false);
  assert.equal(receipt.privateCommitShaPublished, false);
  assert.equal(receipt.receiptSha256, receiptDigestSha256(receipt));
});
