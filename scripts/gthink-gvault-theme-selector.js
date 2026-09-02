(()=>{'use strict';
const SCHEMA='GTHINK_GVAULT_THEME_SELECTOR_V1';
const THEME_KEY='game_vault_theme_v1';
const THEMES=[
 ['obsidian','OBSIDIAN','#090b10'],
 ['vault','COFFRE-FORT','#16130e'],
 ['light','CLAIR','#eef2f6'],
 ['neon','NÉON RÉTRO','#090610'],
 ['terminal','TERMINAL','#020604'],
 ['mono','NOIR / BLANC','#050505']
];
const IDS=new Set(THEMES.map(x=>x[0]));
const css=`
body[data-theme="obsidian"]{--gv-text:#eef4fb;--gv-muted:#8f9aad;--gv-line:#384654;--gv-panel1:#111722;--gv-panel2:#090d13;--gv-input:#060910;--gv-accent:#66e6ff;--gv-bg1:#090b10;--gv-bg2:#04060a;--gv-glow:rgba(102,230,255,.08)}
body[data-theme="vault"]{--gv-text:#efe8d5;--gv-muted:#918a76;--gv-line:#555546;--gv-panel1:#181b15;--gv-panel2:#0c0f0c;--gv-input:#050705;--gv-accent:#c8a95a;--gv-bg1:#0a0d0a;--gv-bg2:#040504;--gv-glow:rgba(200,169,90,.08)}
body[data-theme="light"]{--gv-text:#17212d;--gv-muted:#667483;--gv-line:#bcc7d1;--gv-panel1:#ffffff;--gv-panel2:#eef3f8;--gv-input:#ffffff;--gv-accent:#087d9c;--gv-bg1:#edf2f6;--gv-bg2:#dce4ec;--gv-glow:rgba(8,125,156,.08)}
body[data-theme="neon"]{--gv-text:#f6f0ff;--gv-muted:#a58fb6;--gv-line:#4a3558;--gv-panel1:#140d1d;--gv-panel2:#09060e;--gv-input:#07050b;--gv-accent:#4ff6ff;--gv-bg1:#10091a;--gv-bg2:#05030a;--gv-glow:rgba(79,246,255,.09)}
body[data-theme="terminal"]{--gv-text:#c9ffd4;--gv-muted:#6ea57b;--gv-line:#31553a;--gv-panel1:#071009;--gv-panel2:#020604;--gv-input:#010302;--gv-accent:#61ff85;--gv-bg1:#041008;--gv-bg2:#010302;--gv-glow:rgba(97,255,133,.08)}
body[data-theme="mono"]{--gv-text:#f2f2f2;--gv-muted:#8c8c8c;--gv-line:#3d3d3d;--gv-panel1:#141414;--gv-panel2:#080808;--gv-input:#030303;--gv-accent:#f2f2f2;--gv-bg1:#090909;--gv-bg2:#020202;--gv-glow:rgba(255,255,255,.04)}
html,body{color:var(--gv-text)!important;background:radial-gradient(circle at 50% -10%,var(--gv-glow) 0,transparent 32rem),linear-gradient(180deg,var(--gv-bg1),var(--gv-bg2))!important}
header,#status,footer{color:var(--gv-muted)!important}
.blob{border-color:var(--gv-line)!important;color:var(--gv-text)!important;box-shadow:0 18px 60px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.12)!important}
#userBlob{background:linear-gradient(145deg,var(--gv-panel1),var(--gv-panel2))!important}
#gthinkBlob{background:linear-gradient(215deg,var(--gv-panel1),var(--gv-panel2))!important}
textarea{background:var(--gv-input)!important;color:var(--gv-text)!important;box-shadow:inset 0 0 0 1px var(--gv-line)!important}
textarea::placeholder{color:var(--gv-muted)!important}
button{background:var(--gv-accent)!important;color:var(--gv-panel2)!important}
.stream-monitor,#responseWordFlow{background:var(--gv-panel2)!important;color:var(--gv-muted)!important;box-shadow:inset 0 0 0 1px var(--gv-line)!important}
#gvaultThemeControl{display:flex;align-items:center;gap:5px;min-width:0}
#gvaultThemeControl select{min-height:30px;max-width:138px;border:1px solid var(--gv-line);border-radius:9px;background:var(--gv-input);color:var(--gv-text);padding:0 8px;font:750 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;outline:none}
#gvaultThemeControl button{width:30px;height:30px;min-width:30px;padding:0;border:1px solid var(--gv-line);border-radius:50%;font:900 14px/1 monospace;box-shadow:none}
#gvaultThemeControl select:focus{border-color:var(--gv-accent);box-shadow:0 0 0 2px var(--gv-glow)}
@media(max-width:620px){header{flex-wrap:wrap;gap:6px}#gvaultThemeControl{order:3;width:100%;justify-content:flex-end}#gvaultThemeControl select{max-width:150px}}
`;
function safeRead(){try{return localStorage.getItem(THEME_KEY)||''}catch{return ''}}
function safeWrite(v){try{localStorage.setItem(THEME_KEY,v)}catch{}}
function applyTheme(value,{save=true,origin='gthink'}={}){const next=IDS.has(value)?value:'vault';document.body.dataset.theme=next;const sel=document.getElementById('gvaultThemeSelect');if(sel&&sel.value!==next)sel.value=next;const meta=document.querySelector('meta[name="theme-color"]');const row=THEMES.find(x=>x[0]===next);if(meta&&row)meta.setAttribute('content',row[2]);if(save)safeWrite(next);window.dispatchEvent(new CustomEvent('gthink:theme-change',{detail:{theme:next,origin,schema:SCHEMA}}));return next}
function install(){if(document.getElementById('gvaultThemeControl'))return true;const header=document.querySelector('header');if(!header)return false;if(!document.querySelector('style[data-gthink-gvault-theme]')){const s=document.createElement('style');s.dataset.gthinkGvaultTheme='V1';s.textContent=css;document.head.appendChild(s)}let meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}const wrap=document.createElement('div');wrap.id='gvaultThemeControl';wrap.setAttribute('aria-label','Thème GVAULT');const select=document.createElement('select');select.id='gvaultThemeSelect';select.setAttribute('aria-label','Choisir le thème GVAULT');for(const [id,label] of THEMES){const o=document.createElement('option');o.value=id;o.textContent=label;select.appendChild(o)}const cycle=document.createElement('button');cycle.type='button';cycle.id='gvaultThemeCycle';cycle.title='Thème suivant';cycle.setAttribute('aria-label','Thème suivant');cycle.textContent='↻';wrap.append(select,cycle);const status=document.getElementById('status');header.insertBefore(wrap,status||null);select.addEventListener('change',()=>applyTheme(select.value,{save:true,origin:'gthink-selector'}));cycle.addEventListener('click',()=>{const cur=THEMES.findIndex(x=>x[0]===select.value);applyTheme(THEMES[(cur+1+THEMES.length)%THEMES.length][0],{save:true,origin:'gthink-cycle'})});applyTheme(safeRead()||document.body.dataset.theme||'vault',{save:false,origin:'gvault-storage'});return true}
window.addEventListener('storage',e=>{if(e.key===THEME_KEY&&e.newValue&&IDS.has(e.newValue))applyTheme(e.newValue,{save:false,origin:'storage'})});window.addEventListener('gvault:blop-theme-change',e=>{const t=e?.detail?.theme;if(IDS.has(t))applyTheme(t,{save:false,origin:'gvault-event'})});
if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>200)clearInterval(timer)},25)}
window.GTHINK_GVAULT_THEME_SELECTOR=Object.freeze({schema:SCHEMA,key:THEME_KEY,themes:THEMES.map(x=>x[0]),applyTheme,get current(){return document.body.dataset.theme||'vault'}});
})();