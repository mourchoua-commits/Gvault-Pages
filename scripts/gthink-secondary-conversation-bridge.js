(()=>{'use strict';
const SCHEMA='GTHINK_SECONDARY_CONVERSATION_BRIDGE_V1';
const NAME='GThinkSecondaryConversationBridge';
const STOP=new Set(['a','ai','au','aux','avec','ce','ces','dans','de','des','du','elle','en','et','est','il','je','la','le','les','lui','ma','mais','me','mes','moi','mon','ne','nos','notre','nous','on','ou','par','pas','pour','que','qui','sa','se','ses','son','sur','ta','te','tes','toi','ton','tu','un','une','vos','votre','vous','y','ca','ça','c','d','l','m','n','s','t']);
function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function tokens(v){return [...new Set(norm(v).split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)))]}
function branches(context){return context?.knowledge?.branches&&typeof context.knowledge.branches==='object'?context.knowledge.branches:{}}
function branchNames(context){return Object.keys(branches(context))}
function flatten(value,path='',out=[]){if(out.length>240)return out;if(typeof value==='string'){const s=clean(value);if(s.length>8)out.push({path,text:s});return out}if(Array.isArray(value)){value.forEach((v,i)=>flatten(v,`${path}[${i}]`,out));return out}if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))flatten(v,path?`${path}.${k}`:k,out)}return out}
function knowledgeHits(message,context){const q=tokens(message);if(!q.length)return[];const hits=[];for(const [branch,data] of Object.entries(branches(context))){for(const item of flatten(data)){const hay=norm(item.text);let score=0;for(const token of q)if(hay.includes(token))score+=token.length>6?2:1;if(score>=2)hits.push({branch,path:item.path,text:item.text,score})}}return hits.sort((a,b)=>b.score-a.score||a.text.length-b.text.length).slice(0,3)}
function info(context){const names=branchNames(context);return {names,count:names.length,errors:context?.knowledge?.errors||[],manifest:context?.knowledge?.manifest||null}}
function answer(request,context=request?.payload?.secondKernelContext){const message=clean(request?.payload?.message||request?.text),n=norm(message),k=info(context);if(!message)return {handled:false};
 if(/\b(?:tu )?(?:m ?entend|mentend|mecout|m ecoute|me recoi|me recois|me lis|tu recoi|tu recois)\w*\b/.test(n)||/\b(?:entend|ecoute|recoi|lis)\w* tu\b/.test(n))return {handled:true,text:`Oui. Je te reçois sur le flux blob partagé. Le noyau secondaire est actif${k.count?` avec ${k.count} branches de connaissances chargées`:''}.`,intent:'hearing_check'};
 if(/\b(?:tu )?(?:me )?comprend\w*\b/.test(n)||/\btu saisis\b/.test(n))return {handled:true,text:'Oui. Je reçois le message, je l’interprète dans le noyau secondaire, puis je renvoie ma réponse sur le même flux blob.',intent:'understanding_check'};
 if(/\b(?:qui es tu|tes qui|tu es qui|qui est le noyau secondaire)\b/.test(n))return {handled:true,text:'Je suis le noyau secondaire GThink. Je travaille sur le contexte public qui m’est fourni par le blob de connaissances et je communique avec le noyau principal par le flux blob partagé.',intent:'identity'};
 if(/\b(?:statut|status|etat)\b/.test(n)&&/\b(?:noyau|secondaire|flux|blob)\b/.test(n))return {handled:true,text:`Noyau secondaire actif. Flux blob partagé actif. Branches chargées : ${k.names.join(', ')||'aucune'}.${k.errors.length?` Erreurs de chargement : ${k.errors.length}.`:''}`,intent:'status'};
 if(/\b(?:connaissance|connaissances|branches|sais quoi|acces a quoi|as quoi)\b/.test(n)){return {handled:true,text:`J’ai actuellement accès aux branches publiques chargées pour cette tâche : ${k.names.join(', ')||'aucune'}. Elles restent séparées des données privées et des identifiants.`,intent:'knowledge_inventory'}}
 if(/\b(?:relie|relier|raccorde|raccordes|connecte|connectes|flux)\b/.test(n)&&/\b(?:principal|toi|autre noyau|deux noyaux)\b/.test(n))return {handled:true,text:'Oui. Le noyau principal et moi passons par le même flux blob. Le routeur choisit lequel répond, et les handoffs restent tracés dans le stream.',intent:'kernel_link'};
 const hits=knowledgeHits(message,context);if(hits.length){const unique=[];for(const h of hits)if(!unique.some(x=>x.text===h.text))unique.push(h);const body=unique.slice(0,2).map(h=>`[${h.branch}] ${h.text}`).join('\n');return {handled:true,text:`D’après mes branches chargées :\n${body}`,intent:'knowledge_match',evidence:unique.slice(0,2).map(h=>({branch:h.branch,path:h.path}))}}
 return {handled:false}
}
function status(){return {schema:SCHEMA,name:NAME,ready:true,typoTolerant:true,usesSecondKernelContext:true,knowledgeSearch:true}}
window.GTHINK_SECONDARY_CONVERSATION_BRIDGE=Object.freeze({schema:SCHEMA,name:NAME,answer,status,knowledgeHits});
})();