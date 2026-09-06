# 05 — Feuille de route

Principe : **densifier le réseau avant de l'élargir.** Un graphe clairsemé ne
montre rien ; c'est la densité des relations qui fait la valeur, pas le nombre
de nœuds.

## Phase 0 — Cadrage ✔

Vision, familles, modèle de données, vues, choix techniques.

## Phase 1 — Le réseau local ✔

Carte d'ensemble, focus, pages de nœud sans JavaScript, encodage visuel validé,
validation du contenu en intégration continue.

## Phase 2 — Densifier *(en cours)*

Fait :

- **5 processus**, choisis pour couvrir les quatre prises réelles d'un
  habitant : l'information (demander un document administratif), le contrôle
  (contester une délibération), la participation (une enquête publique),
  l'argent (le vote du budget communal), et l'urbanisme (le permis de
  construire) ;
- les acteurs qui manquaient à ces circuits : CADA, commissaire enquêteur,
  chambre régionale des comptes, Défenseur des droits, CCAS, conseil d'école ;
- les réseaux : syndicat d'énergie et Enedis, autorité organisatrice de la
  mobilité et son exploitant, syndicat de SCoT, agence d'urbanisme, employeurs ;
- huit flux de plus — versement mobilité, redevance de concession, compensation
  à l'exploitant, cotisations, données ouvertes de réseau ;
- 39 acteurs, 37 compétences, 18 flux, 215 relations, 86 pages de référence.

Reste :

- les compétences manquantes : culture, sport, funéraire, numérique ;
- **chiffrer les flux.** Ils sont structurellement en place et liés à l'OFGL,
  mais leurs ordres de grandeur restent qualitatifs : les chiffrer commune par
  commune demande d'ingérer les données, donc un environnement ayant accès au
  réseau ouvert (voir plus bas) ;
- **la relecture par un praticien** des attributions marquées
  `confiance: a_confirmer` — c'est le vrai reste à faire, pas le volume.

**Fini quand** un visiteur peut partir de n'importe quel nœud et atteindre
n'importe quel autre en trois clics, sans passer par une impasse.

### Une contrainte d'outillage à lever

Les sessions de développement passent par une politique réseau qui refuse les
hôtes d'open data (`geo.api.gouv.fr`, `banatic`, `data.gouv.fr`, `data.ofgl.fr`,
`services.eaufrance.fr`, `transport.data.gouv.fr`, `data.enedis.fr`). Tant
qu'elle n'est pas ouverte, ou que les jeux de données ne sont pas déposés dans
le dépôt, tout ce qui ingère de la donnée ne peut être écrit qu'à l'aveugle —
et deviner des noms de champs produit du code qui casse au premier vrai appel.
Le contrôle hebdomadaire des liens, lui, tourne dans l'intégration continue et
n'est pas concerné.

## Phase 2 bis — Mettre en ligne

Déploiement, domaine, mentions légales, licence, sitemap. À faire dès que les
attributions sont relues : rien n'est réel tant que personne d'extérieur n'a
touché le site.

## Phase 2 ter — « Chez moi » ✔ *(en place)*

La résolution territoriale : pour une commune donnée, qui exerce réellement les
compétences que le site décrit comme variables.

- `npm run territoires` fait la jointure entre l'export national BANATIC et le
  découpage administratif d'Etalab, puis écrit des fichiers versionnés dans
  `public/territoires`. **Le site n'appelle aucune interface à l'exécution** :
  la donnée vit dans le dépôt, le build est reproductible et hors ligne, et un
  changement se relit dans un diff.
- 34 875 communes, 9 290 groupements, 14 compétences résolues.
- Chargement en deux temps : un index de recherche léger, puis le seul
  département concerné — personne ne télécharge la France pour trouver sa
  commune.

**Le point le plus important n'est pas la jointure, c'est ce qu'on refuse de
dire.** Le registre a des trous : dans la Sarthe, 15 % des communes ont un
exerçant identifié pour la concession électrique, contre 94 % en France.
Conclure « la commune s'en charge » y serait faux — et faux avec aplomb, ce qui
est le pire défaut possible pour ce site. La couverture est donc mesurée par
département et comparée à la moyenne nationale, et le site distingue trois
états : transférée, communale, non renseignée.

**Choisir sa commune est la première marche, et elle est piégeuse.** 1 481 noms
de communes sont portés par plusieurs communes, soit 3 769 communes — plus d'une
sur dix. « Mayet » n'est pas « Le Mayet-de-Montagne ». La recherche classe donc
la correspondance exacte avant le préfixe, développe les abréviations — 3 885
communes commencent par Saint, personne ne l'écrit en entier — fait passer le
code postal devant le code INSEE, qui occupe le même espace de valeurs, et
affiche le département en toutes lettres avec la population pour départager.
`npm run verifier-recherche` fixe ces cas sur l'index réel : une régression de
tri est invisible à l'œil et proposerait la mauvaise commune.

### Les chiffres ✔

Six repères financiers par commune, tirés des comptes publiés par l'OFGL :
dotation de l'État, impôts locaux, dépenses de fonctionnement, frais de
personnel, dépenses d'équipement, encours de dette. En euros par habitant, et
rapportés à la médiane des communes de taille voisine — c'est précisément ce
que le site recommande par ailleurs de faire avant de conclure.

Là encore, ce qu'on refuse de dire compte : Paris exerce aussi des fonctions
départementales, ses comptes ne se comparent à ceux d'aucune autre commune, la
médiane lui est donc retirée et il est écarté du calcul des médianes des autres.
Et aucun montant faible n'est arrondi à zéro : la dotation communale de Paris
vaut 0,1 € par habitant, « 0 » se lirait « Paris ne reçoit rien ».

### Le prix de l'eau ✔

Rattaché au service qui la distribue réellement, puisque la structure est
identifiée pour chaque commune : prix TTC au m³, mode de gestion, et le nom du
délégataire quand il y en a un. 32 469 communes sur 34 875 sont couvertes ;
seules Mayotte, la Guadeloupe et le Territoire de Belfort décrochent, et
l'absence y est silencieuse plutôt qu'approximative.

**Le choix de source mérite d'être noté**, parce qu'il coûte cher. L'API
Hub'Eau expose ces indicateurs en JSON propre — mais s'arrête à 2018. Pour le
seul service de Mayet, le prix est passé de 2,11 € en 2018 à 2,73 € en 2024,
soit +30 % : un chiffre de 2018 serait faux aujourd'hui, même daté. La source à
jour n'existe que sous forme d'archive 7z contenant un classeur .xls, ce qui
impose deux dépendances de plus au script de rafraîchissement. On a préféré la
complexité au chiffre commode et faux.

## Phase 3 — Élargir

- **Rouages économiques** : métiers, filières, chaînes de valeur. Même modèle,
  autres nœuds.
- **Rouages de l'influence** (prebunking), une fois la neutralité installée, et
  sous la règle absolue : des mécanismes, jamais des personnes.

## Phase 4 — Les outils communautaires

Recherche dans les délibérations · lecture assistée du PLU · recherche de la
procédure applicable. Adossés au graphe, jamais construits isolément. Voir
`07-risques.md` avant la première ligne de code.

## Ce qu'on ne fait pas

- Pas d'articles. Jamais. Le plafond de 280 signes sur les résumés est là pour
  ça, et il est appliqué par le schéma.
- Pas de comptes utilisateurs avant la phase 4.
- Pas de commentaires : coût de modération sans rapport avec la valeur.
- Pas de couverture nationale exhaustive : mieux vaut un réseau dense et juste
  qu'un annuaire creux.
