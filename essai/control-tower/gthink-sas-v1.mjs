import {decideDestination} from './gthink-policy-v1.mjs';

const history=[];
let sasOpen=false;
let sasInitialized=false;
let observer=null;
const now=()=>new Date().toISOString();
const WALL_SELECTORS=['html','body','.top','.layout','.pane','.tracksWrap','.terminal','dialog'];

function emit(type,detail={}){
  const payload={schema:'GVAULT_GTHINK_EVENT_V1',type,at:now(),...detail};
  window.dispatchEvent(new CustomEvent('gvault:gthink',{detail:payload}));
  window.dispatchEvent(new CustomEvent(`gvault:gthink-${type}`,{detail:payload}));
  return payload;
}

function markFixedStructure(){
  for(const selector of WALL_SELECTORS){for(const el of document.querySelectorAll(selector))el.dataset.gvaultWall='fixed'}
}

function installBlobStyleContract(){
  if(document.querySelector('#gvaultGthinkBlobContractV1'))return;
  const style=document.createElement('style');
  style.id='gvaultGthinkBlobContractV1';
  style.textContent=`
[data-gvault-blob-zone="1"]{transition:opacity .16s ease,filter .16s ease,outline-color .16s ease}
[data-gvault-blob-zone="1"][data-blob-focus="1"]{outline:1px solid color-mix(in srgb,var(--accent,#c8a95a) 55%,transparent);outline-offset:-1px}
[data-gvault-blob-zone="1"][data-blob-density="compact"] .event{margin-bottom:3px}
[data-gvault-blob-zone="1"][data-blob-density="compact"] .eventMain{padding:6px}
[data-gvault-blob-zone="1"][data-blob-density="compact"] .summary{font-size:9px;line-height:1.2}
[data-gvault-blob-zone="1"][data-blob-density="compact"] .track{padding:7px}
[data-gvault-blob-zone="1"][data-blob-density="compact"] button{padding-top:5px;padding-bottom:5px}
[data-gvault-blob-zone="1"][data-blob-activity="high"]{filter:saturate(1.08)}
`;
  document.head.appendChild(style);
}

function syncSasState(reason='status'){
  const status=document.querySelector('#connectionState');
  const next=!!status&&/^LIVE\b/.test(String(status.textContent||'').trim());
  const changed=!sasInitialized||next!==sasOpen;
  sasInitialized=true;sasOpen=next;
  document.documentElement.dataset.gvaultGthink=sasOpen?'active':'locked';
  document.documentElement.dataset.gvaultSessionOk=sasOpen?'1':'0';
  if(changed)emit('sas-state',{open:sasOpen,reason});
}

function decide(proposal={}){
  const base=decideDestination(proposal);
  const requiresSas=proposal.requiresSas!==false;
  const result=requiresSas&&!sasOpen
    ? {decision:'DENY',destiny:'GTHINK_PENDING',reason:'sas-gthink-locked'}
    : base;
  const record={id:`GTD-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,at:now(),proposal:structuredClone(proposal),...result};
  history.push(record);
  if(history.length>300)history.splice(0,history.length-300);
  emit('decision',record);
  if(record.decision==='CLARIFY')emit('needs-clarification',record);
  return structuredClone(record);
}

async function request(proposal,executor){
  const verdict=decide(proposal);
  if(verdict.decision!=='ALLOW')return {executed:false,verdict};
  try{
    const value=typeof executor==='function'?await executor(verdict):undefined;
    emit('executed',{decisionId:verdict.id,blobId:proposal?.blobId||null,action:proposal?.action||null});
    return {executed:true,verdict,value};
  }catch(error){
    emit('execution-error',{decisionId:verdict.id,error:String(error?.message||error)});
    return {executed:false,verdict,error:String(error?.message||error)};
  }
}

function decorateSas(){
  const input=document.querySelector('#token');
  const open=document.querySelector('#connect');
  if(input){input.placeholder='SAS GTHINK · même secret GVAULT';input.title='GThink arbitre la destinée des informations et actions. Le secret reste en mémoire de cette page.'}
  if(open)open.textContent='OUVRIR SAS · GTHINK';
}

function arm(){
  markFixedStructure();installBlobStyleContract();
  const status=document.querySelector('#connectionState');
  if(status){observer?.disconnect();observer=new MutationObserver(()=>syncSasState('status-mutation'));observer.observe(status,{childList:true,subtree:true,characterData:true,attributes:true});}
  decorateSas();
  syncSasState('boot');
  setTimeout(()=>{markFixedStructure();installBlobStyleContract();decorateSas();syncSasState('post-boot')},0);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm,{once:true});else arm();
window.addEventListener('pagehide',()=>observer?.disconnect(),{once:true});

window.GVAULT_GTHINK_SAS_V1=Object.freeze({
  schema:'GVAULT_GTHINK_SAS_V1',
  decide,
  request,
  refreshSasState:()=>syncSasState('manual'),
  decorateSas,
  markFixedStructure,
  installBlobStyleContract,
  getState:()=>({sasOpen,mode:sasOpen?'ARBITER_ACTIVE':'LOCKED',fixedWalls:WALL_SELECTORS.slice(),history:history.slice(-50)})
});
