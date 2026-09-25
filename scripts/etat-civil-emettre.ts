/**
 * Les naissances et les décès, commune par commune et année par année.
 *
 * La courbe des habitants disait qu'une commune se vide, pas pourquoi. Le
 * solde naturel — naissances moins décès — en donne la moitié : au
 * Mayet-de-Montagne, huit naissances et trente-deux décès par an en moyenne
 * depuis 2008. L'autre moitié, les départs et les arrivées, n'est publiée par
 * personne commune par commune ; le site ne la reconstitue pas.
 *
 * La source est l'état civil de l'INSEE. **Ce sont des événements domiciliés**,
 * et le fichier le dit : les naissances sont ventilées au domicile de la mère,
 * les décès à celui du défunt. Une commune sans maternité a donc bien ses
 * naissances, et une commune qui abrite un hôpital ne compte pas les décès de
 * tout le canton.
 *
 * Aucun nom : le fichier des personnes décédées, qui les porte, n'est pas lu.
 * La page renvoie vers lui, pour qui le cherche.
 *
 * Lancé seul — `tsx scripts/etat-civil-emettre.ts` —, il réécrit les fichiers
 * de `public/territoires/dep/` sans toucher au reste de l'ingestion.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Les deux fichiers complets du catalogue Melodi : trois mégaoctets chacun, compressés. */
export const FICHIERS = {
  naissances: 'https://api.insee.fr/melodi/file/DS_ETAT_CIVIL_NAIS_COMMUNES/DS_ETAT_CIVIL_NAIS_COMMUNES_2025_CSV_FR',
  deces: 'https://api.insee.fr/melodi/file/DS_ETAT_CIVIL_DECES_COMMUNES/DS_ETAT_CIVIL_DECES_COMMUNES_2025_CSV_FR',
};

export interface EtatCivil {
  maj: string;
  /**
   * Le jour où l'INSEE a publié la dernière année, d'après son catalogue :
   * c'est la date qu'annonce le flux de chaque commune. Null si le catalogue
   * n'a pas répondu — le flux se tait alors plutôt que d'inventer une date.
   */
  publie: string | null;
  annees: number[];
  /** Code commune -> [naissances par année, décès par année] ; null si non publié. */
  communes: Map<string, [(number | null)[], (number | null)[]]>;
}

/** Le CSV de données de l'archive, lu d'un trait : une trentaine de mégaoctets. */
function lireArchive(chemin: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn('sh', ['-c', `unzip -p "${chemin}" '*_data.csv'`]);
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (m: string) => (out += m));
    p.on('error', () => ko(new Error('« unzip » est requis pour lire les fichiers de l’INSEE')));
    p.on('close', (code) => (code === 0 ? ok(out) : ko(new Error(`unzip a rendu ${code}`))));
  });
}

/**
 * Les valeurs d'une série, par commune et par année.
 *
 * Seuls les statuts « normale » (A) et « inclut une autre catégorie » (W)
 * portent un nombre qui vaut pour la commune. « Incluse dans une autre
 * catégorie » (K) et « manquante » (M) deviennent null : écrire zéro dirait
 * qu'il ne s'est rien passé.
 */
function lire(csv: string): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  const lignes = csv.split('\n');
  const entete = lignes[0].replace(/"/g, '').trim().split(';');
  const col = (n: string) => {
    const i = entete.indexOf(n);
    if (i === -1) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
    return i;
  };
  const [iGeo, iObjet, iStatut, iAnnee, iValeur] = ['GEO', 'GEO_OBJECT', 'OBS_STATUS', 'TIME_PERIOD', 'OBS_VALUE'].map(col);
  for (const l of lignes.slice(1)) {
    if (!l) continue;
    const v = l.replace(/"/g, '').split(';');
    if (v[iObjet] !== 'COM') continue;
    if (v[iStatut] !== 'A' && v[iStatut] !== 'W') continue;
    const n = Number(v[iValeur]);
    const annee = Number(v[iAnnee]);
    if (!Number.isFinite(n) || !Number.isFinite(annee)) continue;
    let m = out.get(v[iGeo]);
    if (!m) out.set(v[iGeo], (m = new Map()));
    m.set(annee, Math.round(n));
  }
  return out;
}

export async function collecterEtatCivil(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<EtatCivil | null> {
  const vers = { naissances: join(cache, 'insee-naissances.zip'), deces: join(cache, 'insee-deces.zip') };
  try {
    await telecharger(FICHIERS.naissances, vers.naissances);
    await telecharger(FICHIERS.deces, vers.deces);
  } catch {
    dire('Naissances et décès indisponibles : ceux de l’ingestion précédente restent en place.');
    return null;
  }
  const [naissances, deces] = (await Promise.all([lireArchive(vers.naissances), lireArchive(vers.deces)])).map(lire);
  const toutes = new Set<number>();
  for (const s of [naissances, deces]) for (const m of s.values()) for (const a of m.keys()) toutes.add(a);
  const annees = [...toutes].sort((a, b) => a - b);
  if (annees.length === 0) {
    dire('Naissances et décès : aucune commune lue.');
    return null;
  }
  const communes = new Map<string, [(number | null)[], (number | null)[]]>();
  for (const code of new Set([...naissances.keys(), ...deces.keys()])) {
    const serie = (m?: Map<number, number>) => annees.map((a) => m?.get(a) ?? null);
    communes.set(code, [serie(naissances.get(code)), serie(deces.get(code))]);
  }
  dire(
    `Naissances et décès : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `de ${annees[0]} à ${annees[annees.length - 1]}.`,
  );
  let publie: string | null = null;
  try {
    const r = await fetch('https://api.insee.fr/melodi/catalog/DS_ETAT_CIVIL_NAIS_COMMUNES');
    const cat = (await r.json()) as { issued?: string };
    publie = /^\d{4}-\d{2}-\d{2}/.test(cat.issued ?? '') ? cat.issued!.slice(0, 10) : null;
  } catch {
    publie = null;
  }
  return { maj: new Date().toISOString().slice(0, 10), publie, annees, communes };
}

/** Le département d'une commune, tel que le site range ses fichiers. */
function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/** Un fichier par département, `dep/03-etat-civil.json`. */
export function ecrireEtatCivil(sortie: string, e: EtatCivil): number {
  const parDep = new Map<string, Record<string, [(number | null)[], (number | null)[]]>>();
  for (const code of [...e.communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = e.communes.get(code)!;
  }
  mkdirSync(join(sortie, 'dep'), { recursive: true });
  for (const [dep, c] of parDep) {
    writeFileSync(join(sortie, 'dep', `${dep}-etat-civil.json`), JSON.stringify({ maj: e.maj, annees: e.annees, c }));
  }
  return parDep.size;
}

// Lancé seul : télécharge dans `.cache/` et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const cache = join(racine, '.cache');
  if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
  const telecharger = async (url: string, vers: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    writeFileSync(vers, Buffer.from(await r.arrayBuffer()));
  };
  const e = await collecterEtatCivil(telecharger, cache, console.log);
  if (e) console.log(`${ecrireEtatCivil(join(racine, 'public', 'territoires'), e)} départements écrits.`);
}
