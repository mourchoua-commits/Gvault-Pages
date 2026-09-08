(()=>{'use strict';
const REQUEST_EVENT='GTHINK_NAVIGATOR_BRIDGE_REQUEST_V1';
const RESPONSE_EVENT='GTHINK_NAVIGATOR_BRIDGE_RESPONSE_V1';
const TOOL_EVENT='GTHINK_NAVIGATOR_TOOL_REQUEST_V1';
const TOOL_RESPONSE_EVENT='GTHINK_NAVIGATOR_TOOL_RESPONSE_V1';
let serial=Promise.resolve();
let activeTargetTabId=null;
let toolsRegistered=false;
const pendingTools=new Map();
function clean(v){return String(v??'').trim()}
function id(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitGlobal(test,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){try{const v=test();if(v)return v}catch{}await sleep(100)}return null}
function callNavigatorTool(tool,args={}){
 const targetTabId=activeTargetTabId;if(!Number.isInteger(targetTabId))return Promise.resolve({ok:false,error:'navigator_target_missing'});
 const requestId=id();
 return new Promise(resolve=>{
  const timer=setTimeout(()=>{pendingTools.delete(requestId);resolve({ok:false,error:'navigator_tool_timeout'})},20000);
  pendingTools.set(requestId,{resolve:(v)=>{clearTimeout(timer);pendingTools.delete(requestId);resolve(v)}});
  window.dispatchEvent(new CustomEvent(TOOL_EVENT,{detail:{id:requestId,targetTabId,tool,args}}));
 });
}
window.addEventListener(TOOL_RESPONSE_EVENT,event=>{const d=event?.detail||{},p=pendingTools.get(d.id);if(p)p.resolve(d.result||{ok:false,error:'empty_tool_result'})});
async function registerNavigatorTools(){
 if(toolsRegistered)return true;
 const bus=await waitGlobal(()=>window.GTHINK_UNIVERSAL_TOOL_BUS,15000);if(!bus?.registerTool)return false;
 const explicitOpen=/\b(ouvre|open|va sur|navigue|suis le lien|ouvre le lien|clique le lien)\b/;
 const specs=[
  {name:'navigator_page_snapshot',description:'Lit à la demande le titre, URL, sélection, texte visible et quelques liens de la page web actuellement accompagnée par GThink Navigator.',parameters:{type:'object',properties:{mode:{type:'string',enum:['auto','selection','page']}},additionalProperties:false},execute:(args)=>callNavigatorTool('navigator_page_snapshot',args)},
  {name:'navigator_list_links',description:'Liste les liens visibles de la page courante afin d’aider à se repérer sans cliquer.',parameters:{type:'object',properties:{limit:{type:'integer'}},additionalProperties:false},execute:(args)=>callNavigatorTool('navigator_list_links',args)},
  {name:'navigator_find_text',description:'Cherche un texte dans la page courante, le sélectionne et le fait apparaître à l’écran. Action locale de navigation sans clic.',parameters:{type:'object',properties:{query:{type:'string',maxLength:300}},required:['query'],additionalProperties:false},execute:(args)=>callNavigatorTool('navigator_find_text',args)},
  {name:'navigator_scroll',description:'Fait défiler la page courante vers le haut, le bas, le début ou la fin.',parameters:{type:'object',properties:{direction:{type:'string',enum:['up','down','top','bottom']},amount:{type:'string',enum:['small','page']}},required:['direction'],additionalProperties:false},execute:(args)=>callNavigatorTool('navigator_scroll',args)},
  {name:'navigator_open_link',description:'Ouvre un lien visible correspondant au texte demandé. N’utiliser que si l’utilisateur demande explicitement d’ouvrir, naviguer ou suivre ce lien.',parameters:{type:'object',properties:{query:{type:'string',maxLength:500}},required:['query'],additionalProperties:false},risk:'controlled_action',requiresExplicit:explicitOpen,execute:(args)=>callNavigatorTool('navigator_open_link',args)}
 ];
 for(const spec of specs){try{bus.registerTool(spec)}catch(error){if(!/invalid_tool|already|exists/i.test(clean(error?.message||error)))console.warn('[GThink Navigator] tool register',spec.name,error)}}
 toolsRegistered=true;return true;
}
function promptFrom(request){
 const c=request?.context||{},selection=clean(c.selection),text=clean(c.text).slice(0,14000);
 return `[GTHINK NAVIGATOR · CONTEXTE DE NAVIGATION FOURNI EXPLICITEMENT]\nTitre : ${clean(c.title)||'(sans titre)'}\nURL : ${clean(c.url)||'(inconnue)'}\nMode : ${clean(c.mode)||clean(request?.contextMode)||'auto'}\nSélection : ${selection||'(aucune)'}\nExtrait visible :\n${text||'(non joint)'}\n\n[DEMANDE UTILISATEUR]\n${clean(request?.message)}\n\nTu peux utiliser les outils navigator_* pour relire la page, trouver du texte, faire défiler, lister des liens ou ouvrir un lien si l’utilisateur l’a explicitement demandé. Ne prétends jamais avoir cliqué ou navigué sans résultat d’outil.`;
}
async function processRequest(request){
 const federation=await waitGlobal(()=>window.GTHINK_PROVIDER_FEDERATION,15000);
 await registerNavigatorTools();
 if(!federation?.ask)return{ok:false,error:'gthink_provider_federation_unavailable'};
 const message=clean(request?.message);if(!message)return{ok:false,error:'empty_message'};
 activeTargetTabId=Number.isInteger(request?.sourceTabId)?request.sourceTabId:null;
 try{
  const history=Array.isArray(request?.history)?request.history.slice(-12):[];
  const result=await federation.ask(promptFrom(request),history,{surface:'gthink-navigator-addon',navigator:true,sourceUrl:clean(request?.context?.url)});
  if(result?.ok&&clean(result.text))return{ok:true,text:clean(result.text),provider:result.provider||null,model:result.model||null,webGrounded:result.webGrounded===true,sources:result.sources||[],toolCalls:result.toolCalls||0};
  return{ok:false,error:result?.error||'provider_failed',needsConnection:result?.needsConnection||null};
 }finally{activeTargetTabId=null}
}
window.addEventListener(REQUEST_EVENT,event=>{
 const d=event?.detail||{};if(!d.id)return;
 serial=serial.then(()=>processRequest(d.request||{})).catch(error=>({ok:false,error:clean(error?.message||error)||'navigator_bridge_failed'}));
 serial.then(result=>window.dispatchEvent(new CustomEvent(RESPONSE_EVENT,{detail:{id:d.id,result}})));
});
void registerNavigatorTools();
})();