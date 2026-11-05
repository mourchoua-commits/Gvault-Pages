# GVAULT-Pages

Projection **publique** de GVAULT, avec une page d'entrée, des démonstrations et un paquet Vault chiffré. Ce dépôt n'est **pas** le dépôt privé `Gvault`, ni la référence publique `GvaultStable`.

## Se repérer

| Emplacement | Rôle observé |
| --- | --- |
| [`index.html`](index.html) | Page publique actuelle ; reconstruit une interface depuis une version épinglée et ajoute des surfaces expérimentales. |
| [`manifest.json`](manifest.json) | Métadonnées de la publication chiffrée et références de versions. |
| `vault.<empreinte>.bin` | Paquet chiffré référencé par le manifeste. Ne pas le modifier indépendamment. |
| [`sw-gvault-v1.js`](sw-gvault-v1.js) | Service worker : cache, navigation et relais de ressources publiques. |
| [`scripts/`](scripts/) | Scripts de support et de génération ; examiner avant toute exécution. |
| [`essai/`](essai/) | Expériences et interfaces de démonstration (dont Control Tower, GAdmin, catalogue de projets et présentation GThink). Leur présence ne garantit pas leur validation en production. |
| [`Bigboy/`](Bigboy/) | Interface et manifeste d'un sous-projet public. |
| [`previews/`](previews/) | Références et aperçus de publications antérieures. |
| [`.github/workflows/`](.github/workflows/) | Automatisations GitHub : certaines peuvent écrire des commits sur `main`. |

## Les trois rôles à ne pas confondre

- **Gvault** : dépôt privé, à préserver comme source indépendante.
- **Gvault-Pages** : projection publique et terrain d'expérimentation.
- **GvaultStable** : référence publique distincte ; ne pas y recopier automatiquement les expériences de Pages.

## Repère de vérification du 5 novembre 2026

- La branche par défaut était `main`.
- Le dernier commit observé sur `main` datait du **13 septembre 2026**.
- La dernière exécution observée de déploiement GitHub Pages s'était achevée avec succès le **13 septembre 2026**. Il ne s'agit **pas** d'un test fonctionnel de toutes les pages.
- Le manifeste consulté annonçait le paquet chiffré **R5.6.2**, publié le **26 août 2026**. La date du manifeste n'est pas celle du dernier commit d'interface.

Ces informations sont un instantané d'audit, pas un indicateur vivant.

## Règles de maintenance prudente

1. Préserver les branches `backup/`, `archive/`, `reference/` et les branches expérimentales jusqu'à vérification des références et de leur utilité.
2. Ne jamais publier ici un verbatim privé, une clé secrète, un jeton, une archive déchiffrée ou des données internes.
3. Garder `manifest.json` et le paquet chiffré cohérents. Un changement de fichier `index.html` ne constitue pas, à lui seul, une nouvelle version du paquet.
4. Préparer les changements de structure sur une branche dédiée, puis les examiner en pull request avant fusion.
5. Pour les modifications d'interface ou de service worker, vérifier ensuite le déploiement et tester réellement les parcours navigateur, notamment sur mobile.

Ce document est une **carte de lecture**. Il ne certifie pas l'état de santé applicatif et ne change aucun mécanisme d'exécution.
