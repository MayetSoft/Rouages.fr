# Rouages.fr

**Comprendre comment les choses fonctionnent — et où l'on peut agir.**

Rouages explique les mécanismes : qui décide, avec quel argent, selon quelle
procédure, sur quelle base légale, et à quel moment un citoyen peut intervenir.
Pas une encyclopédie de plus : une carte des rouages, avec les points d'entrée.

> État du projet : **phase 1 — première tranche verticale**. Un rouage complet
> (le permis de construire) est modélisé, validé et rendu, pour éprouver le
> format avant de l'étendre.

## La règle des cinq questions

Toute fiche répond à :

1. Qui décide ?
2. Avec quel argent ?
3. Selon quelle procédure et quel calendrier ?
4. Où est-ce écrit ?
5. **Comment puis-je intervenir — et jusqu'à quand ?**

La cinquième est la signature du projet. Une fiche qui n'y répond pas n'est pas
une fiche Rouages.

## Les familles

| | Famille | Objet | Phase |
|---|---|---|---|
| A | Rouages publics | Répartition des pouvoirs et de l'argent entre échelons | 1–2 |
| B | Rouages du quotidien | Procédures, délais, recours, entrée par la situation vécue | 1–2 |
| C | Rouages économiques | Métiers, organisations, filières, flux | 3 |
| D | Rouages de l'influence | Prebunking : mécanismes de manipulation | 3 |
| E | Outils communautaires | Délibérations, PLU, recherche de procédures | 4 |

Les quatre premières partagent **un seul modèle de données**. C'est le pari
structurant du projet.

## Documents de cadrage

| Document | Contenu |
|---|---|
| [`docs/01-vision.md`](docs/01-vision.md) | Problème, promesse, positionnement, ligne éditoriale |
| [`docs/02-familles.md`](docs/02-familles.md) | Les grandes familles, critères d'admission, granularité |
| [`docs/03-modele-de-donnees.md`](docs/03-modele-de-donnees.md) | Les sept entités, règles de validation — **le cœur** |
| [`docs/04-graphiques.md`](docs/04-graphiques.md) | Les quatre vues canoniques et leurs contraintes |
| [`docs/05-roadmap.md`](docs/05-roadmap.md) | Phases et conditions de sortie |
| [`docs/06-stack-technique.md`](docs/06-stack-technique.md) | Choix techniques proposés et alternatives écartées |
| [`docs/07-risques.md`](docs/07-risques.md) | Péremption, exactitude, neutralité, RGPD, soutenabilité |
| [`contenu/rouages/permis-de-construire.yaml`](contenu/rouages/permis-de-construire.yaml) | Le modèle éprouvé sur un cas réel |

## Faire tourner le site

```sh
npm install
npm run dev        # http://localhost:4321
npm run valider    # contrôle du contenu : sources, références, règles éditoriales
npm run build      # valide puis génère le site statique
```

Le contenu vit dans `contenu/` : un fichier YAML par rouage, les entités
partagées dans `contenu/communs/`, la prose dans `contenu/fiches/`. Les schémas
sont **générés** depuis ces données au moment du build — ils ne peuvent donc pas
diverger du texte.

`npm run valider` refuse de laisser passer une fiche sans source, sans date de
vérification, sans fenêtre d'action, ou avec une référence cassée. C'est la
ligne éditoriale, appliquée mécaniquement plutôt que par vigilance.

## Prochaine étape

Faire relire la fiche pilote par un praticien, puis construire le socle local :
commune, intercommunalité, préfet, budget, école, eau (voir
[`docs/05-roadmap.md`](docs/05-roadmap.md), phase 2).

## Licence (proposition, à confirmer)

Contenu : CC BY-SA 4.0 — compatible avec la réutilisation depuis et vers
Wikipédia. Code : MIT.
