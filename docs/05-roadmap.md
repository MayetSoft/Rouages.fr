# 05 — Feuille de route

> Statut : proposition. Le principe directeur : **une tranche verticale complète
> avant toute extension horizontale.**

Le risque principal de ce projet n'est pas technique, c'est la dispersion : trois
produits différents (encyclopédie visuelle, média de prebunking, plateforme
d'outils) sous une même bannière. La roadmap ci-dessous les sépare dans le temps
et pose une condition de sortie explicite à chaque phase.

---

## Phase 0 — Cadrage *(en cours, ce dépôt)*

Vision, familles, modèle de données, vues graphiques, choix techniques.

**Fini quand** : le modèle de données est validé et une fiche exemple prouve
qu'il tient debout. *(Fait : `exemples/permis-de-construire.yaml`.)*

---

## Phase 1 — La tranche verticale

**Objectif : une seule fiche, complète, publiée, de bout en bout.**

Recommandation : **« Le permis de construire »** (famille B). Raisons : usage
réel et fréquent, délais critiques donc valeur immédiate, mobilise les quatre
vues, met en jeu commune / EPCI / État donc oblige à modéliser proprement le
partage de compétences, et prépare directement la phase 3 (PLU).

Livrables :
- squelette du site, un seul gabarit de fiche ;
- validation du schéma en intégration continue ;
- génération des vues V1, V2 et V4 depuis le YAML ;
- déploiement en ligne, nom de domaine, mentions légales, licence.

**Fini quand** : un inconnu à qui l'on envoie l'URL trouve seul qui décide et
jusqu'à quand il peut contester. À tester sur cinq personnes réelles, pas entre
nous.

---

## Phase 2 — Le socle local (10 à 15 fiches)

Famille A (commune, EPCI, département, préfet, budget local, école, eau,
déchets) + 3 à 4 fiches de famille B qui s'y raccrochent.

Ajouts : recherche plein texte, entrée par situation (« que se passe-t-il si… »),
page de licence et d'export des données, processus de contribution.

**Fini quand** : le graphe est assez dense pour que les fiches se lient
naturellement entre elles, et qu'un contributeur externe puisse en ajouter une
sans nous.

---

## Phase 3 — Élargissement (familles C puis D)

D'abord la famille C (rouages économiques) : elle élargit l'audience sans
engager la neutralité perçue.

Puis, **et seulement si le site a acquis une réputation de neutralité**, la
famille D (prebunking), sous la règle « mécanismes, jamais de personnes ».

**Fini quand** : la famille D ne provoque pas de rejet des familles A à C.
Signal à surveiller : les retours des enseignants et des collectivités.

---

## Phase 4 — Les outils communautaires

Produit distinct, adossé au graphe. Ordre recommandé, du moins risqué au plus
risqué :

1. **Recherche dans les délibérations** d'un territoire pilote — collecte,
   OCR, indexation, recherche. Techniquement connu, juridiquement clair
   (documents publics), utilité immédiate pour la presse locale et les élus
   d'opposition. Point de vigilance RGPD : les noms de personnes physiques dans
   les délibérations.
2. **Recherche de la procédure applicable** dans les documents officiels —
   recherche augmentée qui *cite* et ne *conclut jamais*.
3. **Lecture assistée du PLU** — le plus demandé, le plus risqué. Doit
   restituer l'article applicable et son texte, jamais un verdict de
   constructibilité. Voir `07-risques.md`.

**Ne pas commencer la phase 4 avant la phase 2.** Ces outils n'ont d'intérêt que
rattachés à un graphe qui explique ce qu'on est en train de lire ; construits
isolément, ce sont trois moteurs de recherche de plus.

---

## Ce qu'on ne fait pas (pour l'instant)

- Pas de comptes utilisateurs avant la phase 4.
- Pas de commentaires ni de forum : coût de modération sans rapport avec la
  valeur ajoutée.
- Pas de couverture nationale exhaustive : mieux vaut vingt fiches justes que
  deux cents approximatives.
- Pas d'application mobile : le site responsive suffit.
