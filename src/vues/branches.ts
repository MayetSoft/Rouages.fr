/**
 * Les entités de l'État rangées par branche du pouvoir.
 *
 * C'est une lecture orthogonale à la carte d'ensemble : celle-ci range par
 * échelon territorial — qui est loin, qui est près — alors que la séparation
 * des pouvoirs se joue entièrement à l'intérieur d'une seule colonne, celle de
 * l'État. Les deux ne peuvent donc pas tenir dans le même schéma.
 *
 * Une bande par branche, les entités s'y rangeant à la suite. Une entité qui
 * en exerce deux — le Conseil d'État — apparaît dans les deux bandes, tracée
 * en pointillé : c'est le seul moyen de ne pas devoir choisir.
 */
import type { Acteur, Pouvoir } from '../modele/schemas.ts';
import { LIBELLE_POUVOIR, POUVOIRS } from '../modele/schemas.ts';
import { largeurPastille } from './formes.ts';
import { echapper, LARGEUR, svg, texte } from './commun.ts';
import type { Vue } from './commun.ts';

const MARGE = 4;
const HAUTEUR_PASTILLE = 34;
const INTERLIGNE = 42;
const ENTETE = 30;
const ENTRE_BANDES = 22;

interface Place {
  acteur: Acteur;
  x: number;
  y: number;
  l: number;
  /** Vrai quand l'entité figure aussi dans une autre bande. */
  partage: boolean;
}

/** Les entités d'une branche, dans l'ordre déclaré — donc stable d'un build à l'autre. */
function bande(acteurs: Acteur[], pouvoir: Pouvoir): Acteur[] {
  return acteurs.filter((a) => a.pouvoirs?.includes(pouvoir));
}

export function schemaBranches(acteurs: Acteur[], id = 'branches'): Vue {
  const classes = POUVOIRS.map((p) => ({ pouvoir: p, membres: bande(acteurs, p) })).filter(
    (b) => b.membres.length > 0,
  );

  const places: Place[] = [];
  const entetes: { titre: string; compte: number; y: number }[] = [];
  let y = MARGE + 6;

  for (const { pouvoir, membres } of classes) {
    entetes.push({ titre: LIBELLE_POUVOIR[pouvoir], compte: membres.length, y });
    y += ENTETE;

    // Remplissage ligne à ligne : déterministe, contrairement à un placement
    // par simulation de forces qui donnerait un schéma différent à chaque build.
    let x = MARGE;
    for (const a of membres) {
      const etiquette = a.nom_court ?? a.nom;
      const l = largeurPastille(etiquette, 13, 84);
      if (x + l > LARGEUR - MARGE) {
        x = MARGE;
        y += INTERLIGNE;
      }
      places.push({ acteur: a, x, y, l, partage: (a.pouvoirs?.length ?? 0) > 1 });
      x += l + 10;
    }
    y += INTERLIGNE + ENTRE_BANDES;
  }

  const hauteur = y - ENTRE_BANDES + MARGE;

  const dessin = [
    ...entetes.map(
      (e) =>
        `<line class="v-axe" x1="${MARGE}" y1="${e.y + 16}" x2="${LARGEUR - MARGE}" y2="${e.y + 16}" />` +
        texte(MARGE, e.y + 10, `${e.titre} — ${e.compte}`, { classe: 'v-entete' }),
    ),
    ...places.map((p) => {
      const etiquette = p.acteur.nom_court ?? p.acteur.nom;
      const classe = `v-branche${p.partage ? ' v-branche--partagee' : ''}`;
      return (
        `<a href="/n/${encodeURIComponent(p.acteur.id)}" class="n">` +
        `<rect class="${classe}" x="${p.x}" y="${p.y}" width="${p.l}" height="${HAUTEUR_PASTILLE}" rx="${HAUTEUR_PASTILLE / 2}" />` +
        texte(p.x + p.l / 2, p.y + HAUTEUR_PASTILLE / 2 + 4, etiquette, {
          classe: 'v-texte',
          ancre: 'middle',
        }) +
        `</a>`
      );
    }),
  ].join('');

  const partagees = [...new Set(places.filter((p) => p.partage).map((p) => p.acteur.nom))];
  const description =
    `Les entités de l'État rangées par branche : ` +
    classes.map((b) => `${LIBELLE_POUVOIR[b.pouvoir].toLowerCase()}, ${b.membres.length}`).join(' ; ') +
    `. ` +
    (partagees.length > 0
      ? `${partagees.join(', ')} ${partagees.length > 1 ? 'apparaissent' : 'apparaît'} dans plusieurs bandes, en pointillé, car ${partagees.length > 1 ? 'elles en exercent' : 'il en exerce'} plusieurs.`
      : '');

  const lignes = acteurs
    .filter((a) => a.pouvoirs)
    .map(
      (a) =>
        `<tr><td><a href="/n/${encodeURIComponent(a.id)}">${echapper(a.nom)}</a></td>` +
        `<td>${a.pouvoirs!.map((p) => echapper(LIBELLE_POUVOIR[p])).join(', ')}</td>` +
        `<td>${echapper(a.resume)}</td></tr>`,
    )
    .join('');

  return {
    titre: "Les entités de l'État par branche du pouvoir",
    svg: svg(id, hauteur, "Les entités de l'État par branche du pouvoir", description, dessin),
    tableau:
      `<table class="v-tableau"><caption>Chaque entité et la ou les branches dont elle relève.</caption>` +
      `<thead><tr><th scope="col">Entité</th><th scope="col">Branche</th><th scope="col">Rôle</th></tr></thead>` +
      `<tbody>${lignes}</tbody></table>`,
  };
}
