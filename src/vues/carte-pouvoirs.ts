/**
 * V1 — Carte des pouvoirs : « qui décide quoi ».
 *
 * Le partage de compétences est rendu explicite, parce que c'est le point le
 * plus mal compris : en France, une compétence a rarement un seul détenteur.
 */
import type { Graphe } from '../modele/graphe.ts';
import type { Competence } from '../modele/schemas.ts';
import { LARGEUR, boite, echapper, hauteurTexte, svg, texte, CONFIANCE } from './commun.ts';

const COL = { acteur: 0, competence: 250, partage: 500 };
const LARGEUR_COL = 210;
const MARGE = 18;

export function carteDesPouvoirs(g: Graphe, competences: Competence[], id = 'v1') {
  const morceaux: string[] = [];
  let y = 34;

  morceaux.push(texte(COL.acteur, 16, 'Qui détient', { classe: 'v-entete' }));
  morceaux.push(texte(COL.competence, 16, 'La compétence', { classe: 'v-entete' }));
  morceaux.push(texte(COL.partage, 16, 'Partagée avec', { classe: 'v-entete' }));

  for (const c of competences) {
    const detenteur = g.acteurs.get(c.acteur);
    const partages = c.partagee_avec.map((a) => g.acteurs.get(a)).filter(Boolean);

    const hDetenteur = 30 + hauteurTexte(detenteur?.nom ?? c.acteur, LARGEUR_COL - 24, 16, 14);
    const hCompetence = 30 + hauteurTexte(c.nom, LARGEUR_COL - 24, 16, 14);
    const hPartage =
      partages.length === 0
        ? 40
        : partages.reduce((t, a) => t + 30 + hauteurTexte(a!.nom, LARGEUR_COL - 24, 16, 14), 0) +
          (partages.length - 1) * 8;
    const hLigne = Math.max(hDetenteur, hCompetence, hPartage);

    morceaux.push(boite(COL.acteur, y, LARGEUR_COL, hDetenteur, 'v-boite v-boite--acteur'));
    morceaux.push(
      texte(COL.acteur + 12, y + 20, detenteur?.nom ?? c.acteur, {
        classe: 'v-titre-boite',
        largeur: LARGEUR_COL - 24,
        taille: 14,
      }),
    );

    morceaux.push(fleche(COL.acteur + LARGEUR_COL, y + hLigne / 2, COL.competence, y + hLigne / 2));
    morceaux.push(boite(COL.competence, y, LARGEUR_COL, hCompetence, 'v-boite v-boite--competence'));
    morceaux.push(
      texte(COL.competence + 12, y + 20, c.nom, {
        classe: 'v-titre-boite',
        largeur: LARGEUR_COL - 24,
        taille: 14,
      }),
    );

    if (partages.length > 0) {
      morceaux.push(
        fleche(COL.competence + LARGEUR_COL, y + hLigne / 2, COL.partage, y + hLigne / 2, true),
      );
      let yp = y;
      for (const a of partages) {
        const h = 30 + hauteurTexte(a!.nom, LARGEUR_COL - 24, 16, 14);
        morceaux.push(boite(COL.partage, yp, LARGEUR_COL, h, 'v-boite v-boite--partage'));
        morceaux.push(
          texte(COL.partage + 12, yp + 20, a!.nom, {
            classe: 'v-titre-boite',
            largeur: LARGEUR_COL - 24,
            taille: 14,
          }),
        );
        yp += h + 8;
      }
    } else {
      morceaux.push(
        texte(COL.partage, y + 20, 'Compétence exclusive', { classe: 'v-note', taille: 13 }),
      );
    }

    if (c.confiance !== 'etabli') {
      morceaux.push(
        texte(COL.competence + 12, y + hCompetence + 15, CONFIANCE[c.confiance], {
          classe: 'v-confiance',
          taille: 12,
        }),
      );
      y += 16;
    }

    y += hLigne + MARGE;
  }

  const description = competences
    .map((c) => {
      const d = g.acteurs.get(c.acteur)?.nom ?? c.acteur;
      const p = c.partagee_avec.map((a) => g.acteurs.get(a)?.nom ?? a);
      return `${c.nom} : détenue par ${d}${p.length ? `, partagée avec ${p.join(', ')}` : ''}.`;
    })
    .join(' ');

  return {
    titre: 'Qui décide quoi',
    svg: svg(id, y, 'Carte des pouvoirs', description, morceaux.join('')),
    tableau: tableau(g, competences),
  };
}

function fleche(x1: number, y1: number, x2: number, y2: number, pointille = false): string {
  const classe = pointille ? 'v-lien v-lien--partage' : 'v-lien';
  const milieu = x1 + (x2 - x1) / 2;
  return (
    `<path class="${classe}" d="M ${x1} ${y1} H ${milieu} V ${y2} H ${x2 - 6}" />` +
    `<path class="v-pointe" d="M ${x2 - 6} ${y2 - 4} L ${x2} ${y2} L ${x2 - 6} ${y2 + 4} Z" />`
  );
}

function tableau(g: Graphe, competences: Competence[]): string {
  const lignes = competences
    .map((c) => {
      const d = echapper(g.acteurs.get(c.acteur)?.nom ?? c.acteur);
      const p = c.partagee_avec.map((a) => echapper(g.acteurs.get(a)?.nom ?? a)).join(', ');
      return `<tr><th scope="row">${echapper(c.nom)}</th><td>${d}</td><td>${p || 'Compétence exclusive'}</td><td>${CONFIANCE[c.confiance]}</td></tr>`;
    })
    .join('');
  return `<table class="v-tableau"><caption>Répartition des compétences</caption><thead><tr><th scope="col">Compétence</th><th scope="col">Détenue par</th><th scope="col">Partagée avec</th><th scope="col">Fiabilité</th></tr></thead><tbody>${lignes}</tbody></table>`;
}
export { LARGEUR };
