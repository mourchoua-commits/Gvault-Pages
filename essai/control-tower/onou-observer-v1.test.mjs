import assert from 'node:assert/strict';
import {deriveOnouState,fingerprintState,fingerprintInput} from './onou-observer-v1.mjs';

const source=(engine,path,record)=>({engine,branch:'main',path,kind:'json',records:[record]});
const feed={
  schema:'GVAULT_CONTROL_TOWER_FEED_V1',
  generatedAt:'2026-08-29T03:30:00+02:00',
  source:{mainCommit:'abc',effectiveMainCommit:'abc'},
  sourceCoverage:{registryVersion:'0.8.1-lab.onou-observer'},
  sources:[
    source('onou-entry','modules/onou/gthink_entry.json',{schema:'gvault.onou.gthink_entry.v1',canonical_name:'ONOU',canonical_artifact_id:'490F4C18FB11A6EB',purpose:'Point entree GThink'}),
    source('onou-index','modules/onou/index.json',{schema:'gvault.onou.index.v2',canonical_artifacts:[{id:'490F4C18FB11A6EB',status:'ORIGINAL_VERIFIED_DEDUPED'}],daily_versions:[{day:'2026-08-28',sequence:5,status:'RECONSTRUCTED_FROM_PROOF_SENT',path:'modules/onou/versions/2026-08-28/ONOU_2026-08-28_reconstructed.json'}]}),
    source('onou-versions-manifest','modules/onou/versions_manifest.json',{schema:'gvault.onou.version_manifest.v2',genesis:{id:'490F4C18FB11A6EB',status:'ORIGINAL_VERIFIED'},versions:[{effective_day:'2026-08-28',sequence:5,status:'RECONSTRUCTED_FROM_PROOF_SENT',github_path:'modules/onou/versions/2026-08-28/ONOU_2026-08-28_reconstructed.json'}]}),
    source('onou-versions','modules/onou/versions/2026-08-27/ONOU_2026-08-27_reconstructed.json',{schema:'gvault.onou.reconstructed_capsule.v1',effective_day:'2026-08-27',sequence_after_genesis_v1:4,status:'RECONSTRUCTED_FROM_PROOF_SENT',content:'ancienne capsule'}),
    source('onou-versions','modules/onou/versions/2026-08-28/ONOU_2026-08-28_reconstructed.json',{schema:'gvault.onou.reconstructed_capsule.v1',effective_day:'2026-08-28',sequence_after_genesis_v1:5,status:'RECONSTRUCTED_FROM_PROOF_SENT',content:'capsule la plus recente',source:{type:'proof'}}),
    source('onou-sha-index','modules/onou/sha-capsules/index.json',{schema:'gvault.onou.sha_capsules.index.v2',count:152,generated_at:'2026-08-29T03:16:20+02:00',status:'PROOF_BACKED_SHA_LOCATORS'})
  ]
};

const state=deriveOnouState(feed);
assert.equal(state.available,true);
assert.equal(state.canonicalName,'ONOU');
assert.equal(state.canonicalArtifactId,'490F4C18FB11A6EB');
assert.equal(state.latest.effectiveDay,'2026-08-28');
assert.equal(state.latest.sequence,5);
assert.equal(state.latest.content,'capsule la plus recente');
assert.equal(state.shaLocators.count,152);
assert.ok(state.provenance.sourceRefs.includes('modules/onou/sha-capsules/index.json'));

const fp1=await fingerprintState(state);
const fp2=await fingerprintState(deriveOnouState(structuredClone(feed)));
assert.equal(fp1,fp2,'same ONOU state must keep same fingerprint');

const changed=structuredClone(feed);
changed.sources.find(s=>s.path==='modules/onou/sha-capsules/index.json').records[0].count=153;
const fp3=await fingerprintState(deriveOnouState(changed));
assert.notEqual(fp1,fp3,'proof/provenance change must change fingerprint');

const noDaily=structuredClone(feed);
noDaily.sources=noDaily.sources.filter(s=>!s.path.startsWith('modules/onou/versions/'));
const fallback=deriveOnouState(noDaily);
assert.equal(fallback.latest.effectiveDay,'2026-08-28');
assert.equal(fallback.latest.content,'');
assert.equal(fallback.latest.path,'modules/onou/versions/2026-08-28/ONOU_2026-08-28_reconstructed.json');

const empty=deriveOnouState({schema:'GVAULT_CONTROL_TOWER_FEED_V1',sources:[]});
assert.equal(empty.available,false);
assert.deepEqual(fingerprintInput(empty).latest,{effectiveDay:'',sequence:0,status:'',path:null,content:''});

console.log(JSON.stringify({schema:'GVAULT_ONOU_OBSERVER_TEST_RESULT_V1',status:'PASS',assertions:15,fingerprint:fp1.slice(0,16)},null,2));
