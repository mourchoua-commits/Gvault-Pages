import { test, expect } from '@playwright/test';

const FEED_URL = process.env.GVAULT_CHANGELOG_FEED_URL || 'http://127.0.0.1:4173/publications/git-changelog/index.json';

function collectForbiddenKeys(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectForbiddenKeys(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (/^(author|email|subject|path|parents|content|body|message)$/i.test(key)) found.push(key);
    collectForbiddenKeys(child, found);
  }
  return found;
}

test.describe('GThink/blob unified public commit-changelog feed', () => {
  test('is reachable, complete-shaped and sanitized', async ({ request }) => {
    const response = await request.get(FEED_URL);
    expect(response.ok()).toBe(true);
    const feed = await response.json();

    expect(feed.schema).toBe('gvault.git-changelog.unified.v2');
    expect(feed.visibility).toBe('public');
    expect(feed.gthink?.enabled).toBe(true);
    expect(feed.blob?.intake).toBe('BLOB_GIT_CHANGELOG_CONTINUOUS_INTAKE');
    expect(feed.discovery?.recursive).toBe(true);
    expect(feed.discovery?.commitCount).toBe(feed.commits.length);
    expect(feed.discovery?.changelogSourceCount).toBe(feed.changelogSources.length);
    expect(feed.generatedFrom?.headSha).toMatch(/^[a-f0-9]{40}$/);
    expect(feed.proof?.aggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(collectForbiddenKeys(feed)).toEqual([]);

    for (const commit of feed.commits) {
      expect(commit.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(commit.parentCount).toBeGreaterThanOrEqual(0);
    }
    for (const source of feed.changelogSources) {
      expect(source.sourceId).toMatch(/^[a-f0-9]{64}$/);
      expect(source.contentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.touchingCommitsSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
