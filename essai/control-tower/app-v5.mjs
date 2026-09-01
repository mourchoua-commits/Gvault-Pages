import './gthink-sas-v1.mjs';
await import('./app-v4.mjs');
await import('./blob-autonomy-v1.mjs');

window.GVAULT_CONTROL_TOWER_ARCHITECTURE_V5=Object.freeze({
  schema:'GVAULT_CONTROL_TOWER_ARCHITECTURE_V5',
  fixedStructure:Object.freeze(['document-shell','top-shell','layout-shell','pane-shells','tracks-shell','terminal-shell','dialog-shells']),
  autonomousZones:Object.freeze(['kpis','toolbar','engines','events','detail','tracks','terminal']),
  arbiter:'GVAULT_GTHINK_SAS_V1',
  mesh:'GVAULT_CONTROL_TOWER_BLOB_MESH_V1',
  autonomy:'GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1',
  getState:()=>({
    gthink:window.GVAULT_GTHINK_SAS_V1?.getState?.()||null,
    mesh:window.GVAULT_CONTROL_TOWER_BLOB_MESH_V1?.getState?.()||null,
    autonomy:window.GVAULT_CONTROL_TOWER_BLOB_AUTONOMY_V1?.getState?.()||null
  })
});
