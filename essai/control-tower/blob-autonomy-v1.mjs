const INTERVAL_MS=7000;
const zones=new Map();
let timer=null,stopped=false;
const now=()=>new Date().toISOString();

function register(id,selector,measure){zones.set(id,{id,selector,measure,last:null,lastDecision:null,updatedAt:null,status:'idle'})}
register('engines','#engineList',el=>({items:el.children.length,density:el.children.length>12?'compact':'comfortable'}));
register('events','#eventList',el=>({items:el.querySelectorAll('.event').length,density:el.querySelectorAll('.event').length>80?'compact':'comfortable'}));
register('detail','#detail',el=>({items:el.children.length,density:'comfortable'}));
register('tracks','#trackList',el=>({items:el.querySelectorAll('.track').length,density:el.querySelectorAll('.track').length>8?'compact':'comfortable'}));
register('terminal','#terminalLog',el=>({items:el.children.length,density:el.children.length>100?'compact':'comfortable'}));

function gthink(){return window.GVAULT_GTHINK_SAS_V1}
async function evolve(zone,reason='tick'){
  if(stopped)return;
  const el=document.querySelector(zone.selector);
  if(!el||el.dataset.gvaultBlobZone!=='1'){zone.status='missing-zone';return}
  const next=zone.measure(el);
  const changed=JSON.stringify(next)!==JSON.stringify(zone.last);
  zone.last=next;zone.updatedAt=now();
  if(!changed&&reason==='tick'){zone.status='live';return}
  const arbiter=gthink();
  if(!arbiter){zone.status='waiting-gthink';return}
  const result=await arbiter.request({
    blobId:zone.id,
    action:'adapt-presentation',
    targetRole:'blob-zone',
    touchesWall:false,
    touchesSas:false,
    confidence:1,
    reason,
    desiredState:next
  },()=>{
    el.dataset.blobDensity=next.density;
    el.dataset.blobAutonomy='live';
    el.dataset.blobId=zone.id;
    return next;
  });
  zone.lastDecision=result.verdict;
  zone.status=result.executed?'live':result.verdict?.reason||'blocked';
}

async function refreshAll(reason='tick'){for(const zone of zones.values())await evolve(zone,reason)}
function schedule(){clearTimeout(timer);if(!stopped)timer=setTimeout(async()=>{await refreshAll('tick');schedule()},INTERVAL_MS)}
function wake(){if(!stopped&&document.visibilityState==='visible')void refreshAll('wake')}

const mutation=new MutationObserver(records=>{
  const touched=new Set();
  for(const r of records){const host=r.target?.closest?.('[data-gvault-blob-zone="1"]');if(host?.dataset?.blobId)touched.add(host.dataset.blobId)}
  for(const id of touched){const zone=zones.get(id);if(zone)void evolve(zone,'content-change')}
});

function armInteractions(){
  document.addEventListener('pointerdown',ev=>{
    const zoneEl=ev.target?.closest?.('[data-gvault-blob-zone="1"]');
    if(!zoneEl)return;
    const zone=zones.get(zoneEl.dataset.blobId);
    if(!zone)return;
    gthink()?.request({blobId:zone.id,action:'focus',targetRole:'blob-zone',touchesWall:false,touchesSas:false,confidence:1,reason:'user-interaction'},()=>{
      for(const el of document.querySelectorAll('[data-gvault-blob-zone="1"]'))el.removeAttribute('data-blob-focus');
      zoneEl.dataset.blobFocus='1';
    });
  },{passive:true});
}

function arm(){
  for(const zone of zones.values()){
    const el=document.querySelector(zone.selector);
    if(el){el.dataset.gvaultBlobZone='1';el.dataset.blobId=zone.id;mutation.observe(el,{subtree:true,childList:true,characterData:true})}
  }
  armInteractions();
  void refreshAll('boot');schedule();
}
function stop(){stopped=true;clearTimeout(timer);mutation.disconnect();document.removeEventListener('visibilitychange',wake)}

document.addEventListener('visibilitychange',wake);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm,{once:true});else arm();
window.addEventListener('pagehide',stop,{once:true});
window.GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1',refresh:()=>refreshAll('manual'),stop,getState:()=>({intervalMs:INTERVAL_MS,stopped,zones:[...zones.values()].map(z=>({id:z.id,status:z.status,updatedAt:z.updatedAt,last:z.last,lastDecision:z.lastDecision}))})});
