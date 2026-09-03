import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const argv = process.argv.slice(2);

function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

const VISIBILITY = arg('--visibility', process.env.GVAULT_FEED_VISIBILITY || 'public');
const OUTPUT = arg('--output', process.env.GVAULT_FEED_OUTPUT || 'publications/git-changelog/index.json');
const VERIFY_ONLY = argv.includes('--verify-only');

if (!['public', 'private'].includes(VISIBILITY)) throw new Error(`invalid_visibility:${VISIBILITY}`);

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${String(r.stderr || r.stdout || '').trim()}`);
  return r.stdout;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeRepoPath(p) {
  return String(p || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

const outputPath = normalizeRepoPath(OUTPUT);

function isChangelogLike(filePath) {
  const p = normalizeRepoPath(filePath).toLowerCase();
  if (!p || p === outputPath.toLowerCase()) return false;
  const base = path.posix.basename(p);
  return /changelog|change[-_. ]?log|release[-_. ]?notes?|commit[-_. ]?log/.test(base) ||
    /^(changes|history|releases?|news|journal)(\.[a-z0-9._-]+)?$/.test(base) ||
    /(^|\/)(changelog|change-log|history|release-notes?|releases?|commit-log|provenance)(\/|$)/.test(p);
}

function sourceKind(filePath) {
  const p = filePath.toLowerCase();
  if (p.includes('release')) return 'release_notes';
  if (p.includes('history')) return 'history';
  if (p.includes('provenance')) return 'provenance';
  if (p.includes('commit')) return 'commit_log';
  if (p.includes('news')) return 'news';
  if (p.includes('journal')) return 'journal';
  return 'changelog';
}

function parseCommits(raw) {
  return raw.split('\x1e').map(r => r.trim()).filter(Boolean).map(record => {
    const [commitSha = '', committedAt = '', parentsRaw = ''] = record.split('\x1f');
    const parents = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : [];
    return { commitSha, committedAt, parentCount: parents.length };
  });
}

function forbiddenPublicKey(key) {
  return /^(author|email|subject|path|parents|content|body|message)$/i.test(key);
}

function verifyPublicShape(value, at = '$') {
  if (Array.isArray(value)) return value.forEach((item, i) => verifyPublicShape(item, `${at}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPublicKey(key)) throw new Error(`public_forbidden_key:${at}.${key}`);
    verifyPublicShape(child, `${at}.${key}`);
  }
}

function verifyIndex(index) {
  if (index?.schema !== 'gvault.git-changelog.unified.v2') throw new Error('bad_schema');
  if (index?.visibility !== VISIBILITY) throw new Error('bad_visibility');
  if (!/^[a-f0-9]{40}$/.test(index?.generatedFrom?.headSha || '')) throw new Error('bad_head_sha');
  if (!Array.isArray(index?.commits) || !Array.isArray(index?.changelogSources)) throw new Error('bad_collections');
  verifyPublicShape(index);
  const proof = index?.proof?.aggregateSha256;
  const withoutProof = { ...index };
  delete withoutProof.proof;
  if (proof !== sha256(JSON.stringify(withoutProof))) throw new Error('bad_aggregate_proof');
}

if (VERIFY_ONLY) {
  const existing = JSON.parse(fs.readFileSync(path.join(ROOT, outputPath), 'utf8'));
  verifyIndex(existing);
  console.log(`GVAULT_GIT_CHANGELOG_VERIFY PASS visibility=${VISIBILITY} output=${outputPath}`);
  process.exit(0);
}

const headSha = git(['rev-parse', 'HEAD']).trim();
const headCommittedAt = git(['show', '-s', '--format=%cI', headSha]).trim();
const repository = process.env.GITHUB_REPOSITORY || path.basename(ROOT);
const tracked = git(['ls-files', '-z']).split('\0').map(normalizeRepoPath).filter(Boolean);
const sourcePaths = [...new Set(tracked.filter(isChangelogLike))].sort();

const changelogSources = sourcePaths.map(filePath => {
  const abs = path.join(ROOT, filePath);
  const bytes = fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs) : Buffer.alloc(0);
  const touching = git(['log', '--all', '--format=%H', '--', filePath]).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return {
    sourceId: sha256(filePath),
    kind: sourceKind(filePath),
    basename: path.posix.basename(filePath),
    byteLength: bytes.length,
    contentSha256: sha256(bytes),
    touchingCommitCount: touching.length,
    touchingCommitsSha256: sha256(touching.join('\n'))
  };
});

const commits = parseCommits(git(['log', '--all', '--reverse', '--pretty=format:%H%x1f%cI%x1f%P%x1f%s%x1e']));
const base = {
  schema: 'gvault.git-changelog.unified.v2',
  visibility: 'public',
  repository,
  generatedFrom: { headSha, headCommittedAt },
  authorities: { commits: 'git_history', changelog: 'tracked_repository_files', projection: 'derived_rebuildable_index' },
  gthink: { enabled: true, route: 'intention_function_then_router_then_location_then_index', mode: 'commit_changelog_unification' },
  blob: { intake: 'BLOB_GIT_CHANGELOG_CONTINUOUS_INTAKE', eventPort: 'blob://interior/git-changelog-in', dedupe: ['commitSha', 'sourceId:contentSha256'] },
  discovery: {
    recursive: true,
    trackedFileCount: tracked.length,
    changelogSourceCount: changelogSources.length,
    commitCount: commits.length,
    patterns: ['changelog', 'change-log', 'history', 'release-notes', 'releases', 'changes', 'news', 'journal', 'commit-log', 'provenance']
  },
  commits,
  changelogSources
};
const index = { ...base, proof: { aggregateSha256: sha256(JSON.stringify(base)) } };
verifyIndex(index);
const absOutput = path.join(ROOT, outputPath);
fs.mkdirSync(path.dirname(absOutput), { recursive: true });
fs.writeFileSync(absOutput, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`GVAULT_GIT_CHANGELOG_UNIFY PASS visibility=public commits=${commits.length} sources=${changelogSources.length} output=${outputPath}`);
