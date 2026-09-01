export const LOCAL_GTHINK_BANANA_SCHEMA='GVAULT_LOCAL_GTHINK_BANANA_ADAPTER_V1';

function extractText(result){
  if(typeof result==='string')return result;
  for(const k of ['text','answer','message','output'])if(typeof result?.[k]==='string')return result[k];
  return '';
}
function makeId(prefix='blob'){
  return `${prefix}-${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
export function createLocalGThinkBananaAdapter({
  resolveRuntimeWindow,
  emit=()=>{},
  id=makeId,
  now=()=>new Date().toISOString()
}={}){
  if(typeof resolveRuntimeWindow!=='function')throw new TypeError('resolveRuntimeWindow_required');
  const history=[];
  function blob(type,payload={},parentBlobId=null){
    const b=Object.freeze({schema:'GVAULT_LOCAL_AGENT_ACTION_BLOB_V1',blobId:id('lab'),parentBlobId,type,at:now(),silent:true,muted:false,payload});
    history.push(b);emit(b);return b;
  }
  async function ask(message){
    const root=blob('banana.turn.begin',{surface:'public-pages',method:'GTHINK_LOCAL_ROUTING'});
    try{
      const text=String(message??'').trim();
      blob('input.capture',{bytes:new TextEncoder().encode(text).byteLength},root.blobId);
      if(!text)throw new Error('empty_message');

      const win=resolveRuntimeWindow();
      blob('runtime.resolve',{available:!!win},root.blobId);
      if(!win)throw new Error('runtime_unavailable');
      if(typeof win.sendAgentMessage!=='function')throw new Error('send_agent_message_unavailable');

      const routeContract={
        methodAuthority:'GVAULT_METHOD_ROUTER',
        integrationPoint:'sendAgentMessage -> agentGThinkRouteRequest -> agentAnswer -> recordAgentTrace',
        invocationScope:'EVERY_NEW_USER_MESSAGE'
      };
      blob('gthink.route.entry',{...routeContract},root.blobId);

      const result=await win.sendAgentMessage(text);
      const answer=extractText(result);
      if(!answer)throw new Error('agent_empty_output');
      blob('gthink.route.exit',{routeId:result?.routeId??null,correlationId:result?.correlationId??null,routeTrace:result?.routeTrace??null},root.blobId);

      const bananaBlob={
        schema:'BLOB_AGENT_DIRECT_BANANA_EVENT_V1',
        blobId:id('banana'),
        correlationId:result?.correlationId??result?.routeId??null,
        agentSide:{surface:'blob.direct.reply',display:answer,routeTrace:result?.routeTrace??null},
        otherSide:{surface:'blob.other.display',display:'banane'},
        actionsAuthorized:false,
        localAgent:true,
        provider:'GVAULT_AGENT_LOCAL_GTHINK'
      };
      blob('banana.verify',{literal:bananaBlob.otherSide.display,localAgent:true},root.blobId);
      const done=blob('banana.turn.pass',{textPresent:true,localAgent:true,remoteProvider:false},root.blobId);
      return {ok:true,text:answer,blob:bananaBlob,result,rootBlobId:root.blobId,completionBlobId:done.blobId};
    }catch(error){
      blob('banana.turn.error',{error:String(error?.message||error).slice(0,240)},root.blobId);
      return {ok:false,error:String(error?.message||error).slice(0,240),rootBlobId:root.blobId};
    }
  }
  return Object.freeze({schema:LOCAL_GTHINK_BANANA_SCHEMA,ask,hear:()=>history.slice(),silent:true,muted:false,usesRemoteProvider:false});
}

export function browserRuntimeResolver(doc=globalThis.document){
  try{
    const frame=doc?.querySelector?.('#gvaultRuntime');
    return frame?.contentWindow||null;
  }catch{return null}
}
