import { test, expect } from '@playwright/test';

const TARGET = process.env.GTHINK_URL || 'http://127.0.0.1:4173/gthink/index.html?dual-heart-playwright=2';
const CASES = [
  'Test',
  'Tu va bien ?',
  'On continue ici',
  'Nan pas ça',
  'Du coup ?',
  'Explique la méthode de routage GThink',
  'C est quoi FIRST_CAPTURE dans GVault ?',
  'Teste le bridge',
  'Comment ça va marcher le serveur ?'
];

test.describe('GThink dual-heart simultaneous coexistence probe', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err?.message || err)));
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
    page.__dualHeartPageErrors = pageErrors;
  });

  test('both hearts are available on the same GThink page', async ({ page }) => {
    const status = await page.evaluate(() => window.GTHINK_DUAL_HEART_PROBE.status());
    expect(status.primary).toBe(true);
    expect(status.secondary).toBe(true);
    expect(status.knowledge).toBe(true);
    expect(status.sharedStream).toBe('gvault://blobs/public/gthink/stream');
  });

  for (const message of CASES) {
    test(`same input in parallel without collision: ${message}`, async ({ page }) => {
      const before = await page.evaluate(() => ({
        answer: document.querySelector('#answer')?.textContent || '',
        mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null,
        responderSchema: window.GTHINK_PUBLIC_RESPONDER?.schema || null,
        secondarySchema: window.GTHINK_PUBLIC_NATIVE_ENGINE?.schema || null
      }));

      const result = await page.evaluate(msg => window.GTHINK_DUAL_HEART_PROBE.run(msg, { timeoutMs: 25_000, restoreUI: true }), message);

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

      const state = await page.evaluate(() => ({
        kinds: window.__GTHINK_DUAL_HEART_BLOBS.map(b => b.kind),
        starts: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.start').map(b => b.payload),
        primaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.primary.sealed').map(b => b.payload),
        secondaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.secondary.sealed').map(b => b.payload),
        compares: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.compare').map(b => b.payload),
        answer: document.querySelector('#answer')?.textContent || '',
        mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null,
        responderSchema: window.GTHINK_PUBLIC_RESPONDER?.schema || null,
        secondarySchema: window.GTHINK_PUBLIC_NATIVE_ENGINE?.schema || null
      }));

      expect(state.kinds).toContain('gthink.dual-heart.start');
      expect(state.kinds).toContain('gthink.dual-heart.primary.sealed');
      expect(state.kinds).toContain('gthink.dual-heart.secondary.sealed');
      expect(state.kinds).toContain('gthink.dual-heart.compare');
      const start = state.starts.at(-1);
      const primary = state.primaries.at(-1);
      const secondary = state.secondaries.at(-1);
      const compare = state.compares.at(-1);
      expect(primary.messageSha256).toBe(start.messageSha256);
      expect(secondary.messageSha256).toBe(start.messageSha256);
      expect(compare.primaryOk).toBe(true);
      expect(compare.secondaryOk).toBe(true);

      expect(state.answer).toBe(before.answer);
      expect(state.mode).toBe(before.mode);
      expect(state.responderSchema).toBe(before.responderSchema);
      expect(state.secondarySchema).toBe(before.secondarySchema);
      expect(page.__dualHeartPageErrors).toEqual([]);
    });
  }

  test('repeated parallel probes do not steal router ownership or mutate visible state', async ({ page }) => {
    const before = await page.evaluate(() => ({
      answer: document.querySelector('#answer')?.textContent || '',
      mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null
    }));
    const suite = await page.evaluate(() => window.GTHINK_DUAL_HEART_PROBE.runSuite([
      'Salut',
      'Test',
      'Tu va bien ?',
      'On continue ici',
      'Teste le bridge'
    ], { timeoutMs: 25_000, restoreUI: true }));
    expect(suite.count).toBe(5);
    expect(suite.passed).toBe(5);
    for (const run of suite.runs) {
      expect(run.primary.ok).toBe(true);
      expect(run.secondary.ok).toBe(true);
      expect(run.parallel.sameTick).toBe(true);
      expect(run.comparison.noFusion).toBe(true);
    }
    const after = await page.evaluate(() => ({
      answer: document.querySelector('#answer')?.textContent || '',
      mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null
    }));
    expect(after).toEqual(before);
    expect(page.__dualHeartPageErrors).toEqual([]);
  });
});
