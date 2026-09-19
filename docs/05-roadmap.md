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

### La veille ✔

Trois demandes distinctes — être alerté qu'une source change, réagir quand une
donnée plus fraîche paraît, se voir proposer de nouveaux jeux — sont le même
mécanisme avec trois déclencheurs. Elles ont été traitées ensemble.

Le point de bascule est celui-ci : la donnée sur le prix de l'eau avait déjà
deux ans avant qu'on s'en aperçoive, et on ne s'en est aperçu qu'en la
recoupant à la main. Un projet dont les sources se dégradent en silence ne
tombe pas en panne, il devient faux. Voir `06-stack-technique.md`.

### Le déploiement ✔

Publication automatique sur o2switch en FTPS, avec purge du cache Cloudflare.
Le piège n'était pas le FTP mais le DNS : Cloudflare ne relaie que HTTP et
HTTPS, un enregistrement proxifié ne transporte rien d'autre. Voir
`06-stack-technique.md`.

### Les branches du pouvoir ✔

Les entités de l'État étaient jusque-là un seul échelon indifférencié : sept
nœuds, sans distinction entre celui qui vote la loi, celui qui l'applique et
celui qui tranche. Elles sont maintenant 23, rangées par branche, avec une page
dédiée — la carte d'ensemble range par échelon, la séparation des pouvoirs est
orthogonale à cet axe.

Manquaient entièrement : le Parlement et ses deux chambres, le président de la
République, le Gouvernement, l'administration centrale, le Conseil d'État, le
Conseil constitutionnel, la Cour des comptes, les juridictions d'appel et
l'ordre judiciaire, la CNIL. Le Sénat méritait à lui seul d'être ajouté : ses
grands électeurs sont très majoritairement des conseillers municipaux, et les
textes sur l'organisation des collectivités lui sont soumis en premier.

La règle de validation a payé immédiatement : elle a révélé que le tribunal
administratif et la chambre régionale des comptes étaient typés
`service_deconcentre`, c'est-à-dire rangés parmi les bras de l'exécutif. Voir
`02-familles.md`.

### Où sont les services publics ✔

Écoles, collèges, lycées, France services, CCAS et établissements de santé —
83 719 implantations dans 22 958 communes, affichées sous le nom de la commune
choisie. Le reste du panneau dit qui décide ; ce bloc dit où l'on va.

Les casernes de pompiers manquent, et manqueront : elles ne sont pas publiées
en open data national, seuls les 98 états-majors départementaux le sont. On
nomme le SDIS compétent et on dit qu'on ne situe pas la caserne — plutôt que
d'inventer une proximité. Voir `06-stack-technique.md`.

### Ce qui a changé ✔ (et ce qui ne se tracera pas)

Les six repères financiers sont désormais suivis sur huit exercices, 2018-2025,
avec une courbe et la variation depuis le début de la série. Un chiffre isolé
ne se discute pas ; « +57 % depuis 2018 » appelle une question, et le site
nomme déjà celui à qui la poser.

Le traçage des **décisions** restait à voir. Une partie de ce constat était
fausse et a été corrigée depuis : voir « Ce qu'une école est devenue ». Ce qui
tient : ni les subventions de l'État aux communes, ni a fortiori le **motif**
d'une décision n'existent en open data national exploitable. Le détail des
vérifications est dans `06-stack-technique.md`. Mieux vaut le dire que le
simuler.

### Onze entités de plus ✔

Sécurité (gendarmerie, police nationale), services déconcentrés (DDT, DREAL,
finances publiques), médiation (conciliateur de justice, médiateur de
l'énergie) et agences (Anah, ANCT, ADEME, CAUE). 53 acteurs deviennent 64, et
66 compétences.

Le choix n'est pas encyclopédique : ce sont les entités qu'un habitant ou une
petite commune rencontre vraiment. Gendarmerie et police nationale ne se
partagent pas les tâches mais la carte, et c'est la première chose à savoir.
Le conciliateur de justice est gratuit et son passage est obligatoire avant le
juge sous 5 000 €. Le CAUE conseille gratuitement celui qui construit, et il
est déjà financé par la taxe d'aménagement qu'il paie.

Les liens pointent vers l'annuaire de Service-public plutôt que vers les pages
nationales : ce qu'on cherche, c'est sa brigade, sa DDT, sa DREAL.

Le repli par famille a tenu : « La commune » passe de 29 à 29 relations
partagées sans qu'une pastille de plus soit dessinée, et la colonne « État » du
plan d'ensemble s'est repliée d'elle-même en trois piles.

### La mobilité ne retombe jamais sur la commune ✔

La loi du 24 décembre 2019 ne laisse pas de trou : les communautés
d'agglomération, urbaines et les métropoles sont autorités organisatrices de
plein droit ; les communautés de communes le sont si elles ont délibéré avant
le 31 mars 2021 ; sinon la région exerce la compétence depuis le 1er juillet
2021. Le site répondait « la commune » là où le registre était muet —
c'est-à-dire dans le seul cas où la commune n'est certainement pas la réponse.

D'où un quatrième état du verdict : `a-defaut` nomme celui que la loi désigne,
et s'affiche à l'encre pleine parce que c'est une réponse, pas une incertitude.
12 113 communes répondent désormais avec leur région.

### Signaler une erreur ✔

Le site se trompera. Le registre ignore ce qui se décide en conseil
communautaire, une convention de mutualisation ne laisse aucune trace dans
l'open data, et le droit bouge. Le lecteur qui habite la commune en sait alors
plus que la donnée.

Un formulaire de contact générique aurait produit des messages incorrigeables.
« C'est faux » n'est pas une correction. `/signaler` ne reçoit donc que des
identifiants — un nœud, un code INSEE, un chemin interne — et recalcule le
relevé avec le code de l'explorateur : la page, la fiche, la commune, la
réponse exacte et son origine. Un relevé recopié depuis l'URL serait
falsifiable par qui fabrique un lien, et vieillirait sans qu'on le sache.

Le signalement devient une issue publique du dépôt : la correction se discute
au même endroit que le contenu. Pour qui n'a pas de compte, le même texte se
copie et part par un autre canal — pas d'adresse inventée, un lien mort vaut
moins que pas de lien.

### Culture, sport, funéraire, numérique ✔

Les quatre compétences qui manquaient, plus une cinquième que le référentiel
imposait de distinguer : BANATIC sépare les *activités* culturelles (5035) et
sportives (5040) des *équipements* qui les abritent (5000), et les
intercommunalités ne déclarent pas les mêmes.

Culture et sport sont un cas à part dans tout le site : l'article L1111-4 du
CGCT les déclare **partagés** entre commune, département, région et État.
Ailleurs, Rouages répond « qui exerce » ; ici la réponse honnête est
« plusieurs à la fois », et la réserve le dit plutôt que de laisser croire à un
exerçant unique.

Le cimetière est l'enseignement le plus utile. Sa couverture est de 5 %, et
c'est **correct** — l'inverse du cas de la concession électrique, où un
département à 15 % contre 94 % en France signale un registre incomplet. Ici,
l'article L2223-1 oblige chaque commune à disposer d'un cimetière : presque
aucune ne le transfère, et le silence du registre veut bien dire « la commune ».
L'heuristique ne s'y trompe pas, parce qu'elle compare le département à la
moyenne nationale et non à 100 %.

Reste que la Métropole du Grand Paris déclare ce code, et le site la nomme donc
pour Paris. En conclure qu'elle gère le Père-Lachaise serait faux : déclarer la
compétence n'est pas gérer chaque cimetière. C'est le cas où la réserve compte
le plus, parce que la réponse est exacte et l'inférence qu'on en tire ne l'est
pas.

### Une panne qu'on ne pouvait pas voir ✔

`public/territoires/meta.json` est écrit par `npm run territoires`, pas par le
build. Corriger une réserve dans les compétences ne suffisait donc pas à la
corriger sur le site : le contenu était juste, la validation passait, et le
panneau affichait l'ancien texte. C'est arrivé en écrivant la réserve du
cimetière, et rien ne l'aurait signalé.

Une règle de validation compare désormais les trois champs recopiés —
`obligatoires`, `reserves`, `aDefaut` — et refuse de publier tant qu'ils
divergent. Elle a attrapé son auteur dans la minute.

### Chiffrer les flux ✔

Deux des flux dont on parle le plus à un habitant — la taxe d'enlèvement des
ordures ménagères et le versement mobilité — n'apparaissaient nulle part sur le
site. La raison est un piège d'échelon : ils ne sont presque jamais dans les
comptes d'une commune, c'est le groupement qui les perçoit. Les chercher au
mauvais endroit ramène 568 lignes au lieu de 1 942, et répondre « la commune ne
perçoit rien » aurait été exact et sans intérêt.

Un repère déclare donc désormais l'échelon où sa mesure a un sens, et le site
sait déjà quelle structure sert chaque commune : la jointure BANATIC lui donne
le SIREN de chacun de ses groupements. Il ne manquait que le chiffre en face.
1 016 structures sont chiffrées, sur huit exercices, dans un fichier de 88 ko
chargé à part — le fondre dans `meta.json` ferait payer ce poids à chaque
visite pour une information que peu de gens ouvriront.

Ce qui a été refusé : combler l'absence. 886 intercommunalités perçoivent la
taxe d'enlèvement et 281 le versement mobilité ; les autres financent le
service autrement, par une redevance ou par un syndicat qui n'est pas un
groupement à fiscalité propre. La médiane ne porte donc que sur celles qui
perçoivent — les compter pour zéro ferait passer un taux ordinaire pour une
anomalie — et une valeur manquante reste manquante.

En vérifiant l'affichage, un défaut plus ancien est apparu : l'évolution était
annoncée « depuis 2018 » quelle que soit la première année réellement
renseignée. La communauté de communes Sud Sarthe n'a de taxe d'enlèvement qu'à
partir de 2022, et le site écrivait pourtant « + 6 % depuis 2018 ». Les deux
blocs nomment maintenant l'année du premier chiffre.

La veille, enfin, ne surveillait que la base communale de l'OFGL. Un agrégat
peut disparaître d'une base sans bouger dans l'autre, et « Versement transport »
existe résiduellement dans les deux : le contrôle aurait été rassurant à tort.
Chaque surveillance déclare désormais l'échelon dont elle répond.

### Ce qu'une école est devenue ✔ *(et un constat corrigé)*

Cette feuille de route affirmait que les effectifs par école, année après
année, n'existaient pas en open data exploitable. **C'était faux.** L'Éducation
nationale les publie depuis 2009 : 859 372 lignes, 55 928 écoles, avec le
nombre de classes. Le constat a été écrit sans vérifier, et il a tenu jusqu'à
ce qu'on cherche.

Le site montre désormais, pour chaque école du premier degré d'une commune, son
nombre de classes et d'élèves sur dix rentrées, et nomme la dernière variation :
« −1 classe à la rentrée 2025 ». À Mayet, l'école Jules Ferry est passée de 7 à
6 classes en 2018 et la maternelle St Exupéry de 4 à 3 en 2025 ; au
Mayet-de-Montagne, l'école Yves Duteil a perdu une classe en 2021. 46 670
écoles sont suivies.

Ce qui reste refusé, c'est le **motif**. Ni le seuil appliqué cette année-là, ni
l'arbitrage du rectorat ne sont publiés. Montrer le fait et nommer le décideur
suffit à savoir à qui écrire — et c'est justement là que le site sert : la
carte scolaire relève des services de l'État, pas du maire, même quand la
commune est propriétaire des murs.

**La jointure méritait de la méfiance.** Le jeu des effectifs porte un champ
nommé `code_commune_insee` qui contient en réalité le code postal. Pour Mayet
(Sarthe) il vaut 72360 — qui est aussi un vrai code INSEE, celui de Trangé, à
quarante kilomètres. S'y fier aurait rattaché les écoles à la mauvaise commune,
sans erreur visible ni ligne perdue : le pire genre de bogue, celui qui produit
une réponse plausible. La clé retenue est le numéro UAI, que l'annuaire de
l'éducation fournit avec le bon code INSEE.

### Qui est le maire ✔

Le site nommait des structures et ne nommait personne. « La commune décide » ne
dit pas à qui écrire, et c'est la question qui amène le plus de monde. Les
34 743 communes pour lesquelles le répertoire national publie un maire
l'affichent désormais, avec sa date de prise de fonction.

**La règle « aucun nom de personne physique » n'a pas été levée, elle a été
précisée — et en le devenant, elle s'est durcie.** Le graphe décrit des
fonctions : le nœud reste « le maire ». Le nom du titulaire est une donnée
territoriale, au même rang que le nom de la communauté de communes ; il ne crée
ni nœud, ni arête, ni page. Et le contrôle des civilités, qui ne visait que la
famille « influence », porte maintenant sur **tout** le contenu : un nom en dur
dans `contenu/` s'y périmerait en silence, puisque le contenu n'a pas de date de
rafraîchissement là où les fichiers de données en ont une. La règle a été
éprouvée en y glissant volontairement un nom : elle l'a refusé.

Minimisation : le répertoire publie la date de naissance, le sexe et la
catégorie socio-professionnelle de chaque élu. Aucun des trois ne sert à savoir
qui décide, aucun n'est collecté — ce qui n'est pas collecté n'a pas à être
protégé.

Le risque principal n'est pas la vie privée, le mandat étant public par nature :
c'est la péremption. D'où la date affichée avec le nom, la surveillance du
répertoire dans la veille avec un seuil serré à 5 %, et le signalement ouvert à
qui constate l'erreur. Voir `07-risques.md`.

Note d'outillage : `data.gouv.fr` reste hors d'atteinte depuis l'environnement
de développement, mais son API tabulaire (`tabular-api.data.gouv.fr`) répond.
Elle sert la ressource par pages de cent — 349 pages, environ 90 secondes — et
l'ingestion refuse d'écrire si elle en a perdu plus d'un dixième : mieux vaut
échouer que publier un annuaire troué.

### Les « frais de notaire » sont un impôt ✔

C'est le malentendu le plus répandu de la fiscalité locale, et le site est fait
pour ce genre de chose. L'essentiel de ce qu'on appelle « frais de notaire » ne
va pas au notaire : ce sont les droits de mutation, qu'il collecte et reverse au
département et aux communes — deux échelons déjà décrits ici. Dans l'Allier :
37,7 M€ pour le département en 2025, 9,2 M€ pour les communes du département.
Et la série dit ce qu'un chiffre seul ne dirait pas : 42,7 M€ en 2021, 32,8 M€
en 2024, un quart de la recette perdu en trois ans sur un budget départemental.

**La part communale change de destinataire selon la taille de la commune**, et
c'est le seul endroit du site où une règle de droit dépend de la population.
Au-dessus de 5 000 habitants, l'article 1584 du CGI verse la taxe additionnelle
à la commune ; en dessous, l'article 1595 bis l'oriente vers un fonds de
péréquation départemental redistribué selon un barème voté par le conseil
départemental. Le site connaît la population : il tranche au lieu de décrire les
deux cas. Le Mayet-de-Montagne relève du second, Moulins du premier. Les
stations de tourisme classées font exception, et le site ne connaît pas ce
classement — il le dit.

**Le taux voté par chaque département n'est pas recopié.** Il existe, dans un
tableau officiel département par département, et le site y conduit. Recopier
cent une valeurs révisées chaque année, c'est se condamner à les laisser
vieillir : c'est exactement ce que le projet s'interdit ailleurs.

Trois professions entrent au graphe avec le notaire, parce que l'État leur
délègue une prérogative et que leur intervention est obligatoire, pas choisie :
le notaire qui donne force authentique, le commissaire de justice sans qui un
jugement gagné ne s'exécute pas, et le géomètre-expert seul habilité à fixer une
limite de propriété — le cadastre sert l'impôt et ne délimite rien. Aucune étude
n'est listée : le site renvoie vers l'annuaire de chaque profession, comme il le
fait pour la gendarmerie ou la DDT.

### Le conseil juridique gratuit ✔

2 524 points-justice — permanences d'avocat, de notaire, de conciliateur ou
d'association, gratuites, coordonnées par le conseil départemental de l'accès
au droit. Ils étaient déjà dans l'annuaire que le site ingère : il ne les
lisait pas.

Le travail n'a pas été de les collecter mais de **généraliser le voisinage**.
Une école est dans la commune ou elle n'y est pas ; un point-justice existe par
bassin de vie. Le mécanisme qui signalait les France services des communes
voisines ne servait qu'à elles ; il vaut maintenant pour toute famille qui le
mérite. Au Mayet-de-Montagne, le panneau répond « aucun dans la commune —
Saint-Germain-des-Fossés, Saint-Yorre » là où il n'aurait rien dit.

Les 110 points-justice installés en détention sont écartés : ils ne sont pas
ouverts au public. Dans l'Allier, 18 des 20 recensés sont retenus.

### L'obligation de logements sociaux ✔

L'article 55 de la loi SRU est l'une des rares obligations à la fois chiffrée,
datée et sanctionnée qui pèse sur une commune : un taux à atteindre, un écart
constaté, un prélèvement quand il n'est pas comblé, et la carence — seule
situation où le préfet peut se substituer au maire pour délivrer les permis.
L'inventaire annuel du ministère donne tout cela, commune par commune, avec un
code INSEE propre : 2 206 communes soumises, 1 140 déficitaires, 335 carencées,
690 prélevées pour 135 M€.

Deux silences sont volontaires. **Les communes absentes du fichier ne sont pas
en défaut** : elles n'atteignent pas les seuils de population et
d'agglomération, et écrire « 0 » se lirait comme un manquement. Et **« Pas
d'inventaire » n'est pas une donnée manquante** : Le Mans porte cette mention
avec un taux « >25% », parce que la commune dépasse la cible et que
l'inventaire détaillé ne lui est donc pas demandé. Le site reprend le texte du
fichier plutôt que d'afficher un trou.

La fragilité connue : l'identifiant de la ressource change à chaque millésime.
La veille la surveille pour que sa disparition se voie au lieu de se deviner.

**Le répertoire des logements locatifs sociaux (RPLS) proprement dit n'est pas
intégré** : le fichier national par commune n'est pas servi par une interface
requêtable joignable, et l'inventaire SRU couvre déjà les communes où
l'obligation — et le débat — existent.

### Ce qui est commandé ✔

Les données essentielles de la commande publique disent à quoi une collectivité
passe commande. C'est la forme la plus concrète de « où va l'argent » : un
objet, une date, un montant. Le site montre les marchés de la commune, puis
ceux de chacun de ses syndicats — qui dépensent souvent davantage et que
personne ne pense à regarder. 13 473 acheteurs du bloc communal sont couverts,
sur 379 986 marchés notifiés depuis 2023.

La jointure est sûre : `acheteur_id` est un SIRET dont les neuf premiers
chiffres sont le SIREN, et le site connaît déjà le SIREN de chaque commune
(découpage Etalab) comme de chaque groupement (BANATIC).

**Ce qui a demandé le plus de discernement, c'est de refuser le total.** Un
accord-cadre déclare un plafond, et chacun de ses lots le redéclare en entier :
sept marchés parisiens portent 21 M€ chacun pour un seul accord. Additionner
les 661 873 marchés attribue 185 Md€ au seul bloc communal en trois ans —
davantage que la commande publique française entière. Le chiffre aurait été
faux d'un ordre de grandeur, et personne ne l'aurait vu. Le site affiche donc
les lignes et pas de somme, et dit pourquoi.

Deux limites de plus sont dites plutôt que corrigées : un même marché figure
parfois deux fois sous deux libellés — le recensement n'est pas dédoublonné à
la source, et un rapprochement approximatif serait une devinette ; et le
recensement n'est complet que depuis 2023. Une seule correction est appliquée,
parce qu'elle ne peut rien abîmer : `¿` tient lieu d'apostrophe dans 3 603
objets, toujours entre deux lettres.

### Une ingestion qui ne se perd plus en route

Le rapatriement complet touche huit sources et dure une dizaine de minutes.
Qu'une seule soit momentanément injoignable — c'est arrivé sur le répertoire
des élus — et tout était perdu, y compris ce qui avait déjà abouti. Les
collectes facultatives sont désormais isolées : celle qui échoue laisse en
place les fichiers de l'ingestion précédente, datés, plutôt que de tout
emporter. Restent fatals les référentiels dont dépend la structure du réseau,
BANATIC et le découpage : sans eux il n'y a rien à écrire.

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
