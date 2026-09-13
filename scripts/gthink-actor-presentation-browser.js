(()=>{
'use strict';
function safeColor(v){const c=String(v||'').trim();return /^#[0-9a-fA-F]{6}$/.test(c)?c:null;}
function receive(presentation,target){
  if(!target)return {rendered:false,count:0};
  const p=presentation&&typeof presentation==='object'?presentation:{};
  const segments=Array.isArray(p.segments)?p.segments.filter(x=>x&&x.verified===true):[];
  target.replaceChildren();
  for(let i=0;i<segments.length;i++){
    const x=segments[i];
    const seg=document.createElement('span');
    seg.className='gvaultActorSegment';
    seg.dataset.actorId=String(x.id||'unknown');
    const color=safeColor(x.color);if(color)seg.style.setProperty('--actor-color',color);
    const marker=document.createElement('span');marker.textContent=String(x.marker||'⚪');
    const label=document.createElement('span');label.textContent=String(x.label||'Acteur non vérifié');
    seg.append(marker,label);target.appendChild(seg);
    if(i<segments.length-1){const arrow=document.createElement('span');arrow.textContent='→';target.appendChild(arrow);}
  }
  target.dataset.gvaultVerifiedActorCount=String(segments.length);
  return {rendered:segments.length>0,count:segments.length};
}
window.GVAULT_ACTOR_PRESENTATION_BROWSER={receive};
})();
