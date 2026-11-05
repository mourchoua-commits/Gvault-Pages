/* GVAULT C-LETTER/1 : alphabet public, aucune lecture privee ni transport. */
"use strict";
(() => {
  const CORE = Object.freeze("self other yes no state task data learn teach translate language message error success request response source target".split(" "));
  const SCHEMA = "GVAULT_C_ALPHABET_PUBLIC_LANGUAGE_PACK_V1";
  const DEMO = {
    schema: SCHEMA, version: 1, authority: "PUBLIC_DEMO_ONLY",
    origin: "DETERMINISTIC_RECONSTRUCTION_OF_GVAULT_ALGORITHM",
    bridgeMethod: "CANONICAL_CONCEPT_LAYER", unknownTokenPolicy: "PRESERVE_OPAQUE",
    concepts: CORE,
    languages: [
      {alias:"SOURCE",lexicon:{self:"ragatri37",other:"trizushi35",yes:"mikitri53",no:"shizuyu70",state:"miluzua4",task:"peluzu02",data:"mifitecf",learn:"naluce6e",teach:"diorna85",translate:"mivote49",language:"kiluga8e",message:"dipepe95",error:"ganasa02",success:"cesatri49",request:"dimotef6",response:"shixoun78",source:"zumika96",target:"naveyu9b"}},
      {alias:"TARGET",lexicon:{self:"kayumo20",other:"xoteor25",yes:"teyutri51",no:"momimo0b",state:"unluorc0",task:"orxopef8",data:"divoluc4",learn:"razuyub2",teach:"cevevo80",translate:"lumoce46",language:"xoramieb",message:"ornalud7",error:"shilurafc",success:"mivemi94",request:"lupeshi72",response:"gaunvoe4",source:"ganafid9",target:"unmika83"}}
    ],
    privateIdentifiersIncluded:false,privateRawTextIncluded:false,remoteDelivery:false
  };
  const el = id => document.getElementById(id);
  const stationName = ch => {
    const cp = ch.codePointAt(0);
    if ((cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122)) return "C_" + ch.toUpperCase();
    if (cp === 32) return "C_SPACE";
    if (cp === 10) return "C_NEWLINE";
    if (cp >= 48 && cp <= 57) return "C_DIGIT_" + ch;
    return "C_U" + cp.toString(16).toUpperCase().padStart(4, "0");
  };
  const stations = text => [...text.normalize("NFC")].map((char, i) => ({
    index: i, char, point: stationName(char),
    codepoint: "U+" + char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")
  }));
  let currentPack = DEMO, packKind = "demo";
  const inform = (message, error=false) => {
    el("notice").textContent = message;
    el("notice").dataset.state = error ? "error" : "ok";
  };
  function renderStations(text, destination) {
    const out=el(destination);
    out.replaceChildren();
    const items=stations(text);
    if(items.length>512) {inform("Maximum : 512 caractères Unicode par parcours.",true);return;}
    if(items.length===0){out.textContent="Aucun caractère.";return;}
    for(const item of items) {
      const cell=document.createElement("div");cell.className="char-point";
      const glyph=document.createElement("strong");glyph.textContent=item.char===" "?"␠":item.char==="\n"?"↵":item.char;
      const point=document.createElement("code");point.textContent=item.point;
      const meta=document.createElement("small");meta.textContent=item.codepoint;
      cell.append(glyph,point,meta);out.append(cell);
    }
    el("pointCount").textContent=String(items.length);
    el("lastRoute").textContent=items.map(x=>x.point).join(" → ");
  }
  function validatePack(p) {
    if(!p || typeof p!=="object" || Array.isArray(p) || p.schema!==SCHEMA ||
       p.version!==1 || p.bridgeMethod!=="CANONICAL_CONCEPT_LAYER" ||
       p.unknownTokenPolicy!=="PRESERVE_OPAQUE" ||
       p.privateIdentifiersIncluded!==false || p.privateRawTextIncluded!==false ||
       p.remoteDelivery!==false || !Array.isArray(p.languages) || p.languages.length!==2 ||
       !Array.isArray(p.concepts) || p.concepts.length<1 || p.concepts.length>CORE.length)
      throw Error("CONTRAT_INVALIDE");
    const allowed=new Set(CORE);
    if(new Set(p.concepts).size!==p.concepts.length ||
       p.concepts.some(c=>!allowed.has(c))) throw Error("CONCEPTS_NON_AUTORISES");
    for(const language of p.languages) {
      if(!language || !["SOURCE","TARGET"].includes(language.alias) || 
         !language.lexicon || typeof language.lexicon!=="object" || Array.isArray(language.lexicon))
        throw Error("LANGUE_INVALIDE");
      if(Object.keys(language.lexicon).length!==p.concepts.length ||
         p.concepts.some(concept=>typeof language.lexicon[concept]!=="string" ||
           !/^[a-z0-9]{4,32}$/.test(language.lexicon[concept])))
        throw Error("LEXIQUE_INVALIDE");
      if(new Set(Object.values(language.lexicon)).size!==p.concepts.length)
        throw Error("LEXIQUE_AMBIGU");
    }
    if(p.languages[0].alias!=="SOURCE" || p.languages[1].alias!=="TARGET")
      throw Error("ORDRE_LANGUES_INVALIDE");
    return p;
  }
  function showPack() {
    const options=currentPack.concepts.map(value=>({value,text:value}));
    el("concept").replaceChildren();
    for(const o of options){const option=document.createElement("option");option.value=o.value;option.textContent=o.text;el("concept").append(option);}
    if(options.some(o=>o.value==="message"))el("concept").value="message";
    el("packStatus").textContent=packKind==="demo"
      ? "Démonstration publique : mots issus de la formule déterministe du moteur GVault, avec identités fictives. Aucun lexique privé chargé."
      : "Paquet importé manuellement : lexiques séparés. Provenance réelle non authentifiée par cette page.";
    drawConcept();
  }
  function drawConcept() {
    const c=el("concept").value;
    const [a,b]=currentPack.languages;
    const src=a.lexicon[c] ?? "",dst=b.lexicon[c] ?? "";
    el("conceptMeaning").textContent="Concept partagé : "+c+" (sens déclaré, pas déduit des lettres)";
    el("sourceToken").textContent=src;
    el("targetToken").textContent=dst;
    const result=el("lexemeStations");result.replaceChildren();
    for(const [name,word] of [["SOURCE",src],["TARGET",dst]]) {
      const box=document.createElement("section");box.className="lexeme-lane";
      const title=document.createElement("b");title.textContent=name+" · "+word;
      const line=document.createElement("div");line.className="route";
      for(const p of stations(word)) {
        const tag=document.createElement("code");tag.textContent=p.point;line.append(tag);
      }
      box.append(title,line);result.append(box);
    }
    el("wordInput").value=src;
    translateWord();
  }
  function translateWord() {
    const original=el("wordInput").value.trim();
    const [a,b]=currentPack.languages;
    const hit=currentPack.concepts.find(c=>a.lexicon[c]===original);
    const word=hit ? b.lexicon[hit] : original;
    el("wordOutput").textContent=word || "∅";
    el("wordStatus").textContent=hit
      ? "Concept prouvé par le lexique : "+hit+" · passage vers la langue cible."
      : "OPAQUE : correspondance inconnue, aucune signification inventée.";
    const route=el("translatedRoute");route.replaceChildren();
    if([...word].length>256){route.textContent="Trop long pour afficher les stations.";return;}
    for(const s of stations(word)) {
      const code=document.createElement("code");code.textContent=s.point;route.append(code);
    }
  }
  const alphabet=el("alphabet");
  for(const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const button=document.createElement("button");button.type="button";button.textContent=char;
    button.setAttribute("aria-label","Ajouter le point C_"+char);
    button.addEventListener("click",()=>{el("phrase").value+=char;renderStations(el("phrase").value,"letterStations");});
    alphabet.append(button);
  }
  for(const char of ["É","À","Ç","È","Ê","Ü","Ω","💚"," "]) {
    const button=document.createElement("button");button.type="button";button.textContent=char===" "?"ESPACE":char;button.className="special";
    button.addEventListener("click",()=>{el("phrase").value+=char;renderStations(el("phrase").value,"letterStations");});
    alphabet.append(button);
  }
  el("phrase").addEventListener("input",()=>renderStations(el("phrase").value,"letterStations"));
  el("clear").addEventListener("click",()=>{el("phrase").value="";renderStations("","letterStations");});
  el("concept").addEventListener("change",drawConcept);
  el("wordInput").addEventListener("input",translateWord);
  el("loadDemo").addEventListener("click",()=>{currentPack=DEMO;packKind="demo";showPack();inform("Démonstration rechargée.");});
  el("import").addEventListener("click",()=>{
    const raw=el("packInput").value;
    if(raw.length>12000){inform("Paquet trop volumineux.",true);return;}
    try{
      const p=validatePack(JSON.parse(raw));
      currentPack=p;packKind="import";showPack();
      inform("Lexiques chargés en mémoire locale ; aucune requête réseau.");
      el("packInput").value="";
    }catch(e){inform("Import refusé : "+String(e.message??e),true);}
  });
  el("copyRoute").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(el("lastRoute").textContent);inform("Points copiés. Aucun transfert entre cœurs.");}
    catch{inform("Copie bloquée par le navigateur.",true);}
  });
  validatePack(DEMO);
  el("phrase").value="cactus coton écho 💚";
  renderStations(el("phrase").value,"letterStations");
  showPack();
  inform("Libre-service prêt. Les deux langues visibles sont fictives, construites avec la formule interne.");
})();
