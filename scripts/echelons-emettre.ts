/**
 * Les comptes du département et de la région.
 *
 * Le site nomme ces deux échelons à chaque écran — ils versent le revenu de
 * solidarité active, bâtissent les collèges et les lycées, paient les trains
 * régionaux — et ne montrait jamais leurs comptes, alors qu'il détaille ceux de
 * la commune depuis longtemps. Un lecteur pouvait savoir ce que sa commune de
 * 1 400 habitants dépense par habitant, et rien de ce que fait le département
 * qui décide de son collège.
 *
 * Les mêmes repères qu'à l'échelon communal — moins ceux qui n'y ont plus de
 * sens, voir `reperesEchelons` — pour que les ordres de grandeur se comparent
 * d'un coup d'œil. Deux précautions propres à ces bases, qui ne sont pas
 * consolidées comme celle des communes :
 *
 *   — **le budget principal seulement.** 230 391 lignes sur 318 638 sont des
 *     budgets annexes : un domaine, un laboratoire, un service d'incendie.
 *     Les additionner au budget principal gonflerait tout sans rien expliquer.
 *   — **une ligne par exercice**, et non par mois : on prend telle quelle la
 *     valeur en euros par habitant que l'OFGL publie.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';
import { PROFONDEUR } from './finances-emettre.ts';

const BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets';

interface LigneEchelon {
  exer: number | string;
  code: string | null;
  euros_par_habitant: number | null;
}

export interface ComptesEchelon {
  annees: number[];
  /** Code de la collectivité -> pour chaque repère, la valeur de chaque exercice. */
  series: Map<string, (number | null)[][]>;
  /** Médiane de chaque repère au dernier exercice, toutes collectivités confondues. */
  medianes: (number | null)[];
  /**
   * Combien de collectivités entrent dans *chaque* médiane.
   *
   * Un chiffre par repère, et non un pour l'échelon : les régions n'ont plus de
   * dotation globale de fonctionnement depuis 2018 — seules quelques-unes en
   * déclarent encore une — et annoncer « médiane des dix-sept régions » sous ce
   * repère ferait passer une poignée de cas particuliers pour la norme.
   */
  effectifs: number[];
  /** Le plus grand des effectifs : la taille de l'échelon tel qu'il est publié. */
  effectif: number;
}

export interface Echelons {
  departements: ComptesEchelon | null;
  regions: ComptesEchelon | null;
  maj: string;
}

/**
 * Les repères qui gardent un sens hors de la commune.
 *
 * « Impôts locaux » n'en a plus. La part départementale de la taxe foncière est
 * passée aux communes en 2021, et départements comme régions sont depuis
 * compensés par une fraction de TVA, que cet agrégat ne porte pas. Il reste
 * 65 € par habitant dans l'Allier contre 375 en 2020, et des valeurs négatives
 * dans les régions — une écriture de restitution, pas un impôt. Afficher cela
 * sous le libellé « impôts locaux » ferait conclure qu'un département ne lève
 * presque rien, ce qui est vrai de cet agrégat et faux de ses recettes.
 */
const HORS_ECHELON = new Set(['repere-impots-locaux']);

export function reperesEchelons(reperes: Repere[]): Repere[] {
  return reperes.filter((r) => !HORS_ECHELON.has(r.id));
}

async function collecterUn(
  jeu: string,
  colonneCode: string,
  reperes: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<ComptesEchelon | null> {
  const annees: number[] = [];
  for (let a = annee - PROFONDEUR + 1; a <= annee; a++) annees.push(a);
  const rang = new Map(annees.map((a, i) => [a, i]));
  const series = new Map<string, (number | null)[][]>();

  for (const [i, r] of reperes.entries()) {
    const url =
      `${BASE}/${jeu}/exports/json?select=exer,${colonneCode} as code,euros_par_habitant` +
      `&where=${encodeURIComponent(
        `agregat="${r.agregat}" and type_de_budget="Budget principal" and ` +
          `exer>=${annees[0]} and exer<=${annees[annees.length - 1]}`,
      )}`;
    const lignes = await json<LigneEchelon[]>(url);
    if (lignes.length === 0) {
      throw new Error(
        `l'agrégat « ${r.agregat} » ne renvoie rien dans ${jeu} : le libellé a-t-il changé ?`,
      );
    }
    for (const l of lignes) {
      const j = rang.get(Number(l.exer));
      const code = String(l.code ?? '').trim();
      if (j === undefined || !code) continue;
      let v = series.get(code);
      if (!v) {
        v = reperes.map(() => new Array<number | null>(annees.length).fill(null));
        series.set(code, v);
      }
      const brut = l.euros_par_habitant;
      v[i][j] =
        brut === null ? null : Math.abs(brut) < 10 ? Math.round(brut * 10) / 10 : Math.round(brut);
    }
  }
  if (series.size === 0) return null;

  const dernier = annees.length - 1;
  const medianes: (number | null)[] = [];
  const effectifs: number[] = [];
  for (const i of reperes.keys()) {
    const valeurs: number[] = [];
    for (const v of series.values()) {
      const x = v[i][dernier];
      if (x !== null) valeurs.push(x);
    }
    valeurs.sort((a, b) => a - b);
    medianes.push(valeurs.length > 0 ? valeurs[Math.floor(valeurs.length / 2)] : null);
    effectifs.push(valeurs.length);
  }
  const effectif = Math.max(0, ...effectifs);
  dire(`  ${jeu} : ${series.size} collectivités, ${annees[0]} à ${annees[dernier]}.`);
  return { annees, series, medianes, effectifs, effectif };
}

export async function collecterEchelons(
  reperes: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Echelons | null> {
  if (reperes.length === 0) return null;
  dire(`Comptes du département et de la région (${reperes.length} repères) :`);
  const departements = await collecterUn(
    'ofgl-base-departements',
    'dep_code',
    reperes,
    annee,
    json,
    dire,
  );
  const regions = await collecterUn('ofgl-base-regions', 'reg_code', reperes, annee, json, dire);
  if (!departements && !regions) return null;
  return { departements, regions, maj: new Date().toISOString().slice(0, 10) };
}

/**
 * Un seul fichier national : une centaine de départements et une vingtaine de
 * régions, cinq séries chacun. Quelques dizaines de kilo-octets, chargés avec
 * le reste plutôt qu'à part.
 *
 * Le nom du repère seulement, pas son explication : celles de `reperes.yaml`
 * sont écrites pour une commune — « ce que l'État verse à la commune » — et les
 * recopier sous les comptes d'un département dirait autre chose que le chiffre
 * affiché.
 */
export function ecrireEchelons(sortie: string, reperes: Repere[], e: Echelons): number {
  const rendre = (c: ComptesEchelon | null) => {
    if (!c) return null;
    const h: Record<string, (number | null)[][]> = {};
    for (const code of [...c.series.keys()].sort()) h[code] = c.series.get(code)!;
    return {
      annees: c.annees,
      medianes: c.medianes,
      effectifs: c.effectifs,
      effectif: c.effectif,
      h,
    };
  };
  const dep = rendre(e.departements);
  const reg = rendre(e.regions);
  writeFileSync(
    join(sortie, 'echelons.json'),
    JSON.stringify({
      maj: e.maj,
      reperes: reperes.map((r) => ({ id: r.id, nom: r.nom })),
      departements: dep,
      regions: reg,
    }),
  );
  return (dep ? Object.keys(dep.h).length : 0) + (reg ? Object.keys(reg.h).length : 0);
}
