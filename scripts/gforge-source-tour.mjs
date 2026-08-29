import fs from 'node:fs';
import crypto from 'node:crypto';

const outDir=process.argv[2]||'generated/gforge-source-tour';
fs.mkdirSync(outDir,{recursive:true});
const USER_AGENT='GVAULT-GForge-Research/1.0 (+https://github.com/mourchoua-commits/Gvault-Pages)';
const Q=encodeURIComponent;
const SOURCES=[
 {id:'onet31',name:'O*NET 31.0 Database',role:'PRIMARY_OCCUPATION_SOURCE',url:'https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json',kind:'json'},
 {id:'ilo-isco08',name:'ILO ISCO-08',role:'GLOBAL_OCCUPATION_CLASSIFICATION',url:'https://isco.ilo.org/en/isco-08/',kind:'html'},
 {id:'esco',name:'ESCO',role:'MULTILINGUAL_SKILL_OCCUPATION_CLASSIFICATION',url:'https://esco.ec.europa.eu/en/classification',kind:'html'},
 {id:'wikidata',name:'Wikidata Query Service',role:'GLOBAL_REFERENCE',url:`https://query.wikidata.org/sparql?format=json&query=${Q('SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o } LIMIT 1')}`,kind:'json'},
 {id:'dbpedia',name:'DBpedia SPARQL',role:'GLOBAL_REFERENCE',url:`https://dbpedia.org/sparql?format=application%2Fsparql-results%2Bjson&query=${Q('ASK { ?s ?p ?o }')}`,kind:'json'},
 {id:'openalex',name:'OpenAlex',role:'GLOBAL_SCHOLARLY_REFERENCE',url:'https://api.openalex.org/topics?per-page=1',kind:'json'},
 {id:'unesco-thesaurus',name:'UNESCO Thesaurus',role:'CONTROLLED_VOCABULARY',url:`https://vocabularies.unesco.org/sparql?query=${Q('SELECT ?s WHERE { ?s a <http://www.w3.org/2004/02/skos/core#Concept> } LIMIT 1')}&format=json`,kind:'json'},
 {id:'loc-linked-data',name:'Library of Congress Linked Data Service',role:'CONTROLLED_VOCABULARY',url:'https://www.loc.gov/apis/additional-apis/linked-data-service/',kind:'html'},
 {id:'github-topics',name:'GitHub Topics',role:'TECH_TOPIC_REFERENCE',url:'https://github.com/topics',kind:'html'},
 {id:'stackexchange-tags',name:'Stack Exchange Tags',role:'COMMUNITY_TAG_REFERENCE',url:'https://api.stackexchange.com/2.3/tags?site=stackoverflow&pagesize=10&order=desc&sort=popular',kind:'json'},
 {id:'arxiv-rss-ai',name:'arXiv cs.AI RSS',role:'RSS_FEED',url:'https://rss.arxiv.org/rss/cs.AI',kind:'rss'},
 {id:'nasa-rss',name:'NASA RSS',role:'RSS_FEED',url:'https://www.nasa.gov/feed/',kind:'rss'},
 {id:'sciencedaily-tech-rss',name:'ScienceDaily Top Technology RSS',role:'RSS_FEED',url:'https://www.sciencedaily.com/rss/top/technology.xml',kind:'rss'}
];

const fold=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,' ').replace(/&[a-z]+;/gi,' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const stop=new Set('the and for with from into over new nasa science study research using use how what why who are was were this that these those their its our your about after before more most can may has have had not but via says said'.split(/\s+/));
function rssSignals(text){
 const titles=[...text.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' '));
 const dates=[...text.matchAll(/<(?:pubDate|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|updated)>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' ').trim()).filter(Boolean);
 const counts=new Map();
 for(const t of titles.slice(1,81)) for(const token of fold(t).replace(/[^a-z0-9+#.-]+/g,' ').split(/\s+/)) if(token.length>=4&&!stop.has(token)) counts.set(token,(counts.get(token)||0)+1);
 const top=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,24).map(([term,count])=>({term,count}));
 return {itemTitleCount:Math.max(0,titles.length-1),dateMarkerCount:dates.length,latestDateMarker:dates[0]||null,derivedTopTerms:top};
}

const results=[];
for(const src of SOURCES){
 const started=Date.now();
 try{
   const r=await fetch(src.url,{headers:{'user-agent':USER_AGENT,'accept':'*/*'},redirect:'follow'});
   const buf=Buffer.from(await r.arrayBuffer());
   const text=buf.toString('utf8');
   const row={...src,httpStatus:r.status,ok:r.ok,finalUrl:r.url,contentType:r.headers.get('content-type'),bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),durationMs:Date.now()-started};
   if(src.kind==='rss') row.rss=rssSignals(text);
   if(src.id==='onet31') { try { const d=JSON.parse(text); row.occupationRows=Array.isArray(d.row)?d.row.length:null; } catch{} }
   if(src.id==='stackexchange-tags') { try { const d=JSON.parse(text); row.tagSample=(d.items||[]).slice(0,10).map(x=>({name:x.name,count:x.count})); } catch{} }
   if(src.id==='openalex') { try { const d=JSON.parse(text); row.resultCount=Array.isArray(d.results)?d.results.length:null; } catch{} }
   results.push(row);
 }catch(error){ results.push({...src,ok:false,error:String(error?.message||error),durationMs:Date.now()-started}); }
}
const sourceOk=results.filter(r=>r.ok).length;
const globalsOk=results.filter(r=>r.ok&&r.role==='GLOBAL_REFERENCE').length;
const rssOk=results.filter(r=>r.ok&&r.role==='RSS_FEED').length;
const onet=results.find(r=>r.id==='onet31');
const report={schema:'GFORGE_EXTERNAL_SOURCE_TOUR_V1',generatedAt:new Date().toISOString(),requirements:{minimumDistinctSources:12,minimumGlobalReferences:2,minimumRssFeeds:3,minimumOnetRows:1000},summary:{configuredSources:SOURCES.length,successfulSources:sourceOk,globalReferencesSuccessful:globalsOk,rssFeedsSuccessful:rssOk,onetRows:onet?.occupationRows??null},status:(sourceOk>=12&&globalsOk>=2&&rssOk>=3&&(onet?.occupationRows||0)>=1000)?'PASS':'FAIL',sources:results,storagePolicy:{rawPageBodiesPersisted:false,rawRssItemsPersisted:false,onlyHashesMetadataAndDerivedSignals:true,hiddenReasoningPersisted:false}};
fs.writeFileSync(`${outDir}/source-tour.json`,JSON.stringify(report,null,2)+'\n');
console.log('GFORGE_SOURCE_TOUR',report.status,JSON.stringify(report.summary));
if(report.status!=='PASS') process.exitCode=2;
