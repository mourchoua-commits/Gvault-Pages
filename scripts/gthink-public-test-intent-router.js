(()=>{'use strict';
const SCHEMA='GTHINK_PUBLIC_TEST_INTENT_ROUTER_V1';
function clean(v){return String(v??'').trim()}
function norm(v){return clean(v).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function bareTestIntent(message){const n=norm(message);return /^(test|teste|tester|un test|le test|fais un test|fait un test|on test|on teste|on testera|testons|essai|un essai|essaie|essaye|on essaie|on essaye)$/.test(n)}
function targetedTestIntent(message){const n=norm(message);if(bareTestIntent(message))return false;return /^(test|teste|tester|verifie|verifier|verification|valide|valider|validation|preuve)\b/.test(n)||/\b(test|teste|tester|verifie|verifier|validation)\b/.test(n)}
function answer(request){const message=clean(request?.payload?.message||request?.text);if(!message)return {handled:false};if(bareTestIntent(message))return {handled:true,text:'Oui. Quel test tu veux lancer ?',intent:'test_intent_needs_target',methodHint:'T_CADRAGE',nextProtocol:'T_EPREUVE',targetState:'MISSING',doNotInferTarget:true};return {handled:false,targeted:targetedTestIntent(message)}}
function status(){return {schema:SCHEMA,ready:true,bareTestNeedsTarget:true,methodHint:'T_CADRAGE',nextProtocol:'T_EPREUVE'}}
window.GTHINK_PUBLIC_TEST_INTENT_ROUTER=Object.freeze({schema:SCHEMA,answer,status,bareTestIntent,targetedTestIntent});
})();