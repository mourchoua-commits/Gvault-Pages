# C-LETTER/1 · Alphabet intégral et langues de blobs

## Libre-service

Ouvrir [alphabet.html](alphabet.html) depuis un navigateur. Les **26 lettres A–Z** ont leurs stations `C_A` à `C_Z` ; les minuscules partagent la station de leur majuscule, sans perdre le caractère original. Les accents (`é` → `C_U00E9`), alphabets non latins (`Ω` → `C_U03A9`), emojis et autres scalaires Unicode ont des stations `C_U...`. Les espaces et les chiffres ont des points spécifiques. **Aucune lettre n'est interprétée comme un concept à elle seule.**

La page découpe les mots en points C et montre deux lexiques séparés, sans réunir leurs identités. Le paquet de démonstration est reconstruit de manière déterministe avec l'algorithme observé dans le moteur GVault privé, mais **emploie des identifiants fictifs**.

La traduction ne porte que sur des **concepts explicitement connus** des deux langues. Un mot inconnu est conservé comme **OPAQUE**, sans traduction inventée.

## Pont vers les langues réellement développées à l'intérieur

Le GVault privé possède maintenant une proposition d'adaptateur sur la branche expérimentale : `scripts/gvault-letter-language-points.mjs`. Il appelle `ensureBlobLanguage`, `encodeBlobConcepts` et `translateBlobLanguage` du moteur natif ; la langue propre de chaque blob est conservée.

L'export facultatif `exportPublicLetterLanguagePack({sourceBlob,targetBlob,approved:true})` exige un accord explicite et ne garde que les 18 concepts de base publics du moteur, sans ID de blob, ID de langue, texte de conversation ou preuve privée. L'export n'envoie rien : il construit un objet JSON que l'opérateur peut décider de coller dans l'interface.

Exemple autonome avec **identités fictives**, à exécuter dans un checkout autorisé du GVault privé une fois la PR expérimentale disponible :

```sh
node --input-type=module <<'NODE'
import { exportPublicLetterLanguagePack } from './scripts/gvault-letter-language-points.mjs';
const packet = exportPublicLetterLanguagePack({
  sourceBlob: { blobId: 'C_LOCAL_DEMO_SOURCE' },
  targetBlob: { blobId: 'C_LOCAL_DEMO_TARGET' },
  approved: true
});
console.log(JSON.stringify(packet,null,2));
NODE
```

Pour des blobs réels, l'appel doit se faire **dans GVault privé**, uniquement avec des objets autorisés. Un paquet collé est **structurellement vérifié mais non authentifié**.

## Version C11 compilée et testée

Le fichier [c_letters.c](c_letters.c) lit de l'UTF-8 et imprime les stations :

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic c_letters.c -o c_letters
./c_letters --self-test
printf 'Cactus é Ω 💚\n' | ./c_letters --points
```

Contrat : UTF-8 strict, maximum 512 scalaires, rejet des séquences mal formées, des surrogates et des encodages excessifs, aucun réseau ou écritures. Résultat attendu : `SELF_TEST_PASS:26_LETTERS_UTF8_AND_REJECTIONS`.

## Frontière maintenue

- La passerelle C-BORDER/1 reste **limitée à six champs, sans charge utile**. Les lettres et lexiques ne s'y transmettent pas automatiquement.
- Les langues des blobs sont distinctes ; les concepts connus sont traduits par la couche sémantique native, pas par ressemblance visuelle des lettres.
- L'arbitrage linguistique reste consultatif. Le Method Router et GThink gardent leurs responsabilités.
- Ni la page ni le C11 ne se connectent au dépôt privé. Aucune livraison entre cœurs, preuve distante ou présence permanente n'est revendiquée.
- En cas de divergence, le résultat reste opaque ou non concluant. Aucun consensus fictif.

Voir [le paquet de démonstration](public-demo-language-pack.json) et [le contrat](c-alphabet.contract.v1.json).

## Tic et petits cœurs

Chaque station affichée possède un petit cœur, ainsi que les boutons de l'alphabet et les points des mots traduits. Les frappes au clavier et les pressions sur les lettres font **battre un seul cœur par événement d'entrée**, avec un compteur temporaire « Tics ». Une saisie collée affiche un cœur sur chaque caractère mais ne déclenche qu'une pulsation visuelle pour le collage. Le compteur repart de zéro à chaque ouverture de page.

Cette représentation est **uniquement visuelle et locale** : elle ne constitue ni un battement réel des cœurs GThink, ni un heartbeat réseau, ni un accusé de réception distant. La préférence système de réduction des animations est respectée ; aucun son, stockage ou accès réseau supplémentaire.

## Relais TIC / TAC · 5 novembre 2026

Chaque événement de saisie ou interaction sur les lettres déclenche un relais **alternatif et exclusif** : TIC allumé / TAC éteint, puis TIC éteint / TAC allumé. Le compteur local progresse d'une unité par geste. Tous les mini-cœurs des stations et des lexèmes restent associés en alternance à l'une de ces deux voies ; seule la voie active est lumineuse, l'autre est réellement masquée (opacité zéro). Quand le suivant s'allume, le précédent s'éteint immédiatement. Les deux cœurs sont éteints au chargement.

Les tests simulés vérifient le cycle TIC → TAC → TIC → TAC, l'exclusion des deux états actifs simultanés et l'affectation alternée des stations. La page conserve les garde-fous existants : pas de son, pas de réseau ni de persistance ajoutés, et aucune connexion aux vrais cœurs GThink. Le paramètre de réduction des animations est toujours respecté.


## Jumelage TIC/TAC vers la passerelle, et multiplication des besoins

La page [alphabet.html](alphabet.html) et la [frontière C-BORDER](index.html) peuvent désormais se parler à travers **un relais local entre onglets du même site**. Les deux boutons d'activation doivent être pressés volontairement. Le cœur TIC s'allume lorsque TAC s'éteint, puis l'inverse. Une pulsation peut émettre l'un des huit besoins : tic, station de lettre disponible, concept linguistique connu, mot opaque inconnu, contrôle de frontière, provenance à vérifier, consentement requis ou limite de charge. Les catégories n'emportent **jamais le contenu de la lettre ou du mot**.

Les reçus signifient uniquement que le récepteur du navigateur a traité une trame, pas qu'un véritable cœur a entendu ou répondu. Le canal est de type `BroadcastChannel`, sans stockage, sans réseau ni liaison au dépôt privé. Deux onglets ouverts sous une même origine sont nécessaires ; certains téléphones suspendent les onglets inactifs.

La vérification porte sur les six champs C-BORDER/1 et deux enums locaux `need` et `phase`. Les classes sont mappées aux types autorisés `HELLO`, `CAPABILITY`, `EVIDENCE_REF` ou `STOP` sans changer le validateur en C. On ne confond donc pas un besoin d'indice avec une preuve réelle. L'ancien service manuel reste disponible.

Documentation commune : [contrat du relais](local-gateway.contract.v1.json), [tests](local-gateway.test.mjs).
