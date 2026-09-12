/**
 * Chiffrer les flux qui ne passent pas par la commune.
 *
 * Le versement mobilité et la taxe d'enlèvement des ordures ménagères ne sont
 * presque jamais dans les comptes communaux : c'est l'intercommunalité qui les
 * perçoit. Les y chercher ramène 568 lignes contre 1 942, et répondre « la
 * commune ne perçoit rien » serait exact et sans intérêt.
 *
 * Le site sait déjà quelle structure sert chaque commune — la jointure BANATIC
 * lui donne le SIREN de chacun de ses groupements. Il ne manquait que le
 * chiffre en face de ce SIREN.
 *
 * Ce que ce module refuse de faire : combler l'absence. Seuls 297 groupements
 * perçoivent le versement mobilité et 983 la taxe d'enlèvement — les autres
 * financent le service autrement, par une redevance ou par un syndicat qui
 * n'est pas un groupement à fiscalité propre. Une valeur manquante reste
 * manquante ; écrire « 0 € » dirait que le service ne coûte rien.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';
import { PROFONDEUR } from './finances-emettre.ts';

const OFGL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-gfp';

interface LigneGfp {
  siren: string;
  annee_join: number | string;
  euros_par_habitant: number | null;
}

export interface FluxGroupements {
  annees: number[];
  /** SIREN -> pour chaque repère, la valeur de chaque exercice. */
  series: Map<string, (number | null)[][]>;
  /** Médiane, par repère, des groupements qui perçoivent effectivement. */
  medianes: (number | null)[];
  /** Nombre de groupements concernés, par repère : l'absence se dit en chiffres. */
  percepteurs: number[];
}

export async function collecterFluxGroupements(
  reperes: Repere[],
  annee: number,
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<FluxGroupements | null> {
  if (reperes.length === 0) return null;

  const annees: number[] = [];
  for (let a = annee - PROFONDEUR + 1; a <= annee; a++) annees.push(a);
  const rang = new Map(annees.map((a, i) => [a, i]));

  const series = new Map<string, (number | null)[][]>();
  const medianes: (number | null)[] = [];
  const percepteurs: number[] = [];

  for (const [i, r] of reperes.entries()) {
    const url =
      `${OFGL}/exports/json?select=siren,annee_join,euros_par_habitant` +
      // Même piège qu'au niveau communal : `annee_join` est un champ texte à
      // l'OFGL, une comparaison numérique y renvoie une erreur 400.
      `&where=${encodeURIComponent(
        `agregat="${r.agregat}" and annee_join in (${annees.map((a) => `"${a}"`).join(',')})`,
      )}`;
    const lignes = (await (await obstine(url)).json()) as LigneGfp[];
    if (lignes.length === 0) {
      throw new Error(
        `l'agrégat « ${r.agregat} » (repère ${r.id}) ne renvoie rien au niveau des ` +
          `groupements : le libellé a-t-il changé à l'OFGL ?`,
      );
    }
    for (const l of lignes) {
      const j = rang.get(Number(l.annee_join));
      if (j === undefined) continue;
      let v = series.get(l.siren);
      if (!v) {
        v = reperes.map(() => new Array<number | null>(annees.length).fill(null));
        series.set(l.siren, v);
      }
      const brut = l.euros_par_habitant;
      v[i][j] = brut === null ? null : Math.abs(brut) < 10 ? Math.round(brut * 10) / 10 : Math.round(brut);
    }

    // La médiane ne porte que sur ceux qui perçoivent : y compter les autres
    // pour zéro tirerait la référence vers le bas et ferait passer un taux
    // ordinaire pour une anomalie.
    const dernier = annees.length - 1;
    const valeurs: number[] = [];
    for (const v of series.values()) {
      const x = v[i][dernier];
      if (x !== null) valeurs.push(x);
    }
    valeurs.sort((a, b) => a - b);
    medianes.push(valeurs.length > 0 ? valeurs[Math.floor(valeurs.length / 2)] : null);
    percepteurs.push(valeurs.length);
    dire(
      `  ${r.agregat} : ${lignes.length.toLocaleString('fr-FR')} lignes, ` +
        `${valeurs.length.toLocaleString('fr-FR')} groupements en ${annees[dernier]}`,
    );
  }

  return { annees, series, medianes, percepteurs };
}

/**
 * Un seul fichier, chargé à la demande.
 *
 * Il pèse quelques dizaines de kilo-octets : le fondre dans `meta.json`, que
 * tout le monde télécharge, coûterait ce poids à chaque visite pour une
 * information que seul un clic sur un flux fait apparaître.
 */
export function ecrireFlux(
  sortie: string,
  reperes: Repere[],
  f: FluxGroupements,
): number {
  const h: Record<string, (number | null)[][]> = {};
  for (const [siren, v] of f.series) h[siren] = v;
  writeFileSync(
    join(sortie, 'flux.json'),
    JSON.stringify({
      annees: f.annees,
      reperes: reperes.map((r, i) => ({
        id: r.id,
        nom: r.nom,
        explication: r.explication,
        flux: r.flux,
        mediane: f.medianes[i],
        percepteurs: f.percepteurs[i],
      })),
      h,
    }),
  );
  return f.series.size;
}
