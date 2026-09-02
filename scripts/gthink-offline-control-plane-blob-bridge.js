(()=>{'use strict';
const SCHEMA='GVAULT_OFFLINE_CONTROL_PLANE_BLOB_BRIDGE_V1';
const BLOB_SCHEMA='GVAULT_UNIVERSAL_BLOB_V1';
const NAME='OfflineControlPlaneBlobBridge';
const SOURCE=Object.freeze({
  repository:'mourchoua-commits/Gvault',
  branch:'offline-control-plane',
  path:'OFFLINE_NO_INTERNET_METHOD.json',
  sourceBlobSha:'5b3dbcbb5951829ea6f22a5f9bf9cb8613924a0a',
  sourceMutation:false,
  mergeRequired:false,
  branchStateRemainsSeparate:true
});
const SNAPSHOT=Object.freeze({
  blobId:'BLOB_NO_INTERNET_RESOLUTION_METHOD',
  principle:'Résoudre et reconstruire sans utiliser Internet ni aucune source externe au moment de l’exécution.',
  sourceOrder:Object.freeze([
    'current_local_state',
    'existing_blobs',
    'local_files_and_manifests',
    'snapshots_and_known_good_states',
    'hashes_and_provenance',
    'local_relations_and_routes',
    'deterministic_reconstruction'
  ]),
  method:Object.freeze([
    'freeze_current_state',
    'observe_input_and_output_without_modifying_them',
    'locate_first_divergence',
    'isolate_the_faulty_layer',
    'reconstruct_from_existing_local_evidence',
    'compare_against_known_good_local_state',
    'apply_smallest_local_patch',
    'run_local_deterministic_tests',
    'keep_rollback_snapshot',
    'promote_only_after_local_pass'
  ]),
  forbiddenRuntimeDependencies:Object.freeze([
    'web_search',
    'remote_api_required_for_reasoning',
    'remote_cdn_required_for_core_function',
    'external_model_required_for_repair',
    'network_only_fallback'
  ]),
  relayRule:Object.freeze({
    network_available:'ignored_for_core_resolution',
    network_unavailable:'same_core_path',
    external_enrichment:'optional_and_outside_core'
  }),
  networkRule:'Internet ne participe pas au noyau de décision/réparation.'
});
function uid(){return `offline-plane-${crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`}
function api(){return window.GVAULT_AGENT_LIVE_BLOB}
function makeBlob(){return {
  schema:BLOB_SCHEMA,
  blobId:'blob:gthink:offline-control-plane:v1',
  parentBlobId:null,
  conversationId:'gthink-offline-control-plane',
  kind:'gthink.offline.control-plane',
  role:'system',
  from:NAME,
  to:'GThinkPublicNative',
  intent:'provide_offline_resolution_method',
  language:'fr',
  at:new Date().toISOString(),
  surface:'Gvault-Pages',
  streamUrl:api()?.streamUrl||'gvault://blobs/public/gthink/stream',
  text:SNAPSHOT.principle,
  display:SNAPSHOT.principle,
  payload:{
    bridgeSchema:SCHEMA,
    source:SOURCE,
    snapshot:SNAPSHOT,
    canonicalBranch:'offline-control-plane',
    localSnapshot:true,
    networkRequired:false,
    sourceMutation:false,
    mergeRequired:false
  },
  understoodBy:['GThinkPublicNative','GThink','GThinkMini','public-kernel','prelistener'],
  silent:true,
  muted:false
}}
let announced=false;
function announce(){if(announced)return true;const a=api();if(!a?.speak)return false;try{a.speak({...makeBlob(),blobId:uid()});announced=true;return true}catch{return false}}
function status(){return {
  schema:SCHEMA,
  configured:true,
  ready:true,
  connected:true,
  mode:'local-blob-bridge',
  source:SOURCE,
  networkRequired:false,
  sourceMutation:false,
  mergeRequired:false,
  announced
}}
const bridge=Object.freeze({schema:SCHEMA,name:NAME,source:SOURCE,snapshot:SNAPSHOT,get blob(){return makeBlob()},announce,status});
window.GTHINK_OFFLINE_CONTROL_PLANE_BRIDGE=bridge;
window.GTHINK_OFFLINE_CONTROL_PLANE_BLOB=bridge.blob;
if(!announce()){let tries=0;const timer=setInterval(()=>{tries++;if(announce()||tries>240)clearInterval(timer)},25)}
})();
