# 04 — Les vues graphiques

> Statut : proposition.

Quatre vues canoniques, **générées depuis le graphe**, réutilisables sur toutes
les familles. Pas de schéma dessiné à la main : un schéma manuel diverge du
texte dès la première mise à jour, et n'est pas réutilisable.

## V1 — Carte des pouvoirs : « qui décide quoi »

Acteurs et compétences. Répond à la question 1.

Forme : arbre ou matrice acteurs × compétences, avec le partage de compétences
rendu explicite (une compétence peut avoir plusieurs détenteurs, c'est le cas
le plus fréquent et le plus mal compris).

Exemple : « L'eau : qui capte, qui distribue, qui fixe le prix, qui contrôle. »

## V2 — Chronologie de procédure : « quand, et combien de temps »

Le processus en étapes, avec les délais à l'échelle et les acteurs en couloirs.
Répond à la question 3.

C'est la vue la plus utile du site, parce que les délais sont invisibles dans
les sources textuelles et déterminants pour l'usager. Elle doit distinguer
visuellement le délai *légal maximum*, le délai *observé*, et le délai
*indicatif*.

## V3 — Flux : « d'où vient l'argent »

Diagramme de flux (type Sankey) argent / information / autorisation. Répond à
la question 2. Sert aussi bien un budget communal qu'une chaîne de valeur
(famille C) ou un financement d'influence (famille D).

## V4 — Fenêtres d'action : « où puis-je agir »

**La vue signature.** Une frise du processus sur laquelle sont posées les
fenêtres d'intervention citoyenne : ce qui est ouvert, jusqu'à quand, auprès de
qui, avec quelle difficulté. Répond à la question 5.

C'est la seule des quatre qu'aucun site institutionnel ne propose. Si une seule
vue doit être excellente, c'est celle-là.

## Règles de conception

**Accessibilité — non négociable.** Tout schéma doit :
- exister en **version tableau** équivalente (repliée, mais dans le DOM) ;
- ne pas coder d'information uniquement par la couleur ;
- rester lisible en 320 px de large — beaucoup d'usagers arrivent sur mobile,
  souvent en situation d'urgence.

**Un schéma doit se comprendre sorti de sa page.** Il sera capturé et partagé.
Il porte donc son titre, sa date de vérification et l'URL de la fiche.

**Le schéma est un point d'entrée, pas une illustration.** Chaque nœud est
cliquable et mène à la fiche de l'acteur, de l'étape ou du levier.

**Densité maîtrisée.** Au-delà d'une dizaine de nœuds visibles, on découpe la
fiche. Un schéma illisible est pire qu'un paragraphe.

## Mise en œuvre technique

| Vue | Rendu | Remarque |
|---|---|---|
| V1 | SVG généré (D3 ou code maison) | statique, pas d'interaction complexe |
| V2 | SVG généré, échelle temporelle | attention au responsive : basculer en liste verticale sur mobile |
| V3 | Sankey (d3-sankey) | fallback tableau obligatoire |
| V4 | SVG généré maison | c'est notre différenciateur : ne pas déléguer à une bibliothèque générique |

Mermaid reste utile pour la **documentation interne** (comme ici) et les
brouillons éditoriaux, mais pas pour le rendu final : trop peu de contrôle sur
la typographie, l'accessibilité et le responsive.

Rendu **au build**, pas dans le navigateur : les schémas doivent être visibles
sans JavaScript, indexables, et instantanés.
