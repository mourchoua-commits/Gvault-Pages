const REPO='mourchoua-commits/Gvault-Pages';
const BRANCH='main';
const WATCH_PATH='essai/control-tower/data/latest.json';
const API=`https://api.github.com/repos/${REPO}/commits?sha=${encodeURIComponent(BRANCH)}&path=${encodeURIComponent(WATCH_PATH)}&per_page=1`;
const LAST='gvault.controlTower.commitWatcher.last.v1';
const LEADER='gvault.controlTower.commitWatcher.leader.v1';
const CHANNEL='gvault-control-tower-commit-watcher-v1';
const NORMAL_MS=120000;
const ERROR_MS=300000;
const LEADER_MS=45000;
const id=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);
let stopped=false,timer=null,leaderTimer=null,lastCheckAt=0,lastCommit='',lastError='',remaining=null,resetAt=null,bc=null;
const validSha=s=>/^[a-f0-9]{40}$/i.test(String(s||''));
const now=()=>Date.now();
function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function readLast(){const x=readJson(LAST);return x&&validSha(x.sha)?x:null}
function setLast(sha,detectedAt=new Date().toISOString()){const x={schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCH_HEAD_V1',sha,detectedAt,path:WATCH_PATH};writeJson(LAST,x);lastCommit=sha;return x}
function leaderRecord(){return readJson(LEADER)}
function isLeader(){const x=leaderRecord();return !!x&&x.id===id&&Number(x.expiresAt)>now()}
function acquireLeader(){const x=leaderRecord();if(!x||Number(x.expiresAt)<=now()||x.id===id){writeJson(LEADER,{schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCH_LEADER_V1',id,expiresAt:now()+LEADER_MS});return true}return false}
function renewLeader(){if(stopped)return;if(acquireLeader())writeJson(LEADER,{schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCH_LEADER_V1',id,expiresAt:now()+LEADER_MS});renderStatus()}
function releaseLeader(){const x=leaderRecord();if(x?.id===id)try{localStorage.removeItem(LEADER)}catch{}}
function schedule(ms){clearTimeout(timer);if(!stopped)timer=setTimeout(tick,Math.max(5000,ms))}
function detail(extra={}){return {schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCH_EVENT_V1',repo:REPO,branch:BRANCH,path:WATCH_PATH,leader:isLeader(),lastCheckAt,lastCommit,lastError,rateLimitRemaining:remaining,rateLimitResetAt:resetAt,...extra}}
function emit(name,extra={}){const d=detail(extra);window.dispatchEvent(new CustomEvent(name,{detail:d}));try{bc?.postMessage({name,detail:d})}catch{}return d}
function statusHost(){return document.querySelector('#ctVfs .ctVfsHead')||document.querySelector('.status')||null}
function ensureStatus(){let n=document.querySelector('#ctCommitWatch');if(n)return n;const host=statusHost();if(!host)return null;n=document.createElement('span');n.id='ctCommitWatch';n.className='ctVfsState';n.style.whiteSpace='nowrap';host.appendChild(n);return n}
function renderStatus(){const n=ensureStatus();if(!n)return;const age=lastCheckAt?Math.max(0,Math.round((now()-lastCheckAt)/1000)):null;if(lastError)n.textContent=`commit watch: DEGRADED · ${lastError}`;else if(lastCommit)n.textContent=`commit watch: ${lastCommit.slice(0,10)}${age===null?'':` · ${age}s`}`;else n.textContent=isLeader()?'commit watch: attente snapshot':'commit watch: veille passive'}
async function fetchLatestCommit(){const r=await fetch(API,{cache:'no-store',credentials:'omit',headers:{'Accept':'application/vnd.github+json'}});remaining=Number(r.headers.get('x-ratelimit-remaining'));const reset=Number(r.headers.get('x-ratelimit-reset'));resetAt=Number.isFinite(reset)&&reset>0?new Date(reset*1000).toISOString():null;if(r.status===403||r.status===429){const e=new Error('RATE_LIMIT');e.retryAfter=Math.max(ERROR_MS,(reset*1000)-now()+5000);throw e}if(!r.ok)throw new Error('HTTP_'+r.status);const rows=await r.json();if(!Array.isArray(rows)||!rows.length)return null;const sha=String(rows[0]?.sha||'');return validSha(sha)?sha:null}
async function triggerSync(sha,previousSha){emit('gvault:control-tower-public-commit',{sha,previousSha});try{const api=window.GVAULT_CONTROL_TOWER_VFS_V2;if(api?.syncChain){const result=await api.syncChain({source:'commit-watcher',commitSha:sha});emit('gvault:control-tower-vfs-ingested',{sha,previousSha,result});return result}}catch(e){emit('gvault:control-tower-vfs-ingest-failed',{sha,previousSha,error:String(e?.message||e)});throw e}return null}
async function check(force=false){if(stopped)return;if(!force&&!acquireLeader()){renderStatus();return}lastCheckAt=now();try{const sha=await fetchLatestCommit();lastError='';if(!sha){emit('gvault:control-tower-commit-watch-empty');renderStatus();return}const prev=readLast()?.sha||'';lastCommit=sha;if(prev!==sha){setLast(sha);emit('gvault:control-tower-new-public-commit',{sha,previousSha:prev||null});await triggerSync(sha,prev||null)}else emit('gvault:control-tower-public-commit-same',{sha});renderStatus()}catch(e){lastError=String(e?.message||e);emit('gvault:control-tower-commit-watch-error',{error:lastError});renderStatus();throw e}}
async function tick(){if(stopped)return;renewLeader();if(!isLeader()){schedule(NORMAL_MS);return}try{await check(true);schedule(NORMAL_MS)}catch(e){schedule(Number(e?.retryAfter)||ERROR_MS)}}
function wake(){if(stopped)return;if(document.visibilityState==='visible'){renewLeader();if(isLeader())void check(true).catch(()=>{});renderStatus()}}
function stop(){if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(leaderTimer);releaseLeader();try{bc?.close()}catch{}window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
try{bc=new BroadcastChannel(CHANNEL);bc.onmessage=ev=>{const m=ev.data||{};if(m.detail?.lastCommit)lastCommit=m.detail.lastCommit;if(m.name==='gvault:control-tower-new-public-commit'||m.name==='gvault:control-tower-vfs-ingested')renderStatus()}}catch{}
const prior=readLast();if(prior)lastCommit=prior.sha;
leaderTimer=setInterval(renewLeader,Math.floor(LEADER_MS/2));window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('pagehide',stop,{once:true});
window.GVAULT_CONTROL_TOWER_COMMIT_WATCHER_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_COMMIT_WATCHER_V1',check:()=>check(true),getState:()=>detail(),stop});
setTimeout(()=>{ensureStatus();renewLeader();void tick()},800);
