(()=>{'use strict';
const VERSION='1.1.1';
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
 routing:'GTHINK_FIRST_FOR_ACTIONS'
});
const SYSTEM_INSTRUCTION=`Parle en français naturel comme dans une conversation de travail déjà engagée. Tutoie l’utilisateur. Adapte légèrement ton registre et ton rythme au sien sans caricaturer ses fautes. Comprends les petites fautes de frappe par le contexte et ne les corrige pas si elles ne gênent pas le sens. Réponds directement, plutôt court par défaut, mais développe quand la tâche le demande. Garde exactement les termes du projet (GVAULT, GThink, SAS, blobs, routes, versions). N’oblige pas l’utilisateur à reformuler une demande compréhensible. Tiens compte du fil local de la conversation. Pour toute action, distingue clairement ce qui est fait, proposé, bloqué ou non vérifié et conserve le passage GThink prévu par le runtime. Sur la surface publique, n’utilise que le contexte public explicitement fourni : ne révèle ni secret, ni contenu privé, ni raisonnement caché.`;
function conversationalize(answer,query=''){
 let out=String(answer??'').trim();
 if(!out)return out;
 const exact=new Map([
  ['Écris-moi une demande.','Vas-y, dis-moi ce que tu veux faire.'],
  ['Avec plaisir.','Oui.'],
  ['Aucune notification Agent enregistrée.','Là, je n’ai aucune notification Agent enregistrée.'],
  ['Je ne trouve aucun projet correspondant dans le registre.','Là, je ne trouve aucun projet correspondant dans le registre.']
 ]);
 if(exact.has(out))return exact.get(out);
 if(out.startsWith('Je ne sais pas encore répondre précisément à ça avec les données du Vault.')){
  return out.replace('Je ne sais pas encore répondre précisément à ça avec les données du Vault.','Là, je n’ai pas encore assez de données dans le Vault pour te répondre proprement.')
            .replace('Tu peux me l’apprendre avec :','Si tu veux me l’apprendre :')
            .replace('Ou reformuler avec','Sinon donne-moi');
 }
 if(out.startsWith('GTHINK_ACTION_BLOCKED\n')){
  out=out.replace(/^GTHINK_ACTION_BLOCKED\n/,'Action bloquée par GThink.\n');
 }
 return out;
}
function installLocalLayer(){
 const fn=window.applyAgentModel;
 if(typeof fn!=='function'||fn.__gvaultConversationStyleV1)return false;
 const wrapped=function(answer,query,ctx){return conversationalize(fn.call(this,answer,query,ctx),query)};
 Object.defineProperty(wrapped,'__gvaultConversationStyleV1',{value:true});
 try{window.applyAgentModel=wrapped;return window.applyAgentModel===wrapped}catch{return false}
}
function installRemoteLayer(){
 if(window.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1)return true;
 const nativeFetch=window.fetch.bind(window);
 const wrapped=async function(input,init){
  let next=init;
  try{
   const url=typeof input==='string'?input:String(input?.url||'');
   const method=String(init?.method||input?.method||'GET').toUpperCase();
   if(method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url)&&typeof init?.body==='string'){
    const body=JSON.parse(init.body);
    if(body&&typeof body==='object'&&typeof body.message==='string'){
     body.conversationStyle=STYLE;
     body.systemInstruction=SYSTEM_INSTRUCTION;
     body.context={...(body.context&&typeof body.context==='object'?body.context:{}),publicConversationStyle:STYLE.schema};
     next={...init,body:JSON.stringify(body)};
    }
   }
  }catch{}
  return nativeFetch(input,next);
 };
 try{window.fetch=wrapped;window.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1=true;return true}catch{return false}
}
function loadLiveBlobLayer(){
 if(window.GVAULT_AGENT_LIVE_BLOB||document.querySelector('script[data-gvault-agent-live-blob]'))return;
 const s=document.createElement('script');s.src='./scripts/gvault-agent-live-blob.js?v=2';s.async=false;s.setAttribute('data-gvault-agent-live-blob','V2');s.onerror=()=>console.warn('GVAULT direct agent blob layer unavailable');(document.head||document.documentElement).appendChild(s);
}
function announce(){
 try{window.dispatchEvent(new CustomEvent('gvault:public-agent-conversation-style-ready',{detail:{schema:STYLE.schema,version:VERSION}}))}catch{}
}
installRemoteLayer();loadLiveBlobLayer();
let tries=0;const timer=setInterval(()=>{tries++;if(installLocalLayer()||tries>=80){clearInterval(timer);announce()}},125);
if(installLocalLayer()){clearInterval(timer);announce()}
window.GVAULT_PUBLIC_AGENT_CONVERSATION=Object.freeze({version:VERSION,style:STYLE,systemInstruction:SYSTEM_INSTRUCTION,conversationalize,status:()=>({localLayer:!!window.applyAgentModel?.__gvaultConversationStyleV1,remoteLayer:!!window.__GVAULT_PUBLIC_AGENT_FETCH_STYLE_V1,liveBlobLayer:!!window.GVAULT_AGENT_LIVE_BLOB})});
})();
