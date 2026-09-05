# 06 — Choix techniques

> Statut : **engagé** pour la phase 1. Les points listés en fin de document
> restent à trancher.

## Principe

Le contenu est l'actif du projet, pas le code. Les choix ci-dessous privilégient
donc : contenu en fichiers versionnés, site statique, dépendances minimales,
possibilité de tout reprendre ailleurs.

## Recommandation

| Besoin | Choix retenu | Pourquoi |
|---|---|---|
| Site | **Astro**, sortie statique | contenu en fichiers, validation de schéma intégrée (collections + Zod), zéro JS par défaut, excellent référencement |
| Contenu | **YAML** (données) + **Markdown** (prose) dans le dépôt | relisible, diffable, contribuable par pull request, exportable |
| Validation | schémas **Zod** + contrôles maison en CI | la ligne éditoriale devient exécutable (`03-modele-de-donnees.md`) |
| Schémas au build | SVG généré, code maison | lisible sans JS, indexable, imprimable, partageable |
| Explorateur | SVG construit côté client, **sans bibliothèque** | la navigation *est* le produit ; d3-force a été écarté (voir plus bas) |
| Couleurs | palette validée, 3 teintes porteuses d'identité | vérifiée au validateur, pas à l'œil — voir `04-graphiques.md` |
| Recherche | **Pagefind** (index statique) | pas de serveur, suffisant jusqu'à plusieurs milliers de pages — *pas encore branché* |
| Hébergement | Cloudflare Pages ou Netlify | statique, gratuit à cette échelle, déploiement sur push |
| Analytique | Plausible ou Umami, sans cookie | cohérent avec le propos du site |
| Phase 4 | **Supabase** (Postgres + pgvector + stockage) | seul moment où un backend devient nécessaire |

## Alternatives écartées, et pourquoi

- **WordPress / un CMS classique** : contenu prisonnier d'une base, pas de
  validation structurelle, schémas ingérables. Le modèle de données est le cœur
  du projet, un CMS de blog le rend impossible.
- **Next.js / application rendue côté client** : complexité et coût
  d'exploitation sans contrepartie pour un site de contenu.
- **Notion / Airtable comme source** : confortable au début, verrouillant
  ensuite, et incompatible avec la contribution externe par pull request.
- **Mermaid en rendu final** : pratique pour la documentation, insuffisant en
  typographie, accessibilité et responsive pour la production.
- **d3-force / un moteur de graphe** : une disposition par forces est jolie en
  démonstration et mauvaise ici. Elle est non déterministe — la même donnée
  donne deux images différentes, donc rien n'est citable ni comparable — et elle
  ignore l'information la plus utile de ce réseau : l'échelon. Nos deux
  dispositions sont calculées (colonnes par échelon, puis radiale), en une
  centaine de lignes, sans dépendance.

## Une exception assumée au « pas de JavaScript »

La phase 0 avait tranché pour un site statique sans JS. Ce choix valait pour un
site de contenu ; ici la navigation dans le graphe **est** le produit, et elle
demande du code côté client.

Le repli reste complet : chaque nœud a sa page rendue au build, avec son schéma
de voisinage en SVG, ses relations en liste et ses liens sortants. La carte a
son équivalent textuel dans un `<noscript>`. Les moteurs de recherche et les
navigateurs sans JS voient tout le réseau.

## Points à trancher

1. **Licence.** Proposition : contenu en **CC BY-SA 4.0** (compatible avec la
   réutilisation depuis et vers Wikipédia), code en **MIT**. À confirmer : une
   licence *share-alike* impose la réciprocité aux réutilisateurs, ce qui est
   sans doute souhaitable ici, mais freine certains usages commerciaux (presse).
2. **Dépôt public ou privé.** Public dès maintenant permet la contribution et
   la crédibilité ; privé jusqu'à la phase 1 évite d'exposer des brouillons non
   vérifiés. Recommandation : **public dès la phase 1 publiée**.
3. **Langue.** Français uniquement au départ ; le modèle de données est agnostique
   mais le contenu est intrinsèquement lié au droit français.
4. **Nom des URL.** Stables et lisibles : `/rouages/permis-de-construire`. Une
   URL publiée ne change jamais (redirection sinon).

## Structure du dépôt

```
contenu/                  tout le YAML, à n'importe quelle profondeur
  sources.yaml            les pages de référence — le contenu du site
  acteurs.yaml
  competences.yaml
  flux.yaml
  processus/*.yaml        un fichier par processus (étapes + leviers)
src/
  modele/     schemas.ts (Zod) · graphe.ts (chargement, intégrité) · reseau.ts (nœuds et arêtes)
  client/     explorateur.ts — la carte et le focus
  vues/       voisinage, chronologie, fenêtres d'action — SVG au build
  pages/      index (l'explorateur) · n/[id] (une page par nœud) · methode
scripts/valider.ts        la ligne éditoriale, exécutable
docs/                     décisions et cadrage
```

Un fichier par type d'entité : le réseau se lit et se relit par catégorie, et
les processus, qui portent beaucoup plus de détail, restent isolés.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur local |
| `npm run valider` | structure, références, règles éditoriales |
| `npm run valider -- --liens` | vérifie en plus que les URL des sources répondent |
| `npm run fraicheur` | échoue si une fiche a dépassé sa date de revérification |
| `npm run build` | valide puis génère le site statique |
