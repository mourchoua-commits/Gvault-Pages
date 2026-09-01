#!/usr/bin/env python3
import importlib.util, json, shutil, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('a11y',ROOT/'tests/public-pre-sas-accessibility-cdp.py')
a11y=importlib.util.module_from_spec(spec);spec.loader.exec_module(a11y)
SCRIPT=(ROOT/'scripts/gvault-defect-selfheal-blobs.js').read_text(encoding='utf-8')
OUT=ROOT/'artifacts/pre-sas-a11y/selfheal-proof.json'
OUT.parent.mkdir(parents=True,exist_ok=True)

def main():
 chrome,user=a11y.launch_chrome();cdp=None
 try:
  cdp,_=a11y.new_tab()
  cdp.call('Page.enable');cdp.call('Runtime.enable');cdp.call('Accessibility.enable');cdp.call('Network.enable')
  cdp.call('Emulation.setDeviceMetricsOverride',{'width':360,'height':663,'deviceScaleFactor':3,'mobile':True,'screenWidth':360,'screenHeight':663})
  cdp.call('Emulation.setEmulatedMedia',{'media':'screen','features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
  cdp.call('Page.navigate',{'url':a11y.URL});a11y.wait_js(cdp,"!!document.querySelector('#lockScreenTrigger')",60)
  cdp.eval("document.querySelector('#lockScreenTrigger').focus();true");a11y.key(cdp,'Enter');time.sleep(.2)
  r=cdp.call('Runtime.evaluate',{'expression':SCRIPT,'returnByValue':True})
  if r.get('exceptionDetails'):raise RuntimeError(r['exceptionDetails'])
  a11y.wait_js(cdp,"!!window.GVAULT_DEFECT_BLOBS && window.GVAULT_DEFECT_BLOBS.status().events>0",8)
  time.sleep(.25)
  probe=cdp.eval(r'''(()=>{
    const rect=id=>{const e=document.getElementById(id),r=e?.getBoundingClientRect();return r?{w:Math.round(r.width),h:Math.round(r.height)}:null};
    const targeted=new Set(['vaultGear','phoneLockSymbol','lockSwipe','themeArtifact','matrixSprite','neonScanline','constellationTag','archiveSlip','monoGhost']);
    const running=document.getAnimations().filter(a=>a.playState==='running'&&[...targeted].some(c=>a.effect?.target?.classList?.contains(c))).map(a=>a.animationName||'');
    return {
      passwordAria:document.querySelector('#vaultPassword')?.getAttribute('aria-label')||'',
      themeAria:document.querySelector('#entryTheme')?.getAttribute('aria-label')||'',
      sizes:Object.fromEntries(['safeCollapse','themeCycle','togglePass','unlockBtn'].map(id=>[id,rect(id)])),
      reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedMotionStyle:!!document.getElementById('gvaultDefectBlobReducedMotion'),
      targetedRunningAnimations:running,
      status:window.GVAULT_DEFECT_BLOBS.status(),
      autoFixedEvents:window.GVAULT_DEFECT_BLOBS.events().filter(x=>x.status==='AUTO_FIXED').map(x=>x.code),
      liveEventName:window.GVAULT_DEFECT_BLOBS.eventName
    };
  })()''')
  failures=[]
  if probe['passwordAria']!='Mot de passe GVAULT':failures.append('PASSWORD_NOT_FIXED')
  if probe['themeAria']!='Thème GVAULT':failures.append('THEME_NOT_FIXED')
  for id,r in probe['sizes'].items():
   if r and (r['w']<44 or r['h']<44):failures.append('TARGET_LT_44:'+id)
  if not probe['reducedMotionStyle']:failures.append('REDUCED_MOTION_STYLE_MISSING')
  if probe['targetedRunningAnimations']:failures.append('TARGETED_ANIMATION_STILL_RUNNING')
  required={'PASSWORD_ACCESSIBLE_NAME','THEME_ACCESSIBLE_NAME','REDUCED_MOTION'}
  if not required.issubset(set(probe['autoFixedEvents'])):failures.append('EXPECTED_AUTOFIX_EVENTS_MISSING')
  result={'schema':'GVAULT_DEFECT_BLOB_SELFHEAL_PROOF_V1','status':'PASS' if not failures else 'FAIL','failures':failures,'probe':probe}
  OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(result,ensure_ascii=False,indent=2))
  if failures:raise SystemExit(2)
 finally:
  if cdp:cdp.close()
  try:chrome.terminate();chrome.wait(timeout=5)
  except Exception:
   try:chrome.kill()
   except Exception:pass
  shutil.rmtree(user,ignore_errors=True)

if __name__=='__main__':main()
