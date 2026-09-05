# 06 — Choix techniques

> Statut : recommandations à confirmer. Aucune n'est encore engagée.

## Principe

Le contenu est l'actif du projet, pas le code. Les choix ci-dessous privilégient
donc : contenu en fichiers versionnés, site statique, dépendances minimales,
possibilité de tout reprendre ailleurs.

## Recommandation

| Besoin | Choix proposé | Pourquoi |
|---|---|---|
| Site | **Astro**, sortie statique | contenu en fichiers, validation de schéma intégrée (collections + Zod), zéro JS par défaut, excellent référencement |
| Contenu | **YAML** (données) + **Markdown** (prose) dans le dépôt | relisible, diffable, contribuable par pull request, exportable |
| Validation | schémas **Zod** + contrôles maison en CI | la ligne éditoriale devient exécutable (`03-modele-de-donnees.md`) |
| Schémas | SVG généré **au build** (D3 côté serveur ou code maison) | lisible sans JS, indexable, imprimable, partageable |
| Recherche | **Pagefind** (index statique) | pas de serveur, suffisant jusqu'à plusieurs milliers de pages |
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

## Structure de dépôt visée

```
contenu/
  acteurs/          *.yaml
  processus/        *.yaml
  sources/          *.yaml
  fiches/           *.md      (prose, référence les entités par id)
src/
  schemas/                    (Zod : le modèle de données, exécutable)
  vues/                       (V1 à V4, génération SVG)
  pages/
docs/                         (ce dossier : décisions et cadrage)
exemples/                     (jeux d'essai du modèle)
```
