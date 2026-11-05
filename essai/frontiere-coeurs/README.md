# Frontière provisoire des cœurs · C-BORDER/1

**Statut : candidat expérimental isolé, sans liaison réseau ni activation du GThink privé.**

Cette surface publique propose un passage **manuel et local** entre trois identités connues : `GTHINK_PUBLIC`, `GTHINK_PRIVATE` et `GTHINK_IMAGE`. Elle ne remplace ni les cœurs, ni leur autorité, ni le Method Router canonique de GVault.

## Accès libre-service

Ouvrir [l'interface](index.html), choisir le cœur de départ, la destination, le type de signal et la limite de sauts, puis préparer la trame. On peut copier ou exporter le résultat, ou coller une trame reçue pour la faire contrôler localement.

Les trois points « deal » sont :

- **C-01 · Grammaire :** version et nombre exact de champs.
- **C-02 · Douane :** identités différentes, types autorisés, identifiant corrélatif et TTL de 1 à 3.
- **C-03 · Reçu local :** accepte/refuse la *syntaxe* sans déclarer qu'un destinataire a répondu.

Format strict : `C-BORDER/1|FROM|TO|KIND|NONCE|TTL`

Exemple public, sans données privées :

```text
C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|0123456789abcdef|2
```

Seuls les signaux `HELLO`, `CAPABILITY`, `EVIDENCE_REF`, `ACK` et `STOP` sont autorisés. Le champ `NONCE` fait exactement 16 caractères hexadécimaux minuscules ; il distingue les messages, **mais n'est ni un secret ni une signature**. Le protocole n'accepte aucun champ de texte libre, code exécutable, token, mot de passe, contenu de conversation ou adresse.

## Version C11 autonome

Le fichier [`c_border.c`](c_border.c) est un validateur de paquets standard C, sans bibliothèque tierce, socket ou accès à un dépôt.

Sous Linux ou dans Termux (avec un compilateur C installé) :

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -o c_border c_border.c
./c_border --self-test
printf '%s\n' 'C-BORDER/1|GTHINK_PUBLIC|GTHINK_IMAGE|HELLO|0123456789abcdef|2' | ./c_border --validate
```

Le test de référence doit afficher `SELF_TEST_PASS:8` ; un paquet autorisé affiche `LOCAL_ACCEPT:validation_only` et un paquet refusé quitte avec code 2. La validation locale n'est **pas** une authentification, une livraison distante ou la preuve d'un transit entre cœurs.

## Frontière et autorité

- GThink reste orchestrateur et le Method Router privé conserve la politique de routage.
- Les identités des cœurs, leur état et leur provenance restent distincts. Aucun `main` privé n'est muté.
- Aucun secret, verbatim, contenu brut ou état des cœurs n'est lu, demandé ou transmis par cette interface.
- Les postes C ne réinterprètent pas une demande et ne déclenchent pas de GitHub Action.
- La passerelle est **provisoire, explicite et sans état**. Fermer la page suffit à arrêter son usage.
- La publication d'un fichier dans un dépôt public ne doit jamais être prise pour une preuve que le cœur privé est joignable.

Voir [le contrat détaillé](contract.v1.json), puis les contrats canoniques du dépôt privé `Gvault` : `ops/p2p/GVAULT_P2P_BLOB_MESH.contract.v1.json`, `ops/isolation/isolation-semantics.v1.json` et `ops/method-router/dual-core-conversation.binding.v1.json`.

## Pour une vraie connexion future

Il faudrait un adaptateur de transport **séparé**, authentifié côté serveur, avec consentement explicite de chaque cœur, contrôles de provenance, anti-rejeu, expiration, traces minimales et preuves de livraison. Rien de cela n'est activé ici. Ne jamais utiliser la trame seule comme autorisation.

Cette expérience n'effectue aucune modification sur `GvaultStable`, les manifestes chiffrés, les payloads Vault ou les workflows existants.


## Passerelle locale TIC/TAC : connexion volontaire des deux pages

1. Ouvrir [l'alphabet C-LETTER/1](alphabet.html) et [la frontière C-BORDER/1](index.html) dans deux onglets de **la même origine** et du même navigateur.
2. Cliquer sur **Ouvrir le récepteur local** côté frontière, puis **Activer le relais local** côté alphabet.
3. Appuyer sur une lettre ou faire circuler un besoin. TIC et TAC restent alternés : le récepteur affiche la catégorie et une trame validée, puis renvoie seulement un reçu **de page à page**.
4. Fermer l'un des récepteurs pour couper le flux. Aucun déclenchement automatique au démarrage, aucune file d'attente persistante.

Le canal est un `BroadcastChannel` du navigateur. Il ne traverse **aucun réseau** et ne relie pas réellement les processus `GTHINK_PRIVATE`, `GTHINK_IMAGE` ou `GTHINK_PUBLIC`. Les noms de cœurs dans la trame sont des **étiquettes logiques**. Un reçu est auto-déclaré par une page du même site, non signé et non authentifié : ce n'est ni un ACK d'un cœur réel ni une preuve de provenance forte.

Le message C-BORDER/1 reste limité à six champs. Un enrobage local strictement typé ajoute seulement `need` (une des huit catégories fixes) et `phase` (TIC ou TAC). **Les lettres, phrases, lexiques, concepts exacts, tokens privés, identifiants et mots inconnus ne circulent jamais.**

Les huit catégories : `HEART_TICK`, `LETTER_POINT`, `LANGUAGE_CONCEPT`, `OPAQUE_UNKNOWN`, `BOUNDARY_CHECK`, `PROVENANCE_CHECK`, `CONSENT_REQUIRED`, `LOAD_LIMIT`. La classification est indicative. Elle n'autorise aucune méthode, exécution ou écriture dans les cœurs. Un maximum de **32 signaux par seconde par émetteur** réduit les rafales ; rejet de doublon par identifiant dans une fenêtre bornée et aucune retransmission automatique.

Voir [contrat du relais local](local-gateway.contract.v1.json), [implémentation](local-gateway.js) et [tests](local-gateway.test.mjs).

Test de régression depuis un checkout du dépôt avec Node 20+ :

```sh
node --test essai/frontiere-coeurs/local-gateway.test.mjs
```

Selon le navigateur mobile, un onglet en arrière-plan peut être suspendu : un signal émis ne garantit donc pas de réponse de la deuxième page. Pour un transport réel entre cœurs, il faut une couche séparée et authentifiée avec consentement et preuves de livraison.
