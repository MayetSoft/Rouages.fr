/**
 * L'encodage visuel des relations — partagé par l'explorateur et les schémas
 * rendus au build, pour que les deux disent exactement la même chose.
 *
 * Sept types d'arêtes, mais **cinq familles seulement**, parce qu'au-delà la
 * couleur cesse de distinguer quoi que ce soit. Et trois teintes seulement
 * portent l'identité : bleu, orange, aqua sont le seul triplet de notre palette
 * qui passe les seuils de séparation en vision normale *et* daltonienne, en
 * clair comme en sombre, avec toutes les paires simultanément à l'écran — ce
 * qui est le cas d'un graphe, contrairement à un histogramme.
 *
 * Les deux familles restantes n'utilisent donc pas de teinte :
 *   — « information » prend le gris de texte : c'est de la plomberie, elle doit
 *     rester en retrait ;
 *   — « vous pouvez agir » prend la couleur de l'encre, le contraste maximal
 *     disponible. C'est l'information la plus importante du site, et elle reste
 *     lisible sans aucune perception des couleurs.
 *
 * Chaque famille porte en plus son propre tracé (plein, tirets, pointillés) :
 * l'identité ne repose jamais sur la seule couleur.
 */
import type { Arete, TypeArete } from './reseau.ts';

export type Famille = 'pouvoir' | 'partage' | 'argent' | 'information' | 'levier';

export const FAMILLES: {
  id: Famille;
  libelle: string;
  aide: string;
  /** Aperçu du tracé dans la légende : tirets SVG. */
  tirets: string;
}[] = [
  { id: 'pouvoir', libelle: 'Pouvoir', aide: 'qui détient une compétence, qui intervient', tirets: '' },
  { id: 'partage', libelle: 'Partagé', aide: 'la compétence est exercée à plusieurs', tirets: '7 5' },
  { id: 'argent', libelle: 'Argent', aide: 'ce qui est versé, et dans quel sens', tirets: '' },
  { id: 'information', libelle: 'Information', aide: 'ce qui est produit et publié', tirets: '2 4' },
  { id: 'levier', libelle: 'Vous pouvez agir', aide: 'les moments où un tiers peut peser', tirets: '1 7' },
];

const PAR_TYPE: Record<TypeArete, Famille> = {
  detient: 'pouvoir',
  exerce: 'pouvoir',
  intervient: 'pouvoir',
  partage: 'partage',
  flux: 'argent',
  produit: 'information',
  'peut-agir': 'levier',
};

export function famille(a: Pick<Arete, 'type' | 'nature'>): Famille {
  if (a.type === 'flux') return a.nature === 'information' ? 'information' : 'argent';
  return PAR_TYPE[a.type];
}

/** Les familles qui portent une flèche : celles où le sens change le sens. */
export const FLECHEE: Record<Famille, boolean> = {
  pouvoir: false,
  partage: false,
  argent: true,
  information: true,
  levier: true,
};

export const LIBELLE_ARETE: Record<TypeArete, string> = {
  detient: 'détient',
  partage: 'partage avec',
  flux: 'verse à',
  intervient: 'intervient dans',
  'peut-agir': 'peut agir sur',
  produit: 'produit',
  exerce: 'met en œuvre',
};

export const LIBELLE_INVERSE: Record<TypeArete, string> = {
  detient: 'détenue par',
  partage: 'partagée avec',
  flux: 'reçoit de',
  intervient: 'fait intervenir',
  'peut-agir': 'ouvert à',
  produit: 'produit par',
  exerce: 'mise en œuvre par',
};

export const LIBELLE_TYPE_NOEUD = {
  acteur: 'Acteur',
  competence: 'Compétence',
  processus: 'Processus',
  document: 'Document',
} as const;

export const LIBELLE_LIEN: Record<string, string> = {
  wikipedia: 'Wikipédia',
  droit: 'Le texte',
  page_officielle: 'Page officielle',
  donnees_ouvertes: 'Données ouvertes',
  etude: 'Étude',
  presse: 'Presse',
};
