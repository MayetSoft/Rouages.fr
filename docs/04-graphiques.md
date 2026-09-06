# 04 — Les vues et leur encodage

Le site est une visualisation. Ce document dit ce que chaque canal graphique
signifie, et pourquoi il a été choisi.

## Un canal, une information

| Canal | Porte | Jamais |
|---|---|---|
| **Couleur** | la famille de relation | le type de nœud, l'échelon, une valeur |
| **Forme** | le type de nœud | autre chose |
| **Colonne** | l'échelon | autre chose |
| **Épaisseur** | le nombre de relations agrégées | une importance éditoriale |
| **Texte** | toujours en encre | jamais en couleur de série |

La couleur est le canal le plus rare et le plus fragile : elle est donc réservée
à l'information la plus difficile à lire autrement — quelle *sorte* de lien relie
deux nœuds. Le reste passe par des canaux qui survivent au noir et blanc, à
l'impression et au daltonisme.

## Les cinq familles de relations

| Famille | Arêtes | Rendu |
|---|---|---|
| **Pouvoir** | détient, met en œuvre, intervient dans | bleu, trait plein |
| **Partagé** | partage avec | orange, tirets |
| **Argent** | flux financier | aqua, trait plein fléché |
| **Information** | flux d'information, produit | gris, pointillés |
| **Vous pouvez agir** | levier citoyen | encre, gros pointillés |

**Trois teintes seulement portent l'identité.** Bleu, orange et aqua sont le seul
triplet de la palette qui passe les seuils de séparation — vision normale *et*
daltonienne, en clair comme en sombre, **toutes paires simultanément à l'écran**.
Cette dernière condition est celle d'un graphe : contrairement à un histogramme,
n'importe quelles deux couleurs peuvent s'y retrouver côte à côte. Aucun
quadruplet de la palette ne tient ce seuil.

Les deux familles restantes n'ont donc pas de teinte, et c'est un choix, pas un
pis-aller :

- **Information** prend le gris de texte. C'est de la plomberie ; elle doit
  rester en retrait.
- **Vous pouvez agir** prend la couleur de l'encre — le contraste maximal
  disponible. C'est l'information la plus importante du site, et elle reste
  lisible sans aucune perception des couleurs.

Chaque famille porte en plus **son propre tracé**. L'identité ne repose jamais
sur la seule couleur, et la légende est toujours affichée.

> La vérification n'est pas une appréciation : le triplet a été passé au
> validateur de palette, en clair et en sombre, toutes paires. Refaire ce
> contrôle avant tout changement de couleur.

## Les quatre formes de nœuds

| Forme | Type | Pourquoi |
|---|---|---|
| Pastille | acteur | une personne morale, arrondie |
| Plaque | compétence | une attribution, à angles vifs |
| Barre de départ | processus | il a un début, il se déroule |
| Coin replié | document | c'est une feuille |

## Les vues

**La carte d'ensemble.** Tous les acteurs, en colonnes par échelon. Deux types
d'arêtes seulement : l'argent, et les compétences partagées agrégées en une seule
arête par paire d'acteurs, épaisseur = nombre de compétences en commun.
L'agrégation est ce qui rend la carte lisible : sans elle, cinquante nœuds et
deux cents arêtes ne montrent rien.

**Le focus.** Un nœud au centre, ses relations autour, groupées par famille pour
que les couches se lisent comme des secteurs, chacune nommée en toutes lettres.

**La chronologie** et **les fenêtres d'action**, pour les processus seulement :
un graphe ne sait pas montrer le temps.

## L'interaction, qui fait la lisibilité

Un graphe dense ne se lit pas d'un bloc. Trois gestes le déplient :

- **Survoler une famille** (dans la légende, ou une arête) éteint les autres et
  ne garde allumés que les nœuds que cette famille touche. On met en retrait, on
  ne masque pas : la structure d'ensemble reste visible pendant qu'on lit une
  couche.
- **Survoler un nœud** ne garde que son voisinage.
- **Cliquer une clé de légende** retire durablement une famille. C'est aussi la
  commande tactile, là où le survol n'existe pas.

## Règles

**Les sigles sont expliqués au survol.** `<abbr title>` dans tout le texte —
c'est la balise que les lecteurs d'écran annoncent, elle marche sans JavaScript,
et le navigateur l'affiche déjà. Un SVG n'accepte pas `<abbr>` : le développé y
est donc collé à l'infobulle du nœud. Et comme le survol n'existe ni à
l'impression ni au doigt, chaque page de nœud rappelle en clair, sous son
schéma, les sigles qu'elle emploie.

**Accessibilité.** La légende est toujours présente. Chaque schéma généré au
build porte un `title`, une `desc` et un tableau équivalent. Aucune information
n'est portée par la seule couleur. Les animations respectent
`prefers-reduced-motion`.

**Lisibilité avant compacité.** Sous 700 px, un schéma garde sa taille naturelle
et défile ; le réduire le rendrait illisible, ce qui est pire.

**Déterminisme.** Les deux dispositions sont calculées, pas simulées. La même
donnée donne toujours la même image, donc on peut la citer et la comparer.
