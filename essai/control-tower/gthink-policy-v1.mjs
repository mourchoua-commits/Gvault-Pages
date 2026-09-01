export const GTHINK_DESTINIES=Object.freeze({
  FIXED_STRUCTURE:'FIXED_STRUCTURE',
  SELF_MAINTAIN:'SELF_MAINTAIN',
  ADAPTIVE_BLOB:'ADAPTIVE_BLOB',
  GTHINK_PENDING:'GTHINK_PENDING'
});

const PROTECTED_ROLES=new Set(['wall','structure','sas','gthink','auth','security','route','root']);
const SELF_ACTIONS=new Set(['observe','refresh','sync','self-check']);
const ADAPTIVE_ACTIONS=new Set(['decorate','annotate','prioritize','reorder-content','adapt-presentation','focus']);

export function decideDestination(proposal={}){
  const action=String(proposal.action||'').trim().toLowerCase();
  const targetRole=String(proposal.targetRole||'blob-zone').trim().toLowerCase();
  const confidence=Number.isFinite(Number(proposal.confidence))?Number(proposal.confidence):1;
  if(proposal.touchesWall===true||proposal.touchesSas===true||PROTECTED_ROLES.has(targetRole)){
    return {decision:'DENY',destiny:GTHINK_DESTINIES.FIXED_STRUCTURE,reason:'protected-fixed-structure'};
  }
  if(proposal.requiresClarification===true||confidence<0.55){
    return {decision:'CLARIFY',destiny:GTHINK_DESTINIES.GTHINK_PENDING,reason:'insufficient-intent'};
  }
  if(SELF_ACTIONS.has(action)){
    return {decision:'ALLOW',destiny:GTHINK_DESTINIES.SELF_MAINTAIN,reason:'blob-self-maintenance'};
  }
  if(ADAPTIVE_ACTIONS.has(action)&&targetRole==='blob-zone'){
    return {decision:'ALLOW',destiny:GTHINK_DESTINIES.ADAPTIVE_BLOB,reason:'bounded-blob-autonomy'};
  }
  return {decision:'CLARIFY',destiny:GTHINK_DESTINIES.GTHINK_PENDING,reason:'unknown-destiny'};
}
