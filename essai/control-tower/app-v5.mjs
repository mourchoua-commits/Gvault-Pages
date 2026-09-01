import './gthink-sas-v1.mjs';
await import('./app-v4.mjs');
await import('./blob-autonomy-v1.mjs');
await import('./advanced-blob-bridge-v1.mjs');
await import('./public-private-blob-chain-v1.mjs');

window.GVAULT_CONTROL_TOWER_ARCHITECTURE_V5=Object.freeze({
  schema:'GVAULT_CONTROL_TOWER_ARCHITECTURE_V5',
  fixedStructure:Object.freeze(['document-shell','top-shell','layout-shell','pane-shells','tracks-shell','terminal-shell','dialog-shells']),
  autonomousZones:Object.freeze(['kpis','toolbar','engines','events','detail','tracks','terminal']),
  arbiter:'GVAULT_GTHINK_SAS_V1',
  mesh:'GVAULT_CONTROL_TOWER_BLOB_MESH_V1',
  autonomy:'GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1',
  advanced:'GVAULT_BLOB_ADVANCED_BRIDGE_V1',
  publicPrivateBlobChain:'GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_V1',
  advancedCapabilities:Object.freeze(['QRSPRITE_CHROMA','TWITCH_DEPLOY','WORLD_IMAGE_EMBED','ACOUSTIC_PERCEPTION','VISUAL_PERCEPTION','SOLAR_DAY_NIGHT_SOUND_SIMULATION','ACCORD_CADUC_REACTION','CONSEQUENCE_FLUX','PUBLIC_GIT_CHANGELOG_INTAKE','NON_BLOB_GUARD','PUBLIC_PRIVATE_EXPLICIT_TRANSIT']),
  getState:()=>({
    gthink:window.GVAULT_GTHINK_SAS_V1?.getState?.()||null,
    mesh:window.GVAULT_CONTROL_TOWER_BLOB_MESH_V1?.getState?.()||null,
    autonomy:window.GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1?.getState?.()||null,
    advanced:window.GVAULT_BLOB_ADVANCED_BRIDGE_V1?.getState?.()||null,
    publicPrivateBlobChain:window.GVAULT_PUBLIC_PRIVATE_BLOB_CHAIN_V1?.getState?.()||null
  })
});
