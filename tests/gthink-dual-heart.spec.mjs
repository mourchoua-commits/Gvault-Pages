import { test, expect } from '@playwright/test';

const TARGET = process.env.GTHINK_URL || 'http://127.0.0.1:4173/gthink/index.html?dual-heart-playwright=1';
const CASES = ['Test', 'Tu va bien ?', 'Explique la méthode de routage GThink'];

test.describe('GThink dual-heart simultaneous probe', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.GVAULT_AGENT_LIVE_BLOB?.speak, null, { timeout: 15_000 });
    await page.waitForFunction(() => !!window.GTHINK_PUBLIC_RESPONDER?.respond, null, { timeout: 15_000 });
    await page.waitForFunction(() => !!window.GTHINK_PUBLIC_NATIVE_ENGINE?.answer, null, { timeout: 15_000 });
    await page.evaluate(async () => {
      if (window.GTHINK_DUAL_HEART_PROBE?.run) return;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = new URL('../scripts/gthink-dual-heart-probe.js?v=1', location.href).href;
        s.async = false;
        s.onload = resolve;
        s.onerror = () => reject(new Error('dual_heart_probe_load_failed'));
        document.head.appendChild(s);
      });
    });
    await page.waitForFunction(() => !!window.GTHINK_DUAL_HEART_PROBE?.run, null, { timeout: 10_000 });
    await page.evaluate(() => {
      window.__GTHINK_DUAL_HEART_BLOBS = [];
      window.addEventListener('gvault:blob', e => {
        const b = e.detail;
        if (String(b?.kind || '').startsWith('gthink.dual-heart.')) window.__GTHINK_DUAL_HEART_BLOBS.push(b);
      });
    });
  });

  test('both hearts are available on the same GThink page', async ({ page }) => {
    const status = await page.evaluate(() => window.GTHINK_DUAL_HEART_PROBE.status());
    expect(status.primary).toBe(true);
    expect(status.secondary).toBe(true);
    expect(status.knowledge).toBe(true);
    expect(status.sharedStream).toBe('gvault://blobs/public/gthink/stream');
  });

  for (const message of CASES) {
    test(`same input in parallel: ${message}`, async ({ page }) => {
      const beforeAnswer = await page.locator('#answer').textContent();
      const result = await page.evaluate(msg => window.GTHINK_DUAL_HEART_PROBE.run(msg, { timeoutMs: 20_000, restoreUI: true }), message);

      expect(result.message).toBe(message);
      expect(result.messageSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.parallel.startDeltaMs).toBeLessThan(5);
      expect(result.parallel.sameTick).toBe(true);
      expect(result.primary.ok).toBe(true);
      expect(result.secondary.ok).toBe(true);
      expect(result.primary.text.length).toBeGreaterThan(0);
      expect(result.secondary.text.length).toBeGreaterThan(0);
      expect(['CONVERGENT', 'COMPLEMENTARY', 'DIVERGENT']).toContain(result.comparison.verdict);
      expect(result.comparison.noFusion).toBe(true);
      expect(result.comparison.noVote).toBe(true);
      expect(result.comparison.independentSeals).toBe(true);

      const kinds = await page.evaluate(() => window.__GTHINK_DUAL_HEART_BLOBS.map(b => b.kind));
      expect(kinds).toContain('gthink.dual-heart.start');
      expect(kinds).toContain('gthink.dual-heart.primary.sealed');
      expect(kinds).toContain('gthink.dual-heart.secondary.sealed');
      expect(kinds).toContain('gthink.dual-heart.compare');

      const start = await page.evaluate(() => window.__GTHINK_DUAL_HEART_BLOBS.find(b => b.kind === 'gthink.dual-heart.start')?.payload);
      const primary = await page.evaluate(() => window.__GTHINK_DUAL_HEART_BLOBS.find(b => b.kind === 'gthink.dual-heart.primary.sealed')?.payload);
      const secondary = await page.evaluate(() => window.__GTHINK_DUAL_HEART_BLOBS.find(b => b.kind === 'gthink.dual-heart.secondary.sealed')?.payload);
      expect(primary.messageSha256).toBe(start.messageSha256);
      expect(secondary.messageSha256).toBe(start.messageSha256);

      await expect(page.locator('#answer')).toHaveText(beforeAnswer || '');
    });
  }
});
