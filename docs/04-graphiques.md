# 04 — Les vues

Le site est une visualisation. Il n'a que quatre rendus, et trois suffisent la
plupart du temps.

## V1 — La carte d'ensemble

Tous les acteurs, en colonnes par échelon : Union européenne, État, région,
département, intercommunalité, commune, acteurs privés, vous.

Deux types d'arêtes seulement : **l'argent qui circule** (trait plein, fléché) et
**les compétences partagées** (pointillé, épaisseur = nombre de compétences en
commun).

L'agrégation est le choix qui rend la carte lisible : sans elle, cinquante nœuds
et deux cents arêtes ne montrent rien. Les compétences se déplient au clic.

## V2 — Le focus

Un nœud au centre, ses relations autour, chacune **nommée en toutes lettres**
(« détient », « partage avec », « reçoit de », « peut agir sur »). On clique un
voisin, il devient le centre. C'est la navigation principale du site.

Le panneau qui l'accompagne porte les liens sortants, groupés par nature :
Wikipédia pour la définition, le texte pour la règle, l'open data pour les
chiffres.

## V3 — La chronologie *(processus uniquement)*

Un graphe ne sait pas montrer le temps. Un processus a donc une frise verticale :
étapes, acteurs, délais à l'échelle, et la **nature** de chaque délai — maximum
légal, indicatif, ou constaté. La confusion entre les trois est la première
cause de mauvaise décision.

## V4 — Les fenêtres d'action *(processus uniquement)*

Ce que vous pouvez faire, jusqu'à quand, auprès de qui, et le piège de forme sur
lequel on perd. C'est la vue signature : elle rend visibles les arêtes qui
partent du nœud « Vous ».

## Règles

**Accessibilité.** Chaque schéma généré au build est doublé d'un tableau
équivalent dans le DOM, porte un `title` et une `desc`, et n'encode jamais une
information par la seule couleur : chaque relation est aussi écrite.

**Lisibilité avant compacité.** Sous 700 px, un schéma garde sa taille naturelle
et défile ; le réduire le rendrait illisible, ce qui est pire.

**Déterminisme.** Les deux dispositions sont calculées, pas simulées. Aucune
force, aucun aléa : la même donnée donne toujours la même image, donc on peut la
citer et la comparer d'une version à l'autre.

**Le nœud est cliquable partout.** Sur la carte, dans le focus, dans les schémas
générés au build.
