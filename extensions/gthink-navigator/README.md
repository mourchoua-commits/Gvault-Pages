# GThink Navigator

Prototype WebExtension qui transforme `VAULT AGENT // LIGHT` en compagnon de navigation sans refaire son interface.

## Architecture

`page courante -> content.js -> background.js -> onglet-coeur GVAULT -> bridge-isolated.js -> bridge-main.js -> GThink Provider Federation + Universal Tool Bus -> retour même page`

Le coeur GVAULT reste dans un onglet `https://mourchoua-commits.github.io/Gvault-Pages/`. L'extension ne copie pas les jetons OAuth et ne les expose pas aux pages visitées. Si Hugging Face/OpenRouter sont autorisés dans l'onglet-coeur, le navigateur les utilise par relais. Sinon le coeur peut rester local/fallback selon ses capacités.

## Ce que l'extension sait faire en V0.1

- afficher un petit orb GThink sur les pages `http/https` ;
- dialoguer sans quitter la page ;
- joindre la sélection ou un extrait visible uniquement au moment où l'utilisateur envoie ;
- utiliser GThink/Hugging Face/OpenRouter via l'onglet-coeur ;
- lire un snapshot de la page ;
- lister les liens visibles ;
- trouver et faire apparaître un texte ;
- faire défiler la page ;
- ouvrir un lien uniquement si la demande utilisateur contient explicitement une intention d'ouverture/navigation ;
- utiliser le menu contextuel Firefox sur une sélection ou une page.

Aucun clic générique sur bouton/formulaire n'est autorisé en V0.1. Les actions privées GVAULT restent hors du plan public et nécessitent un relais sécurisé séparé.

## Permissions

Le mode compagnon persistant utilise des content scripts sur les pages `http/https`, donc l'extension demande l'accès aux sites visités. Elle ne collecte rien en arrière-plan : la lecture du contenu utile est déclenchée par l'envoi de la demande ou par un outil GThink pendant cette demande.

## Firefox Android

La cible prioritaire est Firefox pour Android, qui prend en charge les extensions WebExtension installées depuis le gestionnaire d'extensions/AMO. Le prototype doit être empaqueté et signé/publié avant un test normal sur Firefox Android stable. Sur desktop, il peut être chargé temporairement pour le développement.

## Etat

`STAGING / NOT ANDROID E2E PASS`

La promotion sur `main` doit attendre : validation du manifest par Firefox, tests de syntaxe, test de la boucle page -> coeur -> page, puis test réel Android.
