(()=>{'use strict';
const VERSION='0.1.0-test';
const EVENT='gvault:defect-live';
const MAX_EVENTS=200;
const listeners=new Set();
const events=[];
let scanQueued=false,observer=null;
const now=()=>new Date().toISOString();
function emit(code,status,detail={}){
 const item=Object.freeze({schema:'GVAULT_DEFECT_BLOB_EVENT_V1',version:VERSION,code,status,at:now(),...detail});
 events.push(item);if(events.length>MAX_EVENTS)events.splice(0,events.length-MAX_EVENTS);
 try{window.dispatchEvent(new CustomEvent(EVENT,{detail:item}))}catch{}
 for(const fn of [...listeners])try{fn(item)}catch{}
 return item;
}
function associatedLabel(el){if(!el)return false;const id=el.id;if(id&&document.querySelector(`label[for="${CSS.escape(id)}"]`))return true;return !!el.closest('label');}
function hasAccessibleName(el){return !!(el?.getAttribute('aria-label')?.trim()||el?.getAttribute('aria-labelledby')?.trim()||associatedLabel(el));}
function fixAccessibleName(selector,label,code){
 const el=document.querySelector(selector);if(!el)return;
 if(hasAccessibleName(el)){emit(code,'PASS',{fixed:false,selector});return;}
 el.setAttribute('aria-label',label);
 emit(code,'AUTO_FIXED',{fixed:true,selector,fix:'ARIA_LABEL_ADDED',label});
}
function ensureTarget(id){
 const el=document.getElementById(id);if(!el)return;
 const r=el.getBoundingClientRect();if(r.width>=44&&r.height>=44){emit('TOUCH_TARGET_'+id.toUpperCase(),'PASS',{fixed:false,size:{width:Math.round(r.width),height:Math.round(r.height)}});return;}
 el.style.minWidth='44px';el.style.minHeight='44px';
 emit('TOUCH_TARGET_'+id.toUpperCase(),'AUTO_FIXED',{fixed:true,before:{width:Math.round(r.width),height:Math.round(r.height)},fix:'MIN_TARGET_44PX'});
}
function ensureReducedMotion(){
 const reduce=matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const id='gvaultDefectBlobReducedMotion';let style=document.getElementById(id);
 if(!reduce){if(style)style.remove();emit('REDUCED_MOTION','PASS',{fixed:false,preference:'no-preference'});return;}
 if(!style){style=document.createElement('style');style.id=id;style.textContent='@media (prefers-reduced-motion: reduce){.vaultGear,.phoneLockSymbol,.lockSwipe,.themeArtifact,.matrixSprite,.neonScanline,.constellationTag,.archiveSlip,.monoGhost{animation:none!important;transition:none!important}.phoneLockSymbol,.lockSwipe{transform:none!important}}';document.head.appendChild(style);}
 emit('REDUCED_MOTION','AUTO_FIXED',{fixed:true,fix:'DECORATIVE_ANIMATIONS_DISABLED'});
}
function reportUnknowns(){
 const vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
 const overflow=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)>vw+2;
 if(overflow)emit('HORIZONTAL_OVERFLOW','REPORT_ONLY',{fixed:false,viewport:{width:vw,height:vh},reason:'UNBOUNDED_LAYOUT_FIX_REQUIRES_REVIEW'});
 const interactive=[...document.querySelectorAll('button,input,select,textarea,a[href],[role="button"]')].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0});
 for(const el of interactive){
  if(!hasAccessibleName(el)&&!String(el.textContent||'').trim()&&!el.getAttribute('title')&&!el.getAttribute('placeholder'))emit('UNNAMED_INTERACTIVE','REPORT_ONLY',{fixed:false,selector:el.id?'#'+el.id:el.tagName.toLowerCase(),reason:'UNKNOWN_CONTROL_NOT_AUTO_MUTATED'});
 }
}
function scan(reason='SCAN'){
 scanQueued=false;
 fixAccessibleName('#vaultPassword','Mot de passe GVAULT','PASSWORD_ACCESSIBLE_NAME');
 fixAccessibleName('#entryTheme','Thème GVAULT','THEME_ACCESSIBLE_NAME');
 ['safeCollapse','themeCycle','togglePass','unlockBtn'].forEach(ensureTarget);
 ensureReducedMotion();
 reportUnknowns();
 emit('SCAN_COMPLETE','PASS',{fixed:false,reason});
 return status();
}
function queueScan(reason){if(scanQueued)return;scanQueued=true;setTimeout(()=>scan(reason),40);}
function status(){const latest=new Map();for(const e of events)latest.set(e.code,e);const values=[...latest.values()];return Object.freeze({schema:'GVAULT_DEFECT_BLOBS_STATUS_V1',version:VERSION,active:true,events:events.length,autoFixed:values.filter(x=>x.status==='AUTO_FIXED').length,reportOnly:values.filter(x=>x.status==='REPORT_ONLY').length,issues:values.filter(x=>['AUTO_FIXED','REPORT_ONLY'].includes(x.status)),latest:values});}
function start(){if(observer)return status();observer=new MutationObserver(()=>queueScan('DOM_MUTATION'));observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-label','aria-labelledby']});addEventListener('resize',()=>queueScan('RESIZE'),{passive:true});try{matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>queueScan('MOTION_PREF_CHANGE'))}catch{};queueScan('START');emit('DEFECT_BLOBS_RUNTIME','PASS',{fixed:false,mode:'BOUNDED_SELF_HEAL_PLUS_REPORT_ONLY'});return status();}
function stop(){observer?.disconnect();observer=null;emit('DEFECT_BLOBS_RUNTIME','STOPPED',{fixed:false});return status();}
const api=Object.freeze({version:VERSION,eventName:EVENT,start,stop,scan,status,events:()=>events.slice(),subscribe(fn){if(typeof fn!=='function')throw new TypeError('listener required');listeners.add(fn);return()=>listeners.delete(fn)}});
Object.defineProperty(window,'GVAULT_DEFECT_BLOBS',{value:api,writable:false,configurable:false,enumerable:false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start(),{once:true});else start();
})();
