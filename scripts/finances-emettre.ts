/**
 * Les repères financiers, commune par commune.
 *
 * « 90 € par habitant » ne dit rien. Chaque repère est donc restitué en euros
 * par habitant — la seule forme comparable — et confronté à la médiane des
 * communes de taille voisine. C'est exactement ce que le site recommande par
 * ailleurs de faire avant de conclure : comparer à strate équivalente, sinon
 * les écarts ne veulent rien dire.
 *
 * Les comptes viennent de l'OFGL, qui les publie sous licence ouverte.
 *
 * Chaque repère est collecté sur toute la profondeur disponible, pas seulement
 * sur le dernier exercice. Un chiffre isolé ne se discute pas ; une série dit
 * ce qui a changé — et c'est de là que part toute question à un élu. L'OFGL
 * couvre 2018 à 2025, huit exercices complets.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';

const OFGL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes-consolidee';

/**
 * Les strates de population de référence : comparer un village à une ville n'a
 * aucun sens. Les libellés se lisent à la suite de « les communes … ».
 */
export const STRATES: { max: number; libelle: string }[] = [
  { max: 500, libelle: 'de moins de 500 habitants' },
  { max: 2000, libelle: 'de 500 à 2 000 habitants' },
  { max: 10000, libelle: 'de 2 000 à 10 000 habitants' },
  { max: 50000, libelle: 'de 10 000 à 50 000 habitants' },
  { max: Infinity, libelle: 'de plus de 50 000 habitants' },
];

export function strateDe(population: number): number {
  return STRATES.findIndex((s) => population < s.max);
}

interface LigneOfgl {
  com_code: string;
  categ: string;
  annee_join: number | string;
  euros_par_habitant: number | null;
}

/**
 * La série ne remonte pas plus loin que l'OFGL ne publie, et huit points
 * suffisent largement à voir une tendance. Au-delà, on alourdirait chaque
 * fichier départemental pour une précision que personne ne lit.
 */
export const PROFONDEUR = 8;

export async function collecterFinances(
  reperes: Repere[],
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<{
  annee: number;
  /** Les exercices retenus, du plus ancien au plus récent. */
  annees: number[];
  /** Par commune : pour chaque repère, la valeur de chaque exercice. */
  series: Map<string, (number | null)[][]>;
  /** Le dernier exercice seul, pour tout ce qui n'a pas besoin de la série. */
  parCommune: Map<string, (number | null)[]>;
  /** Communes au statut particulier : leurs comptes ne se comparent pas. */
  statutParticulier: Map<string, string>;
} | null> {
  if (reperes.length === 0) return null;

  const annee = await dernierExercice(reperes[0].agregat, obstine, dire);
  if (!annee) {
    dire("Aucun exercice exploitable à l'OFGL : les repères financiers sont ignorés.");
    return null;
  }
  const annees: number[] = [];
  for (let a = annee - PROFONDEUR + 1; a <= annee; a++) annees.push(a);
  const rang = new Map(annees.map((a, i) => [a, i]));

  const series = new Map<string, (number | null)[][]>();
  const statutParticulier = new Map<string, string>();
  for (const [i, r] of reperes.entries()) {
    // Un seul export par repère, tous exercices confondus : huit requêtes
    // séparées ramèneraient les mêmes lignes en huit fois plus d'allers-retours.
    const url =
      `${OFGL}/exports/json?select=com_code,categ,annee_join,euros_par_habitant` +
      // `annee_join` est un champ texte à l'OFGL : une comparaison numérique y
      // renvoie une erreur 400. On énumère donc les exercices voulus.
      `&where=${encodeURIComponent(
        `agregat="${r.agregat}" and annee_join in (${annees.map((a) => `"${a}"`).join(',')})`,
      )}`;
    const lignes = (await (await obstine(url)).json()) as LigneOfgl[];
    if (lignes.length === 0) {
      throw new Error(
        `l'agrégat « ${r.agregat} » (repère ${r.id}) ne renvoie rien : le libellé a-t-il changé à l'OFGL ?`,
      );
    }
    for (const l of lignes) {
      const j = rang.get(Number(l.annee_join));
      if (j === undefined) continue;
      // Paris fusionne les fonctions communales et départementales : ses
      // comptes sont hors d'échelle par rapport aux autres communes, et sa
      // dotation communale est quasi nulle par construction. On garde les
      // chiffres, on retire la comparaison.
      if (l.categ && l.categ !== 'Commune') statutParticulier.set(l.com_code, l.categ);
      let v = series.get(l.com_code);
      if (!v) {
        v = reperes.map(() => new Array<number | null>(annees.length).fill(null));
        series.set(l.com_code, v);
      }
      // Arrondir à l'euro près écrirait « 0 € » là où la valeur est faible mais
      // non nulle — la dotation communale de Paris vaut 0,06 € par habitant, et
      // « 0 » se lirait « Paris ne reçoit rien », ce qui est faux.
      const brut = l.euros_par_habitant;
      v[i][j] = brut === null ? null : Math.abs(brut) < 10 ? Math.round(brut * 10) / 10 : Math.round(brut);
    }
    dire(`  ${r.agregat} : ${lignes.length.toLocaleString('fr-FR')} lignes sur ${annees.length} exercices`);
  }

  // Le dernier exercice, extrait de la série : c'est lui que lisent les
  // médianes et l'affichage principal.
  const dernier = annees.length - 1;
  const parCommune = new Map<string, (number | null)[]>();
  for (const [code, v] of series) parCommune.set(code, v.map((r) => r[dernier]));

  if (statutParticulier.size > 0) {
    dire(`  ${statutParticulier.size} commune(s) au statut particulier, exclue(s) des médianes.`);
  }
  return { annee, annees, series, parCommune, statutParticulier };
}

/** Le dernier exercice réellement renseigné : le plus récent est souvent partiel. */
async function dernierExercice(
  agregat: string,
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<number | null> {
  const cette = new Date().getFullYear();
  for (let annee = cette; annee >= cette - 4; annee--) {
    const url =
      `${OFGL}/records?limit=1&select=com_code` +
      `&where=${encodeURIComponent(`annee_join=${annee} and agregat="${agregat}"`)}`;
    const r = (await (await obstine(url)).json()) as { total_count: number };
    if (r.total_count > 30_000) {
      dire(`Exercice retenu : ${annee} (${r.total_count.toLocaleString('fr-FR')} communes).`);
      return annee;
    }
  }
  return null;
}

/** Médiane par strate : la moyenne serait tirée par quelques communes atypiques. */
export function medianesParStrate(
  reperes: Repere[],
  parCommune: Map<string, (number | null)[]>,
  populations: Map<string, number>,
  statutParticulier: Map<string, string>,
): (number | null)[][] {
  const paquets: number[][][] = STRATES.map(() => reperes.map(() => []));
  for (const [code, valeurs] of parCommune) {
    const pop = populations.get(code);
    // Une commune hors norme fausserait la référence à laquelle les autres se
    // comparent : elle est écartée du calcul comme de l'affichage.
    if (pop === undefined || statutParticulier.has(code)) continue;
    const s = strateDe(pop);
    valeurs.forEach((v, i) => {
      if (v !== null) paquets[s][i].push(v);
    });
  }
  return paquets.map((parRepere) =>
    parRepere.map((liste) => {
      if (liste.length === 0) return null;
      liste.sort((a, b) => a - b);
      return liste[Math.floor(liste.length / 2)];
    }),
  );
}

export function ecrireFinances(
  sortie: string,
  dep: string,
  annee: number,
  annees: number[],
  codes: string[],
  series: Map<string, (number | null)[][]>,
): number {
  // Seule la série est écrite : le dernier exercice en est la dernière colonne,
  // et le stocker en double coûterait un huitième du fichier pour éviter une
  // indexation de tableau.
  const h: Record<string, (number | null)[][]> = {};
  let n = 0;
  for (const code of codes) {
    const v = series.get(code);
    if (!v) continue;
    h[code] = v;
    n++;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-finances.json`),
    JSON.stringify({ dep, annee, annees, h }),
  );
  return n;
}
