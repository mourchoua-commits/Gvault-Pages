import {getState,useMaster,useLocal,useRemote} from './source-router-v1.mjs';
const $=s=>document.querySelector(s);
function reloadAfter(fn){try{fn();location.reload()}catch(e){alert('SOURCE REFUSÉE · '+String(e?.message||e))}}
function mount(){
 if($('#ctSourceRouter'))return;
 const host=$('#ctVfs')||document.querySelector('.kpis')||document.querySelector('main')||document.body;
 const n=document.createElement('section');n.id='ctSourceRouter';n.innerHTML=`<style>#ctSourceRouter{margin:0 10px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:8px;font:8px ui-monospace,monospace;display:flex;gap:6px;align-items:center;flex-wrap:wrap}#ctSourceRouter b{color:var(--accent);margin-right:auto}#ctSourceRouter button{font-size:8px;padding:7px}#ctSourceState{color:var(--muted);word-break:break-all;flex-basis:100%}</style><b>SOURCE ROUTER</b><button id="ctSrcMaster">MASTER</button><button id="ctSrcLocal">LOCAL VFS</button><button id="ctSrcRemote">REMOTE</button><span id="ctSourceState"></span>`;
 host.insertAdjacentElement('afterend',n);
 $('#ctSrcMaster').onclick=()=>reloadAfter(useMaster);
 $('#ctSrcLocal').onclick=()=>reloadAfter(useLocal);
 $('#ctSrcRemote').onclick=()=>{const current=getState(),v=prompt('URL de base du feed chiffré compatible (dossier contenant latest.json)',current.mode==='REMOTE_COMPATIBLE_SOURCE'?current.baseUrl:'https://');if(!v)return;reloadAfter(()=>useRemote(v,'REMOTE'))};
 render();
}
function render(){const s=getState(),n=$('#ctSourceState');if(!n)return;n.textContent=s.mode==='REMOTE_COMPATIBLE_SOURCE'?`${s.mode} · ${s.baseUrl}`:s.mode}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('gvault:control-tower-source-changed',render);
