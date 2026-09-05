# 07 — Risques, limites et garde-fous

> Statut : à relire avant chaque changement de phase.

## 1. Péremption du contenu — le risque n°1

Le droit et les compétences changent en permanence (transferts commune/EPCI,
réformes, jurisprudence). Un site d'explication institutionnelle non entretenu
devient **activement nuisible** : il fait rater des délais.

**Garde-fous** : `verifie_le` et `perime_apres_mois` obligatoires ; mention
automatique passé la date ; contrôle « fraîcheur » et vérification des liens une
fois par semaine en intégration continue ; plafond volontaire du nombre de nœuds
selon la capacité réelle de relecture.

Le format graphe atténue ce risque plus qu'un format d'articles : un nœud porte
une phrase et des liens, pas trois écrans de développements à réviser. Ce qui
périme vraiment, ce sont les **attributions de compétences** — et elles sont
concentrées dans un seul fichier.

## 2. Exactitude juridique

Nous ne sommes ni juristes ni administration. Une erreur sur un délai de recours
a des conséquences concrètes pour un usager.

**Garde-fous** : ne jamais formuler de conseil personnalisé ; toujours renvoyer
au texte et à l'interlocuteur compétent ; afficher le niveau de `confiance` ;
pour les procédures à enjeu, faire relire par un praticien avant publication.

Le parti pris « on ne rédige pas » est aussi une protection : moins nous
affirmons, moins nous pouvons nous tromper. Le lien vers Légifrance ne périme
pas de la même façon qu'un paragraphe d'explication.

## 3. Neutralité perçue et famille « influence »

Le prebunking peut faire basculer la perception du site de « ressource » à
« militant », et rétroactivement discréditer les familles A à C.

**Garde-fous** : mécanismes uniquement, **aucun nom de personne physique**
(règle vérifiée automatiquement) ; sources académiques ou cas documentés
publiquement ; publication seulement après la phase 2 ; séparation visuelle
claire de cette famille.

## 4. Risques juridiques directs

- **Diffamation** (famille D) : traitée par la règle « pas de personnes ».
- **Droit d'auteur** : ne pas recopier service-public.fr ou Wikipédia — citer,
  lier, reformuler. Vérifier la licence de chaque jeu de données réutilisé
  (Licence Ouverte, ODbL : obligations de partage à l'identique différentes).
- **RGPD (phase 4)** : les délibérations de conseils municipaux sont publiques,
  mais contiennent des noms de personnes physiques. Republier et **indexer**
  n'est pas neutre au regard du droit à l'effacement et du référencement. À
  cadrer avant la première collecte : pseudonymisation des mentions non
  publiques par nature, exclusion de l'indexation par les moteurs, procédure de
  retrait. Recommandation : avis juridique avant la phase 4.

## 5. L'assistance à la lecture du PLU

C'est la fonctionnalité la plus demandée et la plus dangereuse. Un modèle qui
répond « votre terrain est constructible » alors qu'il ne l'est pas cause un
préjudice réel.

**Garde-fous** : l'outil **retrouve et cite**, il ne **conclut jamais**.
Réponse attendue : « voici l'article du règlement applicable à votre zone, son
texte intégral, et le lien vers le document opposable ». Toute réponse non
étayée par une citation littérale est refusée par le système. Avertissement
permanent. Aucune réponse à une question de faisabilité.

## 6. Soutenabilité

Un projet bénévole d'explication institutionnelle meurt généralement par la
maintenance, pas par le lancement.

**Garde-fous** : rester statique et sans compte utilisateur le plus longtemps
possible (coût d'exploitation ≈ 0) ; automatiser la détection de péremption
plutôt que de compter sur la vigilance ; concevoir la contribution externe dès
la phase 2 ; se donner un critère d'arrêt explicite par phase.

## 7. Concurrence de l'existant

Risque de produire un doublon moins bon de vie-publique.fr.

**Garde-fous** : l'entité `levier` et la vue V4 (« où puis-je agir ») ; l'échelon
local ; le format graphique. Si une fiche n'apporte rien de plus que la page
service-public correspondante, ne pas la publier — la lier.
