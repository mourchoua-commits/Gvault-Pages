(()=>{'use strict';
const VERSION='1.0.0';
const SCHEMA='GVAULT_PUBLIC_CHATGPT_IMAGE_BRIDGE_V1';
const RESULT_SCHEMA='GVAULT_PUBLIC_CHATGPT_IMAGE_RESULT_LINK_V1';
const IMAGE_NOUN_RE=/\b(?:image|images|photo|photos|picture|pictures|illustration|illustrations|portrait|portraits|affiche|affiches|poster|posters|logo|logos|ic[oô]ne|ic[oô]nes|icon|icons|dessin|dessins|artwork|visuel|visuels|scene|sc[eè]ne)\b/i;
const GENERIC_CREATE_RE=/\b(?:g[eé]n[eè]re(?:r)?|g[eé]n[eè]rer|cr[eé]e(?:r)?|cr[eé]er|fabrique(?:r)?|produi(?:s|re)|rends?|render|renders?|generate|generates?|create|creates?|design|visuali[sz]e|visualiser|fais|faire|make)\b/i;
const DIRECT_DRAW_RE=/\b(?:dessine|dessiner|draw|draws|sketch|peins|peindre|paint)\b/i;
const EDIT_RE=/\b(?:modifie|modifier|retouche|retoucher|[ée]dite|[ée]diter|transforme|transformer|restyle|restylise|restyliser|ajoute|ajouter|enl[eè]ve|enlever|supprime|supprimer|remplace|remplacer|change|changer|upscale|agrandis|agrandir|am[eé]liore|am[eé]liorer|restore|restaure|restaurer|remove|add|replace|edit|modify|transform)\b/i;
const SELF_RE=/\b(?:moi|me|myself|mon visage|ma t[eê]te|mon portrait|de moi|my face|portrait of me|image of me|photo of me)\b/i;
const enc=new TextEncoder();
const executed=new Set();
let nativeFetch=null,installed=false,lastEnvelope=null,lastResult=null;
function clean(v){return String(v??'').trim()}
function uniq(values){return [...new Set((Array.isArray(values)?values:[]).map(clean).filter(Boolean))]}
function attachmentRefs(body={}){
 const refs=[];const images=[];
 const scan=(value)=>{
  if(!value)return;
  if(typeof value==='string'){if(/^https?:|^blob:|^data:image\//i.test(value))refs.push(value);return}
  if(Array.isArray(value)){for(const item of value)scan(item);return}
  if(typeof value!=='object')return;
  const type=clean(value.type||value.mimeType||value.contentType||value.mediaType);
  const url=clean(value.url||value.href||value.ref||value.id||value.fileId||value.file_id);
  if(url)refs.push(url);
  if(/^image\//i.test(type)||value.kind==='image'||value.image===true)images.push(url||type||'image');
 };
 scan(body.attachments);scan(body.images);scan(body.imageTargetRefs);scan(body.context?.attachments);scan(body.context?.imageTargetRefs);
 return {refs:uniq(refs),hasImageTarget:images.length>0||uniq(refs).some(x=>/image|photo|picture|blob:|data:image\//i.test(x))};
}
function classify(input,options={}){
 const value=clean(input),imageRefs=uniq(options.imageTargetRefs),hasImageTarget=options.hasImageTarget===true||imageRefs.length>0,hasUserImage=options.hasUserImage===true||hasImageTarget;
 const selfRendition=options.selfRendition===true||SELF_RE.test(value),directDraw=DIRECT_DRAW_RE.test(value),imageNoun=IMAGE_NOUN_RE.test(value),genericCreate=GENERIC_CREATE_RE.test(value),editVerb=EDIT_RE.test(value);
 let mode='NONE',state='NO_IMAGE_TOOL_INTENT',toolEligible=false,reason='no explicit host image-generation intent';
 if(editVerb&&(imageNoun||hasImageTarget)){
  mode='EDIT';
  if(!hasImageTarget){state='TARGET_REQUIRED';reason='image edit requested but no usable image target is attached'}
  else{state='READY';toolEligible=true;reason='explicit image edit with usable target'}
 }else if(directDraw||(genericCreate&&imageNoun)){
  mode='GENERATE';
  if(selfRendition&&!hasUserImage){state='USER_IMAGE_REQUIRED';reason='self-rendition requires a user image before host generation'}
  else{state='READY';toolEligible=true;reason=directDraw?'direct drawing request':'explicit create/generate/make intent paired with image subject'}
 }
 return Object.freeze({schema:'GVAULT_CHATGPT_IMAGE_INTENT_V1',mode,state,toolEligible,hasImageTarget,hasUserImage,selfRendition,reason});
}
async function sha256(value){
 try{const out=await crypto.subtle.digest('SHA-256',enc.encode(String(value??'')));return Array.from(new Uint8Array(out),b=>b.toString(16).padStart(2,'0')).join('')}
 catch{return null}
}
function gthinkReady(){return !!(window.GTHINK_DUAL_KERNEL_ROUTER_V4||window.GTHINK_DUAL_KERNEL_ROUTER||window.GTHINK_PUBLIC_RESPONDER||window.GVAULT_AGENT_LIVE_BLOB)}
function pageProof(){const s=window.GVAULT_PUBLIC_PAGE_BLOB?.snapshot?.();return s?{snapshotBlobId:s.snapshotBlobId||null,snapshotSha256:s.snapshotSha256||null,domSha256:s.document?.domSha256||null}:null}
function emit(kind,payload={}){
 try{const bus=window.GVAULT_AGENT_LIVE_BLOB;if(!bus?.speak)return;bus.speak({schema:'GVAULT_UNIVERSAL_BLOB_V1',blobId:`blob:public:image-bridge:${crypto.randomUUID?.()||Date.now()}`,conversationId:'gvault-public-image-bridge',kind,role:'runtime',from:'GVAULT_PUBLIC_IMAGE_BRIDGE',to:'public.bus',intent:'chatgpt_image_host_handoff',language:'fr',at:new Date().toISOString(),surface:'Gvault-Pages',streamUrl:bus.streamUrl,text:'GVAULT image bridge event',payload:{...payload,schema:SCHEMA,version:VERSION},silent:true,muted:false})}catch{}
}
async function buildEnvelope(message,body={}){
 const attachments=attachmentRefs(body);
 const explicitRefs=uniq([...(body.imageTargetRefs||[]),...(body.context?.imageTargetRefs||[]),...attachments.refs]);
 const intent=classify(message,{imageTargetRefs:explicitRefs,hasImageTarget:attachments.hasImageTarget,hasUserImage:attachments.hasImageTarget});
 if(intent.mode==='NONE')return null;
 const core={message:clean(message),mode:intent.mode,state:intent.state,imageTargetRefs:explicitRefs,transparentBackgroundRequested:body.transparentBackground===true||body.context?.transparentBackground===true,styleTransferRequested:body.styleTransfer===true||body.context?.styleTransfer===true,requestedSize:body.size||body.context?.size||null};
 const requestSha256=await sha256(JSON.stringify(core));
 const executeOnceKey=`post-response-image:${requestSha256||clean(message).slice(0,64)}`;
 const ready=intent.state==='READY';
 return Object.freeze({schema:SCHEMA,version:VERSION,requestSha256,executeOnceKey,state:ready?'POST_RESPONSE_IMAGE_HOST_HANDOFF_READY':intent.state,postResponseOnly:true,textResponseMustPrecedeImage:true,hostToolInvocationBudget:ready?1:0,hostToolInvocationCount:0,executor:ready?'CHATGPT_NATIVE_IMAGE_GENERATION':null,executorAuthority:'HOST_CHATGPT_ONLY',localImageExecutor:false,intent,request:Object.freeze(core),firstCore:Object.freeze({authority:'GTHINK_METHOD_ROUTER',publicRuntimeDetected:gthinkReady(),intentCandidateVerified:intent.toolEligible===true}),secondCore:Object.freeze({authority:'CAPTURE_PROOF_CONTEXT',publicPageProof:pageProof(),contextReady:true,visualSimulationAdvisoryOnly:true}),boundaries:Object.freeze({noAutomaticExternalProviderFallback:true,noFabricatedImageTarget:true,noFabricatedVisualSourceData:true,hostGeneratedMediaIsNotBlobTruth:true})});
}
function answerText(data){return clean(data?.text||data?.answer||data?.message||data?.blob?.display||data?.blob?.text||data?.pair?.responseBlob?.display||data?.pair?.responseBlob?.text)}
function publishReady(envelope,responseData){
 if(!envelope||envelope.state!=='POST_RESPONSE_IMAGE_HOST_HANDOFF_READY'||executed.has(envelope.executeOnceKey))return;
 const detail=Object.freeze({schema:'GVAULT_POST_RESPONSE_IMAGE_TASK_V1',state:'POST_RESPONSE_IMAGE_READY',executeOnceKey:envelope.executeOnceKey,requestSha256:envelope.requestSha256,postResponseOnly:true,textResponseMustPrecedeImage:true,hostToolInvocationBudget:1,hostToolInvocationCount:0,executor:'CHATGPT_NATIVE_IMAGE_GENERATION',executorAuthority:'HOST_CHATGPT_ONLY',assistantResponseObserved:true,assistantTextSha256:null,assistantText:answerText(responseData),request:envelope.request,intent:envelope.intent,firstCore:envelope.firstCore,secondCore:envelope.secondCore});
 void sha256(detail.assistantText).then(h=>{
  const withHash=Object.freeze({...detail,assistantTextSha256:h});lastEnvelope=withHash;
  try{window.dispatchEvent(new CustomEvent('gvault:post-response-image-ready',{detail:withHash}))}catch{}
  emit('image.post_response.ready',{requestSha256:withHash.requestSha256,executeOnceKey:withHash.executeOnceKey,state:withHash.state,assistantTextSha256:h});
 });
}
function linkResult(result={}){
 const envelope=result.envelope||lastEnvelope;if(!envelope?.executeOnceKey)throw new Error('POST_RESPONSE_IMAGE_TASK_REQUIRED');
 const resultRef=clean(result.resultRef||result.mediaRef||result.id||result.url);if(!resultRef)throw new Error('IMAGE_RESULT_REF_REQUIRED');
 executed.add(envelope.executeOnceKey);
 const linked=Object.freeze({schema:RESULT_SCHEMA,version:VERSION,state:'POST_RESPONSE_IMAGE_LINKED',requestSha256:envelope.requestSha256||null,executeOnceKey:envelope.executeOnceKey,imageResultRef:resultRef,ordering:'ASSISTANT_FINAL_THEN_IMAGE',hostGeneratedMediaIsNotBlobTruth:true,at:new Date().toISOString()});lastResult=linked;
 try{window.dispatchEvent(new CustomEvent('gvault:post-response-image-linked',{detail:linked}))}catch{}
 emit('image.post_response.linked',linked);return linked;
}
function installFetchLayer(){
 if(installed||window.__GVAULT_PUBLIC_IMAGE_BRIDGE_FETCH_V1)return true;
 nativeFetch=window.fetch.bind(window);
 const wrapped=async function(input,init){
  let next=init,envelope=null,isChat=false;
  try{
   const url=typeof input==='string'?input:String(input?.url||''),method=String(init?.method||input?.method||'GET').toUpperCase();
   isChat=method==='POST'&&/\/api\/vault\/chat(?:\?|$)/.test(url);
   if(isChat&&typeof init?.body==='string'){
    const body=JSON.parse(init.body);
    if(body&&typeof body==='object'&&typeof body.message==='string'){
     envelope=await buildEnvelope(body.message,body);
     if(envelope){body.imageBridge=envelope;body.context={...(body.context&&typeof body.context==='object'?body.context:{}),publicImageBridge:SCHEMA,postResponseImage:envelope};next={...init,body:JSON.stringify(body)};emit('image.intent.detected',{requestSha256:envelope.requestSha256,state:envelope.state,mode:envelope.intent.mode})}
    }
   }
  }catch(e){console.warn('GVAULT image bridge request graft skipped',e)}
  const response=await nativeFetch(input,next);
  if(isChat&&envelope){try{const data=await response.clone().json();setTimeout(()=>publishReady(envelope,data),0)}catch{}}
  return response;
 };
 try{window.fetch=wrapped;window.__GVAULT_PUBLIC_IMAGE_BRIDGE_FETCH_V1=true;installed=true;return true}catch{return false}
}
function status(){return Object.freeze({schema:SCHEMA,version:VERSION,installed:!!window.__GVAULT_PUBLIC_IMAGE_BRIDGE_FETCH_V1,gthinkRuntimeDetected:gthinkReady(),postResponseOnly:true,localImageExecutor:false,executorAuthority:'HOST_CHATGPT_ONLY',lastTask:lastEnvelope,lastResult,executedCount:executed.size})}
installFetchLayer();
window.addEventListener('gvault:host-image-result',e=>{try{linkResult(e.detail||{})}catch(err){console.warn('GVAULT host image result rejected',err)}});
window.GVAULT_PUBLIC_IMAGE_BRIDGE=Object.freeze({schema:SCHEMA,version:VERSION,classify,buildEnvelope,linkResult,status});
try{window.dispatchEvent(new CustomEvent('gvault:public-image-bridge-ready',{detail:status()}))}catch{}
emit('image.bridge.ready',{status:status()});
})();
