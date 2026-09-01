export const ACTION_BLOB_SCHEMA='GVAULT_FULL_SAVE_ACTION_BLOB_V1';

function defaultId(prefix='blob'){
  const id=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
function compact(value,max=240){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function summarize(value){
  if(value==null)return null;
  if(typeof value==='string')return compact(value,180);
  if(typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return {kind:'array',length:value.length};
  if(typeof value==='object'){
    const out={};
    for(const k of ['ok','status','error','model','correlationId','configured','silent','muted'])if(k in value)out[k]=value[k];
    return Object.keys(out).length?out:{kind:'object',keys:Object.keys(value).slice(0,12)};
  }
  return compact(value,180);
}

export function createFullSaveActionPipeline({ask,snapshot=async()=>({}),emit=()=>{},now=()=>new Date().toISOString(),id=defaultId}={}){
  if(typeof ask!=='function')throw new TypeError('ask_function_required');
  const history=[];
  function blob(type,payload={},parentBlobId=null){
    const value=Object.freeze({schema:ACTION_BLOB_SCHEMA,blobId:id('fsb'),parentBlobId,type,at:now(),surface:'Gvault-Pages',silent:true,muted:false,payload});
    history.push(value);emit(value);return value;
  }
  async function action(name,parentBlobId,fn,input=null){
    const started=blob('action.start',{action:name,input:summarize(input)},parentBlobId);
    try{
      const result=await fn();
      blob('action.pass',{action:name,result:summarize(result)},started.blobId);
      return result;
    }catch(error){
      blob('action.error',{action:name,error:compact(error?.message||error,240)},started.blobId);
      throw error;
    }
  }
  async function turn(rawMessage){
    const root=blob('fullsave.turn.begin',{methodology:'FULL_SAVE_ASSEMBLE_THEN_TEST'});
    try{
      const before=await action('snapshot.before',root.blobId,()=>snapshot());
      const message=await action('input.capture',root.blobId,()=>{
        const m=String(rawMessage??'').trim();if(!m)throw new Error('empty_message');return m;
      },rawMessage);
      const result=await action('agent.direct.ask',root.blobId,()=>ask(message),{messageBytes:new TextEncoder().encode(message).byteLength});
      await action('agent.response.require_ok',root.blobId,()=>{
        if(!result?.ok)throw new Error(result?.error||'agent_response_not_ok');return true;
      },result);
      await action('banana.verify',root.blobId,()=>{
        const literal=result?.blob?.otherSide?.display;
        if(literal!=='banane')throw new Error(`banana_mismatch:${compact(literal,40)}`);
        return {literal:'banane'};
      },result?.blob);
      const after=await action('snapshot.after',root.blobId,()=>snapshot());
      const done=blob('fullsave.turn.pass',{response:summarize(result),before:summarize(before),after:summarize(after)},root.blobId);
      return {ok:true,result,rootBlobId:root.blobId,completionBlobId:done.blobId,blobs:history.filter(x=>x.blobId===root.blobId||x.parentBlobId===root.blobId||history.some(y=>y.parentBlobId===x.blobId&&y.blobId===x.blobId))};
    }catch(error){
      blob('fullsave.turn.error',{error:compact(error?.message||error,240)},root.blobId);
      return {ok:false,error:compact(error?.message||error,240),rootBlobId:root.blobId};
    }
  }
  return Object.freeze({turn,hear:()=>history.slice(),last:n=>history.slice(-Math.max(1,Number(n)||12)),schema:ACTION_BLOB_SCHEMA,silent:true,muted:false});
}
