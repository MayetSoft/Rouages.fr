/**
 * V4 — Fenêtres d'action : « où puis-je agir, et jusqu'à quand ».
 *
 * La vue signature du projet. Aucun site institutionnel ne la propose : les
 * sources officielles décrivent la procédure du point de vue de
 * l'administration, jamais les fenêtres où un tiers peut se manifester.
 *
 * Le champ « piège » est volontairement mis en avant : dans la quasi-totalité
 * des procédures, on perd sur un point de forme, pas sur le fond.
 */
import type { Processus } from '../modele/schemas.ts';
import { boite, DIFFICULTE, DIFFICULTE_LONG, echapper, hauteurTexte, svg, texte } from './commun.ts';

const X_JALON = 0;
const L_JALON = 96;
const X_AXE = 118;
const X_CARTE = 142;
const L_CARTE = 578;
/** Place réservée en haut à droite pour l'étiquette de difficulté. */
const RESERVE_DIFFICULTE = 96;

export function fenetresAction(p: Processus, id = 'v4') {
  const etapes = new Map(p.etapes.map((e) => [e.ordre, e]));
  const leviers = [...p.leviers].sort(
    (a, b) => (a.ancre_etape ?? 0) - (b.ancre_etape ?? 0),
  );

  const morceaux: string[] = [];
  let y = 34;
  morceaux.push(texte(X_CARTE, 16, "Ce que vous pouvez faire, et avant quand", { classe: 'v-entete' }));

  const debutAxe = y + 16;
  let finAxe = debutAxe;

  for (const l of leviers) {
    const hQuoi = hauteurTexte(l.quoi, L_CARTE - 28 - RESERVE_DIFFICULTE, 18, 15);
    const hQuand = hauteurTexte(l.quand, L_CARTE - 130, 16, 13);
    const hAupres = hauteurTexte(l.aupres_de, L_CARTE - 130, 16, 13);
    const hPiege = l.piege ? hauteurTexte(l.piege, L_CARTE - 44, 15, 12) + 18 : 0;
    const hRecours = l.recours_si_refus ? 18 : 0;
    const hCarte = 16 + hQuoi + 10 + hQuand + hAupres + hRecours + hPiege + 26;

    const etape = l.ancre_etape ? etapes.get(l.ancre_etape) : undefined;
    const jalon = etape ? `Étape ${etape.ordre}` : 'À tout moment';
    morceaux.push(
      texte(X_JALON + L_JALON, y + 20, jalon, { classe: 'v-jalon', ancre: 'end', largeur: L_JALON, taille: 12 }),
    );

    morceaux.push(`<circle class="v-noeud v-noeud--levier" cx="${X_AXE}" cy="${y + 16}" r="6" />`);
    finAxe = y + 16;

    morceaux.push(boite(X_CARTE, y, L_CARTE, hCarte, `v-boite v-boite--levier v-difficulte--${l.difficulte}`));

    let yi = y + 24;
    morceaux.push(texte(X_CARTE + 14, yi, l.quoi, {
        classe: 'v-titre-levier',
        largeur: L_CARTE - 28 - RESERVE_DIFFICULTE,
        interligne: 18,
        taille: 15,
      }));
    yi += hQuoi + 10;

    morceaux.push(texte(X_CARTE + 14, yi, 'Jusqu’à quand', { classe: 'v-etiquette', taille: 12 }));
    morceaux.push(texte(X_CARTE + 116, yi, l.quand, { classe: 'v-quand', largeur: L_CARTE - 130, taille: 13 }));
    yi += hQuand;

    morceaux.push(texte(X_CARTE + 14, yi, 'Auprès de', { classe: 'v-etiquette', taille: 12 }));
    morceaux.push(texte(X_CARTE + 116, yi, l.aupres_de, { classe: 'v-texte', largeur: L_CARTE - 130, taille: 13 }));
    yi += hAupres;

    if (l.recours_si_refus) {
      morceaux.push(texte(X_CARTE + 14, yi, 'Si on refuse', { classe: 'v-etiquette', taille: 12 }));
      morceaux.push(texte(X_CARTE + 116, yi, l.recours_si_refus, { classe: 'v-texte', taille: 13 }));
      yi += hRecours;
    }

    if (l.piege) {
      morceaux.push(
        `<rect class="v-piege-fond" x="${X_CARTE + 14}" y="${yi - 2}" width="${L_CARTE - 28}" height="${hPiege}" rx="4" />`,
      );
      morceaux.push(texte(X_CARTE + 24, yi + 14, 'Piège fréquent', { classe: 'v-etiquette v-etiquette--piege', taille: 11 }));
      morceaux.push(
        texte(X_CARTE + 24, yi + 29, l.piege, { classe: 'v-piege', largeur: L_CARTE - 48, interligne: 15, taille: 12 }),
      );
    }

    morceaux.push(
      texte(X_CARTE + L_CARTE - 14, y + 20, DIFFICULTE[l.difficulte], { classe: 'v-etiquette', ancre: 'end', taille: 11 }),
    );

    y += hCarte + 16;
  }

  morceaux.unshift(`<line class="v-axe" x1="${X_AXE}" y1="${debutAxe}" x2="${X_AXE}" y2="${finAxe}" />`);

  const description = leviers
    .map((l) => `${l.quoi} — ${l.quand}, auprès de : ${l.aupres_de}.`)
    .join(' ');

  return {
    titre: 'Où pouvez-vous agir',
    svg: svg(id, y, `Fenêtres d’action : ${p.nom}`, description, morceaux.join('')),
    tableau: tableau(leviers),
  };
}

function tableau(leviers: Processus['leviers']): string {
  const lignes = leviers
    .map(
      (l) =>
        `<tr><th scope="row">${echapper(l.quoi)}</th><td>${echapper(l.quand)}</td><td>${echapper(l.aupres_de)}</td><td>${DIFFICULTE_LONG[l.difficulte]}</td><td>${l.piege ? echapper(l.piege) : '—'}</td></tr>`,
    )
    .join('');
  return `<table class="v-tableau"><caption>Fenêtres d’intervention</caption><thead><tr><th scope="col">Ce que vous pouvez faire</th><th scope="col">Jusqu’à quand</th><th scope="col">Auprès de</th><th scope="col">Difficulté</th><th scope="col">Piège fréquent</th></tr></thead><tbody>${lignes}</tbody></table>`;
}
