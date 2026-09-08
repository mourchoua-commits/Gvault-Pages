import { test, expect } from '@playwright/test';

const ROOT='http://127.0.0.1:4173/';

test('GThink Model v0 boots, routes and integrates with a LIGHT-compatible runtime', async ({ page }) => {
  await page.goto(ROOT, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => !!window.GTHINK_MODEL_LIGHT_ADAPTER_V0, null, { timeout: 45_000 });
  await page.waitForFunction(() => !!window.GTHINK_MODEL_RUNTIME_V0, null, { timeout: 45_000 });

  const status=await page.evaluate(() => window.GTHINK_MODEL_RUNTIME_V0.status());
  expect(status.ready).toBeTruthy();

  const inspect=await page.evaluate(() => window.GTHINK_MODEL_RUNTIME_V0.inspect('analyse profondément le runtime et vérifie les risques'));
  expect(inspect.classification.depth).toBe('deep');
  expect(inspect.workforce.length).toBeGreaterThanOrEqual(2);
  expect(inspect.route).toContain('SPECIALIST_WORKFORCE');
  expect(inspect.route).toContain('SAFE_MIRROR_VISIBLE_OUTPUT');

  const direct=await page.evaluate(() => window.GTHINK_MODEL_RUNTIME_V0.ask('2+2'));
  expect(direct.ok).toBeTruthy();
  expect(direct.text).toContain('4');
  expect(direct.safeState.status).toBe('COMPLETED');
  expect(direct.safeState.privateReasoning).toBe('NOT_EXPOSED');

  const guard=await page.evaluate(() => window.GTHINK_MODEL_RUNTIME_V0.ask('supprime ce fichier'));
  expect(guard.ok).toBeFalsy();
  expect(guard.safeState.status).toBe('PRIVATE_RELAY_REQUIRED');

  const simple=await page.evaluate(() => window.GTHINK_MODEL_RUNTIME_V0.shouldHandle('ça va ?'));
  expect(simple).toBeFalsy();

  // The production #gvaultRuntime is created only after the live SAS handoff.
  // CI intentionally does not fake that authenticated lifecycle. Instead we test
  // the exact applyAgentModel contract against a same-origin LIGHT-compatible frame.
  await page.evaluate(() => {
    const old=document.getElementById('gvaultRuntime');
    if(old) old.remove();
    const frame=document.createElement('iframe');
    frame.id='gvaultRuntime';
    frame.src='about:blank';
    document.body.appendChild(frame);
  });

  await page.waitForFunction(() => {
    const frame=document.getElementById('gvaultRuntime');
    return !!frame?.contentWindow;
  });

  await page.evaluate(() => {
    const frame=document.getElementById('gvaultRuntime');
    const fallback=function(answer){ return answer || 'fallback'; };
    Object.defineProperty(fallback,'__gvaultConversationStyleV1',{value:true});
    Object.defineProperty(fallback,'__gvaultLightRuntimeBridge',{value:true});
    frame.contentWindow.applyAgentModel=fallback;
    window.GTHINK_MODEL_LIGHT_ADAPTER_V0.install();
  });

  await page.waitForFunction(async () => {
    const s=await window.GTHINK_MODEL_LIGHT_ADAPTER_V0?.status?.();
    return s?.runtimeWrapped===true;
  }, null, { timeout: 15_000 });

  const lightAnswer=await page.evaluate(async () => {
    const frame=document.getElementById('gvaultRuntime');
    return await frame.contentWindow.applyAgentModel('fallback','2+2',{});
  });
  expect(String(lightAnswer)).toContain('4');

  const adapterStatus=await page.evaluate(() => window.GTHINK_MODEL_LIGHT_ADAPTER_V0.status());
  expect(adapterStatus.runtimeWrapped).toBeTruthy();
  expect(adapterStatus.model.ready).toBeTruthy();
});
