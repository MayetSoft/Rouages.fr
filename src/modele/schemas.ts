/**
 * Le modèle de données de Rouages, rendu exécutable.
 *
 * Le site n'a pas d'articles : il a un graphe. Une entité n'existe donc que si
 * elle est reliée à d'autres et si elle renvoie vers au moins une page de
 * référence — Wikipédia pour la définition, Légifrance pour la règle,
 * l'open data pour les chiffres. Nous ne réécrivons rien de ce que ces sites
 * disent déjà mieux ; nous montrons ce qu'ils ne montrent pas : les liens.
 *
 * Ces schémas sont donc la ligne éditoriale appliquée mécaniquement : sans lien
 * sortant, sans date de vérification, ou avec une référence cassée, le build
 * échoue.
 *
 * Référence : docs/03-modele-de-donnees.md
 */
import { z } from 'zod';

/** Identifiant stable, en minuscules. Jamais réutilisé pour autre chose. */
/** Les colonnes de la carte d'ensemble, du plus lointain au plus proche. */
export const ECHELONS = [
  'union_europeenne',
  'etat',
  'region',
  'departement',
  'epci',
  'commune',
  'prive',
  'citoyen',
] as const;
export type Echelon = (typeof ECHELONS)[number];

export const LIBELLE_ECHELON: Record<Echelon, string> = {
  union_europeenne: 'Union européenne',
  etat: 'État',
  region: 'Région',
  departement: 'Département',
  epci: 'Intercommunalité',
  commune: 'Commune',
  prive: 'Acteurs privés',
  citoyen: 'Vous',
};

export const Id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'un id est en minuscules, mots séparés par des tirets');

/**
 * Le niveau de certitude affiché à l'usager. `variable_selon_territoire` est
 * indispensable en France : la répartition commune / EPCI dépend des statuts
 * locaux, et prétendre à une réponse unique serait faux.
 */
export const Confiance = z
  .enum(['etabli', 'variable_selon_territoire', 'a_confirmer'])
  .default('etabli');

const dateSimple = z.coerce.date();

/** Champs de traçabilité communs à toute entité sauf les sources elles-mêmes. */
const tracable = {
  /**
   * Les pages de référence vers lesquelles ce nœud renvoie. C'est le contenu
   * du site : on relie, on ne rédige pas.
   */
  liens: z.array(Id).min(1, 'toute entité renvoie vers au moins une page de référence'),
  verifie_le: dateSimple,
  verifie_par: z.string().optional(),
  /** Mois avant que la fiche ne se signale comme potentiellement périmée. */
  perime_apres_mois: z.number().int().positive().default(12),
  confiance: Confiance,
};

/** Une page de référence. Jamais recopiée, seulement citée et liée. */
export const Source = z.object({
  id: Id,
  type: z.enum(['wikipedia', 'droit', 'donnees_ouvertes', 'page_officielle', 'etude', 'presse']),
  titre: z.string().min(3),
  url: z.string().url(),
  consulte_le: dateSimple,
});

export const Acteur = z.object({
  id: Id,
  nom: z.string().min(2),
  /** Étiquette portée sur les schémas, où la place manque. */
  nom_court: z.string().min(2).max(24).optional(),
  type: z.enum([
    'personne',
    'mandat_electif',
    'assemblee',
    'service_administratif',
    'service_deconcentre',
    'collectivite',
    'entreprise',
    'association',
    'metier',
  ]),
  /** Détermine la colonne du nœud sur la carte d'ensemble. */
  echelon: z.enum(ECHELONS),
  /** Une phrase, pas un paragraphe : le détail est sur les pages liées. */
  resume: z.string().min(10).max(280, 'une phrase suffit — le reste est sur les pages liées'),
  ...tracable,
});

export const Competence = z.object({
  id: Id,
  nom: z.string().min(3),
  nom_court: z.string().min(3).max(28).optional(),
  /**
   * Les codes du référentiel BANATIC qui permettent de dire, pour une commune
   * donnée, qui exerce réellement cette compétence.
   *
   * C'est la compétence qui déclare comment elle se résout : la correspondance
   * est une décision éditoriale, pas un détail d'implémentation, et elle se
   * relit dans le contenu plutôt que dans un script.
   */
  banatic: z.array(z.string().regex(/^\d{3,5}$/)).default([]),
  acteur: Id,
  resume: z.string().min(10).max(280, 'une phrase suffit — le reste est sur les pages liées'),
  partagee_avec: z.array(Id).default([]),
  ...tracable,
});

export const Document = z.object({
  id: Id,
  nom: z.string().min(3),
  resume: z.string().max(280).optional(),
  ou_le_trouver: z.string().optional(),
  liens: z.array(Id).min(1),
});

/**
 * La nature du délai est aussi importante que sa valeur : un maximum légal et
 * un délai observé ne se traitent pas pareil quand on organise sa réaction.
 */
export const Delai = z.object({
  valeur: z.number().positive(),
  unite: z.enum(['jours', 'semaines', 'mois', 'annees']),
  nature: z.enum(['maximum_legal', 'indicatif', 'observe']),
});

export const Etape = z.object({
  ordre: z.number().int().positive(),
  acteur: Id,
  action: z.string().min(5),
  delai: Delai.optional(),
  produit: z.array(Id).default([]),
  note: z.string().optional(),
  conditionnelle: z.boolean().default(false),
  liens: z.array(Id).min(1),
  confiance: Confiance,
});

/**
 * L'entité distinctive du projet : le point où un citoyen peut effectivement
 * intervenir. Aucun site institutionnel ne la modélise ; c'est elle qui
 * transforme une encyclopédie en outil.
 */
export const Levier = z.object({
  id: Id,
  /** Qui peut agir. Par défaut vous. */
  acteur: Id.default('citoyen'),
  quoi: z.string().min(5),
  quand: z.string().min(3),
  aupres_de: z.string().min(3),
  difficulte: z.enum(['faible', 'moyenne', 'elevee']),
  /** Le point de forme sur lequel on perd, presque toujours. */
  piege: z.string().optional(),
  recours_si_refus: z.string().optional(),
  /** Position sur la frise des fenêtres d'action, en n° d'étape du processus. */
  ancre_etape: z.number().int().positive().optional(),
  liens: z.array(Id).min(1),
  confiance: Confiance,
});

export const Processus = z.object({
  id: Id,
  nom: z.string().min(3),
  famille: z.enum(['publics', 'quotidien', 'economiques', 'influence']),
  resume: z.string().min(10).max(280),
  declencheur: z.string().min(5),
  sortie: z.string().min(5),
  /** Qui signe, au bout du compte. La réponse à la question 1, en un id. */
  decideur: Id,
  /** Les compétences que ce processus met en œuvre — relie le temps au réseau. */
  competences: z.array(Id).default([]),
  etapes: z.array(Etape).min(1, 'un processus a au moins une étape'),
  leviers: z
    .array(Levier)
    .min(1, "un processus sans levier d'action n'est pas une fiche Rouages"),
  ...tracable,
});

export const Flux = z.object({
  id: Id,
  /** Le libellé porté par l'arête sur le schéma. */
  nom: z.string().min(3).max(60),
  nature: z.enum(['argent', 'information', 'autorisation', 'obligation', 'attention']),
  de: Id,
  vers: z.array(Id).min(1),
  resume: z.string().min(10).max(280),
  ordre_de_grandeur: z.string().optional(),
  ...tracable,
});

/**
 * Un sigle et son développé.
 *
 * Un sigle non expliqué est une porte fermée pour exactement le lecteur à qui
 * le site s'adresse. La validation refuse donc toute suite de majuscules qui
 * n'a pas son entrée ici.
 */
export const Sigle = z.object({
  id: Id,
  /** Tel qu'il s'écrit dans le texte, casse comprise : SCoT, PLUi, NOTRe. */
  sigle: z.string().min(2).max(12),
  developpe: z.string().min(4).max(120),
  definition: z.string().max(200).optional(),
  /** La fiche correspondante, quand il y en a une. */
  noeud: Id.optional(),
  liens: z.array(Id).default([]),
  confiance: Confiance,
});

/**
 * Un repère financier : un agrégat des comptes publics, rendu comparable.
 *
 * Un montant seul ne dit rien. Chaque repère est donc restitué en euros par
 * habitant et confronté à la médiane des communes de taille voisine — ce que le
 * site recommande par ailleurs de faire avant de conclure quoi que ce soit.
 */
export const Repere = z.object({
  id: Id,
  nom: z.string().min(3).max(60),
  /** Libellé exact de l'agrégat OFGL : l'ingestion échoue s'il ne correspond pas. */
  agregat: z.string().min(3),
  /** Le flux du réseau que ce repère chiffre, quand la correspondance est exacte. */
  flux: Id.optional(),
  explication: z.string().min(10).max(280),
  liens: z.array(Id).min(1),
});

/** Un fichier de contenu : toutes les entités d'un même rouage. */
export const FichierContenu = z.object({
  acteurs: z.array(Acteur).default([]),
  competences: z.array(Competence).default([]),
  documents: z.array(Document).default([]),
  processus: z.array(Processus).default([]),
  flux: z.array(Flux).default([]),
  sources: z.array(Source).default([]),
  sigles: z.array(Sigle).default([]),
  reperes: z.array(Repere).default([]),
});

export type Repere = z.infer<typeof Repere>;
export type Sigle = z.infer<typeof Sigle>;
export type Source = z.infer<typeof Source>;
export type Acteur = z.infer<typeof Acteur>;
export type Competence = z.infer<typeof Competence>;
export type Document = z.infer<typeof Document>;
export type Etape = z.infer<typeof Etape>;
export type Levier = z.infer<typeof Levier>;
export type Processus = z.infer<typeof Processus>;
export type Flux = z.infer<typeof Flux>;
export type Delai = z.infer<typeof Delai>;
export type FichierContenu = z.infer<typeof FichierContenu>;
