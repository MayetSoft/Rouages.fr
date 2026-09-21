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

### Une contrainte d'outillage levée ✔

Cette section décrivait une politique réseau qui refusait les hôtes d'open
data, et qui obligeait à écrire l'ingestion à l'aveugle. Ce n'est plus le cas :
BANATIC, l'OFGL, les portails Opendatasoft, `files.georisques.fr` et
`tabular-api.data.gouv.fr` répondent tous, et les huit sources sont ingérées
depuis cet environnement.

Ce qui reste fermé est consigné dans `CLAUDE.md` plutôt qu'ici, parce que c'est
une contrainte de travail et non une étape de la feuille de route : les grosses
réponses de `www.data.gouv.fr` font tomber le tunnel au bout de sept secondes —
on passe donc par l'API v2 de recherche ou par `tabular-api` — et Légifrance
refuse les requêtes automatisées, si bien qu'un article se vérifie par
recherche web et jamais de mémoire. Un identifiant `LEGIARTI` écrit de tête a
déjà été faux une fois.

## Phase 2 bis — Mettre en ligne *(presque)*

Déploiement ✔, sitemap ✔, licences ✔, mentions légales ✔ — à ceci près que le
nom de l'éditeur, son contact, le directeur de la publication et l'hébergeur
restent à déclarer dans `contenu/editeur.yaml` : ce sont les seules
informations du site que personne ne peut déduire d'une source. Le déploiement
refuse de publier tant qu'elles manquent.

Reste le domaine, et la relecture des attributions : rien n'est réel tant que
personne d'extérieur n'a touché le site.

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
recensement n'est complet que depuis 2023. Deux corrections seulement sont
appliquées, parce qu'aucune ne peut rien abîmer : `¿` tient lieu d'apostrophe
dans 3 603 objets, toujours entre deux lettres ; et les octets 0x80 à 0x9F de
Windows-1252 arrivent lus comme du Latin-1, donc comme des caractères de
commande — « GROS UVRE », « DACTIONS » — dans 1 783 objets sur
369 872. Un caractère de commande n'a aucune raison d'être dans un libellé, et
la table de Windows-1252 dit exactement lequel était visé.

### Les 88 % de marchés qu'on ne montrait pas ✔

Le fichier du département ne portait que les cinq marchés les plus récents de
chaque acheteur : **49 804 lignes sur 419 052**, et la mention « les 5 plus
récents » ne menait nulle part. Vichy Communauté en a 325, la ville de
Marseille 5 523 — un lecteur ne pouvait en voir cinq.

La suite de chaque liste a désormais son propre fichier, chargé au clic :
**6 670 fichiers, 45 Mo, 2 ko dans le cas médian**. Un fichier par acheteur et
non par département, parce qu'on ouvre la liste d'un acheteur, jamais celle de
tout un département — et 2 ko à télécharger au lieu de 1,5 Mo. Les cinq
premiers n'y sont pas répétés : le client les a déjà, et les redonner aurait
coûté cinq mégaoctets pour rien.

Côté panneau, le bouton se déplie par vingt-cinq et dit toujours combien il
reste : « voir les 295 autres ». Une liste de 5 523 marchés dépliée d'un coup
ne se lit pas, et fige le panneau sur un téléphone. Le décompte lui-même
informe : c'est lui qui donne la mesure de ce qu'une collectivité commande.

Le site passe ainsi de 36 000 à près de 43 000 fichiers, ce qui allonge
l'envoi FTP complet sans changer le poids de la page : qui ne clique pas ne
télécharge rien de plus.

### Une page par commune ✔

Le panneau « chez vous » répondait déjà, mais il ne répondait qu'à qui
exécutait le JavaScript et savait qu'il existait. 34 875 communes n'avaient
aucune adresse propre : rien à envoyer à un voisin, rien à indexer, rien à
ouvrir depuis un moteur de recherche.

Chaque commune a désormais sa page statique, `/commune/03165` pour
Le Mayet-de-Montagne, construite au build à partir des mêmes fichiers que le
panneau. Le verdict — qui exerce réellement chaque compétence — a été sorti
dans `src/modele/verdict.ts` pour que les deux rendus ne puissent pas diverger :
une seule fonction, deux appelants.

Le coût est réel et il est mesuré : **35 954 fichiers, 455 Mo, 108 secondes de
build**, environ 10 Ko par page, et de l'ordre d'une demi-heure de miroir FTP
complet. Le déploiement est passé à huit transferts parallèles pour tenir.

Le plan de site suit la même arithmétique : un index, un plan des pages du
réseau, puis un plan par département. Un fichier unique serait sous la limite
de 50 000 URL, mais sans aucune marge.

### Les comptes du département et de la région ✔

Le site nommait le département à chaque écran — le collège, la route, le revenu
de solidarité active, l'aide à l'autonomie — sans jamais montrer ce qu'il
dépense. Un lecteur pouvait connaître les six repères financiers de sa commune
de 1 400 habitants et rien de l'échelon qui décide de son collège.

Les mêmes agrégats de l'OFGL sont désormais lus pour les 97 départements et les
17 régions qu'il publie, sur huit exercices, et affichés sous les comptes
communaux avec la médiane de l'échelon. Deux précautions :

- **le budget principal seulement.** 230 391 lignes sur 318 638 sont des
  budgets annexes — un domaine, un laboratoire, un service d'incendie. Les
  additionner gonflerait tout sans rien expliquer.
- **« Impôts locaux » est retiré à ces deux échelons.** La part départementale
  de la taxe foncière est passée aux communes en 2021 ; départements et régions
  sont depuis compensés par une fraction de TVA, que cet agrégat ne porte pas.
  Il reste 65 € par habitant dans l'Allier contre 375 en 2020, et des valeurs
  *négatives* pour les régions — une écriture de restitution, pas un impôt.
  Afficher cela sous ce libellé ferait conclure qu'un département ne lève
  presque rien : vrai de l'agrégat, faux de ses recettes. Le repère est donc
  absent et la raison écrite dans le code qui l'écarte.

Les explications des repères ne sont pas recopiées non plus : celles de
`reperes.yaml` sont écrites pour une commune — « ce que l'État verse à la
commune » — et diraient autre chose que le chiffre affiché sous les comptes
d'un département.

### Cinq démarches de plus ✔

Le site savait décrire un permis de construire et une enquête publique, c'est-à-
dire ce qu'on subit. Il ne disait rien de ce qu'on demande. Cinq processus
comblent le trou, chacun avec ses leviers d'action et ses pièges :

- **inscrire un enfant à l'école** — la mairie inscrit, le directeur admet :
  deux actes, deux autorités, et un refus possible de chaque côté ;
- **demander le revenu de solidarité active** — le département décide, la
  caisse verse, France Travail accompagne. Écrire à la caisse pour contester
  fait perdre le délai ;
- **demander un logement social** — la date du premier enregistrement fixe
  l'ancienneté, et une part des logements est attribuée par des réservataires
  que le bailleur ne choisit pas ;
- **contester une facture d'eau** — le plafonnement après fuite n'est jamais
  automatique, et la médiation exige une réclamation écrite préalable ;
- **s'inscrire sur la liste électorale** — depuis 2019 le maire décide seul,
  le recours devant la commission de contrôle est un préalable obligatoire, et
  c'est le juge judiciaire qui tranche.

Deux acteurs et une compétence sont apparus avec eux : la Médiation de l'eau,
la commission de contrôle des listes électorales, et la tenue de la liste
électorale — une compétence que la commune exerce au nom de l'État, sans code
BANATIC, donc absente de la résolution territoriale et présente dans le réseau.

Les fiches `service-public.fr` sont enregistrées sous `service-public.gouv.fr` :
le portail a migré, les anciennes adresses redirigent.

### À quoi l'endroit est exposé ✔

Tout le reste du site dit qui décide. Ce bloc-là dit ce qui arrive — et c'est
la première question qu'on se pose en arrivant quelque part, bien avant de
savoir qui exerce la compétence voirie.

GASPAR, la base du ministère de la Transition écologique, tient en **une
archive de 8 Mo** : les risques recensés au dossier départemental, les
**247 141 arrêtés de catastrophe naturelle depuis 1982**, les 32 789 procédures
de plan de prévention et les documents d'information communaux. Un seul
téléchargement, là où l'interface par commune de Géorisques imposerait 34 875
appels.

**Deux listes, et le site refuse de les fondre.** Le dossier départemental
recense ce à quoi l'État estime la commune exposée ; les arrêtés disent ce qui
est arrivé. Au Mayet-de-Montagne, le premier retient le séisme et le feu de
forêt ; le second compte trois inondations, une sécheresse, une tempête et un
mouvement de terrain — aucun des deux risques recensés. Ce sont deux
instruments, l'un prospectif et l'autre constaté ; les rapprocher serait
tentant et faux. Le site les affiche côte à côte et dit qu'ils ne se recouvrent
pas.

Trois autres décisions :

- **Le nombre d'arrêtés ne vaut que comparé.** 34 699 communes sur 34 875 en
  ont au moins un : le chiffre brut ne distingue personne. La médiane
  nationale est de 6, et c'est elle qui donne son sens au chiffre local — Le
  Mayet-de-Montagne en compte exactement 6.
- **Les plans caducs sont écartés.** Seuls `Opposable` et `Prescrit` sont
  montrés : un plan caduc ne s'impose plus à personne, et l'afficher laisserait
  croire le contraire. « Opposable » est le mot qui compte — le plan vaut alors
  servitude d'utilité publique et s'impose aux permis, y compris à l'État
  (art. L562-4 du code de l'environnement).
- **L'absence de document d'information communal se dit, sans conclure.**
  9 744 communes sur 34 875 en ont publié un. Son absence ne dit rien des
  risques eux-mêmes, seulement que l'information n'a pas été faite — et le
  site distingue les deux cas, puisque l'obligation d'informer la population
  tous les deux ans ne pèse que là où un plan est prescrit ou approuvé.

Avec ce bloc viennent deux compétences que le graphe séparait mal : **l'État
prescrit la contrainte, le maire doit la faire connaître.** Un habitant qui
ignore laquelle est en jeu s'adresse presque toujours au mauvais des deux. Et
un processus, `s-informer-sur-les-risques`, dont les leviers portent les pièges
de forme habituels : l'état des risques doit dater de moins de six mois et
figurer dès l'annonce immobilière depuis 2023 ; le délai de déclaration après
un arrêté de catastrophe naturelle court depuis sa publication au Journal
officiel et non depuis le sinistre, et il est passé de dix à trente jours en
2023 ; et un particulier ne peut pas demander lui-même la reconnaissance —
seule la commune peut saisir le préfet, si bien que sans démarche du maire
aucun sinistré n'est couvert.

### Comment le conseil a été élu ✔

Le site nomme le maire. Il ne disait pas dans quelles conditions ce maire avait
été désigné — ce qui est la même question, posée en amont.

Les résultats du ministère de l'Intérieur, commune par commune, donnent trois
chiffres et **34 801 communes** couvertes : la participation, la part de
bulletins blancs ou nuls, et le nombre de listes en présence. Chacun rapporté à
sa médiane nationale, parce qu'un taux seul ne se discute pas — 57 % n'est ni
bon ni mauvais tant qu'on ignore que la médiane est à 63,2 %.

**Ce que le module ne collecte pas, et c'est la décision principale : les
nuances politiques.** Le fichier les porte, liste par liste. `07-risques.md`
est explicite : « relier une personne à une opinion, à un financement, à un
réseau » reste interdit, et la règle n'a pas été levée quand le site s'est mis
à nommer les maires — elle a été précisée. Le nom d'un titulaire est une donnée
d'annuaire ; sa couleur politique est autre chose. Le fichier des résultats par
commune ne porte d'ailleurs aucun nom de candidat : ils sont dans un fichier
séparé, que le site n'ouvre pas.

Ce qui reste est structurel, et parle de soi. Au Mayet-de-Montagne :
**56,8 % de participation, et 28,2 % de bulletins blancs ou nuls** — trois fois
la médiane nationale de 9,3 % — pour **une seule liste**. À Vichy, trois
listes : 50,5 % de participation et 3,2 % de blancs et nuls. Le rapprochement
se fait tout seul, et sans que le site ait à conclure quoi que ce soit.

Deux repères nationaux accompagnent chaque fiche : **23 681 communes sur
34 836 n'avaient qu'une seule liste au premier tour**, soit 68 % ; et 1 526
communes seulement ont connu un second tour. S'y ajoutent les sièges au conseil
municipal et **au conseil communautaire** — le poids de la commune là où se
décident les compétences transférées, que tout le reste du panneau décrit.

Le scrutin de 2026 est aussi le premier où toutes les communes votent au
scrutin de liste paritaire : la loi du 21 mai 2025 l'a étendu aux communes de
moins de 1 000 habitants, sept sur dix, et le panachage a disparu. Le processus
d'inscription électorale le dit.

### Les délibérations, sans recensement national ✔

C'est là que se décide ce que tout le reste du site décrit : une compétence
transférée l'a été par une délibération, un budget voté l'est en séance, un
marché est autorisé par une autorisation de signature. Le site montrait le
résultat sans jamais montrer l'acte.

**Il n'existe aucune consolidation nationale**, et la raison est juridique :
l'ordonnance n° 2021-1310 impose depuis le 1er juillet 2022 de publier les
actes en ligne — mais **sur le site de la collectivité**. Elle a dématérialisé
la publicité sans créer de dépôt central, et l'open data reste facultatif.

Ce qui existe, en revanche, c'est un **format commun** : le schéma SCDL
« délibérations ». Le collecteur s'y adosse, et se remplit par deux robinets :

- **la découverte**, par l'attribut de schéma que data.gouv expose — 211
  ressources aujourd'hui, ingérées sans qu'on ait à les connaître, et la
  couverture grossit d'elle-même ;
- **une liste déclarée**, pour les agrégateurs qui publient au format sans le
  déclarer sur leurs ressources. Mégalis Bretagne est le plus gros — la
  découverte seule le manquerait, et avec lui l'essentiel du volume.

Résultat : **570 916 délibérations depuis 2014, pour 1 260 collectivités** —
communes, intercommunalités, syndicats, un département et une région. Le
rattachement se fait par SIREN, exactement comme les marchés, si bien qu'une
délibération de la communauté d'agglomération ou du syndicat d'eau apparaît
sous la commune qu'elle engage.

**Le bloc ne vaut jamais zéro.** Une collectivité absente n'est pas une
collectivité qui ne délibère pas : c'est une collectivité qui ne verse pas ses
actes en données ouvertes, et la phrase de source le dit en toutes lettres. Ce
n'est pas la même chose que les subventions, où un total partiel aurait été un
chiffre faux ; ici, une liste absente est une liste absente.

**3 294 délibérations sont écartées** parce que leur objet nomme quelqu'un —
« cession de la parcelle AC 0151 à Madame X », « aide sociale à M. Y ». Ce sont
précisément celles qui statuent sur le cas d'une personne. Le filtre réutilise
le motif qui interdit déjà un nom dans `contenu/`, désormais dans
`src/modele/civilites.ts` pour que les deux usages ne divergent pas. Il est
grossier — un nom sans civilité lui échappe — et il ne remplace pas la
précaution qui vaut pour tout le bloc : **le site relaie un intitulé et un
lien, jamais le document**, qui reste chez la collectivité qui l'a publié.
C'était la réserve de `07-risques.md` sur les délibérations : elle visait
« republier et indexer », et lier ne fait ni l'un ni l'autre.

Deux défauts que le premier essai a révélés, et qu'aucune relecture de code
n'aurait attrapés : un producteur écrit en point-virgule et un autre en
virgule — le délimiteur se tranche sur l'en-tête ; et un fichier est en
Windows-1252 quand tous les autres sont en UTF-8 — le décodage strict échoue
sur ces octets, et c'est ce qui les signale, sans avoir à deviner.

Un troisième est resté tel quel, après vérification de la source : un
producteur retire les apostrophes de ses intitulés — « en application de
larticle L2122-22 ». Le réparer demanderait de distinguer « larticle » de
« larve », donc un dictionnaire. Le site rend l'intitulé tel qu'il a été
publié, comme il rend les majuscules sans accents des marchés publics.

### Les subventions aux associations ✔ *(revenues par une autre porte)*

Elles avaient été écartées : publiées collectivité par collectivité, sans
agrégat national, elles ne permettaient pas de reconstituer un total qui ne
soit pas trompeur. Le collecteur écrit pour les délibérations a changé la
donne — il ingère **tout jeu conforme à un schéma du socle commun**, sans
qu'on ait à connaître les producteurs, et le schéma « subventions » existe au
même titre que celui des délibérations.

La mécanique commune est sortie dans `scripts/donnees-ouvertes.ts` : détection
du délimiteur, détection de l'encodage, découverte par attribut de schéma.
Trois précautions qu'un fichier réel a exigées chacune, et qui servent
désormais deux collecteurs au lieu d'un.

**Aucun total n'est affiché, et cette fois la raison est dans le texte.** Le
décret n° 2017-779 n'impose la publication qu'au-dessus de **23 000 €**, et
seulement pour les collectivités de plus de 3 500 habitants employant plus de
cinquante agents. Certains producteurs publient tout, d'autres s'en tiennent
au seuil — le titre de leurs jeux le dit souvent : « subventions de
fonctionnement supérieures à 23 000 € ». Sommer les deux donnerait un chiffre
sous-estimé d'un facteur inconnu, variable d'une commune à l'autre. Le site
montre les lignes, les plus grosses d'abord, et dit pourquoi il ne les
additionne pas.

Deux découvertes en chemin :

- **Les trois quarts des lignes venaient de départements et de régions que le
  site ne savait pas rattacher.** Les collectivités territoriales portent un
  SIREN construit — `22` puis le code du département, `23` puis celui du
  département chef-lieu pour une région — et la règle a été vérifiée sur huit
  cas observés avant d'être écrite. Les collecteurs prennent désormais un
  prédicat plutôt qu'une liste figée, ce qui profite aussi aux délibérations :
  les assemblées départementales et régionales y entrent du même coup.
- **9 971 lignes sont perdues sans recours** : leur SIRET a été enregistré par
  un tableur en notation scientifique — `2,256E+13`. La précision est partie
  avec, et aucun traitement ne la rend. On le constate, on ne le devine pas.

Le mot-clé reste dans la veille : le jour où un agrégat national paraît, la
couverture cesse d'être une affaire de bonne volonté.

### Les obligations de publication ✔

La phase 2 bis listait « mentions légales, licence » sans que rien n'existe :
le pied de page affirmait un contenu « sous licence CC BY-SA 4.0 » qu'aucun
fichier du dépôt n'adoptait, et le README la donnait comme une « proposition ».

Ce qui est en place :

- **`LICENSE` (MIT) pour le code, `LICENSE-CONTENU.md` (CC BY-SA 4.0) pour le
  contenu éditorial.** Le second est la licence de Wikipédia, ce qui est
  cohérent avec un projet qui relie plutôt qu'il ne réécrit.
- **La licence de chaque jeu réutilisé, vérifiée une par une** plutôt que
  supposée : OFGL et DECP en Licence Ouverte v2.0, GASPAR et le répertoire des
  associations en Licence Ouverte, le découpage Etalab en Licence Ouverte
  également — ses codes postaux, autrefois sous ODbL, ne le sont plus.
  **Aucun ODbL**, donc aucun partage à l'identique qui entrerait en conflit
  avec le CC BY-SA du reste. La seule obligation est de citer la source et sa
  date : chaque bloc de chiffres le fait déjà.
- **Une page `/mentions`** qui dit ce que le site sait de son lecteur — un
  site statique, aucune mesure d'audience, aucun cookie, une seule clé de
  stockage local pour la commune choisie — et qui **construit la liste des
  jeux réutilisés depuis la veille** plutôt que de la recopier : une liste
  écrite à la main vieillirait dès la source suivante.
- **L'identité de l'éditeur est du contenu, donc vérifiée par le build.**
  `contenu/editeur.yaml` la déclare, et `npm run publier` — ce que lance le
  déploiement — refuse de générer tant qu'un champ porte sa valeur d'attente.
  `npm run build` se contente d'un avertissement : l'obligation de l'article 6
  de la loi pour la confiance dans l'économie numérique naît de la mise à
  disposition du public, pas de l'écriture d'une fiche.

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
