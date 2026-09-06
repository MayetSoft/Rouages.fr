/**
 * Résolution territoriale : « chez moi, qui fait quoi ? »
 *
 * Le site répond partout « variable selon le territoire ». C'est honnête, et
 * c'est une impasse pour l'usager. Or la réponse est calculable : BANATIC
 * publie, pour chaque groupement de communes, les compétences que ses membres
 * lui ont transférées.
 *
 * Ce script fait la jointure une fois pour toutes et écrit le résultat dans le
 * dépôt. Le site n'appelle donc aucune API : il lit des fichiers versionnés.
 * C'est plus lourd à rafraîchir, et c'est le prix d'un build reproductible,
 * hors ligne, et dont la donnée est relisible dans un diff.
 *
 *   npm run territoires            rafraîchit à partir des sources
 *   npm run territoires -- --cache  réutilise le fichier déjà téléchargé
 *
 * Prérequis : `unzip` (l'export national fait 1,4 Go décompressé, on le lit en
 * flux plutôt que de le charger en mémoire).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chargerGraphe, RACINE } from '../src/modele/graphe.ts';

// Le `fetch` intégré de Node ne lit la configuration de proxy qu'à son
// démarrage : la poser depuis le script serait trop tard. Quand on tourne
// derrière un proxy sans elle, on se relance une fois, avec.
if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== '1') {
  const { status } = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(status ?? 1);
}

const EXPORT_NATIONAL =
  'https://www.banatic.interieur.gouv.fr/consultation/api/export/pregenere/telecharger/France';
const REFERENTIEL =
  'https://www.banatic.interieur.gouv.fr/consultation/api/referentiel/competence/all';
const REFERENTIEL_NATURES =
  'https://www.banatic.interieur.gouv.fr/consultation/api/referentiel/nature-juridique';

const CACHE = join(RACINE, '.cache');
const SORTIE = join(RACINE, 'public', 'territoires');
const XLSX = join(CACHE, 'banatic-france.xlsx');

const VERT = '\x1b[32m', JAUNE = '\x1b[33m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
const dire = (m: string) => console.log(m);

/** Le tunnel du proxy lâche par intermittence : on réessaie plutôt que d'abandonner. */
async function obstine(url: string, essais = 5): Promise<Response> {
  let derniere: unknown;
  for (let i = 0; i < essais; i++) {
    try {
      // Le catalogue de l'OFB refuse l'en-tête de langue par défaut de Node
      // (« Couldn't find 3-letter language code for * ») : on en pose un.
      const r = await fetch(url, {
        headers: { 'accept-language': 'fre' },
        signal: AbortSignal.timeout(180_000),
      });
      if (r.ok) return r;
      derniere = new Error(`HTTP ${r.status}`);
    } catch (e) {
      derniere = e;
    }
    await new Promise((r) => setTimeout(r, (i + 1) * 2000));
  }
  throw new Error(`${url} : ${(derniere as Error)?.message ?? 'injoignable'}`);
}

async function telecharger(url: string, vers: string): Promise<void> {
  const r = await obstine(url);
  if (!r.body) throw new Error(`${url} : réponse sans corps`);
  const flux = createWriteStream(vers);
  const { Readable } = await import('node:stream');
  await new Promise<void>((ok, ko) => {
    Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0])
      .pipe(flux)
      .on('finish', () => ok())
      .on('error', ko);
  });
}

/** Colonne Excel (A, B, …, AA) vers son index, et retour. */
function indiceColonne(ref: string): number {
  let n = 0;
  for (const c of ref) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

interface Groupement {
  siren: string;
  nom: string;
  nature: string;
  /** Codes BANATIC suivis que ce groupement exerce. */
  codes: Set<string>;
  /** Sirens de ses membres, communes ou autres groupements. */
  membres: Set<string>;
}

async function principal() {
  const reutiliser = process.argv.includes('--cache');
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(SORTIE, { recursive: true });

  // 1. Les codes à suivre viennent du contenu : c'est chaque compétence qui
  //    déclare comment elle se résout.
  const graphe = chargerGraphe();
  const codesSuivis = new Map<string, string[]>(); // code BANATIC -> compétences Rouages
  for (const c of graphe.competences.values()) {
    for (const code of c.banatic) {
      if (!codesSuivis.has(code)) codesSuivis.set(code, []);
      codesSuivis.get(code)!.push(c.id);
    }
  }
  if (codesSuivis.size === 0) {
    dire(`${JAUNE}Aucune compétence ne déclare de code BANATIC — rien à faire.${RAZ}`);
    return;
  }
  dire(`${GRIS}${codesSuivis.size} codes BANATIC suivis, pour ${graphe.competences.size} compétences.${RAZ}`);

  // 2. Référentiel : code -> libellé, pour retrouver les colonnes de l'export.
  dire(`${GRIS}Référentiel des compétences…${RAZ}`);
  const ref = (await (await obstine(REFERENTIEL)).json()) as {
    data: { code: string; libelle: string }[];
  };
  const libelleDeCode = new Map(ref.data.map((r) => [r.code, r.libelle.trim()]));
  for (const code of codesSuivis.keys()) {
    if (!libelleDeCode.has(code)) throw new Error(`code BANATIC inconnu au référentiel : ${code}`);
  }

  // 3. L'export national.
  if (!reutiliser || !existsSync(XLSX)) {
    dire(`${GRIS}Téléchargement de l'export national (environ 75 Mo)…${RAZ}`);
    await telecharger(EXPORT_NATIONAL, XLSX);
  }
  dire(`${GRIS}Export : ${(statSync(XLSX).size / 1e6).toFixed(0)} Mo${RAZ}`);

  // Les natures juridiques sont elles-mêmes des sigles — SIVU, SMF, PETR — que
  // personne n'est censé connaître : on emporte leurs libellés.
  const natures = new Map<string, string>();
  try {
    const rn = (await (await obstine(REFERENTIEL_NATURES)).json()) as {
      data: { code: string; libelle: string }[];
    };
    for (const n of rn.data ?? []) natures.set(n.code, n.libelle);
    dire(`${GRIS}${natures.size} natures juridiques.${RAZ}`);
  } catch {
    dire(`${JAUNE}Référentiel des natures juridiques injoignable : les codes resteront bruts.${RAZ}`);
  }

  const { groupements, dateExport } = await lireExport(XLSX, libelleDeCode, codesSuivis);
  dire(`${GRIS}${groupements.size.toLocaleString('fr-FR')} groupements lus.${RAZ}`);

  // Les repères financiers : les comptes des communes, en euros par habitant.
  const { collecterFinances } = await import('./finances-emettre.ts');
  const reperes = [...graphe.reperes.values()];
  dire(`${GRIS}Repères financiers (${reperes.length}) :${RAZ}`);
  const finances = await collecterFinances(reperes, obstine, (m) => dire(`${GRIS}${m}${RAZ}`));

  // Le prix de l'eau, rattaché à la structure qui la distribue réellement.
  const { collecterEau } = await import('./eau-emettre.ts');
  const eau = await collecterEau(telecharger, CACHE, (m) => dire(`${GRIS}${m}${RAZ}`));

  ecrire(graphe, groupements, codesSuivis, dateExport, natures, finances, eau);
}

/** Lit l'export en flux : 1,4 Go de XML ne tiennent pas en mémoire. */
async function lireExport(
  chemin: string,
  libelleDeCode: Map<string, string>,
  codesSuivis: Map<string, string[]>,
): Promise<{ groupements: Map<string, Groupement>; dateExport: string }> {
  const flux = spawn('unzip', ['-p', chemin, 'xl/worksheets/sheet1.xml']);
  flux.on('error', () => {
    throw new Error("« unzip » est requis pour lire l'export BANATIC");
  });

  const groupements = new Map<string, Groupement>();
  let colonnes: Map<string, number> | null = null; // code BANATIC -> indice
  let colSiren = -1, colNom = -1, colNature = -1, colMembre = -1, colCategorie = -1;
  let reste = '';
  let lignes = 0;

  const cellules = (ligne: string): Map<number, string> => {
    const out = new Map<number, string>();
    const re = /<c\b([^>]*)>(.*?)<\/c>/gs;
    for (let m = re.exec(ligne); m; m = re.exec(ligne)) {
      const ref = /r="([A-Z]+)\d+"/.exec(m[1]);
      if (!ref) continue;
      const t = /<t[^>]*>(.*?)<\/t>/s.exec(m[2]) ?? /<v>(.*?)<\/v>/s.exec(m[2]);
      out.set(indiceColonne(ref[1]), t ? decoder(t[1]) : '');
    }
    return out;
  };

  for await (const morceau of flux.stdout) {
    reste += (morceau as Buffer).toString('utf8');
    let coupe: number;
    while ((coupe = reste.indexOf('</row>')) !== -1) {
      const ligne = reste.slice(0, coupe + 6);
      reste = reste.slice(coupe + 6);
      const cs = cellules(ligne);
      if (!colonnes) {
        // La première ligne est l'en-tête : on y retrouve chaque compétence par
        // son libellé exact, plutôt que par une position qui pourrait bouger.
        const parLibelle = new Map<string, number>();
        for (const [i, v] of cs) parLibelle.set(v.trim(), i);
        colonnes = new Map();
        for (const code of codesSuivis.keys()) {
          const i = parLibelle.get(libelleDeCode.get(code)!);
          if (i === undefined) throw new Error(`colonne introuvable pour le code ${code}`);
          colonnes.set(code, i);
        }
        colSiren = parLibelle.get('N° SIREN')!;
        colNom = parLibelle.get('Nom du groupement')!;
        colNature = parLibelle.get('Nature juridique')!;
        colMembre = parLibelle.get('Siren membre')!;
        colCategorie = parLibelle.get('Catégorie des membres du groupement')!;
        continue;
      }
      lignes++;
      const siren = cs.get(colSiren)?.trim();
      if (!siren) continue;
      let g = groupements.get(siren);
      if (!g) {
        const codes = new Set<string>();
        for (const [code, i] of colonnes) if (cs.get(i)?.trim() === 'OUI') codes.add(code);
        g = {
          siren,
          nom: cs.get(colNom)?.trim() ?? '',
          nature: cs.get(colNature)?.trim() ?? '',
          codes,
          membres: new Set(),
        };
        groupements.set(siren, g);
      }
      const membre = cs.get(colMembre)?.trim();
      if (membre) g.membres.add(membre);
      void colCategorie;
    }
  }
  await new Promise((r) => flux.on('close', r));
  dire(`${GRIS}${lignes.toLocaleString('fr-FR')} lignes lues.${RAZ}`);
  return { groupements, dateExport: new Date().toISOString().slice(0, 10) };
}

function decoder(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* L'écriture est dans un second fichier pour garder celui-ci lisible. */
async function ecrire(
  graphe: ReturnType<typeof chargerGraphe>,
  groupements: Map<string, Groupement>,
  codesSuivis: Map<string, string[]>,
  dateExport: string,
  natures: Map<string, string>,
  finances: {
    annee: number;
    parCommune: Map<string, (number | null)[]>;
    statutParticulier: Map<string, string>;
  } | null,
  eau: Awaited<ReturnType<typeof import('./eau-emettre.ts')['collecterEau']>>,
) {
  const { emettre } = await import('./territoires-emettre.ts');
  emettre({
    graphe,
    groupements,
    codesSuivis,
    dateExport,
    natures,
    finances,
    eau,
    sortie: SORTIE,
    dire,
    VERT,
    RAZ,
    GRIS,
  });
}

await principal();
