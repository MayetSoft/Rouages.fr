/**
 * Les risques majeurs d'une commune, d'après GASPAR.
 *
 * Le reste du site dit qui décide. Celui-ci dit à quoi l'endroit est exposé —
 * et c'est la première question qu'on se pose en arrivant quelque part, bien
 * avant de savoir qui exerce la compétence voirie.
 *
 * GASPAR est la base du ministère de la Transition écologique : une archive de
 * 8 Mo qui porte, commune par commune, les risques recensés au dossier
 * départemental, les arrêtés de catastrophe naturelle depuis 1982, les plans de
 * prévention et les documents d'information communaux. Tout vient d'un seul
 * téléchargement, ce qui évite les 34 875 appels que l'interface par commune de
 * Géorisques imposerait.
 *
 * **Deux listes, et elles ne disent pas la même chose.** Le dossier
 * départemental recense ce à quoi l'État estime la commune exposée ; les
 * arrêtés disent ce qui est arrivé. Au Mayet-de-Montagne, le premier retient le
 * séisme et le feu de forêt, le second compte trois inondations, une sécheresse,
 * une tempête et un mouvement de terrain. Les rapprocher serait tentant et
 * faux : ce sont deux instruments, l'un prospectif et l'autre constaté. Le site
 * affiche les deux côte à côte et dit qu'ils ne se recouvrent pas.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Un seul fichier, mis à jour par le ministère, dont le nom ne change pas. */
const ARCHIVE = 'http://files.georisques.fr/GASPAR/gaspar.zip';

/**
 * Les états de plan de prévention qui produisent un effet.
 *
 * `Opposable` vaut servitude d'utilité publique : le plan est annexé au plan
 * local d'urbanisme et s'impose aux permis (art. L562-4 du code de
 * l'environnement). `Prescrit` n'est pas encore approuvé, mais la procédure est
 * engagée — et c'est déjà ce qui déclenche l'obligation d'information de la
 * population tous les deux ans. `Caduque` est écarté : un plan caduc ne
 * s'impose plus à personne, et l'afficher laisserait croire le contraire.
 */
const ETATS_UTILES = ['Opposable', 'Prescrit'] as const;

export interface RisquesCommune {
  /**
   * Ce que le dossier départemental recense ici : par famille de risque, son
   * index dans `risques` puis ceux de ses sous-types.
   *
   * GASPAR code la hiérarchie dans le numéro : deux chiffres pour la famille
   * (`11` Inondation), trois pour le sous-type (`112` Par une crue à
   * débordement lent). Les aligner sur un même niveau afficherait « Inondation »
   * et « Par une crue à débordement lent » comme deux risques distincts, ce
   * qu'ils ne sont pas.
   */
  ddrm: [number, number[]][];
  /** Par risque : son index dans `jo`, le nombre d'arrêtés, la date du plus récent. */
  catnat: [number, number, string][];
  /** Les plans de prévention qui produisent un effet. */
  ppr: { m: number; nom: string; e: number; date: string }[];
  /** L'année de publication du document d'information communal, s'il existe. */
  dicrim?: string;
}

export interface Risques {
  /** La date portée par les fichiers de l'archive. */
  maj: string;
  risques: string[];
  jo: string[];
  modeles: string[];
  etats: string[];
  communes: Map<string, RisquesCommune>;
  /**
   * Le nombre médian d'arrêtés par commune, pour situer le sien.
   *
   * 34 699 communes sur 34 875 en ont au moins un : le chiffre brut ne
   * distingue personne, et seule la comparaison lui donne un sens.
   */
  medianeCatnat: number;
}

/** Un CSV point-virgule, tel que GASPAR les écrit. */
function lireCsv(chemin: string): Record<string, string>[] {
  const texte = readFileSync(chemin, 'utf8');
  const lignes = texte.split(/\r?\n/);
  const entetes = (lignes.shift() ?? '').split(';');
  const out: Record<string, string>[] = [];
  for (const l of lignes) {
    if (!l.trim()) continue;
    const champs = l.split(';');
    if (champs.length < 2) continue;
    const r: Record<string, string> = {};
    for (const [i, h] of entetes.entries()) r[h] = champs[i] ?? '';
    out.push(r);
  }
  return out;
}

/** Indexe un libellé et rend son rang : les libellés se répètent, pas les rangs. */
function indexer(table: string[], rangs: Map<string, number>, libelle: string): number {
  const deja = rangs.get(libelle);
  if (deja !== undefined) return deja;
  const rang = table.length;
  table.push(libelle);
  rangs.set(libelle, rang);
  return rang;
}

export async function collecterRisques(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Risques | null> {
  const { default: sept } = await import('7zip-min');
  const archive = join(cache, 'gaspar.zip');
  try {
    await telecharger(ARCHIVE, archive);
  } catch {
    dire('GASPAR indisponible : les risques restent ceux de l’ingestion précédente.');
    return null;
  }

  const dossier = mkdtempSync(join(tmpdir(), 'gaspar-'));
  await new Promise<void>((ok, ko) =>
    sept.unpack(archive, dossier, (e: Error | null) => (e ? ko(e) : ok())),
  );
  const fichiers = readdirSync(dossier);
  const trouver = (prefixe: string) => {
    const f = fichiers.find((x) => x.startsWith(`${prefixe}_gaspar_`) && x.endsWith('.csv'));
    if (!f) throw new Error(`GASPAR : ${prefixe} manquant — l'archive a changé de forme ?`);
    return join(dossier, f);
  };
  // Le millésime est dans le nom des fichiers : c'est la date que le ministère
  // date lui-même, plus honnête que celle du téléchargement.
  const maj = /(\d{4}-\d{2}-\d{2})/.exec(fichiers[0] ?? '')?.[1] ?? '';

  const risques: string[] = [];
  const rangRisque = new Map<string, number>();
  const jo: string[] = [];
  const rangJo = new Map<string, number>();
  const modeles: string[] = [];
  const rangModele = new Map<string, number>();
  const etats: string[] = [...ETATS_UTILES];
  const communes = new Map<string, RisquesCommune>();
  const de = (code: string): RisquesCommune => {
    let c = communes.get(code);
    if (!c) {
      c = { ddrm: [], catnat: [], ppr: [] };
      communes.set(code, c);
    }
    return c;
  };

  // Ce à quoi l'État estime la commune exposée, famille par famille. Le
  // sous-type se rattache à sa famille par le préfixe de son numéro ; quand la
  // famille n'est pas elle-même déclarée, le sous-type tient lieu d'entrée.
  const parFamille = new Map<string, Map<string, Set<string>>>();
  const libelleDeNum = new Map<string, string>();
  for (const r of lireCsv(trouver('ddrm_risq'))) {
    const code = (r['cod_commune'] ?? '').trim();
    const libelle = (r['lib_risque'] ?? '').trim();
    const num = (r['num_risque'] ?? '').trim();
    if (code.length !== 5 || !libelle || !num) continue;
    libelleDeNum.set(num, libelle);
    const famille = num.slice(0, 2);
    let m = parFamille.get(code);
    if (!m) {
      m = new Map();
      parFamille.set(code, m);
    }
    let sous = m.get(famille);
    if (!sous) {
      sous = new Set();
      m.set(famille, sous);
    }
    if (num.length > 2) sous.add(num);
  }
  for (const [code, familles] of parFamille) {
    const c = de(code);
    for (const [famille, sous] of [...familles].sort((a, b) => a[0].localeCompare(b[0]))) {
      // Le libellé de la famille quand elle est déclarée ; sinon celui du
      // premier sous-type, qui devient alors l'entrée elle-même.
      const nums = [...sous].sort();
      const titre = libelleDeNum.get(famille) ?? (nums[0] ? libelleDeNum.get(nums[0]) : undefined);
      if (!titre) continue;
      const enfants = libelleDeNum.has(famille) ? nums : nums.slice(1);
      c.ddrm.push([
        indexer(risques, rangRisque, titre),
        enfants
          .map((n) => libelleDeNum.get(n))
          .filter((l): l is string => !!l)
          .map((l) => indexer(risques, rangRisque, l)),
      ]);
    }
  }

  // Ce qui est arrivé. Regroupé par nature : « trois inondations » se lit, la
  // liste des trois arrêtés ne se lit pas.
  const parRisque = new Map<string, Map<number, { n: number; date: string }>>();
  for (const r of lireCsv(trouver('catnat'))) {
    const code = (r['code_commune'] ?? '').trim();
    const libelle = (r['lib_risque_jo'] ?? '').trim();
    const debut = (r['date_debut'] ?? '').slice(0, 10);
    if (code.length !== 5 || !libelle) continue;
    const i = indexer(jo, rangJo, libelle);
    let m = parRisque.get(code);
    if (!m) {
      m = new Map();
      parRisque.set(code, m);
    }
    const vu = m.get(i);
    if (vu) {
      vu.n++;
      if (debut > vu.date) vu.date = debut;
    } else m.set(i, { n: 1, date: debut });
  }
  const totaux: number[] = [];
  for (const [code, m] of parRisque) {
    const c = de(code);
    // Du plus fréquent au plus rare : c'est ce qui revient qui caractérise un
    // endroit, pas ce qui est arrivé une fois.
    c.catnat = [...m]
      .sort((a, b) => b[1].n - a[1].n || b[1].date.localeCompare(a[1].date))
      .map(([i, v]) => [i, v.n, v.date] as [number, number, string]);
    totaux.push(c.catnat.reduce((a, b) => a + b[1], 0));
  }
  totaux.sort((a, b) => a - b);
  const medianeCatnat = totaux.length > 0 ? totaux[Math.floor(totaux.length / 2)] : 0;

  // Les plans de prévention, naturels puis technologiques. Mêmes colonnes dans
  // les deux fichiers : le ministère les produit du même moule.
  for (const fichier of ['pprn', 'pprt']) {
    for (const r of lireCsv(trouver(fichier))) {
      const code = (r['CODE INSEE COMMUNE'] ?? '').trim();
      const etat = (r['LIBELLE ETAT'] ?? '').trim();
      if (code.length !== 5) continue;
      const e = etats.indexOf(etat);
      if (e === -1) continue;
      const modele = (r['LIBELLE MODELE'] ?? '').trim();
      const nom = (r['LIBELLE PROCEDURE'] ?? '').trim();
      if (!modele) continue;
      // La date d'approbation quand il y en a une ; sinon celle de la
      // prescription, qui est alors le seul jalon franchi.
      const date = ((r['APPROBATION'] || r['PRESCRIPTION']) ?? '').slice(0, 10);
      de(code).ppr.push({ m: indexer(modeles, rangModele, modele), nom, e, date });
    }
  }
  for (const c of communes.values()) {
    c.ppr.sort((a, b) => b.date.localeCompare(a.date));
  }

  // Le document d'information communal : une obligation du maire, et l'un des
  // rares endroits où le site peut dire qu'elle n'est pas remplie.
  let avecDicrim = 0;
  for (const r of lireCsv(trouver('dicrim'))) {
    const code = (r['cod_commune'] ?? '').trim();
    const date = (r['dat_publi_dicrim'] ?? '').slice(0, 4);
    if (code.length !== 5 || !/^\d{4}$/.test(date)) continue;
    const c = de(code);
    // Le plus récent, quand une commune en a publié plusieurs.
    if (!c.dicrim || date > c.dicrim) c.dicrim = date;
    avecDicrim++;
  }

  dire(
    `Risques majeurs (GASPAR ${maj}) : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${parRisque.size.toLocaleString('fr-FR')} avec un arrêté de catastrophe naturelle ` +
      `(médiane ${medianeCatnat}), ${avecDicrim.toLocaleString('fr-FR')} avec un DICRIM.`,
  );
  return { maj, risques, jo, modeles, etats, communes, medianeCatnat };
}

/**
 * Un fichier par département, comme le reste : le panneau n'en charge qu'un.
 *
 * Les tables de libellés y sont recopiées — une quarantaine d'entrées, un
 * kilo-octet — pour que chaque fichier se suffise à lui-même, comme celui des
 * marchés recopie déjà la liste des procédures.
 */
export function ecrireRisques(sortie: string, dep: string, codes: string[], r: Risques): number {
  const c: Record<string, RisquesCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const fiche = r.communes.get(code);
    if (!fiche) continue;
    if (fiche.ddrm.length === 0 && fiche.catnat.length === 0 && fiche.ppr.length === 0 && !fiche.dicrim) {
      continue;
    }
    c[code] = fiche;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-risques.json`),
    JSON.stringify({
      maj: r.maj,
      risques: r.risques,
      jo: r.jo,
      modeles: r.modeles,
      etats: r.etats,
      mediane: r.medianeCatnat,
      c,
    }),
  );
  return n;
}
