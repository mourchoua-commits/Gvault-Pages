(()=>{'use strict';
const ext=globalThis.browser||globalThis.chrome;
const GVAULT_URL='https://mourchoua-commits.github.io/Gvault-Pages/';
const BRIDGE_TIMEOUT=15000;
function clean(v){return String(v??'').trim()}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function activeTab(){const tabs=await ext.tabs.query({active:true,currentWindow:true});return tabs?.[0]||null}
async function sendTab(tabId,message){return await ext.tabs.sendMessage(tabId,message)}
async function findGvaultTab(){
 const tabs=await ext.tabs.query({});
 return tabs.find(t=>typeof t.url==='string'&&t.url.startsWith('https://mourchoua-commits.github.io/Gvault-Pages/'))||null;
}
async function waitBridge(tabId){
 const start=Date.now();
 while(Date.now()-start<BRIDGE_TIMEOUT){
  try{const r=await sendTab(tabId,{type:'gthink.bridge.ping'});if(r?.ok)return true}catch{}
  await sleep(250);
 }
 return false;
}
async function ensureHeartTab(){
 let tab=await findGvaultTab();
 if(!tab)tab=await ext.tabs.create({url:GVAULT_URL,active:false});
 if(!await waitBridge(tab.id))throw new Error('gvault_heart_unreachable');
 return tab;
}
async function askViaHeart(request){
 const heart=await ensureHeartTab();
 const result=await sendTab(heart.id,{type:'gthink.bridge.ask',request});
 if(!result)throw new Error('gvault_bridge_empty');
 if(result.ok===false&&!result.needsConnection)throw new Error(result.error||'gvault_bridge_failed');
 return result;
}
async function askFromTab(senderTab,request){
 const sourceTabId=senderTab?.id??request?.sourceTabId;
 if(!sourceTabId)throw new Error('source_tab_missing');
 return await askViaHeart({...request,sourceTabId});
}
async function executeNavigatorTool(message){
 const tabId=Number(message?.targetTabId);
 if(!Number.isInteger(tabId))return{ok:false,error:'target_tab_missing'};
 try{return await sendTab(tabId,{type:'gthink.navigator.tool.execute',tool:clean(message.tool),args:message.args||{}})}catch(error){return{ok:false,error:clean(error?.message||error)||'navigator_tool_failed'}}
}
async function toggle(tabId){try{return await sendTab(tabId,{type:'gthink.navigator.toggle'})}catch{return null}}
async function contextAsk(info,tab){
 const mode=info?.menuItemId==='gthink-selection'?'selection':'page';
 const selection=clean(info?.selectionText);
 const request={message:mode==='selection'?'Explique-moi clairement cette sélection.':'Aide-moi à comprendre cette page et dis-moi ce qui est utile ici.',contextMode:mode,selection,source:'context-menu'};
 try{
  const ctx=await sendTab(tab.id,{type:'gthink.navigator.context',mode}).catch(()=>null);
  request.context=ctx?.ok?ctx.context:null;
  if(selection&&request.context)request.context.selection=selection;
  await sendTab(tab.id,{type:'gthink.navigator.show',pending:true,prefill:request.message});
  const result=await askFromTab(tab,request);
  await sendTab(tab.id,{type:'gthink.navigator.result',result});
 }catch(error){await sendTab(tab.id,{type:'gthink.navigator.result',result:{ok:false,error:clean(error?.message||error)}}).catch(()=>{})}
}
async function setupMenus(){
 try{
  await ext.contextMenus.removeAll();
  ext.contextMenus.create({id:'gthink-selection',title:'Demander à GThink sur la sélection',contexts:['selection']});
  ext.contextMenus.create({id:'gthink-page',title:'Demander à GThink sur cette page',contexts:['page']});
 }catch{}
}
ext.runtime.onInstalled?.addListener(()=>{void setupMenus()});
ext.contextMenus?.onClicked?.addListener((info,tab)=>{void contextAsk(info,tab)});
ext.action?.onClicked?.addListener(tab=>{if(tab?.id)void toggle(tab.id)});
ext.commands?.onCommand?.addListener(async command=>{if(command!=='toggle-gthink-navigator')return;const tab=await activeTab();if(tab?.id)void toggle(tab.id)});
ext.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 const run=async()=>{
  if(message?.type==='gthink.navigator.ask')return await askFromTab(sender.tab,message.request||{});
  if(message?.type==='gthink.navigator.tool')return await executeNavigatorTool(message);
  if(message?.type==='gthink.navigator.open-heart'){
   const heart=await ensureHeartTab();await ext.tabs.update(heart.id,{active:true});return{ok:true,tabId:heart.id};
  }
  return null;
 };
 run().then(x=>sendResponse(x)).catch(error=>sendResponse({ok:false,error:clean(error?.message||error)||'background_failed'}));
 return true;
});
void setupMenus();
})();