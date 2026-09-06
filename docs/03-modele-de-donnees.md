# 03 — Modèle de données

> **C'est la décision structurante du projet.** Version exécutable :
> `src/modele/schemas.ts` ; mise en forme pour l'affichage : `src/modele/reseau.ts`.

## Le pari

Le site n'a pas d'articles. Il a **un graphe**, dont la carte, les pages de nœud
et les schémas sont des rendus.

Conséquences :

- les schémas sont **générés** depuis les données, jamais dessinés — ils ne
  peuvent pas diverger ;
- une entité est décrite une seule fois et apparaît partout où elle est reliée ;
- le prebunking (famille D) réutilisera le même schéma sans entité nouvelle ;
- les outils communautaires (phase 4) auront un graphe où s'accrocher.

## Les entités

| Entité | Ce que c'est | Rendu |
|---|---|---|
| **Acteur** | Qui agit : institution, mandat, service, entreprise, vous | nœud |
| **Compétence** | Un pouvoir de décision, attribué et souvent partagé | nœud |
| **Processus** | Une suite d'étapes datées — ce qu'un graphe ne sait pas montrer | nœud + frise |
| **Document** | Ce qui est produit ou requis, et où le trouver | nœud |
| **Flux** | Ce qui circule : argent, information | arête |
| **Levier** | Là où vous pouvez agir, et jusqu'à quand | arête depuis « Vous » |
| **Source** | Une page de référence — Wikipédia, Légifrance, open data | lien sortant |
| **Sigle** | Un acronyme et son développé | `<abbr>` au survol, partout |

**« Levier » est l'entité distinctive du projet.** Aucune source institutionnelle
ne la modélise : elles décrivent la procédure du point de vue de
l'administration. Dans le graphe, les leviers sont les arêtes qui partent du
nœud « Vous ».

## Champs communs

| Champ | Rôle |
|---|---|
| `id` | identifiant stable, jamais réutilisé |
| `nom` | libellé complet |
| `nom_court` | étiquette portée sur les schémas, où la place manque |
| `resume` | **une phrase, 280 signes maximum** — la contrainte est dans le schéma |
| `liens` | pages de référence, **au moins une** : c'est le contenu du site |
| `verifie_le` / `perime_apres_mois` | fraîcheur, contrôlée automatiquement |
| `confiance` | `etabli`, `variable_selon_territoire`, `a_confirmer` |

Deux champs méritent qu'on s'y arrête.

`resume` est **plafonné**. Sans plafond, le site redevient une encyclopédie en
six mois : chacun ajoute une précision, puis un contre-exemple, et la phrase
devient un article. La limite est dans le schéma, donc elle tient.

`confiance: variable_selon_territoire` est indispensable en France. La
répartition commune / intercommunalité dépend des transferts locaux. Prétendre à
une réponse unique serait faux ; l'afficher est utile, et c'est ce qui envoie le
lecteur vérifier son cas dans BANATIC.

## Règles de validation

Appliquées par `npm run valider`, donc par `npm run build` et par
l'intégration continue :

1. Toute entité porte au moins un lien sortant, vers une source déclarée.
2. Tout `id` référencé existe — le graphe ne peut pas mentir sur ses arêtes.
3. Tout processus a au moins une étape **et au moins un levier**.
4. Tout délai porte sa nature : `maximum_legal`, `indicatif` ou `observe`.
5. Aucun résumé ne dépasse une phrase.
6. Aucun nom de personne physique dans la famille « influence ».
7. **Tout sigle employé a son entrée au glossaire.** Toute suite d'au moins deux
   majuscules apparaissant dans un texte visible doit être définie, sinon le
   build échoue. L'administration française parle par sigles ; un sigle non
   expliqué est une porte fermée pour exactement le lecteur à qui le site
   s'adresse. La règle se renforce d'elle-même à mesure que le réseau grossit —
   elle a attrapé DGFiP dès sa mise en place.
7. Un nœud dépassant sa date de revérification déclenche un avertissement, et
   fait échouer le contrôle hebdomadaire de fraîcheur.

Ces règles sont la ligne éditoriale rendue exécutable. C'est ce qui permet
d'accepter des contributions extérieures sans relire chaque virgule.
