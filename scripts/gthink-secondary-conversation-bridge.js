(()=>{'use strict';
const SCHEMA='GTHINK_SECONDARY_CONVERSATION_BRIDGE_V2_CORE_COGNITION';
const NAME='GThinkSecondaryConversationBridge';
const STOP=new Set(['a','ai','au','aux','avec','ce','ces','dans','de','des','du','elle','en','et','est','il','je','la','le','les','lui','ma','mais','me','mes','moi','mon','ne','nos','notre','nous','on','ou','par','pas','pour','que','qui','sa','se','ses','son','sur','ta','te','tes','toi','ton','tu','un','une','vos','votre','vous','y','ca','ça','c','d','l','m','n','s','t']);
function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function tokens(v){return [...new Set(norm(v).split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)))]}
function branches(context){return context?.knowledge?.branches&&typeof context.knowledge.branches==='object'?context.knowledge.branches:{}}
function branchNames(context){return Object.keys(branches(context))}
function core(context){return branches(context)['core-cognition']||{}}
function historyFor(request){return (Array.isArray(request?.payload?.history)?request.payload.history:[]).slice(-20).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content)})).filter(x=>x.content)}
function lastAssistant(history){return [...history].reverse().find(x=>x.role==='assistant'&&x.content)?.content||''}
function pick(list,fallback){return Array.isArray(list)&&list.length?clean(list[0])||fallback:fallback}
function flatten(value,path='',out=[]){if(out.length>360)return out;if(typeof value==='string'){const s=clean(value);if(s.length>8)out.push({path,text:s});return out}if(Array.isArray(value)){value.forEach((v,i)=>flatten(v,`${path}[${i}]`,out));return out}if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))flatten(v,path?`${path}.${k}`:k,out)}return out}
function knowledgeHits(message,context){const q=tokens(message);if(!q.length)return[];const hits=[];for(const [branch,data] of Object.entries(branches(context))){for(const item of flatten(data)){const hay=norm(item.text);let score=0;for(const token of q)if(hay.includes(token))score+=token.length>6?2:1;if(score>=2)hits.push({branch,path:item.path,text:item.text,score})}}return hits.sort((a,b)=>b.score-a.score||a.text.length-b.text.length).slice(0,5)}
function info(context){const names=branchNames(context);return {names,count:names.length,errors:context?.knowledge?.errors||[],manifest:context?.knowledge?.manifest||null,coreLoaded:!!branches(context)['core-cognition']}}
function socialReply(message,request,context){const n=norm(message),c=core(context),basic=c?.conversation?.basicReplies||{},history=historyFor(request);
 if(/^(salut|bonjour|bonsoir|yo|hey|coucou|hello|wesh|re|allo)\b/.test(n))return {handled:true,text:pick(basic.greeting,'Salut.'),intent:'social_greeting',knowledgeBranch:'core-cognition'};
 if(/\b(?:tu vas bien|comment tu vas|tout va bien|ca va|ça va)\b/.test(n)&&!/(pourquoi|comment ca marche|comment ça marche)/.test(n))return {handled:true,text:pick(basic.wellbeing,'Oui, ça va. Et toi ?'),intent:'social_wellbeing',knowledgeBranch:'core-cognition'};
 if(/^(merci|merci beaucoup|thx|thanks)\b/.test(n))return {handled:true,text:pick(basic.thanks,'De rien.'),intent:'thanks',knowledgeBranch:'core-cognition'};
 if(/^(pret|prêt|tu es pret|tu es prêt|ready)\??$/.test(n))return {handled:true,text:pick(basic.ready,'Oui, prêt.'),intent:'ready',knowledgeBranch:'core-cognition'};
 if(/^(ok|okay|d accord|daccord|yes|oui|nickel|parfait|compris)[ !?.]*$/.test(n))return {handled:true,text:'Compris.',intent:'acknowledgement',knowledgeBranch:'core-cognition'};
 if(/^(du coup|et maintenant|donc|alors|et ca|et ça)[ ?!.]*$/.test(n)){const prev=lastAssistant(history);return {handled:true,text:prev?`Donc : ${prev}`:'Je suis le contexte du fil. Dis-moi simplement ce que tu veux poursuivre.',intent:'short_followup',knowledgeBranch:'core-cognition'}}
 return null
}
function answer(request,context=request?.payload?.secondKernelContext){const message=clean(request?.payload?.message||request?.text),n=norm(message),k=info(context);if(!message)return {handled:false};
 const social=socialReply(message,request,context);if(social)return social;
 if(/\b(?:tu )?(?:m ?entend|mentend|mecout|m ecoute|me recoi|me recois|me lis|tu recoi|tu recois)\w*\b/.test(n)||/\b(?:entend|ecoute|recoi|lis)\w* tu\b/.test(n))return {handled:true,text:`Oui. Je te reçois sur le flux blob partagé. GThink public est actif${k.count?` avec ${k.count} branches de connaissances chargées`:''}.`,intent:'hearing_check'};
 if(/\b(?:tu )?(?:me )?comprend\w*\b/.test(n)||/\btu saisis\b/.test(n))return {handled:true,text:'Oui. Je conserve ton message exact, j’utilise le contexte du fil avant la normalisation, puis le Method Router choisit la route proportionnelle avant la réponse.',intent:'understanding_check'};
 if(/\b(?:qui es tu|tes qui|tu es qui|qui est gthink|qui est le noyau secondaire)\b/.test(n))return {handled:true,text:'Je suis GThink dans le mini-environnement GVAULT public. Je fonctionne sur le stream blob public avec le Method Router, la mémoire de conversation et les connaissances publiques chargées.',intent:'identity'};
 if(/\b(?:statut|status|etat)\b/.test(n)&&/\b(?:gthink|noyau|secondaire|flux|blob|method router)\b/.test(n))return {handled:true,text:`GThink public actif. Flux blob partagé actif. Core cognition : ${k.coreLoaded?'chargé':'absent'}. Branches chargées : ${k.names.join(', ')||'aucune'}.${k.errors.length?` Erreurs de chargement : ${k.errors.length}.`:''}`,intent:'status'};
 if(/\b(?:connaissance|connaissances|branches|sais quoi|acces a quoi|as quoi)\b/.test(n))return {handled:true,text:`J’ai accès aux connaissances publiques chargées pour ce tour : ${k.names.join(', ')||'aucune'}. Le blob core-cognition contient mes règles conversationnelles, sémantiques, GThink/GVAULT, routage, mémoire et vérification. Le privé reste hors de cette page.`,intent:'knowledge_inventory'};
 if(/\b(?:relie|relier|raccorde|raccordes|connecte|connectes|flux)\b/.test(n)&&/\b(?:principal|toi|autre noyau|deux noyaux|method router)\b/.test(n))return {handled:true,text:'Oui. Le flux canonique relie public-kernel, gateway.request, Method Router GThink, moteur public et gateway.response. Sur cette page, aucune route privée n’est autorisée.',intent:'kernel_link'};
 const hits=knowledgeHits(message,context);if(hits.length){const unique=[];for(const h of hits)if(!unique.some(x=>x.text===h.text))unique.push(h);const body=unique.slice(0,3).map(h=>`[${h.branch}] ${h.text}`).join('\n');return {handled:true,text:`D’après mes connaissances publiques chargées :\n${body}`,intent:'knowledge_match',evidence:unique.slice(0,3).map(h=>({branch:h.branch,path:h.path}))}}
 return {handled:false}
}
function status(){return {schema:SCHEMA,name:NAME,ready:true,typoTolerant:true,usesSecondKernelContext:true,knowledgeSearch:true,coreCognitionAware:true,socialIntentAware:true}}
window.GTHINK_SECONDARY_CONVERSATION_BRIDGE=Object.freeze({schema:SCHEMA,name:NAME,answer,status,knowledgeHits,core});
})();