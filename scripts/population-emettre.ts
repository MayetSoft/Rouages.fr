/**
 * La population d'une commune dans le temps.
 *
 * Le site affichait « 1 383 habitants » sans dire que la commune en comptait
 * 2 320 en 1931. Or **tous ses autres chiffres sont par habitant** — les
 * comptes, les dotations, les créations d'associations, les droits de
 * mutation : le dénominateur méritait sa propre histoire. Sans elle, une
 * dotation qui baisse se lit comme une décision de l'État alors qu'elle suit
 * souvent une population qui s'en va.
 *
 * La source est le recensement lui-même : l'INSEE publie en un fichier les
 * populations communales de 1876 à 2023, ramenées à la géographie en vigueur —
 * ce qui règle d'avance le problème des fusions, puisque c'est l'INSEE qui
 * recompose les séries des communes nouvelles.
 *
 * **Trois définitions se succèdent dans la même ligne**, et le site le dit
 * plutôt que de l'effacer : population totale jusqu'en 1954 (`PTOT`), sans
 * doubles comptes de 1962 à 1999 (`PSDC`), municipale depuis 2006 (`PMUN`).
 * L'INSEE les publie comme une seule série historique, et c'est ainsi qu'on la
 * rend ; l'écart entre les deux dernières est de l'ordre du pour cent, celui
 * avec la première davantage. Comparer 1876 à 2023 reste une lecture de
 * tendance, pas une soustraction exacte.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le fichier des séries historiques. Son adresse porte le millésime : la
 * veille surveille la page qui le publie, pas cette adresse-ci.
 */
const FICHIER =
  'https://www.insee.fr/fr/statistiques/fichier/3698339/base-pop-historiques-1876-2023.xlsx';

/**
 * Les années retenues pour la courbe.
 *
 * Le fichier en porte trente-sept ; toutes les embarquer coûterait soixante
 * kilo-octets par département pour un tracé que l'œil ne distingue pas d'un
 * échantillon. Quatorze points suffisent à montrer l'exode rural, le creux et
 * le retournement éventuel — et le maximum, lui, est cherché sur la série
 * entière, jamais sur l'échantillon.
 */
const ANNEES = [1876, 1901, 1921, 1936, 1954, 1968, 1975, 1982, 1990, 1999, 2010, 2015, 2020, 2023];

export interface PopulationCommune {
  /** Les valeurs aux années de `ANNEES`, dans le même ordre ; null si absente. */
  serie: (number | null)[];
  /** Le maximum de la série entière : l'année, puis la valeur. */
  sommet: [number, number];
}

export interface Populations {
  maj: string;
  annees: number[];
  communes: Map<string, PopulationCommune>;
}

/** Lit une feuille de calcul sans la charger deux fois : 7 Mo, un seul passage. */
function extraire(chemin: string, entree: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn('unzip', ['-p', chemin, entree]);
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (m: string) => (out += m));
    p.on('error', () => ko(new Error('« unzip » est requis pour lire le fichier INSEE')));
    p.on('close', (code) => (code === 0 ? ok(out) : ko(new Error(`unzip a rendu ${code}`))));
  });
}

export async function collecterPopulations(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Populations | null> {
  const fichier = join(cache, 'insee-populations.xlsx');
  try {
    await telecharger(FICHIER, fichier);
  } catch {
    dire('Séries de population indisponibles : celles de l’ingestion précédente restent en place.');
    return null;
  }

  const [chainesXml, feuille] = await Promise.all([
    extraire(fichier, 'xl/sharedStrings.xml'),
    extraire(fichier, 'xl/worksheets/sheet1.xml'),
  ]);
  const chaines = [...chainesXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  );

  const cellules = (ligne: string): string[] => {
    const out: string[] = [];
    for (const m of ligne.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1] ?? '';
      const corps = m[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(corps);
      out.push(
        / t="s"/.test(` ${attrs}`) && v ? (chaines[Number(v[1])] ?? '') : (v?.[1] ?? ''),
      );
    }
    return out;
  };

  const lignes = [...feuille.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) => m[1]);
  // L'en-tête technique est la première ligne dont la case de gauche vaut
  // « CODGEO » : le fichier commence par un titre, une source et une date, et
  // leur nombre a déjà changé d'un millésime à l'autre.
  const iEntete = lignes.findIndex((l) => cellules(l)[0] === 'CODGEO');
  if (iEntete === -1) {
    dire('Séries de population : aucune colonne « CODGEO » — le fichier a changé de forme.');
    return null;
  }
  const entetes = cellules(lignes[iEntete]);
  // PTOT jusqu'en 1954, PSDC de 1962 à 1999, PMUN depuis 2006 : trois
  // définitions, une seule série — c'est l'INSEE qui les enchaîne ainsi.
  const colonnes = entetes
    .map((h, i) => ({ annee: Number(/^(?:PMUN|PSDC|PTOT)(\d{4})$/.exec(h)?.[1] ?? 0), i }))
    .filter((c) => c.annee > 0);
  if (colonnes.length === 0) {
    dire('Séries de population : aucune colonne de millésime reconnue.');
    return null;
  }
  const rangDe = new Map(colonnes.map((c) => [c.annee, c.i]));

  const communes = new Map<string, PopulationCommune>();
  for (const l of lignes.slice(iEntete + 1)) {
    const v = cellules(l);
    const code = (v[0] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    let sommet: [number, number] = [0, 0];
    for (const c of colonnes) {
      const n = Number(v[c.i]);
      if (Number.isFinite(n) && n > sommet[1]) sommet = [c.annee, n];
    }
    if (sommet[1] === 0) continue;
    communes.set(code, {
      serie: ANNEES.map((a) => {
        const i = rangDe.get(a);
        const n = i === undefined ? NaN : Number(v[i]);
        return Number.isFinite(n) && n > 0 ? n : null;
      }),
      sommet,
    });
  }

  if (communes.size === 0) {
    dire('Séries de population : aucune commune lue.');
    return null;
  }
  dire(
    `Séries de population : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${colonnes.length} recensements de ${Math.min(...colonnes.map((c) => c.annee))} à ` +
      `${Math.max(...colonnes.map((c) => c.annee))}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annees: ANNEES, communes };
}

/** Un fichier par département, comme le reste. */
export function ecrirePopulations(
  sortie: string,
  dep: string,
  codes: string[],
  p: Populations,
): number {
  const c: Record<string, [number[], number, number]> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = p.communes.get(code);
    if (!f) continue;
    // Les valeurs manquantes voyagent en zéro : `null` coûte deux caractères de
    // plus par point, et zéro habitant ne se confond avec rien.
    c[code] = [f.serie.map((x) => x ?? 0), f.sommet[0], f.sommet[1]];
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-population.json`),
    JSON.stringify({ maj: p.maj, annees: p.annees, c }),
  );
  return n;
}
