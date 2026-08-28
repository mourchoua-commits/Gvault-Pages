# GVAULT CONTROL TOWER v0.1.0

Candidate de poste de surveillance pour Gvault-Pages.

## Principes
- La page publique ne contient aucune donnée privée ni aucun token.
- L'accès au dépôt privé se fait après ouverture SAS ; le token reste uniquement en mémoire JS.
- La Vigie reste la source principale des événements normalisés. Les autres moteurs sont lus via adaptateurs en lecture seule.
- Les tags de suivi sont des objets `TRACK-*` persistés dans `vigie-state:modules/vigie/control_tower_tracks.json` si l'autorisation Git le permet, avec miroir local sans secret.
- Un tag conserve des ancres (ledgerId, Work-ID, projet, workflow, branche, etc.) et rattrape les événements correspondants à chaque refresh.
- Aucune source n'est modifiée pour satisfaire l'UI ; le terminal adapte leurs sorties.

## Moteurs branchés v0.1
Vigie, private-intake, public-stream, blob-index, conversation-ledger, git, continuity control-plane, Actions capacity, CI budget/classes, project-review, method-router, changelog provenance/versions, swarm watch/state/control.

## États de suivi
- `ACTIVE` / `PAUSED`
- `LOCAL_PENDING` : tag durable dans le navigateur, sync privée non confirmée.
- `PRIVATE_SYNCED` : registre privé écrit avec succès.

## Sécurité
Aucun token en localStorage/sessionStorage. `pagehide` efface la référence mémoire. Le registre TRACK ne conserve pas le JSON brut des événements : seulement les références, ancres, résumés et SHA utiles.
