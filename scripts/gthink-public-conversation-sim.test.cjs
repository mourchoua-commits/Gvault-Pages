const fs=require('fs');
const path=require('path');
const vm=require('vm');
const crypto=require('crypto');
global.window=global;
global.crypto=crypto.webcrypto;
const bridgePath=path.join(__dirname,'gthink-secondary-conversation-bridge.js');
vm.runInThisContext(fs.readFileSync(bridgePath,'utf8'),{filename:bridgePath});
const bridge=global.GTHINK_SECONDARY_CONVERSATION_BRIDGE;
const core=JSON.parse(fs.readFileSync(path.join(__dirname,'../gthink/second-kernel/blob/branches/07-gthink-core-cognition.json'),'utf8'));
const coDev=JSON.parse(fs.readFileSync(path.join(__dirname,'../gthink/second-kernel/blob/branches/08-gthink-co-development-memory.json'),'utf8'));
const context={knowledge:{branches:{'core-cognition':core,'co-development-memory':coDev,routing:{},'task-methods':{},handoff:{},'offline-control-plane':{},'scan-link-turrets':{}},errors:[]}};
function request(message,history=[]){return {payload:{message,history,secondKernelContext:context}}}
const base=[];
function add(user,intent,history=[]){base.push({user,intent,history})}
for(const s of ['Yo','Salut','salut !','Bonjour','bonsoir','coucou','Hello','Wesh','re','Salu','Bonjor'])add(s,'social_greeting');
for(const s of ['Tu vas bien ?','Tu va bien ?','tu vas bein ?','Tu vas biien ?','ça va ?','ca va','sa va ?','cv ?','Comment tu vas ?','comment tu va','Tout va bien ?','tout vas bien ?'])add(s,'social_wellbeing');
for(const s of ['ok','Okay','okey','daccord','oui','ouais','yep','nickel','parfait','compris'])add(s,'acknowledgement');
for(const s of ['merci','merci beaucoup','mercii','thanks'])add(s,'thanks');
for(const s of ['pret ?','prêt?','tu es prêt ?','ready?'])add(s,'ready');
for(const s of ['On parle ici','on continue ici','on reste ici','on bosse ici','on travaille ici','c est ici qu on continue'])add(s,'continuation_statement');
for(const s of ['go','vasy','vas y'])add(s,'continuation_ack',[{role:'assistant',content:'On avait décidé de tester le routeur.'}]);
for(const s of ['du coup ?','et du coup ?','et maintenant ?','et là ?','donc ?','alors ?'])add(s,'short_followup',[{role:'assistant',content:'La page est branchée.'}]);
add('pourquoi ?','short_followup_why',[{role:'assistant',content:'Parce que le routeur a détecté un conflit.'}]);
add('comment ?','short_followup_how',[{role:'assistant',content:'Je passe par le Method Router.'}]);
for(const s of ['Nan pas ça','Non','pas ca','c est pas ça','je voulais dire le blob','tu confonds','corrige ça'])add(s,'correction',[{role:'assistant',content:'Ancienne interprétation.'}]);
for(const s of ['t es la ?','tes la','tu es là ?'])add(s,'presence_statement');
for(const s of ['tu peux m aider ?','tu peut m aider','aide moi'])add(s,'help_offer');
for(const s of ['j ai un probleme','jai un souci','ça bloque'])add(s,'problem_statement');
add('Tu me comprends ?','understanding_check');add('Tu m entends ?','hearing_check');add('Qui es tu ?','identity');add('statut gthink','status');add('tu as quelles connaissances ?','knowledge_inventory');add('quels protocoles tu connais ?','method_inventory');add('tu connais quoi de gvault ?','co_development_inventory');
add('C est quoi GArchive ?','project_knowledge');add('Tu sais quoi sur Ladybug ?','project_knowledge');add('Explique FICSA','method_knowledge');add('SACREBLEU sert à quoi ?','method_knowledge');
for(const s of ['Comment ça va marcher le serveur ?','Comment va fonctionner le routeur ?','Quelle est la capitale du Pérou ?','Pourquoi le ciel est bleu ?','Combien font 12+3 ?','Raconte moi une histoire de dragon','Traduis bonjour en anglais','Quelle météo demain ?'])add(s,null);
function runCases(cases){const failures=[];for(const c of cases){const r=bridge.answer(request(c.user,c.history||[]),context);const got=r?.handled?r.intent:null;if(got!==c.intent)failures.push({input:c.user,expected:c.intent,got,text:r?.text||null})}return {total:cases.length,pass:cases.length-failures.length,fail:failures.length,failures}}
function variants(s){const out=new Set([s]);const low=s.toLowerCase();for(let i=0;i<low.length;i++)if(/[a-z]/.test(low[i]))out.add(low.slice(0,i)+low.slice(i+1));out.add(low.replace(/vas/g,'va'));out.add(low.replace(/bien/g,'bein'));out.add(low.replace(/bien/g,'biien'));out.add(low.replace(/bonjour/g,'bonjor'));out.add(low.replace(/salut/g,'salu'));return [...out]}
const fuzz=[];for(const [seed,intent] of [['Tu vas bien ?','social_wellbeing'],['Comment tu vas ?','social_wellbeing'],['Salut','social_greeting'],['Bonjour','social_greeting']])for(const v of variants(seed))fuzz.push({user:v,intent,history:[]});
const counterInputs=['Comment ça va marcher le serveur ?','Tu vas bien configurer le serveur ?','Le serveur va bien ?','Comment tu vas router ça ?','Ça va fonctionner ?','Ca va compiler ?','Comment va le code ?','Tout va bien dans le script ?','Tu vas déployer ?','Comment ça va se déployer ?','Pourquoi ça va marcher ?','Est ce que ça va marcher ?','Le moteur va bien fonctionner ?','Le routeur va bien fonctionner ?','L API va bien répondre ?','Comment tu vas coder ça ?','Tu vas bien tester le code ?','Comment va fonctionner GThink ?','Tu vas bien faire le commit ?','Ça va sur GitHub ?','Comment va le build ?','Le worker va bien ?','Le blob va bien passer ?','Le listener va bien répondre ?','Comment ça va dans le moteur ?','Le script va bien charger ?','Tu vas bien garder le contexte ?','Tu vas bien préserver le blob ?','Comment tu vas faire ?','Comment tu vas verifier ?'];
const counterFailures=[];for(const input of counterInputs){const r=bridge.answer(request(input),context);if(r?.intent==='social_wellbeing')counterFailures.push({input,got:r.intent,text:r.text})}
const baseResult=runCases(base),fuzzResult=runCases(fuzz),counterResult={total:counterInputs.length,pass:counterInputs.length-counterFailures.length,fail:counterFailures.length,failures:counterFailures};
const total=baseResult.total+fuzzResult.total+counterResult.total,fail=baseResult.fail+fuzzResult.fail+counterResult.fail;
const report={schema:'GTHINK_PUBLIC_CONVERSATION_SIM_RUN_V1',bridge:bridge.schema,base:baseResult,fuzz:fuzzResult,counterproof:counterResult,combined:{total,pass:total-fail,fail}};
console.log(JSON.stringify(report,null,2));
process.exit(fail?1:0);
