/**
 * Le modèle de données de Rouages, rendu exécutable.
 *
 * Ces schémas ne sont pas de la plomberie : ils sont la ligne éditoriale
 * appliquée mécaniquement. Une fiche sans source, sans date de vérification ou
 * sans levier d'action ne peut pas être publiée parce que le build échoue.
 *
 * Référence : docs/03-modele-de-donnees.md
 */
import { z } from 'zod';

/** Identifiant stable, en minuscules. Jamais réutilisé pour autre chose. */
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
  sources: z.array(Id).min(1, 'toute entité porte au moins une source'),
  verifie_le: dateSimple,
  verifie_par: z.string().optional(),
  /** Mois avant que la fiche ne se signale comme potentiellement périmée. */
  perime_apres_mois: z.number().int().positive().default(12),
  confiance: Confiance,
  wikipedia: z.string().url().optional(),
};

export const Source = z.object({
  id: Id,
  type: z.enum(['droit', 'donnees_ouvertes', 'page_officielle', 'etude', 'presse']),
  titre: z.string().min(3),
  url: z.string().url(),
  consulte_le: dateSimple,
});

export const Acteur = z.object({
  id: Id,
  nom: z.string().min(2),
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
  echelon: z
    .enum(['commune', 'epci', 'departement', 'region', 'etat', 'union_europeenne', 'prive'])
    .optional(),
  resume: z.string().min(10, 'le résumé doit être lisible seul'),
  ...tracable,
});

export const Competence = z.object({
  id: Id,
  nom: z.string().min(3),
  acteur: Id,
  resume: z.string().min(10),
  partagee_avec: z.array(Id).default([]),
  ...tracable,
});

export const Document = z.object({
  id: Id,
  nom: z.string().min(3),
  resume: z.string().optional(),
  ou_le_trouver: z.string().optional(),
  sources: z.array(Id).min(1),
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
  sources: z.array(Id).min(1),
  confiance: Confiance,
});

/**
 * L'entité distinctive du projet : le point où un citoyen peut effectivement
 * intervenir. Aucun site institutionnel ne la modélise ; c'est elle qui
 * transforme une encyclopédie en outil.
 */
export const Levier = z.object({
  id: Id,
  quoi: z.string().min(5),
  quand: z.string().min(3),
  aupres_de: z.string().min(3),
  difficulte: z.enum(['faible', 'moyenne', 'elevee']),
  /** Le point de forme sur lequel on perd, presque toujours. */
  piege: z.string().optional(),
  recours_si_refus: z.string().optional(),
  /** Position sur la frise des fenêtres d'action, en n° d'étape du processus. */
  ancre_etape: z.number().int().positive().optional(),
  sources: z.array(Id).min(1),
  confiance: Confiance,
});

export const Processus = z.object({
  id: Id,
  nom: z.string().min(3),
  famille: z.enum(['publics', 'quotidien', 'economiques', 'influence']),
  resume: z.string().min(10),
  declencheur: z.string().min(5),
  sortie: z.string().min(5),
  /** Qui signe, au bout du compte. La réponse à la question 1, en un id. */
  decideur: Id,
  etapes: z.array(Etape).min(1, 'un processus a au moins une étape'),
  leviers: z
    .array(Levier)
    .min(1, "un processus sans levier d'action n'est pas une fiche Rouages"),
  ...tracable,
});

export const Flux = z.object({
  id: Id,
  nature: z.enum(['argent', 'information', 'autorisation', 'obligation', 'attention']),
  de: Id,
  vers: z.array(Id).min(1),
  resume: z.string().min(10),
  ordre_de_grandeur: z.string().optional(),
  ...tracable,
});

/** Un fichier de contenu : toutes les entités d'un même rouage. */
export const FichierContenu = z.object({
  acteurs: z.array(Acteur).default([]),
  competences: z.array(Competence).default([]),
  documents: z.array(Document).default([]),
  processus: z.array(Processus).default([]),
  flux: z.array(Flux).default([]),
  sources: z.array(Source).default([]),
});

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
