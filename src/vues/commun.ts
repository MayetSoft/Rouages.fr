/**
 * Boîte à outils commune aux vues.
 *
 * Les schémas sont générés au build, en SVG, sans JavaScript côté client :
 * ils doivent être lisibles sans JS, indexables, imprimables et partageables.
 * Les couleurs viennent de classes CSS, jamais d'attributs en dur, pour que le
 * thème sombre et l'impression fonctionnent.
 */

export interface Vue {
  /** Le schéma. */
  svg: string;
  /** L'équivalent tabulaire, obligatoire : un schéma n'est jamais seul. */
  tableau: string;
  titre: string;
}

export const LARGEUR = 720;

export function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Découpe approximative : suffisante pour du SVG généré, sans mesure de police. */
export function couper(texte: string, largeurPx: number, taillePolice = 13): string[] {
  // Marge volontaire : les titres sont en gras, plus larges que la moyenne.
  const parCaractere = taillePolice * 0.6;
  const max = Math.max(8, Math.floor(largeurPx / parCaractere));
  const lignes: string[] = [];
  let courante = '';
  for (const mot of texte.split(/\s+/)) {
    if (courante.length === 0) courante = mot;
    else if (courante.length + 1 + mot.length <= max) courante += ' ' + mot;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

export function texte(
  x: number,
  y: number,
  contenu: string,
  options: { classe?: string; ancre?: 'start' | 'middle' | 'end'; interligne?: number; largeur?: number; taille?: number } = {},
): string {
  const { classe = 'v-texte', ancre = 'start', interligne = 16, largeur, taille = 13 } = options;
  const lignes = largeur ? couper(contenu, largeur, taille) : [contenu];
  return lignes
    .map(
      (ligne, i) =>
        `<text class="${classe}" x="${x}" y="${y + i * interligne}" text-anchor="${ancre}">${echapper(ligne)}</text>`,
    )
    .join('');
}

export function hauteurTexte(contenu: string, largeur: number, interligne = 16, taille = 13): number {
  return couper(contenu, largeur, taille).length * interligne;
}

export function boite(
  x: number,
  y: number,
  l: number,
  h: number,
  classe = 'v-boite',
  rayon = 6,
): string {
  return `<rect class="${classe}" x="${x}" y="${y}" width="${l}" height="${h}" rx="${rayon}" />`;
}

/**
 * Enveloppe accessible : le schéma est annoncé, décrit, et toujours accompagné
 * de son équivalent tabulaire dans le DOM.
 */
export function svg(
  id: string,
  hauteur: number,
  titre: string,
  description: string,
  contenu: string,
  largeur: number = LARGEUR,
): string {
  return [
    `<svg class="v-schema" viewBox="0 0 ${largeur} ${Math.ceil(hauteur)}"`,
    ` role="img" aria-labelledby="${id}-t ${id}-d"`,
    ` xmlns="http://www.w3.org/2000/svg">`,
    `<title id="${id}-t">${echapper(titre)}</title>`,
    `<desc id="${id}-d">${echapper(description)}</desc>`,
    contenu,
    `</svg>`,
  ].join('');
}

/** Libellé lisible de la nature d'un délai — l'information la plus utile du site. */
/** Court, pour les schémas. */
export const NATURE_DELAI: Record<string, string> = {
  maximum_legal: 'maximum prévu par les textes',
  indicatif: 'indicatif',
  observe: 'constaté en pratique',
};

/** Développé, pour les tableaux et les descriptions lues à voix haute. */
export const NATURE_DELAI_LONG: Record<string, string> = {
  maximum_legal: 'délai maximum prévu par les textes',
  indicatif: 'délai seulement indicatif',
  observe: 'délai constaté en pratique',
};

/** Court, pour les schémas. */
export const DIFFICULTE: Record<string, string> = {
  faible: 'Facile',
  moyenne: 'Moyen',
  elevee: 'Difficile',
};

/** Développé, pour les tableaux. */
export const DIFFICULTE_LONG: Record<string, string> = {
  faible: 'Facile, sans formalisme',
  moyenne: 'Demande un peu de méthode',
  elevee: 'Difficile à mener seul',
};

export const CONFIANCE: Record<string, string> = {
  etabli: 'Établi',
  variable_selon_territoire: 'Variable selon le territoire',
  a_confirmer: 'À confirmer',
};
