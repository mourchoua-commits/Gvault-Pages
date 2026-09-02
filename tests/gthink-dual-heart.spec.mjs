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

const POWER_CASES = [
  'Test pleine puissance',
  'Tu va bien même si les deux coeurs tournent en même temps ?',
  'On continue ici sans perdre le contexte précédent',
  'Nan pas ça, corrige seulement la dernière intention',
  'Du coup ? reprends le sens commun de toute la phrase',
  'Explique la méthode de routage GThink sans canoniser trop tôt',
  'C est quoi FIRST_CAPTURE dans GVault et dans quel ordre il intervient ?',
  'Teste le bridge puis vérifie qu aucun coeur ne vole la réponse de l autre',
  'Comment ça va marcher le serveur avec un seul gateway obligatoire ?',
  'star triangulation mais garde le sens de la constellation avant comparaison',
  'beschamps test de routage et de récupération de contexte',
  'orang outan girafe banane 7314 retrouve les relations sans écrasement',
  'fais une passe inverse puis normale sans fusionner les deux résultats',
  'si un coeur diverge laisse les deux résultats scellés indépendamment',
  'question courte ?',
  'une phrase avec des fautes tkt c pa grav comprend le sens avant normalisation',
  'emoji test 🧠🧠 routeur mémoire capture twins',
  'accents éèàù ç œ GThink GVault méthode de routage',
  'A'.repeat(2048),
  'B'.repeat(8192)
];

async function preparePage(page) {
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
}

function assertRun(run, expectedMessage) {
  expect(run.message).toBe(expectedMessage);
  expect(run.messageSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(run.primary.ok).toBe(true);
  expect(run.secondary.ok).toBe(true);
  expect(run.primary.text.length).toBeGreaterThan(0);
  expect(run.secondary.text.length).toBeGreaterThan(0);
  expect(run.comparison.noFusion).toBe(true);
  expect(run.comparison.noVote).toBe(true);
  expect(run.comparison.independentSeals).toBe(true);
  expect(['CONVERGENT', 'COMPLEMENTARY', 'DIVERGENT']).toContain(run.comparison.verdict);
}

test.describe('GThink dual-heart simultaneous coexistence probe', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await preparePage(page);
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

  test('FULL POWER: 128 simultaneous probes keep both hearts sealed and collision-free', async ({ page }) => {
    test.setTimeout(180_000);
    const before = await page.evaluate(() => ({
      answer: document.querySelector('#answer')?.textContent || '',
      mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null,
      responderSchema: window.GTHINK_PUBLIC_RESPONDER?.schema || null,
      secondarySchema: window.GTHINK_PUBLIC_NATIVE_ENGINE?.schema || null
    }));

    const messages = Array.from({ length: 128 }, (_, i) => `${POWER_CASES[i % POWER_CASES.length]} [burst:${i}]`);
    const runs = await page.evaluate(async msgs => Promise.all(msgs.map(msg => window.GTHINK_DUAL_HEART_PROBE.run(msg, { timeoutMs: 45_000, restoreUI: true }))), messages);

    expect(runs).toHaveLength(128);
    const ids = new Set();
    for (let i = 0; i < runs.length; i++) {
      assertRun(runs[i], messages[i]);
      ids.add(runs[i].probeId);
      expect(runs[i].parallel.startDeltaMs).toBeLessThan(20);
    }
    expect(ids.size).toBe(128);

    const state = await page.evaluate(() => ({
      starts: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.start').length,
      primaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.primary.sealed').length,
      secondaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.secondary.sealed').length,
      compares: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.compare').length,
      answer: document.querySelector('#answer')?.textContent || '',
      mode: window.GTHINK_DUAL_KERNEL_ROUTER?.mode || null,
      responderSchema: window.GTHINK_PUBLIC_RESPONDER?.schema || null,
      secondarySchema: window.GTHINK_PUBLIC_NATIVE_ENGINE?.schema || null
    }));

    expect(state.starts).toBe(128);
    expect(state.primaries).toBe(128);
    expect(state.secondaries).toBe(128);
    expect(state.compares).toBe(128);
    expect(state.answer).toBe(before.answer);
    expect(state.mode).toBe(before.mode);
    expect(state.responderSchema).toBe(before.responderSchema);
    expect(state.secondarySchema).toBe(before.secondarySchema);
    expect(page.__dualHeartPageErrors).toEqual([]);
  });

  test('FULL POWER: 6 pages x 24 probes saturate both hearts without cross-page contamination', async ({ browser, page }) => {
    test.setTimeout(240_000);
    const pages = [page];
    for (let i = 1; i < 6; i++) pages.push(await browser.newPage());

    try {
      for (let i = 1; i < pages.length; i++) await preparePage(pages[i]);

      const payloads = pages.map((_, pageIndex) => Array.from({ length: 24 }, (_, i) => `${POWER_CASES[(pageIndex * 24 + i) % POWER_CASES.length]} [page:${pageIndex}:probe:${i}]`));
      const all = await Promise.all(pages.map((p, pageIndex) => p.evaluate(async msgs => Promise.all(msgs.map(msg => window.GTHINK_DUAL_HEART_PROBE.run(msg, { timeoutMs: 45_000, restoreUI: true }))), payloads[pageIndex])));

      expect(all).toHaveLength(6);
      const globalIds = new Set();
      for (let pageIndex = 0; pageIndex < all.length; pageIndex++) {
        expect(all[pageIndex]).toHaveLength(24);
        for (let i = 0; i < all[pageIndex].length; i++) {
          const run = all[pageIndex][i];
          assertRun(run, payloads[pageIndex][i]);
          globalIds.add(run.probeId);
          expect(run.parallel.startDeltaMs).toBeLessThan(25);
        }
        expect(pages[pageIndex].__dualHeartPageErrors).toEqual([]);
      }
      expect(globalIds.size).toBe(144);

      const counts = await Promise.all(pages.map(p => p.evaluate(() => ({
        starts: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.start').length,
        primaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.primary.sealed').length,
        secondaries: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.secondary.sealed').length,
        compares: window.__GTHINK_DUAL_HEART_BLOBS.filter(b => b.kind === 'gthink.dual-heart.compare').length
      }))));
      for (const count of counts) expect(count).toEqual({ starts: 24, primaries: 24, secondaries: 24, compares: 24 });
    } finally {
      for (let i = 1; i < pages.length; i++) await pages[i].close();
    }
  });
});
