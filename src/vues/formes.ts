/**
 * La forme d'un nœud dit son type — pas sa couleur.
 *
 * La couleur est entièrement réservée aux relations : c'est là qu'elle porte
 * l'information la plus difficile à lire autrement. Le type de nœud passe donc
 * par la géométrie, qui reste lisible en noir et blanc, à l'impression, et pour
 * qui ne perçoit pas les teintes.
 *
 * Décrit une fois ici, consommé par l'explorateur (qui construit du DOM) et par
 * les schémas rendus au build (qui construisent des chaînes) : les deux ne
 * peuvent pas diverger.
 */
export type TypeNoeud = 'acteur' | 'competence' | 'processus' | 'document';

export interface Element {
  balise: 'rect' | 'path';
  attrs: Record<string, string | number>;
}

/**
 * @param l largeur, @param h hauteur, l'origine étant le coin haut-gauche.
 */
export function formeNoeud(type: TypeNoeud, l: number, h: number): Element[] {
  switch (type) {
    // Un acteur est une pastille : c'est une personne morale, elle est ronde.
    case 'acteur':
      return [{ balise: 'rect', attrs: { class: 'n-fond', width: l, height: h, rx: h / 2 } }];

    // Une compétence est une plaque : c'est une attribution, elle a des angles.
    // Rayon très faible, sinon elle se confond avec la pastille à petite taille.
    case 'competence':
      return [{ balise: 'rect', attrs: { class: 'n-fond', width: l, height: h, rx: 3 } }];

    // Un processus porte une barre à gauche : il a un début, il se déroule.
    case 'processus':
      return [
        { balise: 'rect', attrs: { class: 'n-fond', width: l, height: h, rx: 6 } },
        {
          balise: 'path',
          attrs: {
            class: 'n-marque',
            d: `M 6 2 L 6 ${h - 2}`,
          },
        },
      ];

    // Un document a le coin replié.
    case 'document': {
      const c = 11;
      return [
        {
          balise: 'path',
          attrs: {
            class: 'n-fond',
            d: `M 4 0 H ${l - c} L ${l} ${c} V ${h - 4} A 4 4 0 0 1 ${l - 4} ${h} H 4 A 4 4 0 0 1 0 ${h - 4} V 4 A 4 4 0 0 1 4 0 Z`,
          },
        },
        { balise: 'path', attrs: { class: 'n-marque', d: `M ${l - c} 0 V ${c} H ${l}` } },
      ];
    }
  }
}

/**
 * La largeur d'une pastille, calculée à un seul endroit.
 *
 * Elle sert deux fois : au build pour dimensionner les colonnes de la carte, et
 * dans le navigateur pour dessiner les pastilles. Deux formules approchantes
 * suffisent à faire se chevaucher les nœuds — c'est arrivé.
 */
export function largeurPastille(texte: string, taille = 13, minimum = 96): number {
  return Math.max(minimum, texte.length * taille * 0.6 + 28);
}

/** Décalage du texte : le processus a une barre à gauche qui prend la place. */
export function decalageTexte(type: TypeNoeud): number {
  return type === 'processus' ? 5 : 0;
}
