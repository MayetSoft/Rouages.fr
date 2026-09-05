/**
 * V2 — Chronologie de procédure : « quand, et combien de temps ».
 *
 * Les délais sont invisibles dans les sources textuelles alors qu'ils sont
 * déterminants pour l'usager. On les met donc à l'échelle, et on distingue
 * visuellement le maximum légal, l'indicatif et l'observé : réagir à un délai
 * opposable et à une moyenne constatée, ce n'est pas la même chose.
 *
 * Déroulé vertical : la hauteur s'adapte au contenu et reste lisible en 320 px,
 * là où une frise horizontale oblige à défiler.
 */
import { enJours, formaterDelai, type Graphe } from '../modele/graphe.ts';
import type { Processus } from '../modele/schemas.ts';
import { boite, echapper, hauteurTexte, NATURE_DELAI, NATURE_DELAI_LONG, svg, texte } from './commun.ts';

const X_ACTEUR = 0;
const L_ACTEUR = 150;
const X_AXE = 172;
const X_CARTE = 196;
const L_CARTE = 524;
/** Place réservée pour la mention des étapes conditionnelles. */
const RESERVE_CONDITION = 172;
/** Largeur maximale d'une barre de délai : au-delà, le libellé n'a plus de place. */
const BARRE_MAX = 200;

export function chronologie(g: Graphe, p: Processus, id = 'v2') {
  const etapes = [...p.etapes].sort((a, b) => a.ordre - b.ordre);
  const morceaux: string[] = [];
  const echelle = calculerEchelle(etapes);
  let y = 30;

  morceaux.push(texte(X_CARTE, 16, p.declencheur, { classe: 'v-entete', largeur: L_CARTE }));

  const debutAxe = y;
  const positions: number[] = [];

  for (const e of etapes) {
    const lTexte = L_CARTE - 28 - (e.conditionnelle ? RESERVE_CONDITION : 0);
    const hTexte = hauteurTexte(e.action, lTexte, 17, 14);
    const hNote = e.note ? hauteurTexte(e.note, L_CARTE - 28, 15, 12) + 6 : 0;
    const hDelai = e.delai ? 20 : 0;
    const hCarte = 18 + hTexte + hDelai + hNote + 12;

    positions.push(y + 20);

    const acteur = g.acteurs.get(e.acteur);
    morceaux.push(
      texte(X_ACTEUR + L_ACTEUR, y + 20, acteur?.nom ?? e.acteur, {
        classe: 'v-acteur',
        ancre: 'end',
        largeur: L_ACTEUR,
        taille: 13,
      }),
    );

    const classeCarte = e.conditionnelle ? 'v-boite v-boite--conditionnelle' : 'v-boite v-boite--etape';
    morceaux.push(boite(X_CARTE, y, L_CARTE, hCarte, classeCarte));
    morceaux.push(
      `<circle class="v-noeud" cx="${X_AXE}" cy="${y + 20}" r="7" />` +
        `<text class="v-numero" x="${X_AXE}" y="${y + 24}" text-anchor="middle">${e.ordre}</text>`,
    );

    let yInterne = y + 22;
    morceaux.push(
      texte(X_CARTE + 14, yInterne, e.action, { classe: 'v-titre-boite', largeur: lTexte, interligne: 17, taille: 14 }),
    );
    yInterne += hTexte;

    if (e.delai) {
      const l = Math.max(36, (enJours(e.delai) / echelle) * BARRE_MAX);
      morceaux.push(
        `<rect class="v-barre v-barre--${e.delai.nature}" x="${X_CARTE + 14}" y="${yInterne - 2}" width="${l}" height="8" rx="4" />`,
      );
      morceaux.push(
        texte(X_CARTE + 14 + l + 8, yInterne + 6, `${formaterDelai(e.delai)} — ${NATURE_DELAI[e.delai.nature]}`, {
          classe: 'v-delai',
          taille: 12,
        }),
      );
      yInterne += 20;
    }

    if (e.note) {
      morceaux.push(
        texte(X_CARTE + 14, yInterne + 6, e.note, { classe: 'v-note', largeur: L_CARTE - 28, interligne: 15, taille: 12 }),
      );
    }

    if (e.conditionnelle) {
      morceaux.push(texte(X_CARTE + L_CARTE - 14, y + 16, 'Seulement dans certains cas', { classe: 'v-conditionnelle', ancre: 'end', taille: 11 }));
    }

    y += hCarte + 16;
  }

  const finAxe = positions[positions.length - 1] ?? debutAxe;
  morceaux.unshift(`<line class="v-axe" x1="${X_AXE}" y1="${debutAxe}" x2="${X_AXE}" y2="${finAxe}" />`);

  const hSortie = 16 + hauteurTexte(p.sortie, L_CARTE - 28, 17, 14);
  morceaux.push(boite(X_CARTE, y, L_CARTE, hSortie, 'v-boite v-boite--sortie'));
  morceaux.push(
    texte(X_CARTE + 14, y + 22, p.sortie, { classe: 'v-titre-boite', largeur: L_CARTE - 28, interligne: 17, taille: 14 }),
  );
  y += hSortie + 12;

  return {
    titre: 'La procédure, étape par étape',
    svg: svg(id, y, `Chronologie : ${p.nom}`, decrire(g, p), morceaux.join('')),
    tableau: tableau(g, p),
  };
}

/** Jours représentés par la largeur pleine d'une carte. */
function calculerEchelle(etapes: Processus['etapes']): number {
  const max = etapes.reduce((m, e) => (e.delai ? Math.max(m, enJours(e.delai)) : m), 0);
  return max > 0 ? max : 1;
}

function decrire(g: Graphe, p: Processus): string {
  const debut = `Déclenché par : ${p.declencheur}.`;
  const corps = [...p.etapes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((e) => {
      const acteur = g.acteurs.get(e.acteur)?.nom ?? e.acteur;
      const d = e.delai ? ` (${formaterDelai(e.delai)}, ${NATURE_DELAI_LONG[e.delai.nature]})` : '';
      return `Étape ${e.ordre}, ${acteur} : ${e.action}${d}.`;
    })
    .join(' ');
  return `${debut} ${corps} Aboutit à : ${p.sortie}.`;
}

function tableau(g: Graphe, p: Processus): string {
  const lignes = [...p.etapes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((e) => {
      const acteur = echapper(g.acteurs.get(e.acteur)?.nom ?? e.acteur);
      const delai = e.delai ? `${formaterDelai(e.delai)} <span class="v-nature">(${NATURE_DELAI_LONG[e.delai.nature]})</span>` : '—';
      const note = [e.conditionnelle ? 'Étape conditionnelle.' : '', e.note ?? ''].filter(Boolean).join(' ');
      return `<tr><th scope="row">${e.ordre}</th><td>${acteur}</td><td>${echapper(e.action)}${note ? `<br /><span class="v-nature">${echapper(note)}</span>` : ''}</td><td>${delai}</td></tr>`;
    })
    .join('');
  return `<table class="v-tableau"><caption>Étapes de la procédure</caption><thead><tr><th scope="col">N°</th><th scope="col">Qui</th><th scope="col">Fait quoi</th><th scope="col">Délai</th></tr></thead><tbody>${lignes}</tbody></table>`;
}
