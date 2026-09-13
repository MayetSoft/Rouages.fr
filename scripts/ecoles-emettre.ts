/**
 * Les effectifs d'élèves, école par école, sur dix-sept rentrées.
 *
 * La feuille de route affirmait que le traçage des décisions ne se ferait pas,
 * faute d'effectifs par école année après année. C'était faux : l'Éducation
 * nationale les publie depuis 2009, pour les 55 928 écoles du premier degré,
 * avec le nombre de classes.
 *
 * Le **motif** d'une fermeture de classe ne sera jamais public — cette partie
 * du constat tenait. Mais le **fait** l'est, et c'est déjà beaucoup : le site
 * nomme le rectorat comme décideur, pas le maire, et un habitant qui voit
 * « −1 classe en 2023 » sait à qui écrire.
 *
 * **Le piège de la jointure, et il est sévère.** Le jeu des effectifs porte un
 * champ `code_commune_insee` qui contient en réalité le code postal. Pour Mayet
 * (Sarthe) il vaut 72360 — qui est aussi un vrai code INSEE, celui de Trangé,
 * à quarante kilomètres. Joindre par ce champ rattacherait les écoles à la
 * mauvaise commune, sans erreur visible ni ligne perdue. La seule clé sûre est
 * le numéro UAI, que l'annuaire de l'éducation fournit avec le bon code INSEE.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EFFECTIFS =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'fr-en-ecoles-effectifs-nb_classes/exports/json' +
  '?select=rentree_scolaire,numero_ecole,nombre_total_classes,nombre_total_eleves';

/**
 * Dix rentrées suffisent à voir une tendance, et le jeu en publie dix-sept.
 * Les sept plus anciennes pèseraient 40 % du fichier pour une profondeur que
 * personne ne lit : une école qui a fermé une classe en 2012 ne dit plus rien
 * de la commune d'aujourd'hui.
 */
export const RENTREES = 10;

interface LigneEffectif {
  rentree_scolaire: string;
  numero_ecole: string;
  nombre_total_classes: number | null;
  nombre_total_eleves: number | null;
}

export interface Effectifs {
  /** Les rentrées retenues, de la plus ancienne à la plus récente. */
  rentrees: number[];
  /** UAI -> [classes par rentrée, élèves par rentrée]. */
  parUai: Map<string, [(number | null)[], (number | null)[]]>;
}

export async function collecterEffectifs(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Effectifs | null> {
  const lignes = await json<LigneEffectif[]>(EFFECTIFS);
  if (lignes.length === 0) {
    dire("Effectifs scolaires : aucune ligne, le jeu a changé de forme.");
    return null;
  }

  const toutes = [...new Set(lignes.map((l) => Number(l.rentree_scolaire)))]
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b);
  const rentrees = toutes.slice(-RENTREES);
  const rang = new Map(rentrees.map((a, i) => [a, i]));

  const parUai = new Map<string, [(number | null)[], (number | null)[]]>();
  for (const l of lignes) {
    const j = rang.get(Number(l.rentree_scolaire));
    if (j === undefined || !l.numero_ecole) continue;
    let v = parUai.get(l.numero_ecole);
    if (!v) {
      v = [new Array(rentrees.length).fill(null), new Array(rentrees.length).fill(null)];
      parUai.set(l.numero_ecole, v);
    }
    v[0][j] = l.nombre_total_classes === null ? null : Math.round(l.nombre_total_classes);
    v[1][j] = l.nombre_total_eleves === null ? null : Math.round(l.nombre_total_eleves);
  }

  dire(
    `Effectifs scolaires : ${lignes.length.toLocaleString('fr-FR')} lignes, ` +
      `${parUai.size.toLocaleString('fr-FR')} écoles, rentrées ${rentrees[0]} à ` +
      `${rentrees[rentrees.length - 1]}.`,
  );
  return { rentrees, parUai };
}

/**
 * Un fichier par département, comme le reste : personne ne télécharge la
 * France pour regarder son village.
 */
export function ecrireEcoles(
  sortie: string,
  dep: string,
  uais: string[],
  effectifs: Effectifs,
): number {
  const h: Record<string, [(number | null)[], (number | null)[]]> = {};
  let n = 0;
  // Trié : deux ingestions des mêmes données doivent produire le même octet,
  // sans quoi le diff bruite et finit par ne plus être lu.
  for (const uai of [...uais].sort()) {
    const v = effectifs.parUai.get(uai);
    if (!v) continue;
    // Une école dont aucune rentrée n'est renseignée n'apprend rien : l'écrire
    // ferait croire à une donnée manquante là où il n'y a rien à dire.
    if (v[0].every((x) => x === null)) continue;
    h[uai] = v;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-ecoles.json`),
    JSON.stringify({ dep, rentrees: effectifs.rentrees, h }),
  );
  return n;
}
