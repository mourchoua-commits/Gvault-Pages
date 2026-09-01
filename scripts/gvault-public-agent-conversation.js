(()=>{'use strict';
const VERSION='1.2.0';
const STYLE=Object.freeze({
 schema:'GVAULT_PUBLIC_AGENT_CONVERSATION_STYLE_V1',
 version:VERSION,
 language:'fr',
 register:'contextual-informal',
 address:'tu',
 mirrorCadence:true,
 conciseByDefault:true,
 preserveProjectTerms:true,
 inferMinorTyposFromContext:true,
 callOutAmbiguityOnlyWhenMaterial:true,
 stateActionTruth:true,
 publicContextOnly:true,
 privateReasoning:false,
 secrets:false,
 routing:'GTHINK_LOCAL_ONLY'
});
function conversationalize(answer,query=''){
 let out=String(answer??'').trim();if(!out)return out;
 const exact=new Map([
  ['Écris-moi une demande.','Vas-y, dis-moi ce que tu veux faire.'],
  ['Avec plaisir.','Oui.'],
  ['Aucune notification Agent enregistrée.','Là, je n’ai aucune notification Agent enregistrée.'],
  ['Je ne trouve aucun projet correspondant dans le registre.','Là, je ne trouve aucun projet correspondant dans le registre.']
 ]);
 if(exact.has(out))return exact.get(out);
 if(out.startsWith('Je ne sais pas encore répondre précisément à ça avec les données du Vault.'))return out.replace('Je ne sais pas encore répondre précisément à ça avec les données du Vault.','Là, je n’ai pas encore assez de données dans le Vault pour te répondre proprement.').replace('Tu peux me l’apprendre avec :','Si tu veux me l’apprendre :').replace('Ou reformuler avec','Sinon donne-moi');
 if(out.startsWith('GTHINK_ACTION_BLOCKED\n'))out=out.replace(/^GTHINK_ACTION_BLOCKED\n/,'Action bloquée par GThink.\n');
 return out;
}
function installLocalLayerOn(w){
 let fn;try{fn=w?.applyAgentModel}catch{return false}
 if(typeof fn!=='function'||fn.__gvaultConversationStyleV1)return !!fn?.__gvaultConversationStyleV1;
 const wrapped=function(answer,query,ctx){return conversationalize(fn.call(this,answer,query,ctx),query)};
 Object.defineProperty(wrapped,'__gvaultConversationStyleV1',{value:true});
 try{w.applyAgentModel=wrapped;return w.applyAgentModel===wrapped}catch{return false}
}
function installAllLocalLayers(){
 let ok=installLocalLayerOn(window);
 for(const f of document.querySelectorAll('iframe'))try{ok=installLocalLayerOn(f.contentWindow)||ok}catch{}
 return ok;
}
function loadLiveBlobLayer(){
 if(window.GVAULT_AGENT_LIVE_BLOB||document.querySelector('script[data-gvault-agent-live-blob]'))return;
 const s=document.createElement('script');s.src='./scripts/gvault-agent-live-blob.js?v=3-local-gthink';s.async=false;s.setAttribute('data-gvault-agent-live-blob','V3_LOCAL_GTHINK');s.onerror=()=>console.warn('GVAULT local GThink banana layer unavailable');(document.head||document.documentElement).appendChild(s);
}
function announce(){try{window.dispatchEvent(new CustomEvent('gvault:public-agent-conversation-style-ready',{detail:{schema:STYLE.schema,version:VERSION,routing:'GTHINK_LOCAL_ONLY'}}))}catch{}}
loadLiveBlobLayer();
let tries=0;const timer=setInterval(()=>{tries++;if(installAllLocalLayers()||tries>=160){if(tries>=160)clearInterval(timer);announce()}},125);
new MutationObserver(()=>installAllLocalLayers()).observe(document.documentElement,{childList:true,subtree:true});
window.GVAULT_PUBLIC_AGENT_CONVERSATION=Object.freeze({version:VERSION,style:STYLE,conversationalize,status:()=>({localLayer:installAllLocalLayers(),liveBlobLayer:!!window.GVAULT_AGENT_LIVE_BLOB,routing:'GTHINK_LOCAL_ONLY',remoteProvider:false})});
})();
