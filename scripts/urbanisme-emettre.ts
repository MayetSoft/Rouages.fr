/**
 * Qui écrit les règles de ce qui peut se construire, et depuis quand.
 *
 * Le site montrait déjà le permis de construire comme un processus dont le
 * maire signe l'arrêté. C'est exact, et c'est insuffisant : **les règles que
 * cet arrêté applique ne sont pas toujours écrites par la commune**. Une
 * commune sur cinq n'a aucun document local et relève du règlement national
 * d'urbanisme — le préfet y donne un avis conforme, c'est-à-dire qu'un refus
 * de sa part interdit le permis (art. L422-5 du code de l'urbanisme), et la
 * construction n'est en principe possible que dans les parties déjà urbanisées
 * (art. L111-3). Une commune sur trois est couverte par un plan intercommunal,
 * voté par un conseil communautaire où elle a un siège ou deux.
 *
 * La source est l'enquête SuDocUH, que la direction de l'habitat, de
 * l'urbanisme et des paysages mène chaque année auprès des directions
 * départementales des territoires. Elle donne, commune par commune, le
 * document opposable, sa date d'approbation, la collectivité qui le porte, et
 * la procédure éventuellement en cours — cette dernière étant le seul moment
 * où un habitant peut encore peser, par l'enquête publique.
 *
 * **Le Géoportail de l'urbanisme ne pouvait pas servir ici** : son interface
 * ne répond que commune par commune, et trente-cinq mille appels ne sont pas
 * une ingestion. SuDocUH publie le même état en un seul fichier.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ressourcesDuJeu } from './donnees-ouvertes.ts';
import { DOCUMENTS } from '../src/modele/urbanisme.ts';

/**
 * Le jeu de données, désigné par son identifiant et non par son adresse : son
 * intitulé porte le millésime et change donc tous les ans, l'identifiant non.
 */
const JEU = '620b924d90e837a5ce0ba819';

const RANG = new Map<string, number>(DOCUMENTS.map((d, i) => [d, i]));

/** L'index du règlement national d'urbanisme : l'absence de document local. */
const RNU = DOCUMENTS.indexOf('RNU');

export interface UrbanismeCommune {
  /** Index dans `DOCUMENTS` du document opposable aujourd'hui. */
  d: number;
  /** Sa date d'approbation, AAAA-MM-JJ ; vide sous règlement national. */
  a: string;
  /**
   * Qui écrit la règle : 0 la commune, 1 le groupement par son document même,
   * 2 le groupement par transfert de compétence, le document restant communal.
   *
   * Les deux derniers cas n'ont pas la même conséquence et le site ne les
   * confond pas : sous plan intercommunal, les règles en vigueur sont déjà
   * votées ailleurs ; après un simple transfert, le plan en vigueur reste
   * celui de la commune et c'est sa révision qui lui échappera.
   */
  i: 0 | 1 | 2;
  /** SIREN du groupement, vide quand la commune garde la compétence. */
  s: string;
  /** Index dans `DOCUMENTS` de la procédure en cours, -1 s'il n'y en a pas. */
  e: number;
  /** La date à laquelle cette procédure a été prescrite. */
  p: string;
}

export interface Urbanisme {
  maj: string;
  /**
   * La date d'approbation la plus récente que le fichier connaisse.
   *
   * L'enquête est annuelle et paraît quelques mois après sa clôture : un plan
   * approuvé ce printemps n'y figurera pas avant l'an prochain. Plutôt que
   * d'afficher une fraîcheur que la donnée n'a pas, le site dit jusqu'où elle
   * va — cette date-là est lue dans le fichier, pas supposée.
   */
  jusquau: string;
  communes: Map<string, UrbanismeCommune>;
  /** Combien de communes relèvent du règlement national, sur le pays entier. */
  sansDocument: number;
  /** Combien relèvent d'un document intercommunal. */
  intercommunales: number;
}

/** Lit une feuille de calcul sans la charger deux fois : 34 Mo, un seul passage. */
function extraire(chemin: string, entree: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn('unzip', ['-p', chemin, entree]);
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (m: string) => (out += m));
    p.on('error', () => ko(new Error('« unzip » est requis pour lire le fichier SuDocUH')));
    p.on('close', (code) => (code === 0 ? ok(out) : ko(new Error(`unzip a rendu ${code}`))));
  });
}

/**
 * Une date de tableur en date civile.
 *
 * Le tableur compte les jours depuis le 30 décembre 1899 — décalage d'usage,
 * qui absorbe le 29 février 1900 que le format croit avoir existé. Les dates
 * du fichier sont toutes postérieures à 1990 : le cas litigieux ne se pose pas.
 */
function dateTableur(brut: string): string {
  const n = Number(brut);
  if (!Number.isFinite(n) || n < 30000 || n > 80000) return '';
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function collecterUrbanisme(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Urbanisme | null> {
  const [adresse] = await ressourcesDuJeu(JEU, "documents d'urbanisme par commune", json, dire);
  if (!adresse) {
    dire('Urbanisme : l’état des documents par commune est introuvable.');
    return null;
  }

  const fichier = join(cache, 'sudocuh-documents-urbanisme.xlsx');
  try {
    await telecharger(adresse, fichier);
  } catch {
    dire('Urbanisme : le fichier n’a pas répondu, celui de l’ingestion précédente reste en place.');
    return null;
  }

  // Le classeur porte quatre feuilles : un mode d'emploi, une synthèse, la
  // liste des communes, une répartition. Seule la troisième nous intéresse, et
  // c'est elle qui pèse les trente-quatre mégaoctets.
  let chainesXml: string;
  let feuille: string;
  try {
    [chainesXml, feuille] = await Promise.all([
      extraire(fichier, 'xl/sharedStrings.xml'),
      extraire(fichier, 'xl/worksheets/sheet3.xml'),
    ]);
  } catch {
    dire('Urbanisme : le classeur n’a pas pu être ouvert.');
    return null;
  }
  const chaines = [...chainesXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  );

  const cellules = (ligne: string): string[] => {
    const out: string[] = [];
    for (const m of ligne.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(m[2] ?? '');
      out.push(/ t="s"/.test(` ${attrs}`) && v ? (chaines[Number(v[1])] ?? '') : (v?.[1] ?? ''));
    }
    return out;
  };

  const lignes = [...feuille.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) => m[1]);
  // L'en-tête est repérée par ses intitulés, jamais par son rang : le fichier
  // a déjà changé de mise en page d'un millésime à l'autre, et lire la
  // colonne 9 parce qu'elle s'y trouvait l'an dernier est la manière la plus
  // sûre de publier le mauvais chiffre sans s'en apercevoir.
  const iEntete = lignes.findIndex((l) =>
    cellules(l).some((h) => h.trim().toLowerCase() === 'du_opposable'),
  );
  if (iEntete === -1) {
    dire('Urbanisme : aucune colonne « DU_Opposable » — le fichier a changé de forme.');
    return null;
  }
  const entetes = cellules(lignes[iEntete]).map((h) => h.trim().toLowerCase());
  const col = (nom: string): number => entetes.indexOf(nom);
  const cCode = col('code insee');
  const cOpposable = col('du_opposable');
  const cEnCours = col('du_en_cours');
  const cSiren = col('siren epci');
  const cEtat = col('etat détaillé');
  const cApprobation = col('approbation du en vigueur');
  const cPrescription = col('prescription proc en cours');
  if (cCode === -1 || cOpposable === -1 || cApprobation === -1) {
    dire('Urbanisme : les colonnes attendues manquent — le fichier a changé de forme.');
    return null;
  }

  const communes = new Map<string, UrbanismeCommune>();
  let sansDocument = 0;
  let intercommunales = 0;
  for (const l of lignes.slice(iEntete + 1)) {
    const v = cellules(l);
    const lis = (i: number) => (i === -1 ? '' : (v[i] ?? '').trim());
    const code = lis(cCode);
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const d = RANG.get(lis(cOpposable));
    if (d === undefined) continue;
    const etat = lis(cEtat);
    const siren = /^\d{9}$/.test(lis(cSiren)) ? lis(cSiren) : '';
    // Un plan intercommunal l'est par nature ; un plan communal peut l'être
    // devenu, la compétence ayant été transférée sans que le document change —
    // c'est le cas de Vichy, dont le plan de 2017 ne couvre que Vichy pendant
    // que sa révision reviendra à l'agglomération.
    const i: 0 | 1 | 2 =
      DOCUMENTS[d] === 'PLUi' || DOCUMENTS[d] === 'PLUiS'
        ? 1
        : /compétence EPCI/i.test(etat)
          ? 2
          : 0;
    const enCours = RANG.get(lis(cEnCours));
    communes.set(code, {
      d,
      a: d === RNU ? '' : dateTableur(lis(cApprobation)),
      i,
      // Le fichier porte parfois le groupement d'appartenance là où la
      // compétence est restée communale : le nommer laisserait croire qu'il
      // décide, ce qu'il ne fait pas.
      s: i === 0 ? '' : siren,
      e: enCours === undefined ? -1 : enCours,
      p: enCours === undefined ? '' : dateTableur(lis(cPrescription)),
    });
    if (d === RNU) sansDocument++;
    if (i !== 0) intercommunales++;
  }

  if (communes.size === 0) {
    dire('Urbanisme : aucune commune lue.');
    return null;
  }
  const jusquau = [...communes.values()].map((c) => c.a).filter(Boolean).sort().pop() ?? '';
  dire(
    `Urbanisme : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${sansDocument.toLocaleString('fr-FR')} au règlement national, ` +
      `${intercommunales.toLocaleString('fr-FR')} sous compétence intercommunale ` +
      `(approbations connues jusqu’au ${jusquau}).`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    jusquau,
    communes,
    sansDocument,
    intercommunales,
  };
}

/** Un fichier par département, comme le reste. */
export function ecrireUrbanisme(sortie: string, dep: string, codes: string[], u: Urbanisme): number {
  const c: Record<string, UrbanismeCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = u.communes.get(code);
    if (!f) continue;
    c[code] = f;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-urbanisme.json`),
    JSON.stringify({
      maj: u.maj,
      jusquau: u.jusquau,
      documents: DOCUMENTS,
      sansDocument: u.sansDocument,
      intercommunales: u.intercommunales,
      total: u.communes.size,
      c,
    }),
  );
  return n;
}
