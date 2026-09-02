(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_NATIVE_ENGINE_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='GThinkPublicNative';
const HISTORY_MAX=12;
const KB={
  gthink:'GThink est le moteur conversationnel de GVAULT. Sur cette page, le moteur public natif traite directement le blob public et garde les autres routes comme renfort.',
  blob:'Un blob est l’unité de message et d’état de GVAULT : il porte son identifiant, son rôle, son intention, son contenu et ses liens avec les autres blobs.',
  listener:'Un listener écoute le stream de blobs et prend les requêtes qui lui sont destinées. Le listener principal est épaulé par les mini-listeners.',
  prelistener:'Un prelistener se place avant le listener principal pour capter une requête ou une réponse au plus tôt, la conserver et la relayer sans casser sa corrélation.',
  stream:'Le stream est le bus de circulation des blobs. Ici, sa route canonique reste gvault://blobs/public/gthink/stream.',
  public:'Le plan public ne reçoit que les données prévues pour la page publique. Le moteur natif public travaille uniquement avec ce contexte public.',
  privé:'Le plan privé sert aux données et traitements qui ne doivent pas être exposés directement sur la page publique.',
  worker:'Un Worker exécute du JavaScript hors du thread principal de la page. Il est utile pour isoler des traitements, mais ce moteur public natif n’en dépend pas pour répondre.',
  moteur:'Le moteur natif public est un moteur JavaScript dédié à GThink. Il ne dépend ni d’un modèle intégré au navigateur ni d’un service distant pour être disponible.'
};
function clean(v){return String(v??'').trim()}
function lower(v){return clean(v).toLocaleLowerCase('fr-FR')}
function uid(prefix='gnative'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function emit(kind,payload={},parentBlobId=null,text){try{api()?.speak?.({schema:BLOB_SCHEMA,blobId:uid(),parentBlobId,conversationId:payload?.conversationId||'gthink-public-native',kind,role:'gthink',from:NAME,to:'public.bus',intent:kind==='gthink.native.ready'?'announce_public_native_ready':'public_native_reply',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:api()?.streamUrl,text,display:text,payload:{...payload,nativeSchema:SCHEMA},understoodBy:['GThink','GThinkMini','public-kernel','public-ui','prelistener'],silent:true,muted:false})}catch{}}
function historyFor(request){return (Array.isArray(request?.payload?.history)?request.payload.history:[]).slice(-HISTORY_MAX).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:clean(x?.content)})).filter(x=>x.content)}
function lastAssistant(history){return [...history].reverse().find(x=>x.role==='assistant'&&x.content)?.content||''}
function lastUser(history){return [...history].reverse().find(x=>x.role==='user'&&x.content)?.content||''}
function recentStream(){try{return api()?.hearLast?.(32)||[]}catch{return []}}
function streamState(){const blobs=recentStream(),errors=blobs.filter(b=>b?.kind==='error'||/error$/i.test(b?.kind||'')),ready=blobs.filter(b=>/ready$/i.test(b?.kind||'')).slice(-6),lastResponse=[...blobs].reverse().find(b=>b?.kind==='gateway.response'||(b?.kind==='utterance'&&b?.role==='gthink'));return {signals:blobs.length,errors:errors.length,ready:ready.map(b=>clean(b?.payload?.name||b?.from||b?.kind)).filter(Boolean),lastResponse:clean(lastResponse?.text||lastResponse?.payload?.text)}}
function math(text){const raw=clean(text).replace(/,/g,'.').replace(/[×x]/g,'*').replace(/÷/g,'/');const m=raw.match(/(?:combien fait|calcule|calcul|=)?\s*(-?\d+(?:\.\d+)?(?:\s*[+\-*/%]\s*-?\d+(?:\.\d+)?)+)\s*\??$/i);if(!m)return null;const expr=m[1],tokens=expr.match(/-?\d+(?:\.\d+)?|[+\-*/%]/g);if(!tokens||tokens.join('').replace(/\s/g,'')!==expr.replace(/\s/g,''))return null;const nums=[],ops=[];const prec=o=>o==='+'||o==='-'?1:2;const apply=()=>{const op=ops.pop(),b=nums.pop(),a=nums.pop();if(!Number.isFinite(a)||!Number.isFinite(b))throw 0;nums.push(op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?a/b:a%b)};try{for(const t of tokens){if(/^-?\d/.test(t))nums.push(Number(t));else{while(ops.length&&prec(ops.at(-1))>=prec(t))apply();ops.push(t)}}while(ops.length)apply();const n=nums[0];return Number.isFinite(n)?`${expr.replace(/\s+/g,' ')} = ${n}`:null}catch{return null}}
function definition(text){const l=lower(text);const m=l.match(/(?:c['’]est quoi|qu['’]est[- ]ce que|définis|definis|à quoi sert|a quoi sert)\s+(?:un |une |le |la |les |l['’])?(.+?)[ ?.]*$/i);if(!m)return null;const q=m[1];for(const [k,v] of Object.entries(KB))if(q.includes(k)||k.includes(q))return v;return null}
function summarizeHistory(history){if(!history.length)return 'Aucun contexte conversationnel récent n’est encore présent dans le moteur public.';const lines=history.slice(-6).map(x=>`${x.role==='assistant'?'GThink':'Toi'} : ${x.content}`);return `Fil récent :\n${lines.join('\n')}`}
function directReply(message,history){const t=clean(message),l=lower(t),state=streamState();if(!t)return '';
 if(/^__GTHINK_BENCH__/i.test(t))return `GTHINK_BENCH_OK:public-native:${uid('bench')}`;
 if(/^__GTHINK_PAGE_SMOKE__/i.test(t))return 'GThink public natif opérationnel.';
 if(/^(test|test\?|essai|ping)[ !?.]*$/i.test(t))return 'GThink public natif est actif. Le message a été traité directement sur la page publique.';
 if(/^(salut|bonjour|bonsoir|yo|hey|coucou|hello|wesh|re|allo)[ !?.]*$/i.test(t))return 'Oui. GThink public natif est disponible.';
 if(/(qui es[- ]?tu|t['’]?es qui|tu es qui|c['’]est qui gthink)/i.test(l))return 'Je suis GThink sur le moteur natif public de GVAULT. Je réponds directement depuis le stream public, sans dépendre du moteur natif du navigateur.';
 if(/(statut|status|listener|stream|ça marche|ca marche|fonctionne|disponible|prêt|pret)/i.test(l)){const ready=state.ready.length?` Listeners vus : ${state.ready.join(', ')}.`:'';return `GThink public natif : actif. Stream : ${api()?.streamUrl||'gvault://blobs/public/gthink/stream'}. Signaux récents : ${state.signals}, erreurs récentes : ${state.errors}.${ready}`}
 const m=math(t);if(m)return m;
 const d=definition(t);if(d)return d;
 if(/^(résume|resume) (notre|la|le) (conversation|discussion|fil)/i.test(l))return summarizeHistory(history);
 if(/^(répète|repete|redis)( |$)/i.test(l)){const prev=lastAssistant(history);return prev||'Je n’ai pas encore de réponse précédente dans ce contexte.'}
 if(/^(du coup|et maintenant|donc|alors)[ ?!.]*$/i.test(l)){const prev=lastAssistant(history);return prev?`Donc : ${prev}`:'Donc : le moteur public natif est prêt et prend directement les prochaines requêtes du stream.'}
 if(/pourquoi.*(affich|réponse|reponse|secours|fallback|reçu ton blob|recu ton blob)/i.test(l))return 'Parce que l’ancien chemin rendait la réponse locale de secours avant qu’une source plus forte soit sélectionnée. Le moteur natif public répond maintenant directement avant ce fallback.';
 if(/comment.*(marche|fonctionne).*(gthink|moteur|stream|listener)/i.test(l))return 'Le chemin est : blob utilisateur → prelisteners → moteur public natif → gateway.response → rendu. Les mini-listeners restent en secours si le listener principal tombe.';
 if(/tu peu[x]?|peux[- ]?tu/i.test(l)&&/(répond|repond|parler|écouter|ecouter|interpréter|interpreter)/i.test(l))return 'Oui. Ces fonctions sont prises en charge directement par le moteur public natif pour le contexte public.';
 if(/tu peu[x]?|peux[- ]?tu/i.test(l)&&/(modifier github|commit|déployer|deployer|écrire dans github|ecrire dans github)/i.test(l))return 'Le moteur public peut interpréter cette demande, mais l’écriture GitHub nécessite toujours l’agent connecté qui possède l’autorisation du dépôt.';
 if(/[?]$/.test(t)||/^(pourquoi|comment|quoi|qui|où|ou|quand|combien|quel|quelle|quels|quelles)\b/i.test(l))return `Je comprends la question, mais le moteur public natif n’a pas assez de connaissance locale pour répondre de façon fiable sans inventer. Sujet détecté : ${t.replace(/\?+$/,'')}.`;
 if(t.length<36)return 'Compris. GThink public natif garde ce point dans le contexte du tour.';
 return 'Compris. Le moteur public natif a pris le message en charge et le conserve dans le contexte conversationnel public de ce tour.'}
async function answer(request){const message=clean(request?.payload?.message||request?.text);if(!message)throw new Error('gthink_public_native_empty_message');const history=historyFor(request),text=directReply(message,history);if(!text)return {handled:false};const result={schema:SCHEMA,handled:true,text,engine:'gthink-public-native-js',model:'native-rules-v1',publicNative:true,offlineCapable:true,actionsAuthorized:false};emit('gthink.native.reply',{engine:result.engine,model:result.model,requestBlobId:request?.blobId||null,conversationId:request?.conversationId||null},request?.blobId||null,text);return result}
function status(){return {schema:SCHEMA,configured:true,ready:true,mode:'public-native',engine:'gthink-public-native-js',model:'native-rules-v1',offlineCapable:true,networkRequired:false,historyMax:HISTORY_MAX}}
window.GTHINK_PUBLIC_NATIVE_ENGINE=Object.freeze({schema:SCHEMA,name:NAME,answer,status,streamState,knowledge:Object.freeze({...KB})});
emit('gthink.native.ready',{state:'ready',engine:'gthink-public-native-js',model:'native-rules-v1',offlineCapable:true,networkRequired:false},null,'GThink public native ready');
})();