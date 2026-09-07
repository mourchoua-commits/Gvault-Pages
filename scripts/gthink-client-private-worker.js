(()=>{'use strict';
const SCHEMA='GTHINK_CLIENT_PRIVATE_WORKER_V3_GVAULT_AUTONOMOUS';
const INVOCATION_SCHEMA='GTHINK_SELF_INVOCATION_PRELISTENER_BLOB_V1';
const KNOWLEDGE_URL=new URL('./gvault-public-agent-knowledge-v1.json',self.location.href).href;
let knowledgeCache=null,knowledgeAt=0;
function clean(v){return String(v??'').trim()}
function lower(v){return clean(v).toLocaleLowerCase('fr-FR')}
function fold(v){return lower(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function recent(history){return (Array.isArray(history)?history:[]).slice(-8).map(x=>`${x?.role==='assistant'?'GThink':'Toi'}: ${clean(x?.content)}`).filter(Boolean).join('\n')}
function simpleMath(text){const raw=clean(text).replace(/,/g,'.').replace(/[×x]/g,'*').replace(/÷/g,'/');const m=raw.match(/(?:combien fait|calcule|calcul|=)?\s*(-?\d+(?:\.\d+)?(?:\s*[+\-*/%]\s*-?\d+(?:\.\d+)?)+)\s*\??$/i);if(!m||!/^[\d\s.+\-*/%]+$/.test(m[1]))return null;try{const value=Function(`"use strict";return (${m[1]})`)();return Number.isFinite(value)?`${m[1].replace(/\s+/g,' ')} = ${value}`:null}catch{return null}}
function invocationFor(request,message){const inv=request?.selfInvocation;if(!inv)return null;if(inv.schema!==INVOCATION_SCHEMA)throw new Error('gthink_selfinvocation_schema_invalid');if(Number(inv.depth)!==1||Number(inv.maxDepth)!==1)throw new Error('gthink_selfinvocation_depth_invalid');if(inv.recursionGuard!=='STOP_AFTER_FIRST_SELF_APPLICATION')throw new Error('gthink_selfinvocation_guard_invalid');if(inv.preserveUserMessageExactly!==true)throw new Error('gthink_selfinvocation_message_guard_missing');if(String(inv.originalMessage??'')!==message)throw new Error('gthink_selfinvocation_message_mismatch');return inv}
function receipt(inv,mode,changed,extra={}){return {applied:!!inv,depth:inv?1:0,maxDepth:inv?1:0,mode:inv?mode:'none',changed:!!changed,sourceBlobId:inv?.blobId||null,schema:inv?.schema||null,messagePreserved:true,hiddenReasoningExposed:false,...extra}}
async function loadJson(url){const r=await fetch(url,{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error(`knowledge_http_${r.status}`);return r.json()}
async function loadKnowledge(force=false){
 if(!force&&knowledgeCache&&Date.now()-knowledgeAt<60000)return knowledgeCache;
 const manifest=await loadJson(KNOWLEDGE_URL);
 if(manifest?.schema!=='GVAULT_PUBLIC_AGENT_KNOWLEDGE_V1')throw new Error('knowledge_manifest_schema');
 const base=new URL('.',KNOWLEDGE_URL),parts=Array.isArray(manifest?.catalog?.parts)?manifest.catalog.parts:[];
 const docs=await Promise.all(parts.map(p=>loadJson(new URL(p,base).href)));
 const projects=docs.flatMap(x=>Array.isArray(x?.entries)?x.entries:[]);
 knowledgeCache={manifest,projects};knowledgeAt=Date.now();return knowledgeCache;
}
function projectText(p){return fold([p?.id,p?.name,p?.kind,p?.category,p?.version,p?.status,p?.summary,(p?.proof||[]).join(' ')].join(' '))}
function queryTokens(q){return fold(q).split(/[^a-z0-9]+/).filter(x=>x.length>1&&!['le','la','les','un','une','des','du','de','dans','sur','pour','avec','est','sont','que','qui','quoi','quel','quelle','comme','plus','moins','moi','toi','nous','vous','ca','ça','ce','cet','cette','ces','projet','projets','gvault','vault'].includes(x))}
function scoreProject(p,q){
 const fq=fold(q),name=fold(p?.name),id=fold(p?.id),text=projectText(p);
 let score=0;
 if(name&&fq.includes(name))score+=24;
 if(id&&fq.includes(id))score+=24;
 const tokens=queryTokens(q);
 for(const t of tokens){if(name.includes(t))score+=6;if(id.includes(t))score+=5;else if(text.includes(t))score+=2}
 return score;
}
function rankedProjects(projects,q,limit=6){return projects.map(p=>({p,s:scoreProject(p,q)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||Number(b.p?.confidence||0)-Number(a.p?.confidence||0)).slice(0,limit).map(x=>x.p)}
function topProjects(projects,limit=12){return [...projects].sort((a,b)=>Number(b?.confidence||0)-Number(a?.confidence||0)||String(a?.name||'').localeCompare(String(b?.name||''),'fr')).slice(0,limit)}
function projectLine(p){const bits=[clean(p?.version),clean(p?.status),p?.playable===true?'lançable':p?.playable===false?'non lançable':''].filter(Boolean);return `${clean(p?.name)||clean(p?.id)}${bits.length?` · ${bits.join(' · ')}`:''}`}
function projectDetail(p,manifest){
 const lines=[projectLine(p)];
 if(clean(p?.summary))lines.push(clean(p.summary));
 if(clean(p?.category))lines.push(`Catégorie : ${clean(p.category)}.`);
 if(clean(p?.publicPath))lines.push(`Ouverture publique : ${clean(p.publicPath)}.`);
 if(Array.isArray(p?.proof)&&p.proof.length)lines.push(`Preuve publique : ${p.proof.join(', ')}.`);
 lines.push(`Source : snapshot public GVAULT, ancré sur Main ${clean(manifest?.source?.anchorCommit).slice(0,12)||'non renseigné'}.`);
 return lines.join('\n');
}
function comparison(projects,manifest){
 const [a,b]=projects;if(!a||!b)return null;
 const field=(label,key)=>{const av=clean(a?.[key])||'non renseigné',bv=clean(b?.[key])||'non renseigné';return `${label} : ${clean(a.name)} = ${av} ; ${clean(b.name)} = ${bv}.`};
 return [`Comparaison ${clean(a.name)} / ${clean(b.name)} :`,field('Version','version'),field('Statut','status'),field('Catégorie','category'),`Lançable : ${clean(a.name)} = ${a.playable===true?'oui':a.playable===false?'non':'non renseigné'} ; ${clean(b.name)} = ${b.playable===true?'oui':b.playable===false?'non':'non renseigné'}.`,`Source : snapshot public GVAULT, Main ${clean(manifest?.source?.anchorCommit).slice(0,12)||'non renseigné'}.`].join('\n');
}
function catalogSummary(projects){
 const counts={project:0,module:0,version:0,duplicate:0,other:0};
 for(const p of projects){const k=counts[p?.kind]!=null?p.kind:'other';counts[k]++}
 return `J’ai ${projects.length} entrées publiques du registre en mémoire locale : ${counts.project} projets, ${counts.module} modules, ${counts.version} versions, ${counts.duplicate} doublons/traces liées et ${counts.other} autres.`;
}
function isListIntent(t){return /\b(liste|inventaire|catalogue|projets?|modules?|qu.?est[- ]?ce qu.?il y a|quoi dans|montre|affiche)\b/i.test(t)}
function isCompareIntent(t){return /\b(compare|comparaison|versus|vs\b|diff[eé]rence|lequel)\b/i.test(t)}
function isStatusIntent(t){return /\b(statut|status|[ée]tat|version|build|checkpoint|point de reprise|suite|risque|config|configuration|lanc|ouvrir|jouable)\b/i.test(t)}
function isAgentStatus(t){return /\b(agent|gthink|coeur|cœur|listener|stream|pont|autonom|direct|backend|connecteur|fonctionne|marche)\b/i.test(t)&&/\b(statut|status|[ée]tat|fonctionne|marche|autonom|direct|backend|connecteur|coeur|cœur|gthink)\b/i.test(t)}
function chooseKnowledgeContext(k,message){
 const hits=rankedProjects(k.projects,message,5);
 const projectBits=hits.length?hits.map(projectLine).join('\n'):'Aucun projet explicitement rapproché de la requête.';
 return `Mode: ${k.manifest.mode}. Source GVAULT Main: ${k.manifest.source?.anchorCommit||'inconnue'}.\nCapacités publiques: recherche projet, comparaison, statut/version, chemin public, historique local. Direct backend: non.\nProjets pertinents:\n${projectBits}`;
}
function systemPrompt(){return 'Tu es GThink, coeur conversationnel public autonome de GVAULT. Réponds en français naturel et directement. Utilise uniquement le contexte public fourni par le worker. Ne révèle aucun secret, contenu privé ou raisonnement caché. Distingue snapshot public et état live. Si une donnée manque, dis-le au lieu de l’inventer. Le backend DIRECT est optionnel et peut être absent.'}
function firstPrompt(message,history,k){return `Contexte récent:\n${recent(history)||'(aucun)'}\n\nContexte public GVAULT vérifié:\n${chooseKnowledgeContext(k,message)}\n\nMessage:\n${message}`}
function selfApplyPrompt(message,history,candidate,inv,k){return `AUTO-INVOCATION GVAULT — UNE SEULE PASSE.\nInstruction du blob : ${clean(inv?.instruction)}\nQuestion originale : ${message}\nContexte public GVAULT:\n${chooseKnowledgeContext(k,message)}\nContexte récent:\n${recent(history)||'(aucun)'}\n\nRéponse candidate:\n${candidate}\n\nRéévalue cette réponse une seule fois. N'invente aucun état live ou privé. Ne décris pas ton raisonnement. Renvoie seulement la réponse finale.`}
async function createNativeSession(){try{const LM=self.LanguageModel;if(LM?.create)return await LM.create({systemPrompt:systemPrompt()})}catch{}try{const lm=self.ai?.languageModel;if(lm?.create)return await lm.create({systemPrompt:systemPrompt()})}catch{}return null}
async function nativeReply(message,history,inv,k){const s=await createNativeSession();if(!s)return null;try{const draft=clean(await s.prompt(firstPrompt(message,history,k)));if(!draft)return null;if(!inv)return {text:draft,engine:'gthink-gvault-native-model',model:'browser-native',selfInvocation:receipt(null,'none',false),knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null}};const revised=clean(await s.prompt(selfApplyPrompt(message,history,draft,inv,k)))||draft;return {text:revised,engine:'gthink-gvault-native-model-self-applied',model:'browser-native',selfInvocation:receipt(inv,'browser-native-two-pass',revised!==draft,{candidateBytes:new TextEncoder().encode(draft).byteLength}),knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null}}}finally{try{s.destroy?.()}catch{}}}
async function nativeSelfApply(message,history,candidate,inv,k){const s=await createNativeSession();if(!s)return null;try{const revised=clean(await s.prompt(selfApplyPrompt(message,history,candidate,inv,k)))||candidate;return {text:revised,engine:'gthink-gvault-native-self-apply',model:'browser-native',selfInvocation:receipt(inv,'browser-native-postprocess',revised!==candidate,{candidateBytes:new TextEncoder().encode(candidate).byteLength}),knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null}}}finally{try{s.destroy?.()}catch{}}}
async function fallback(message,history,k){
 const t=clean(message),l=lower(t),projects=k.projects||[],manifest=k.manifest||{};
 if(/^(salut|bonjour|bonsoir|yo|hey|coucou|hello|wesh|re)[ !?.]*$/i.test(t))return 'Oui. Je suis là. GThink tourne en mode autonome GVAULT sur le snapshot public local.';
 if(/(qui es[- ]?tu|t'es qui|tu es qui|c'est qui gthink|qu.?est[- ]?ce que gthink)/i.test(t))return 'Je suis le cœur conversationnel public de GThink pour GVAULT. Je réponds localement depuis les données publiques autorisées du Vault ; le canal DIRECT reste optionnel.';
 if(isAgentStatus(t))return `Le cœur conversationnel est autonome côté navigateur : registre public GVAULT chargé, historique local actif et fallback déterministe disponible. Le backend DIRECT n’est pas requis pour ce chemin. Je ne présente pas ce snapshot comme un état distant live. Source Main : ${clean(manifest?.source?.anchorCommit).slice(0,12)||'non renseignée'}.`;
 const math=simpleMath(t);if(math)return math;
 if(/^(merci|thanks|thx|nickel|parfait|ok merci)[ !?.]*$/i.test(t))return 'Avec plaisir.';
 if(/^(répète|repete|redis)( |$)/i.test(l)){const prev=[...(Array.isArray(history)?history:[])].reverse().find(x=>x?.role==='assistant'&&clean(x?.content));if(prev)return clean(prev.content)}
 if(/^(résume|resume) (notre|la) (conversation|discussion)/i.test(l)){const ctx=recent(history);if(ctx)return `Fil récent :\n${ctx}`}
 const hits=rankedProjects(projects,t,8);
 if(isCompareIntent(t)&&hits.length>=2)return comparison(hits.slice(0,2),manifest);
 if(hits.length&&(!isListIntent(t)||hits[0]&&scoreProject(hits[0],t)>=6))return projectDetail(hits[0],manifest);
 if(isListIntent(t)){
   const list=topProjects(projects,12).map(p=>`• ${projectLine(p)}`).join('\n');
   return `${catalogSummary(projects)}\n${list}${projects.length>12?`\n… et ${projects.length-12} autres. Donne-moi un nom ou un thème et je filtre.`:''}`;
 }
 if(isStatusIntent(t))return `Je peux te donner le statut, la version, la catégorie et le chemin public d’un projet présent dans le registre GVAULT. Là, je n’ai pas identifié le projet visé. Donne-moi son nom ou un mot-clé.`;
 return `Je reste en mode autonome GVAULT. Je peux retrouver un projet, comparer deux entrées, lire leur statut/version, donner leur chemin public et garder le fil récent. Pour « ${t.length>220?t.slice(0,217)+'…':t} », je n’ai pas assez de contexte public vérifié pour répondre sans inventer.`;
}
function deterministicSelfApply(candidate,inv,k){const text=clean(candidate);if(!text)throw new Error('gthink_selfinvocation_empty_candidate');return {text,engine:'gthink-gvault-self-apply-validation',model:null,selfInvocation:receipt(inv,'deterministic-validation',false,{validatedNonEmpty:true,externalRuntimeClaimed:false}),knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null}}}
async function handle(request){
 const message=clean(request?.publicBlob?.text||request?.message);if(!message)throw new Error('gthink_client_private_empty_message');
 const inv=invocationFor(request,message);
 if(request?.benchmark===true||/^__GTHINK_BENCH__/i.test(message))return {text:`GTHINK_BENCH_OK:gvault-autonomous:${clean(request?.correlationId||'ok')}`,engine:'gthink-gvault-worker-benchmark',model:null,selfInvocation:receipt(null,'benchmark-exempt',false)};
 const history=Array.isArray(request?.history)?request.history.slice(-12):[];
 const k=await loadKnowledge();
 if(request?.mode==='self_apply_response'){if(!inv)throw new Error('gthink_selfinvocation_required_for_postprocess');const candidate=clean(request?.candidateResponse);if(!candidate)throw new Error('gthink_selfinvocation_candidate_missing');const native=await nativeSelfApply(message,history,candidate,inv,k);return native||deterministicSelfApply(candidate,inv,k)}
 const native=await nativeReply(message,history,inv,k);if(native)return native;
 const base=await fallback(message,history,k);
 if(!inv)return {text:base,engine:'gthink-gvault-deterministic-project-engine',model:null,selfInvocation:receipt(null,'none',false),knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null,projects:k.projects.length}};
 return {...deterministicSelfApply(base,inv,k),engine:'gthink-gvault-deterministic-project-engine-self-applied',knowledge:{mode:k.manifest.mode,sourceCommit:k.manifest.source?.anchorCommit||null,projects:k.projects.length}};
}
self.onmessage=async event=>{const d=event.data||{};if(d.type==='ping'){self.postMessage({type:'pong',id:d.id,schema:SCHEMA,ready:true,selfInvocation:true,gvaultKnowledge:true});return}if(d.type!=='request'||!d.id)return;try{const result=await handle(d.request||{});self.postMessage({type:'response',id:d.id,schema:SCHEMA,ok:true,result})}catch(e){self.postMessage({type:'response',id:d.id,schema:SCHEMA,ok:false,error:clean(e?.message||e)})}};
})();
