(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GThinkModelConductorCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const SCHEMA='GTHINK_MODEL_CONDUCTOR_V0';
const VERSION='0.1.0';
const SPECIALISTS=Object.freeze([
  'research','memory_reconstruction','code_and_runtime','browser_navigation','project_registry',
  'verification_and_counterproof','simulation','persistence_and_ledger','public_private_boundary','tool_execution'
]);

function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").replace(/[^a-z0-9._:/+\-]+/g,' ').replace(/\s+/g,' ').trim()}
function unique(xs){return [...new Set(xs.filter(Boolean))]}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min}
function defaultId(){try{return crypto.randomUUID()}catch{return `gthink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}}
function nowIso(){return new Date().toISOString()}

const RX=Object.freeze({
  project:/\b(gvault|vault|projet|project|build|version|checkpoint|aquarium|multiworld|gadmin|control tower|ladybug|coccinelle)\b/,
  browser:/\b(page|onglet|site|navig|scroll|defile|lien|ouvre|selection|selectionne|clique|browser|navigateur|opera|firefox|chrome)\b/,
  research:/\b(recherche|cherche|trouve|internet|web|source|sources|documente|compare les sources|actualite|actuel|aujourd hui|latest|news)\b/,
  code:/\b(code|coder|javascript|typescript|python|html|css|json|bug|debug|runtime|script|fonction|api|commit|github|deploy|deploi)\b/,
  memory:/\b(memoire|souvenir|verbatim|retrouve|rappelle|depuis le|historique|archive|gmail|reconstruction|first capture|ledger)\b/,
  verify:/\b(verifie|verification|contrepreuve|check ?up|checkup|audit|preuve|benchmark|test|pass|fail|coherence)\b/,
  simulate:/\b(simule|simulation|scenario|what if|et si|essai|prototype)\b/,
  persistence:/\b(sauvegarde|persist|snapshot|hash|ledger|index|archive|commit|trace)\b/,
  privateAction:/\b(envoie|envoyer|supprime|supprimer|modifie|modifier|cree|creer|publie|publier|commit|push|mail|gmail|calendar|calendrier|drive|compte|mot de passe|token|secret)\b/,
  highImpact:/\b(supprime|supprimer|efface|effacer|publie|publier|push|deploy|deploie|envoie|envoyer|modifie|modifier|merge|main|production|prod)\b/,
  deep:/\b(profond|integral|complet|scrupule|benchmark|architecture|conception|analyse|compare|triangule|tout|global|integralite|meilleur)\b/,
  current:/\b(aujourd hui|maintenant|actuel|actualite|news|latest|current|live|en ce moment|prix|cours|score|meteo|internet|web)\b/,
  simple:/^(salut|bonjour|bonsoir|yo|hey|coucou|hello|merci|ok|okay|d accord|oui|non|nan|ca va|ça va|tu vas bien|tout va bien|attends?|go)[ !?.]*$/
});

function classify(message,context={}){
  const n=norm(message);
  const labels=[];
  if(RX.project.test(n))labels.push('project_registry');
  if(RX.browser.test(n)||context?.navigator===true)labels.push('browser_navigation');
  if(RX.research.test(n)||RX.current.test(n))labels.push('research');
  if(RX.code.test(n))labels.push('code_and_runtime');
  if(RX.memory.test(n))labels.push('memory_reconstruction');
  if(RX.verify.test(n))labels.push('verification_and_counterproof');
  if(RX.simulate.test(n))labels.push('simulation');
  if(RX.persistence.test(n))labels.push('persistence_and_ledger');
  if(!labels.length)labels.push(RX.simple.test(n)?'conversation':'general_reasoning');
  const highImpact=RX.highImpact.test(n);
  const privateRelayRequired=highImpact&&RX.privateAction.test(n)&&context?.publicOnly!==false;
  const depth=RX.deep.test(n)||labels.length>=3?'deep':labels.length>=2?'medium':'light';
  return Object.freeze({primary:labels[0],labels:unique(labels),depth,highImpact,privateRelayRequired,currentInformation:RX.current.test(n),simpleConversation:RX.simple.test(n)});
}
function selectWorkforce(classification,message,context={}){
  const labels=classification.labels||[],selected=[];const add=x=>{if(SPECIALISTS.includes(x)&&!selected.includes(x))selected.push(x)};
  for(const label of labels){if(label==='general_reasoning'||label==='conversation')continue;if(SPECIALISTS.includes(label))add(label)}
  if(labels.includes('research')&&classification.currentInformation)add('verification_and_counterproof');
  if(labels.includes('code_and_runtime')&&classification.depth!=='light')add('verification_and_counterproof');
  if(labels.includes('memory_reconstruction'))add('persistence_and_ledger');
  if(labels.includes('browser_navigation')&&classification.depth==='deep')add('verification_and_counterproof');
  if(classification.highImpact){add('verification_and_counterproof');add('public_private_boundary')}
  if(!selected.length&&!classification.simpleConversation)add('research');
  const max=classification.depth==='deep'?4:classification.depth==='medium'?3:2;return selected.slice(0,max);
}
function routePlan(classification,workforce,toolName=null){
  const route=['CURRENT_EXPLICIT_USER_INTENT','CANONICAL_METHOD_ROUTER_POLICY'];
  if(classification.labels.includes('project_registry')||classification.labels.includes('memory_reconstruction'))route.push('AUTHORITATIVE_GVAULT_ARTIFACTS');
  route.push('CURRENT_RUNTIME_STATE');if(workforce.length)route.push('SPECIALIST_WORKFORCE');if(toolName)route.push('TOOL_BUS');if(classification.labels.includes('browser_navigation'))route.push('NAVIGATOR');if(!classification.simpleConversation)route.push('EXTERNAL_MODEL_POOL_OR_LOCAL_FALLBACK');route.push('SAFE_MIRROR_VISIBLE_OUTPUT','HEART_FEEDBACK_TRACE');return unique(route);
}
function directToolArgs(name,message){if(name==='gvault_search_projects')return{query:message,limit:5};if(name==='gvault_project_details')return{query:message};if(name==='gvault_best_functional_checkup')return{message};if(name==='local_calculate')return{expression:message};if(name==='gvault_current_context'||name==='runtime_status'||name==='local_time')return{};return null}
function formatToolResult(name,r){
  if(!r||r.ok===false)return `Outil ${name} non validé${r?.error?` : ${r.error}`:''}.`;
  if(name==='local_calculate')return `${r.expression} = ${r.value}`;if(name==='local_time')return `Heure locale : ${r.local}${r.timezone?` · ${r.timezone}`:''}.`;if(name==='runtime_status')return `Runtime GThink : ${Array.isArray(r.tools)?r.tools.length:0} outil(s) public(s) disponibles.`;
  if(name==='gvault_search_projects'){const rows=Array.isArray(r.results)?r.results:[];return rows.length?rows.map(x=>`${x.name}${x.version?` · ${x.version}`:''}${x.status?` · ${x.status}`:''}`).join('\n'):'Aucun projet correspondant dans la projection publique.'}
  if(name==='gvault_project_details'){const x=r.project||{};return [x.name,x.version,x.status,x.summary].filter(Boolean).join(' · ')||'Projet trouvé.'}
  if(name==='gvault_best_functional_checkup')return `Check-up Best Functional : ${r.status||r.result?.status||'terminé'}.`;return clean(r.text||r.result||'Outil exécuté avec résultat vérifié.');
}
const ROLE_PROMPTS=Object.freeze({
  research:'Tu es le spécialiste RESEARCH. Fournis seulement des constats utiles, sources/provenance quand disponibles, incertitudes et éléments vérifiables. Pas de raisonnement caché.',
  memory_reconstruction:'Tu es le spécialiste MEMORY_RECONSTRUCTION. Reconstruis uniquement à partir des éléments fournis/accessible via outils. Distingue preuve, lacune et hypothèse.',
  code_and_runtime:'Tu es le spécialiste CODE_AND_RUNTIME. Analyse l’architecture, les contrats, erreurs et chemins d’exécution. Propose des corrections testables, sans prétendre les avoir exécutées sans résultat d’outil.',
  browser_navigation:'Tu es le spécialiste BROWSER_NAVIGATION. Aide sur la page courante. Utilise les outils navigator_* si disponibles. Ne clique/navigue que sur demande explicite.',
  project_registry:'Tu es le spécialiste PROJECT_REGISTRY. Utilise les outils GVAULT publics pour les faits projet/version/statut au lieu d’inventer.',
  verification_and_counterproof:'Tu es le spécialiste VERIFICATION_COUNTERPROOF. Cherche ce qui pourrait rendre la conclusion fausse, incohérente ou non prouvée. Retourne verdict, preuves manquantes et niveau de confiance.',
  simulation:'Tu es le spécialiste SIMULATION. Explore plusieurs scénarios, hypothèses et points de rupture sans confondre simulation et réalité.',
  persistence_and_ledger:'Tu es le spécialiste PERSISTENCE_LEDGER. Vérifie provenance, snapshots, hashes, continuité et statut des preuves. Ne transforme pas un index dérivé en autorité.',
  public_private_boundary:'Tu es le spécialiste PUBLIC_PRIVATE_BOUNDARY. Identifie ce qui peut rester public, ce qui exige un relais sécurisé et les risques de fuite de secrets.',
  tool_execution:'Tu es le spécialiste TOOL_EXECUTION. Sélectionne uniquement les outils nécessaires et exige un résultat d’outil avant d’affirmer une action.'
});
function specialistPrompt(role,message,classification,context={}){return `${ROLE_PROMPTS[role]||'Tu es un spécialiste GThink.'}\n\nDEMANDE UTILISATEUR (autorité) :\n${message}\n\nCONTEXTE ROUTAGE : ${JSON.stringify({primary:classification.primary,labels:classification.labels,depth:classification.depth,currentInformation:classification.currentInformation,publicOnly:context?.publicOnly!==false})}\n\nRetourne une projection concise : findings, evidence/provenance, confidence 0..1, risks, recommendedNext. N’expose pas de chaîne de pensée privée.`}
function synthesisPrompt(message,classification,outputs){const compact=outputs.map(x=>({specialist:x.specialist,ok:x.ok,text:clean(x.text).slice(0,5000),provider:x.provider||null,toolCalls:x.toolCalls||0}));return `Tu es PINEAL_SAFE_SYNTHESIS pour GThink. Synthétise des projections de spécialistes en une réponse utile à l’utilisateur.\nRègles : intention utilisateur prioritaire, sépare faits et hypothèses, ne prétends aucune action sans résultat d’outil, signale les conflits, garde la réponse en français, ne révèle aucun raisonnement caché.\n\nDEMANDE : ${message}\nCLASSIFICATION : ${JSON.stringify(classification)}\nPROJECTIONS : ${JSON.stringify(compact)}\n\nRetourne seulement la réponse visible finale.`}
function counterproofPrompt(message,draft,classification){return `Tu es GThink COUNTERPROOF. Vérifie la réponse candidate suivante sans exposer de chaîne de pensée. Recherche erreurs factuelles internes, action prétendue sans preuve, contradiction avec la demande ou risque public/privé.\nDEMANDE : ${message}\nCLASSIFICATION : ${JSON.stringify(classification)}\nCANDIDATE : ${clean(draft).slice(0,8000)}\nRetourne une ligne JSON compacte avec keys verdict (PASS|WARN|FAIL), confidence (0..1), riskFlags (array), correction (string optionnelle).`}
function parseCounterproof(text){const raw=clean(text),first=raw.indexOf('{'),last=raw.lastIndexOf('}');if(first>=0&&last>first){try{const x=JSON.parse(raw.slice(first,last+1));return{verdict:['PASS','WARN','FAIL'].includes(x.verdict)?x.verdict:'WARN',confidence:clamp(x.confidence,0,1),riskFlags:Array.isArray(x.riskFlags)?x.riskFlags.slice(0,8):[],correction:clean(x.correction)}}catch{}}return{verdict:'WARN',confidence:.5,riskFlags:['counterproof_unstructured'],correction:''}}
function confidenceFrom({classification,outputs,counterproof,directTool}){if(directTool)return directTool.ok===false?.2:.94;const ok=outputs.filter(x=>x.ok).length,total=Math.max(outputs.length,1);let c=.42+.38*(ok/total);if(outputs.some(x=>x.toolCalls>0))c+=.06;if(classification.currentInformation&&outputs.every(x=>x.webGrounded!==true))c-=.12;if(counterproof?.verdict==='PASS')c+=.08;if(counterproof?.verdict==='WARN')c-=.05;if(counterproof?.verdict==='FAIL')c-=.22;return clamp(c,.05,.98)}
class GThinkModelConductor{
  constructor(adapters={}){this.toolBus=adapters.toolBus||null;this.provider=adapters.provider||null;this.persistence=adapters.persistence||null;this.now=adapters.now||nowIso;this.makeId=adapters.makeId||defaultId;this.maxFanout=clamp(adapters.maxFanout??4,1,6)}
  inspect(message,context={}){const classification=classify(message,context);let toolName=null;try{toolName=this.toolBus?.quickClassify?.(message)||null}catch{}const workforce=selectWorkforce(classification,message,context).slice(0,this.maxFanout);return{schema:SCHEMA,version:VERSION,classification,workforce,toolName,route:routePlan(classification,workforce,toolName)}}
  async run(request={}){
    const message=clean(request.message);if(!message)return{ok:false,error:'empty_message',schema:SCHEMA,version:VERSION};const context={publicOnly:true,...(request.context||{})},taskId=this.makeId(),startedAt=this.now(),plan=this.inspect(message,context);const trace={schema:'GTHINK_MODEL_TRACE_V0',taskId,startedAt,messageSha256:null,classification:plan.classification,route:plan.route,workforce:plan.workforce,toolCalls:[],specialistRuns:[],counterproof:null,riskFlags:[],provenanceRefs:[],status:'RUNNING'};
    if(plan.classification.privateRelayRequired){trace.status='BLOCKED_PRIVATE_RELAY_REQUIRED';trace.riskFlags.push('private_relay_required');const result=this._project(taskId,'Cette demande implique une action privée ou à fort impact. Le modèle public peut préparer et vérifier le plan, mais l’exécution doit passer par un relais sécurisé autorisé.',trace,.92,'PRIVATE_RELAY_REQUIRED');await this._persist(result.trace);return result}
    if(plan.toolName&&this.toolBus?.execute){const args=directToolArgs(plan.toolName,message);if(args!==null){const toolResult=await this.toolBus.execute(plan.toolName,args,{userMessage:message,conductor:SCHEMA,taskId});trace.toolCalls.push({name:plan.toolName,ok:toolResult?.ok!==false,error:toolResult?.error||null});trace.status=toolResult?.ok===false?'TOOL_FAILED':'COMPLETED';const result=this._project(taskId,formatToolResult(plan.toolName,toolResult),trace,confidenceFrom({classification:plan.classification,outputs:[],counterproof:null,directTool:toolResult}),trace.status);await this._persist(result.trace);return result}}
    if(plan.classification.simpleConversation&&!this.provider?.ask){trace.status='LOCAL_CONVERSATION_FALLBACK';const text=/\b(merci)\b/.test(norm(message))?'Avec plaisir.':/\b(ca va|ça va|tu vas bien|tout va bien)\b/.test(norm(message))?'Oui, ça va. Et toi ?':'Oui. Je suis là.';const result=this._project(taskId,text,trace,.8,trace.status);await this._persist(result.trace);return result}
    if(!this.provider?.ask){trace.status='PROVIDER_UNAVAILABLE';trace.riskFlags.push('provider_unavailable');const result=this._project(taskId,'Le conducteur GThink a préparé la route, mais aucun moteur de synthèse n’est actuellement disponible pour cette demande.',trace,.35,trace.status);await this._persist(result.trace);return result}
    const outputs=[],roles=plan.workforce.length?plan.workforce:['research'];for(const role of roles.slice(0,this.maxFanout)){let r=null;try{r=await this.provider.ask(specialistPrompt(role,message,plan.classification,context),request.history||[],{...context,taskId,specialist:role,gthinkModel:true})}catch(error){r={ok:false,error:clean(error?.message||error)}}const out={specialist:role,ok:r?.ok===true,text:clean(r?.text),provider:r?.provider||null,model:r?.model||null,webGrounded:r?.webGrounded===true,toolCalls:Number(r?.toolCalls||0),error:r?.error||null,sources:Array.isArray(r?.sources)?r.sources.slice(0,8):[]};outputs.push(out);trace.specialistRuns.push(out);if(out.sources.length)trace.provenanceRefs.push(...out.sources.map(s=>s.url||s.title).filter(Boolean))}
    const successful=outputs.filter(x=>x.ok&&x.text);if(!successful.length){trace.status='NO_SPECIALIST_RESULT';trace.riskFlags.push('no_specialist_result');const result=this._project(taskId,'Les spécialistes ont été routés, mais aucun n’a produit de résultat vérifiable. Je ne transforme pas ça en faux PASS.',trace,.2,trace.status);await this._persist(result.trace);return result}
    let draft=successful.length===1?successful[0].text:'';if(successful.length>1){try{const syn=await this.provider.ask(synthesisPrompt(message,plan.classification,successful),request.history||[],{...context,taskId,specialist:'pineal_safe_synthesis',gthinkModel:true});draft=syn?.ok&&clean(syn.text)?clean(syn.text):successful.map(x=>x.text).join('\n\n');trace.synthesis={ok:syn?.ok===true,provider:syn?.provider||null,model:syn?.model||null,error:syn?.error||null}}catch(error){draft=successful.map(x=>x.text).join('\n\n');trace.synthesis={ok:false,error:clean(error?.message||error)}}}
    let counterproof=null;if(plan.classification.highImpact||plan.classification.labels.includes('verification_and_counterproof')||plan.classification.depth==='deep'){try{const cp=await this.provider.ask(counterproofPrompt(message,draft,plan.classification),[],{...context,taskId,specialist:'verification_and_counterproof',gthinkModel:true,noTools:true});counterproof=cp?.ok?parseCounterproof(cp.text):{verdict:'WARN',confidence:.4,riskFlags:['counterproof_unavailable'],correction:''}}catch{counterproof={verdict:'WARN',confidence:.4,riskFlags:['counterproof_unavailable'],correction:''}}trace.counterproof=counterproof;trace.riskFlags.push(...counterproof.riskFlags);if(counterproof.verdict==='FAIL'&&counterproof.correction)draft=counterproof.correction}
    const confidence=confidenceFrom({classification:plan.classification,outputs:successful,counterproof,directTool:null});trace.status=counterproof?.verdict==='FAIL'?'COMPLETED_WITH_CORRECTION':counterproof?.verdict==='WARN'?'COMPLETED_WITH_WARNINGS':'COMPLETED';trace.completedAt=this.now();const result=this._project(taskId,draft,trace,confidence,trace.status);await this._persist(result.trace);return result
  }
  _project(taskId,text,trace,confidence,status){const safeTrace={...trace,provenanceRefs:unique(trace.provenanceRefs||[]).slice(0,24),riskFlags:unique(trace.riskFlags||[]).slice(0,16)};if(!safeTrace.completedAt)safeTrace.completedAt=this.now();return{ok:!String(status).includes('FAILED')&&!String(status).includes('BLOCKED')&&status!=='PROVIDER_UNAVAILABLE'&&status!=='NO_SPECIALIST_RESULT'&&status!=='PRIVATE_RELAY_REQUIRED',schema:SCHEMA,version:VERSION,taskId,text:clean(text),safeState:{selectedRoute:safeTrace.route,workforce:safeTrace.workforce,confidence,riskFlags:safeTrace.riskFlags,provenanceRefs:safeTrace.provenanceRefs,status,privateReasoning:'NOT_EXPOSED'},trace:safeTrace}}
  async _persist(trace){if(!this.persistence?.append)return;try{await this.persistence.append(trace)}catch{}}
}
return Object.freeze({SCHEMA,VERSION,SPECIALISTS,GThinkModelConductor,classify,selectWorkforce,routePlan,directToolArgs,formatToolResult,__test:Object.freeze({norm,parseCounterproof,confidenceFrom})});
});
