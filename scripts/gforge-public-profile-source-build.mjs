import fs from 'node:fs';
import crypto from 'node:crypto';

const input = process.argv[2] || '/tmp/occupation_data.json';
const outDir = process.argv[3] || 'generated/gforge-profile-sources';
const source = JSON.parse(fs.readFileSync(input,'utf8'));
const rows = Array.isArray(source.row) ? source.row : [];
if (rows.length < 1000) throw new Error(`O*NET occupation rows below required floor: ${rows.length}`);

const MAJOR = {
  '11':'Management','13':'Business & Financial Operations','15':'Computer & Mathematical','17':'Architecture & Engineering','19':'Life, Physical & Social Science','21':'Community & Social Service','23':'Legal','25':'Education & Library','27':'Arts, Design, Entertainment, Sports & Media','29':'Healthcare Practitioners & Technical','31':'Healthcare Support','33':'Protective Service','35':'Food Preparation & Serving','37':'Building & Grounds Cleaning & Maintenance','39':'Personal Care & Service','41':'Sales & Related','43':'Office & Administrative Support','45':'Farming, Fishing & Forestry','47':'Construction & Extraction','49':'Installation, Maintenance & Repair','51':'Production','53':'Transportation & Material Moving','55':'Military Specific'
};
const fold = s => String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const tokens = s => [...new Set(fold(s).replace(/[^a-z0-9+#.-]+/g,' ').split(/\s+/).filter(x=>x.length>2))].slice(0,36);
const slugCode = code => String(code).replace(/[^0-9A-Za-z]+/g,'-').replace(/^-|-$/g,'').toLowerCase();

const profiles = rows.map(r => {
  const code = String(r.onetsoc_code || '').trim();
  const title = String(r.title || '').trim();
  const description = String(r.description || '').trim();
  if (!code || !title) throw new Error('Missing O*NET code/title');
  const family = MAJOR[code.slice(0,2)] || 'Other / Cross-domain';
  return {
    id:`ref-onet-${slugCode(code)}`,
    name:title,
    family:`Référence métier · ${family}`,
    role:title,
    mission:description,
    angles:['tâches et responsabilités du domaine','contraintes métier','preuves spécifiques au domaine','interfaces avec disciplines voisines'],
    methods:['profile-affinity matching','evidence-backed domain routing'],
    evidence:['O*NET-SOC code','O*NET occupation title','O*NET occupation description'],
    redFlags:['profil utilisé hors de son domaine sans contre-vérification','confusion entre intitulé métier et autorité suffisante'],
    blindSpots:['ce profil de domaine ne remplace pas les preuves propres à la tâche'],
    safetyNotes:'Profil de domaine sourcé. Les capacités opérationnelles et l’autorité d’action restent déterminées par GThink / Method Router / Profile Forge et les preuves de la tâche.',
    kind:'REFERENCE_DOMAIN_PROFILE',
    sourceDerived:true,
    source:{authority:'O*NET 31.0 Database',publisher:'U.S. Department of Labor, Employment and Training Administration',onetsocCode:code,url:`https://www.onetonline.org/link/summary/${code}`,datasetUrl:'https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json',license:'CC BY 4.0',retrievedAt:new Date().toISOString()},
    match:{keywords:[title,...tokens(title),...tokens(description).slice(0,18)],phrases:[fold(title)],priority:0.92}
  };
});

const ids = new Set(profiles.map(p=>p.id));
if (ids.size !== profiles.length) throw new Error(`Duplicate deterministic IDs: ${profiles.length-ids.size}`);

fs.mkdirSync(outDir,{recursive:true});
const catalogPath = `${outDir}/onet-31.0-profiles.json`;
const manifestPath = `${outDir}/onet-31.0-manifest.json`;
const catalog = {schema:'GFORGE_REFERENCE_PROFILE_CATALOG_V1',version:'31.0',source:'O*NET 31.0 Database',generatedAt:new Date().toISOString(),count:profiles.length,profiles};
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
const sha = crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex');
const manifest = {
  schema:'GFORGE_REFERENCE_PROFILE_SOURCE_BUILD_V1',
  generatedAt:new Date().toISOString(),
  source:{authority:'O*NET 31.0 Database',url:'https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json',officialDatabasePage:'https://www.onetcenter.org/database.html',license:'CC BY 4.0',attribution:'This build includes information from the O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under CC BY 4.0. GVAULT transforms it into routing profiles; USDOL/ETA has not approved, endorsed, or tested these modifications.'},
  inputRows:rows.length,
  outputProfiles:profiles.length,
  uniqueIds:ids.size,
  catalogSha256:sha,
  minimumRequired:1000,
  status:profiles.length>=1000?'PASS_SOURCE_COUNT':'FAIL_SOURCE_COUNT'
};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`GFORGE_ONET_SOURCE_BUILD PASS ${profiles.length} profiles sha256=${sha}`);
