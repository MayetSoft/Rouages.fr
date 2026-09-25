/**
 * Le centre communal d'action sociale : ce qu'il reçoit, ce qu'il dépense, ce
 * qu'il gère.
 *
 * Le CCAS est un établissement public distinct de la commune, avec son propre
 * budget : les comptes de la commune ne montrent de lui que la subvention
 * qu'elle lui verse. Trois sources, croisées par le SIREN :
 *
 *   — l'OFGL publie les comptes des CCAS et des CIAS depuis 2018, budget
 *     principal et budgets annexes. Le nom d'un budget annexe dit souvent
 *     l'activité : une résidence, un service d'aide à domicile ;
 *   — SIRENE donne la commune du siège, et l'intercommunalité d'un CIAS,
 *     que l'OFGL ne donne pas (catégories juridiques 7361 et 7367) ;
 *   — FINESS, déjà rapatrié pour les services, rattache chaque établissement
 *     social ou médico-social à son gestionnaire : on y retrouve ce que le
 *     CCAS gère, et combien de places.
 *
 * Aucune personne : un CCAS est une personne morale, et ses aides
 * individuelles ne sont pas publiées.
 *
 * Lancé seul — `tsx scripts/ccas-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-ccas.json`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OFGL =
  'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-ccas-cias/exports/csv';
const SIRENE =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/csv';

/** Les agrégats retenus, dans l'ordre où le fichier les range. */
export const AGREGATS = [
  'Recettes de fonctionnement',
  'Dépenses de fonctionnement',
  'Participations des communes',
  "Concours de l'Etat",
  'Autres dotations et subventions',
  'Ventes de biens et services',
  'Frais de personnel',
  "Dépenses d'intervention",
] as const;

export interface Ccas {
  siren: string;
  nom: string;
  type: 'CCAS' | 'CIAS';
  /** Par agrégat de `AGREGATS`, la série du budget principal. */
  principal: (number | null)[][];
  /** Les budgets annexes du dernier exercice : leur nom et leurs dépenses de fonctionnement. */
  annexes: [string, number][];
  /** Les établissements en service que FINESS rattache au CCAS : catégorie, nom, places. */
  etablissements: [string, string, number | null][];
  /** Le dernier exercice où le centre publie quelque chose. */
  dernier: number;
}

export interface Comptes {
  maj: string;
  annees: number[];
  /** SIREN -> le CCAS. */
  parSiren: Map<string, Ccas>;
  /** SIREN -> commune du siège, et intercommunalité pour un CIAS. */
  siege: Map<string, { commune: string; epci: string }>;
}

function champs(ligne: string): string[] {
  // Les exports Opendatasoft citent les champs qui contiennent le séparateur.
  const out: string[] = [];
  let cur = '';
  let cite = false;
  for (const ch of ligne) {
    if (ch === '"') cite = !cite;
    else if (ch === ';' && !cite) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function lignesDe(texte: string): Promise<string[][]> {
  return texte.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(champs);
}

export async function collecterCcas(
  texte: (url: string) => Promise<string>,
  finess: string | null,
  dire: (m: string) => void,
): Promise<Comptes | null> {
  const liste = AGREGATS.map((a) => `"${a}"`).join(',');
  const ofgl = await lignesDe(
    await texte(
      `${OFGL}?select=exer,siren,type,nom_ccas,lbudg,type_de_budget,agregat,montant` +
        `&where=${encodeURIComponent(`agregat in (${liste})`)}&delimiter=%3B`,
    ),
  );
  const entete = ofgl[0];
  const col = (n: string) => entete.indexOf(n);
  const [iExer, iSiren, iType, iNom, iBudget, iTypeBudget, iAgregat, iMontant] = [
    'exer', 'siren', 'type', 'nom_ccas', 'lbudg', 'type_de_budget', 'agregat', 'montant',
  ].map(col);
  if ([iExer, iSiren, iAgregat, iMontant].some((i) => i === -1)) {
    dire('Comptes des CCAS : l’export de l’OFGL a changé de forme.');
    return null;
  }
  const annees = [...new Set(ofgl.slice(1).map((l) => Number(l[iExer].slice(0, 4))))].filter(Boolean).sort();
  const derniere = annees[annees.length - 1];
  const parSiren = new Map<string, Ccas & { _annexes: Map<string, [number, number]>; _nomAnnee: number }>();
  for (const l of ofgl.slice(1)) {
    const siren = l[iSiren];
    const annee = Number(l[iExer].slice(0, 4));
    const type = l[iType] === 'CIAS' ? 'CIAS' : 'CCAS';
    let c = parSiren.get(siren);
    if (!c) {
      c = {
        siren, nom: l[iNom], type, principal: AGREGATS.map(() => annees.map(() => null)),
        annexes: [], etablissements: [], dernier: annee, _annexes: new Map(), _nomAnnee: annee,
      };
      parSiren.set(siren, c);
    }
    // Le nom du dernier exercice : l'OFGL en a changé la graphie en 2024.
    if (annee >= c._nomAnnee) {
      c.nom = l[iNom];
      c._nomAnnee = annee;
    }
    const montant = Number(l[iMontant]);
    if (!Number.isFinite(montant)) continue;
    if (annee > c.dernier) c.dernier = annee;
    if (l[iTypeBudget] === 'Budget principal') {
      const a = AGREGATS.indexOf(l[iAgregat] as (typeof AGREGATS)[number]);
      if (a !== -1) c.principal[a][annees.indexOf(annee)] = Math.round(montant);
    } else if (l[iAgregat] === 'Dépenses de fonctionnement') {
      const avant = c._annexes.get(l[iBudget]);
      if (!avant || annee > avant[0]) c._annexes.set(l[iBudget], [annee, Math.round(montant)]);
    }
  }
  // Un budget annexe fermé depuis des années n'est plus une activité : on ne
  // garde que ceux du dernier exercice publié par ce CCAS.
  for (const c of parSiren.values()) {
    const dernierCcas = Math.max(...[...c._annexes.values()].map(([a]) => a), 0);
    c.annexes = [...c._annexes]
      .filter(([, [a]]) => a === dernierCcas)
      .map(([nom, [, m]]) => [nom, m] as [string, number])
      .sort((x, y) => y[1] - x[1]);
  }

  const sirene = await lignesDe(
    await texte(
      `${SIRENE}?select=siren,codecommuneetablissement,codeepcietablissement,etatadministratifetablissement` +
        `&where=${encodeURIComponent('categoriejuridiqueunitelegale in ("7361","7367") and etablissementsiege="oui"')}` +
        `&delimiter=%3B`,
    ),
  );
  const siege = new Map<string, { commune: string; epci: string }>();
  for (const l of sirene.slice(1)) {
    // Un siège actif l'emporte sur un siège fermé du même SIREN.
    if (siege.has(l[0]) && l[3] !== 'Actif') continue;
    siege.set(l[0], { commune: l[1], epci: l[2] });
  }

  if (finess && existsSync(finess)) {
    const ejDe = new Map<string, string>();
    const etablissements: string[][] = [];
    const flux = createInterface({ input: createReadStream(finess, 'utf8') });
    let entete: string[] | null = null;
    for await (const ligne of flux) {
      const v = ligne.split('","').map((x) => x.replace(/^"|"$/g, '').replace(/""/g, '"'));
      if (!entete) {
        entete = v;
        continue;
      }
      const f = (n: string) => v[entete!.indexOf(n)] ?? '';
      if (f('etat') !== 'ACTUEL') continue;
      if (f('type') === 'EJ' && parSiren.has(f('siren'))) ejDe.set(f('ej_finess'), f('siren'));
      else if (f('type') === 'ET') etablissements.push([f('ej_finess'), f('categ_lib'), f('et_rs'), f('esms_capaTot_inst')]);
    }
    for (const [ej, categ, nom, capa] of etablissements) {
      const siren = ejDe.get(ej);
      if (!siren) continue;
      // Zéro place, c'est un service sans capacité déclarée — une équipe
      // mobile, un centre d'information — plutôt qu'un établissement vide.
      const n = Number(capa);
      parSiren.get(siren)!.etablissements.push([categ, nom, capa && Number.isFinite(n) && n > 0 ? n : null]);
    }
  }

  dire(
    `Comptes des CCAS : ${parSiren.size.toLocaleString('fr-FR')} centres, de ${annees[0]} à ${derniere}, ` +
      `${siege.size.toLocaleString('fr-FR')} sièges situés.`,
  );
  const propres = new Map<string, Ccas>();
  for (const [s, c] of parSiren) {
    const { _annexes, _nomAnnee, ...reste } = c;
    void _annexes;
    void _nomAnnee;
    propres.set(s, reste);
  }
  return { maj: new Date().toISOString().slice(0, 10), annees, parSiren: propres, siege };
}

/** Les natures d'intercommunalité à fiscalité propre, celles qui portent un CIAS. */
const FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'SAN', 'EPT']);

/**
 * Un fichier par département : pour chaque commune, son CCAS et le CIAS de son
 * intercommunalité, quand ils publient des comptes. L'appartenance à
 * l'intercommunalité vient du fichier de structure du département, déjà écrit.
 */
export function ecrireCcas(sortie: string, c: Comptes): number {
  const parCommune = new Map<string, string[]>();
  const parEpci = new Map<string, string[]>();
  // Un centre qui ne publie plus depuis deux exercices a été dissous ou
  // absorbé — souvent un CIAS d'avant une fusion d'intercommunalités, que
  // SIRENE rattache pourtant à l'intercommunalité d'aujourd'hui.
  const derniere = c.annees[c.annees.length - 1];
  for (const [siren, s] of c.siege) {
    const ccas = c.parSiren.get(siren);
    if (!ccas || ccas.dernier < derniere - 1) continue;
    if (ccas.type === 'CIAS') {
      if (!parEpci.has(s.epci)) parEpci.set(s.epci, []);
      parEpci.get(s.epci)!.push(siren);
    } else {
      if (!parCommune.has(s.commune)) parCommune.set(s.commune, []);
      parCommune.get(s.commune)!.push(siren);
    }
  }
  const dossier = join(sortie, 'dep');
  let ecrits = 0;
  for (const nom of readdirSync(dossier)) {
    const m = /^([0-9AB]{2,3})\.json$/.exec(nom);
    if (!m) continue;
    const dep = JSON.parse(readFileSync(join(dossier, nom), 'utf8')) as {
      g: [string, string, string, string[]][];
      c: [string, string, number, number[], string?][];
    };
    const centres: Record<string, unknown> = {};
    const communes: Record<string, string[]> = {};
    for (const [code, , , groupes] of dep.c) {
      const epcis = groupes.map((i) => dep.g[i]).filter((g) => g && FISCALITE_PROPRE.has(g[2])).map((g) => g[0]);
      const sirens = [...(parCommune.get(code) ?? []), ...epcis.flatMap((e) => parEpci.get(e) ?? [])];
      if (sirens.length === 0) continue;
      communes[code] = sirens;
      for (const s of sirens) {
        const x = c.parSiren.get(s)!;
        centres[s] ??= [x.nom, x.type, x.principal, x.annexes, x.etablissements, x.dernier];
      }
    }
    if (Object.keys(communes).length === 0) continue;
    writeFileSync(
      join(dossier, `${m[1]}-ccas.json`),
      JSON.stringify({ maj: c.maj, annees: c.annees, agregats: AGREGATS, s: centres, c: communes }),
    );
    ecrits++;
  }
  return ecrits;
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const texte = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    return r.text();
  };
  const cache = join(racine, '.cache');
  if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
  const c = await collecterCcas(texte, join(cache, 't-finess.csv'), console.log);
  if (c) console.log(`${ecrireCcas(join(racine, 'public', 'territoires'), c)} départements écrits.`);
}
