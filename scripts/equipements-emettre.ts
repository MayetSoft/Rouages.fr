/**
 * Ce qu'on trouve sur place — et ce pour quoi il faut partir.
 *
 * Le site savait déjà nommer les services publics d'une commune : ses écoles,
 * ses établissements de santé, ses guichets. Il ne disait rien de ce qui fait
 * qu'on y vit ou qu'on la quitte — une boulangerie, une épicerie, un médecin,
 * un terrain de sport. Ce n'est pas du service public, et c'est pourtant la
 * première chose qu'un habitant regarde.
 *
 * La base permanente des équipements de l'INSEE recense 235 types
 * d'équipements, marchands compris, commune par commune. Elle les range en
 * **gammes** — proximité, intermédiaire, supérieure — et c'est ce classement-là
 * que le site reprend plutôt que d'inventer sa propre liste de « ce qui
 * compte » : la gamme de proximité est un objet statistique publié, discuté et
 * daté, pas une opinion.
 *
 * **Deux limites que la page porte.** La base compte des équipements ouverts
 * au public, non des emplois ni des chiffres d'affaires : deux boulangeries ne
 * disent pas laquelle tient. Et une commune sans équipement n'est pas une
 * commune sans accès — le bourg voisin est parfois à trois kilomètres, ce que
 * ce fichier-ci ne dit pas.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les deux fichiers de l'INSEE. **Leur adresse porte l'identifiant de la
 * publication**, qui change à chaque millésime : c'est la veille qui surveille
 * leur date, et une adresse morte laisse en place l'ingestion précédente
 * plutôt que d'emporter le reste.
 */
const DENOMBREMENT = 'https://www.insee.fr/fr/statistiques/fichier/8217527/DS_BPE_CSV_FR.zip';
const GAMMES = 'https://www.insee.fr/fr/statistiques/fichier/8217535/BPE_gammes_equipements_2025.xlsx';

/** Les gammes retenues : au-delà, on décrit une ville, plus une commune. */
const GAMMES_RETENUES = ['Gamme de proximité', 'Gamme intermédiaire'];

export interface TypeEquipement {
  /** Le code INSEE du type, « B207 » pour une boulangerie. */
  code: string;
  /** Son libellé, en minuscules : le fichier crie en capitales. */
  nom: string;
  /** 0 pour la gamme de proximité, 1 pour l'intermédiaire. */
  gamme: 0 | 1;
  /** Le sous-domaine, qui sert de regroupement à l'affichage. */
  ou: string;
}

/**
 * Un regroupement de types, tel que l'INSEE le définit.
 *
 * Sans lui, le site mentirait par omission : Le Mayet-de-Montagne a une école
 * primaire, et lister « école maternelle » et « école élémentaire » comme
 * absentes laisserait croire qu'il manque deux écoles. L'INSEE regroupe les
 * trois, comme il regroupe le bureau de poste, le relais poste et l'agence
 * postale. **La présence et l'absence se comptent donc par regroupement**, le
 * détail des types ne servant qu'à dire ce qu'il y a.
 */
export interface GroupeEquipement {
  /** L'intitulé du regroupement, qui énumère ses variantes. */
  nom: string;
  gamme: 0 | 1;
  /** Les index des types qui le composent, dans `types`. */
  types: number[];
}

export interface Equipements {
  maj: string;
  /** Le millésime du recensement. */
  millesime: number;
  types: TypeEquipement[];
  groupes: GroupeEquipement[];
  /** Par commune : l'index du type dans `types`, puis le nombre. */
  communes: Map<string, [number, number][]>;
  /** Médiane nationale du nombre de regroupements de proximité présents. */
  medianeProximite: number;
  /** Combien de regroupements composent la gamme de proximité. */
  nombreProximite: number;
}

/** Lit un fichier d'une archive en flux : cent cinquante mégaoctets, un passage. */
function enFluxDeZip(archive: string, motif: RegExp): (c: string) => AsyncIterable<Uint8Array> {
  return () => {
    async function* flux(): AsyncIterable<Uint8Array> {
      const liste = await new Promise<string>((ok, ko) => {
        const p = spawn('unzip', ['-Z1', archive]);
        let out = '';
        p.stdout.setEncoding('utf8');
        p.stdout.on('data', (m: string) => (out += m));
        p.on('error', () => ko(new Error('« unzip » est requis pour lire la base des équipements')));
        p.on('close', (c) => (c === 0 ? ok(out) : ko(new Error(`unzip a rendu ${c}`))));
      });
      const nom = liste.split('\n').find((n) => motif.test(n.trim()));
      if (!nom) throw new Error('l’archive ne porte pas le fichier attendu');
      const p = spawn('unzip', ['-p', archive, nom.trim()]);
      for await (const bloc of p.stdout) yield bloc as Uint8Array;
    }
    return flux();
  };
}

/** Extrait une feuille d'un classeur, sans le charger deux fois. */
function extraire(chemin: string, entree: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn('unzip', ['-p', chemin, entree]);
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (m: string) => (out += m));
    p.on('error', () => ko(new Error('« unzip » est requis pour lire le classeur des gammes')));
    p.on('close', (c) => (c === 0 ? ok(out) : ko(new Error(`unzip a rendu ${c}`))));
  });
}

/** « BOULANGERIE-PÂTISSERIE » en « boulangerie-pâtisserie ». */
function enMinuscules(s: string): string {
  // Le fichier écrit « RESTAURANT- RESTAURATION RAPIDE » : l'espace après le
  // trait d'union est une coquille de saisie, pas une règle typographique.
  return s.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ').replace(/-\s+/g, '-').trim();
}

export async function collecterEquipements(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lignesDe: (
    lire: (chemin: string) => AsyncIterable<Uint8Array>,
  ) => AsyncIterable<Record<string, string>>,
  dire: (m: string) => void,
): Promise<Equipements | null> {
  const classeur = join(cache, 'bpe-gammes.xlsx');
  const archive = join(cache, 'bpe-denombrement.zip');
  try {
    await telecharger(GAMMES, classeur);
    await telecharger(DENOMBREMENT, archive);
  } catch {
    dire('Équipements : l’INSEE n’a pas répondu, les fichiers précédents restent en place.');
    return null;
  }

  // --- la nomenclature : quels types composent quelle gamme ---
  let chainesXml: string;
  let feuille: string;
  try {
    [chainesXml, feuille] = await Promise.all([
      extraire(classeur, 'xl/sharedStrings.xml'),
      extraire(classeur, 'xl/worksheets/sheet1.xml'),
    ]);
  } catch {
    dire('Équipements : le classeur des gammes n’a pas pu être ouvert.');
    return null;
  }
  const chaines = [...chainesXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  );
  const cellules = (l: string): string[] => {
    const out: string[] = [];
    for (const m of l.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(m[2] ?? '');
      out.push(/ t="s"/.test(` ${m[1] ?? ''}`) && v ? (chaines[Number(v[1])] ?? '') : (v?.[1] ?? ''));
    }
    return out;
  };
  const lignesGammes = [...feuille.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) =>
    cellules(m[1]),
  );
  // L'en-tête technique est la ligne qui porte « TYPEQU » : le classeur
  // commence par un titre, une année et un en-tête en toutes lettres, et leur
  // nombre a déjà changé.
  const iEntete = lignesGammes.findIndex((l) => l.includes('TYPEQU'));
  if (iEntete === -1) {
    dire('Équipements : aucune colonne « TYPEQU » — le classeur a changé de forme.');
    return null;
  }
  const entetes = lignesGammes[iEntete];
  const col = (nom: string) => entetes.indexOf(nom);
  const cGroupe = col('TYPEQU_REGROUPEMENT');
  const cGroupeNom = col('LIBELLE_TYPEQU_REGROUPEMENT');
  const cCode = col('TYPEQU');
  const cNom = col('LIBELLE_TYPEQU');
  const cGamme = col('GAMME');
  const cOu = col('LIBELLE_SDOM');
  if (cCode === -1 || cGamme === -1) {
    dire('Équipements : les colonnes du classeur des gammes ont changé.');
    return null;
  }

  const types: TypeEquipement[] = [];
  const rang = new Map<string, number>();
  const groupes: GroupeEquipement[] = [];
  const rangGroupe = new Map<string, number>();
  for (const l of lignesGammes.slice(iEntete + 1)) {
    const code = (l[cCode] ?? '').trim();
    const g = GAMMES_RETENUES.indexOf((l[cGamme] ?? '').trim());
    if (!code || g === -1 || rang.has(code)) continue;
    const i = types.length;
    rang.set(code, i);
    types.push({
      code,
      nom: enMinuscules(l[cNom] ?? code),
      gamme: g as 0 | 1,
      ou: (l[cOu] ?? '').trim(),
    });
    // Un type sans regroupement déclaré est son propre regroupement.
    const cle = (cGroupe === -1 ? '' : (l[cGroupe] ?? '').trim()) || code;
    let j = rangGroupe.get(cle);
    if (j === undefined) {
      j = groupes.length;
      rangGroupe.set(cle, j);
      groupes.push({
        nom: enMinuscules(
          (cGroupeNom === -1 ? '' : (l[cGroupeNom] ?? '').trim()) || (l[cNom] ?? code),
        ),
        gamme: g as 0 | 1,
        types: [],
      });
    }
    groupes[j].types.push(i);
  }
  if (types.length === 0) {
    dire('Équipements : aucune gamme reconnue — le classeur a changé de forme.');
    return null;
  }
  const nombreProximite = groupes.filter((g) => g.gamme === 0).length;

  // --- le dénombrement, commune par commune ---
  const communes = new Map<string, [number, number][]>();
  let millesime = 0;
  for await (const l of lignesDe(enFluxDeZip(archive, /_data\.csv$/i))) {
    // Le fichier mêle tous les zonages — bassins de vie, aires d'attraction,
    // régions — et porte aussi des totaux par domaine sous le type « _T ».
    if ((l['GEO_OBJECT'] ?? '').trim() !== 'COM') continue;
    const type = (l['FACILITY_TYPE'] ?? '').trim();
    const i = rang.get(type);
    if (i === undefined) continue;
    const code = (l['GEO'] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const n = Number(l['OBS_VALUE']);
    if (!Number.isFinite(n) || n <= 0) continue;
    const an = Number(l['TIME_PERIOD']);
    if (Number.isFinite(an) && an > millesime) millesime = an;
    let c = communes.get(code);
    if (!c) communes.set(code, (c = []));
    c.push([i, n]);
  }

  if (communes.size === 0) {
    dire('Équipements : aucune commune lue — le fichier a changé de forme.');
    return null;
  }

  const proximites: number[] = [];
  for (const c of communes.values()) {
    c.sort((a, b) => a[0] - b[0]);
    const presents = new Set(c.map(([i]) => i));
    proximites.push(
      groupes.filter((g) => g.gamme === 0 && g.types.some((i) => presents.has(i))).length,
    );
  }
  proximites.sort((a, b) => a - b);
  const medianeProximite = proximites[Math.floor(proximites.length / 2)] ?? 0;

  dire(
    `Équipements ${millesime} : ${communes.size.toLocaleString('fr-FR')} communes équipées, ` +
      `${types.length} types suivis en ${groupes.length} regroupements, dont ` +
      `${nombreProximite} de proximité ; médiane ${medianeProximite} par commune.`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    millesime,
    types,
    groupes,
    communes,
    medianeProximite,
    nombreProximite,
  };
}

/** Un fichier par département, comme le reste. */
export function ecrireEquipements(
  sortie: string,
  dep: string,
  codes: string[],
  e: Equipements,
): number {
  const c: Record<string, [number, number][]> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = e.communes.get(code);
    if (!f || f.length === 0) continue;
    c[code] = f;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-equipements.json`),
    JSON.stringify({
      maj: e.maj,
      millesime: e.millesime,
      // La table est recopiée dans chaque département : cinq kilo-octets, et le
      // panneau n'a qu'un fichier à charger au lieu de deux.
      types: e.types.map((t) => [t.nom, t.gamme, t.ou]),
      groupes: e.groupes.map((g) => [g.nom, g.gamme, g.types]),
      medianeProximite: e.medianeProximite,
      nombreProximite: e.nombreProximite,
      c,
    }),
  );
  return n;
}
