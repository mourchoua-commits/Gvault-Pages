#!/usr/bin/env python3
import json, os, shutil, subprocess, tempfile, time, urllib.request
from pathlib import Path
import websocket

URL=os.environ.get('GVAULT_PUBLIC_URL','https://mourchoua-commits.github.io/Gvault-Pages/')
PORT=int(os.environ.get('CHROME_DEBUG_PORT','9222'))
OUT=Path(os.environ.get('GVAULT_TEST_OUT','artifacts/pre-sas-a11y'))
OUT.mkdir(parents=True,exist_ok=True)

DEVICES=[
 {'id':'small-320','w':320,'h':568,'dpr':2,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'},
 {'id':'android-360x607-dpr3','w':360,'h':607,'dpr':3,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'},
 {'id':'android-360x663-dpr3','w':360,'h':663,'dpr':3,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'},
 {'id':'iphone-se','w':375,'h':667,'dpr':2,'mobile':True,'ua':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'},
 {'id':'iphone-modern','w':390,'h':844,'dpr':3,'mobile':True,'ua':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'},
 {'id':'android-large','w':412,'h':915,'dpr':2.625,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'},
 {'id':'phone-landscape','w':663,'h':360,'dpr':3,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'},
 {'id':'tablet-portrait','w':768,'h':1024,'dpr':2,'mobile':True,'ua':'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/140 Safari/537.36'},
 {'id':'desktop-1366','w':1366,'h':768,'dpr':1,'mobile':False,'ua':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'},
 {'id':'desktop-1920','w':1920,'h':1080,'dpr':1,'mobile':False,'ua':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'},
]

ACCESS_PROFILES=[
 {'id':'default'},
 {'id':'reduced-motion','media':[{'name':'prefers-reduced-motion','value':'reduce'}]},
 {'id':'high-contrast-forced','media':[{'name':'forced-colors','value':'active'},{'name':'prefers-contrast','value':'more'}]},
 {'id':'grayscale','vision':'achromatopsia'},
 {'id':'protanopia','vision':'protanopia'},
 {'id':'deuteranopia','vision':'deuteranopia'},
 {'id':'tritanopia','vision':'tritanopia'},
 {'id':'blurred-vision','vision':'blurredVision'},
 {'id':'reduced-contrast','vision':'reducedContrast'},
 {'id':'zoom-200','zoom':2},
]

class CDP:
 def __init__(self,ws_url):
  self.ws=websocket.create_connection(ws_url,timeout=20,origin='http://127.0.0.1')
  self.n=0
 def call(self,method,params=None,timeout=30):
  self.n+=1; i=self.n
  self.ws.send(json.dumps({'id':i,'method':method,'params':params or {}}))
  end=time.time()+timeout
  while time.time()<end:
   msg=json.loads(self.ws.recv())
   if msg.get('id')==i:
    if 'error' in msg: raise RuntimeError(f"{method}: {msg['error']}")
    return msg.get('result',{})
  raise TimeoutError(method)
 def eval(self,expr,await_promise=False):
  r=self.call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
  return r.get('result',{}).get('value')
 def close(self):
  try:self.ws.close()
  except:pass

def http_json(path,method='GET'):
 req=urllib.request.Request(f'http://127.0.0.1:{PORT}{path}',method=method)
 with urllib.request.urlopen(req,timeout=8) as r:return json.load(r)

def chrome_bin():
 for x in ['google-chrome','google-chrome-stable','chromium','chromium-browser']:
  p=shutil.which(x)
  if p:return p
 raise RuntimeError('CHROME_NOT_FOUND')

def launch_chrome():
 user=tempfile.mkdtemp(prefix='gvault-chrome-')
 cmd=[chrome_bin(),f'--remote-debugging-port={PORT}','--remote-allow-origins=*','--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',f'--user-data-dir={user}','about:blank']
 p=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 end=time.time()+20
 while time.time()<end:
  try:
   http_json('/json/version');return p,user
  except Exception:time.sleep(.25)
 p.kill();raise RuntimeError('CHROME_DEBUG_NOT_READY')

def new_tab():
 t=http_json('/json/new?about:blank','PUT')
 return CDP(t['webSocketDebuggerUrl']),t['id']

def wait_js(cdp,expr,timeout=45,step=.25):
 end=time.time()+timeout
 last=None
 while time.time()<end:
  try:
   last=cdp.eval(expr)
   if last:return last
  except Exception as e:last=str(e)
  time.sleep(step)
 raise TimeoutError(f'WAIT_JS {expr[:80]} last={last}')

def key(cdp,k):
 code='Space' if k==' ' else k
 vk=32 if k==' ' else 13 if k=='Enter' else 9 if k=='Tab' else 0
 for typ in ['keyDown','keyUp']:
  cdp.call('Input.dispatchKeyEvent',{'type':typ,'key':k,'code':code,'windowsVirtualKeyCode':vk,'nativeVirtualKeyCode':vk})

def base_probe_js():
 return r'''(()=>{
 const vis=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity!==0&&r.width>0&&r.height>0};
 const q=[...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')].filter(vis);
 const controls=q.map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id||'',role:e.getAttribute('role')||'',text:(e.innerText||e.value||'').trim().slice(0,80),aria:e.getAttribute('aria-label')||'',title:e.title||'',w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),tabIndex:e.tabIndex,labels:('labels'in e&&e.labels)?[...e.labels].map(x=>x.innerText.trim()).filter(Boolean):[]}});
 const body=document.body,html=document.documentElement;
 const lock=document.querySelector('#lockScreenTrigger'),safe=document.querySelector('.safe'),pw=document.querySelector('#vaultPassword'),theme=document.querySelector('#entryTheme');
 const animations=document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName||'',duration:Number(a.effect?.getTiming?.().duration||0),iterations:a.effect?.getTiming?.().iterations}));
 return {title:document.title,ready:!!lock,viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},overflow:{bodyX:body.scrollWidth>body.clientWidth+1,htmlX:html.scrollWidth>html.clientWidth+1,body:{sw:body.scrollWidth,cw:body.clientWidth,sh:body.scrollHeight,ch:body.clientHeight}},lock:lock?{tabIndex:lock.tabIndex,role:lock.getAttribute('role'),aria:lock.getAttribute('aria-label'),rect:(()=>{const r=lock.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()}:null,safeVisible:!!safe&&vis(safe),controls,undersized:controls.filter(x=>x.w<44||x.h<44),unlabelledFields:controls.filter(x=>['INPUT','SELECT','TEXTAREA'].includes(x.tag)&&!x.aria&&!x.title&&!x.labels.length),pwLabels:pw?.labels?[...pw.labels].map(x=>x.innerText.trim()):[],themeLabels:theme?.labels?[...theme.labels].map(x=>x.innerText.trim()):[],reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,forcedColors:matchMedia('(forced-colors: active)').matches,animations,audioVideo:[...document.querySelectorAll('audio,video')].map(e=>({tag:e.tagName,autoplay:e.autoplay,controls:e.controls})),activeId:document.activeElement?.id||document.activeElement?.tagName||''};
})()'''

def ax_name(cdp,selector):
 r=cdp.call('Runtime.evaluate',{'expression':f'document.querySelector({json.dumps(selector)})','objectGroup':'gvaultAx'})
 obj=r.get('result',{}).get('objectId')
 if not obj:return None
 tree=cdp.call('Accessibility.getPartialAXTree',{'objectId':obj,'fetchRelatives':False})
 nodes=tree.get('nodes',[])
 if not nodes:return None
 n=nodes[0]
 return {'role':n.get('role',{}).get('value'),'name':n.get('name',{}).get('value'),'ignored':n.get('ignored',False)}

def run_case(cdp,case):
 dev=case['device']; profile=case['profile']
 cdp.call('Page.enable');cdp.call('Runtime.enable');cdp.call('Accessibility.enable');cdp.call('Network.enable')
 cdp.call('Emulation.setDeviceMetricsOverride',{'width':dev['w'],'height':dev['h'],'deviceScaleFactor':dev['dpr'],'mobile':dev['mobile'],'screenWidth':dev['w'],'screenHeight':dev['h']})
 cdp.call('Network.setUserAgentOverride',{'userAgent':dev['ua']})
 cdp.call('Emulation.setEmulatedMedia',{'media':'screen','features':profile.get('media',[])})
 try:cdp.call('Emulation.setEmulatedVisionDeficiency',{'type':profile.get('vision','none')})
 except Exception:pass
 if profile.get('zoom'): cdp.call('Emulation.setPageScaleFactor',{'pageScaleFactor':profile['zoom']})
 cdp.call('Page.navigate',{'url':URL})
 wait_js(cdp,"!!document.querySelector('#lockScreenTrigger')",60)
 pre=cdp.eval(base_probe_js())
 ax_lock=ax_name(cdp,'#lockScreenTrigger')
 # keyboard-only: Enter must expose the SAS prompt without pointer input.
 cdp.eval("document.querySelector('#lockScreenTrigger').focus(); true")
 key(cdp,'Enter')
 wait_js(cdp,"document.body.classList.contains('unlockPrompt') || !!document.querySelector('#vaultPassword') && getComputedStyle(document.querySelector('.safe')).pointerEvents!=='none'",8)
 time.sleep(.15)
 post=cdp.eval(base_probe_js())
 ax_pw=ax_name(cdp,'#vaultPassword')
 ax_theme=ax_name(cdp,'#entryTheme')
 # Focus stability: no automatic stealing for a short observation window.
 cdp.eval("document.querySelector('#vaultPassword')?.focus(); true")
 f0=cdp.eval("document.activeElement?.id||''")
 time.sleep(1.2)
 f1=cdp.eval("document.activeElement?.id||''")
 issues=[]
 if pre['overflow']['bodyX'] or pre['overflow']['htmlX']:issues.append({'severity':'FAIL','code':'PRE_SAS_HORIZONTAL_OVERFLOW'})
 if post['overflow']['bodyX'] or post['overflow']['htmlX']:issues.append({'severity':'FAIL','code':'SAS_PROMPT_HORIZONTAL_OVERFLOW'})
 if not pre.get('lock') or pre['lock'].get('tabIndex',-1)<0:issues.append({'severity':'FAIL','code':'LOCK_NOT_KEYBOARD_FOCUSABLE'})
 if not (ax_lock and ax_lock.get('name')):issues.append({'severity':'FAIL','code':'LOCK_NO_ACCESSIBLE_NAME'})
 if not (ax_pw and ax_pw.get('name')):issues.append({'severity':'FAIL','code':'PASSWORD_NO_ACCESSIBLE_NAME'})
 if not (ax_theme and ax_theme.get('name')):issues.append({'severity':'FAIL','code':'THEME_NO_ACCESSIBLE_NAME'})
 # Only count visible pre-SAS/SAS prompt targets. 44px is WCAG-aligned touch policy used by GVAULT reviews.
 for x in post.get('undersized',[]):
  if x.get('id') in {'vaultPassword','entryTheme'}:continue
  issues.append({'severity':'WARN','code':'TOUCH_TARGET_LT_44','id':x.get('id'),'size':f"{x.get('w')}x{x.get('h')}"})
 if profile['id']=='reduced-motion' and post.get('animations'):
  issues.append({'severity':'FAIL','code':'REDUCED_MOTION_STILL_ANIMATING','count':len(post['animations'])})
 if f0!=f1:issues.append({'severity':'WARN','code':'FOCUS_STOLEN_AUTOMATICALLY','before':f0,'after':f1})
 if any(x.get('autoplay') for x in post.get('audioVideo',[])):issues.append({'severity':'WARN','code':'AUTOPLAY_MEDIA'})
 return {'id':case['id'],'device':dev,'profile':profile,'pre':pre,'post':post,'ax':{'lock':ax_lock,'password':ax_pw,'theme':ax_theme},'focus':{'before':f0,'after':f1},'issues':issues,'status':'FAIL' if any(x['severity']=='FAIL' for x in issues) else 'WARN' if issues else 'PASS'}

def main():
 chrome,user=launch_chrome(); results=[]
 try:
  # Geometry matrix across representative phone/tablet/desktop classes.
  cases=[{'id':f"{d['id']}__default",'device':d,'profile':ACCESS_PROFILES[0]} for d in DEVICES]
  target=next(x for x in DEVICES if x['id']=='android-360x663-dpr3')
  cases += [{'id':f"target__{p['id']}",'device':target,'profile':p} for p in ACCESS_PROFILES[1:]]
  # Combined stress cases without exploding the matrix.
  cases += [
   {'id':'small-320__zoom-200','device':DEVICES[0],'profile':next(p for p in ACCESS_PROFILES if p['id']=='zoom-200')},
   {'id':'phone-landscape__reduced-motion','device':next(d for d in DEVICES if d['id']=='phone-landscape'),'profile':next(p for p in ACCESS_PROFILES if p['id']=='reduced-motion')},
   {'id':'iphone-modern__forced-colors','device':next(d for d in DEVICES if d['id']=='iphone-modern'),'profile':next(p for p in ACCESS_PROFILES if p['id']=='high-contrast-forced')},
  ]
  for idx,case in enumerate(cases,1):
   cdp,tid=new_tab()
   try:
    print(f"[{idx}/{len(cases)}] {case['id']}",flush=True)
    results.append(run_case(cdp,case))
   except Exception as e:
    results.append({'id':case['id'],'device':case['device'],'profile':case['profile'],'status':'FAIL','issues':[{'severity':'FAIL','code':'HARNESS_OR_LOAD_FAIL','detail':str(e)}]})
   finally:
    cdp.close()
    try:http_json('/json/close/'+tid,'PUT')
    except:pass
  counts={k:sum(1 for r in results if r['status']==k) for k in ['PASS','WARN','FAIL']}
  codes={}
  for r in results:
   for i in r.get('issues',[]):codes[i['code']]=codes.get(i['code'],0)+1
  summary={'schema':'GVAULT_PUBLIC_PRE_SAS_ACCESSIBILITY_MATRIX_V1','url':URL,'cases':len(results),'counts':counts,'issueCounts':dict(sorted(codes.items())),'results':results}
  (OUT/'results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  md=['# GVAULT public pre-SAS accessibility matrix','',f"Cases: {len(results)} · PASS {counts['PASS']} · WARN {counts['WARN']} · FAIL {counts['FAIL']}",'','## Issue counts','']
  md += [f'- {k}: {v}' for k,v in summary['issueCounts'].items()] or ['- none']
  md += ['','## Cases','']
  md += [f"- {r['status']} · {r['id']} · "+(', '.join(i['code'] for i in r.get('issues',[])) or 'no issue') for r in results]
  (OUT/'summary.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
  print(json.dumps({'counts':counts,'issueCounts':summary['issueCounts']},ensure_ascii=False,indent=2))
  # Diagnostic campaign: keep workflow successful when defects are found; FAIL means product finding, not harness crash.
  harness_fail=all(any(i.get('code')=='HARNESS_OR_LOAD_FAIL' for i in r.get('issues',[])) for r in results)
  if harness_fail:raise SystemExit(2)
 finally:
  try:chrome.terminate();chrome.wait(timeout=4)
  except Exception:
   try:chrome.kill()
   except:pass
  shutil.rmtree(user,ignore_errors=True)

if __name__=='__main__':main()
