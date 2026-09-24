/**
 * « Chez moi » : résoudre les compétences qui varient selon le territoire.
 *
 * Partout ailleurs le site répond « variable selon le territoire ». C'est
 * honnête, et c'est une impasse pour l'usager. Ici on répond vraiment, à partir
 * des transferts de compétences que BANATIC publie, groupement par groupement.
 *
 * Trois fichiers, chargés seulement quand on en a besoin : la table des
 * compétences, les groupements du seul département concerné, et le prix de
 * l'eau qu'on y paie. Tout le reste de ce que le site sait d'une commune — ses
 * comptes, son élection, ses marchés — est sur sa page, écrit au build : le
 * panneau en chargeait dix-neuf fichiers pour en dresser une seconde copie,
 * qui avait dérivé de la première.
 */

import {
  origineVerdict,
  resumerVerdict,
  verdictDe,
  type StructureExercante,
  type Verdict,
} from '../modele/verdict.ts';

export { origineVerdict, resumerVerdict, type Verdict };
export { aplatir, chargerIndex, chercher, classer, normaliser, type CommuneBreve } from './recherche-commune.ts';
import { chargerIndex, indexCharge, type CommuneBreve } from './recherche-commune.ts';


/**
 * Une structure telle que le panneau l'affiche : ce dont le verdict a besoin,
 * plus la liste de ce qu'elle exerce ici — utile au panneau, inutile à la
 * décision, donc absente du modèle partagé.
 */
export interface Structure extends StructureExercante {
  competences: string[];
}

export interface ServiceEau {
  /** Euros TTC par m³, pour la consommation de référence de 120 m³. */
  prix: number | null;
  nom: string;
  /** Régie ou délégation. */
  gestion: string;
  /** Le délégataire, s'il y en a un. */
  operateur: string;
  annee: number;
  /** Prix médian national, pour situer le sien. */
  median: number | null;
  /** La compétence à laquelle rattacher cette information. */
  competence: string;
}

export interface Territoire {
  commune: CommuneBreve;
  population: number;
  structures: Structure[];
  /** compétence Rouages -> structures qui l'exercent sur ce territoire. */
  parCompetence: Map<string, Structure[]>;
  /** compétence Rouages -> ce qu'on peut honnêtement en dire ici. */
  verdict(competence: string): Verdict;
  /** La réserve déclarée par la compétence, quand elle en porte une. */
  reserve(competence: string): string | null;
  /** Le service d'eau qui la dessert, et son prix. */
  eau: ServiceEau | null;
  maj: string;
}

const BASE = '/territoires';
const CLE_MEMOIRE = 'rouages.commune';

let meta: {
  codes: Record<string, string[]>;
  natures: Record<string, string>;
  couverture: Record<string, number>;
  /** Compétence -> catégories d'intercommunalité que la loi oblige. */
  obligatoires?: Record<string, string[]>;
  /** Compétence -> réserve à afficher avec la réponse. */
  reserves?: Record<string, string>;
  /** Compétence -> échelon qui répond quand personne ne s'en est saisi. */
  aDefaut?: Record<string, 'region' | 'departement' | 'etat'>;
  /** Département -> nom de sa région. */
  regions?: Record<string, string>;
  eau?: { annee: number; indicateur: string; competence: string; prixMedian: number | null };
  maj: string;
} | null = null;

/** Le fichier d'un département : ses groupements, puis ses communes. */
type DepStructure = {
  maj: string;
  g: [string, string, string, string[]][];
  /** Par commune : code, nom, population, groupements, codes postaux. */
  c: [string, string, number, number[], string?][];
  couverture?: Record<string, number>;
};

const departements = new Map<string, unknown>();
const eauDep = new Map<
  string,
  { annee: number; c: Record<string, [number | null, string, string, string]> } | null
>();

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
}

/**
 * Retrouve une commune par son code INSEE. Utilisé pour les liens partagés et
 * pour réhydrater un choix mémorisé : un code est sans ambiguïté, contrairement
 * à un nom — et tous ne sont pas numériques (2A004, en Corse).
 */
export async function trouverParCode(code: string): Promise<CommuneBreve | null> {
  const deja = indexCharge()?.find((c) => c.code === code);
  if (deja) return deja;
  // L'index national pèse 1,4 Mo — les deux tiers de tout ce qu'une visite
  // télécharge — et il n'est utile qu'à la recherche par nom. Pour un code
  // déjà connu, le fichier du département suffit : il porte le nom, la
  // population et les codes postaux, et `resoudre` va le charger juste après
  // de toute façon. Reste le nom du département, deux kilo-octets à part.
  const dep = code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
  const [fichier, noms] = await Promise.all([
    (departements.get(dep) as DepStructure | undefined) ??
      json<DepStructure>(`${BASE}/dep/${dep}.json`)
        .then((d) => {
          // Rangé tout de suite : `resoudre` le demande juste après, et le
          // télécharger deux fois annulerait une part de ce qu'on vient de
          // gagner.
          departements.set(dep, d);
          return d;
        })
        .catch(() => null),
    chargerNomsDep(),
  ]);
  const ligne = fichier?.c.find((c) => c[0] === code);
  if (!ligne) {
    // Une commune fusionnée, ou un code inventé : l'index tranche, et lui seul.
    return (await chargerIndex()).find((c) => c.code === code) ?? null;
  }
  const cps = (ligne[4] ?? '').split(' ').filter(Boolean);
  return {
    code: ligne[0],
    nom: ligne[1],
    cp: cps[0] ?? '',
    cps,
    dep,
    depNom: noms[dep] ?? dep,
    population: ligne[2],
  };
}

/** Les noms de département, deux kilo-octets, chargés une fois. */
let nomsDep: Record<string, string> | null = null;
async function chargerNomsDep(): Promise<Record<string, string>> {
  nomsDep ??= await json<Record<string, string>>(`${BASE}/deps.json`).catch(() => ({}));
  return nomsDep;
}

export async function resoudre(commune: CommuneBreve): Promise<Territoire> {
  meta ??= await json(`${BASE}/meta.json`);
  if (!eauDep.has(commune.dep)) {
    // Les deux fichiers en parallèle : ils concernent le même département et
    // arrivent ensemble, plutôt que l'un après l'autre. La structure est
    // peut-être déjà là, si `trouverParCode` l'a chargée.
    const [structure, eau] = await Promise.all([
      departements.get(commune.dep) ?? json(`${BASE}/dep/${commune.dep}.json`),
      json<{ annee: number; c: Record<string, [number | null, string, string, string]> }>(
        `${BASE}/dep/${commune.dep}-eau.json`,
      ).catch(() => null),
    ]);
    departements.set(commune.dep, structure);
    eauDep.set(commune.dep, eau);
  }
  const dep = departements.get(commune.dep) as DepStructure;
  const ligne = dep.c.find((c) => c[0] === commune.code);
  if (!ligne) throw new Error(`commune absente du département : ${commune.code}`);

  const structures: Structure[] = ligne[3].map((i) => {
    const [siren, nom, nature, codes] = dep.g[i];
    const competences = [...new Set(codes.flatMap((c) => meta!.codes[c] ?? []))].sort();
    return { siren, nom, nature, natureLibelle: meta!.natures[nature] ?? nature, competences };
  });

  const parCompetence = new Map<string, Structure[]>();
  for (const s of structures) {
    for (const c of s.competences) {
      if (!parCompetence.has(c)) parCompetence.set(c, []);
      parCompetence.get(c)!.push(s);
    }
  }

  /**
   * On ne conclut « la commune » que si le registre est renseigné pour ce
   * département. Le repère est la couverture nationale : un département qui
   * décroche nettement signale un trou de saisie, pas 350 communes qui auraient
   * gardé la compétence.
   */
  // La décision elle-même est dans `src/modele/verdict.ts` : la page statique
  // de chaque commune la consulte aussi, et deux copies finiraient par se
  // contredire. Ici on ne fait que rassembler ce dont elle a besoin.
  const verdict = (competence: string): Verdict =>
    verdictDe({
      exercants: parCompetence.get(competence) ?? [],
      structures,
      obligatoirePour: meta!.obligatoires?.[competence] ?? [],
      aDefaut: meta!.aDefaut?.[competence],
      region: meta!.regions?.[commune.dep],
      departement: commune.depNom,
      couvertureDep: dep.couverture?.[competence] ?? 0,
      couvertureNationale: meta!.couverture?.[competence] ?? 0,
    });

  return {
    commune,
    population: ligne[2],
    structures,
    parCompetence,
    verdict,
    reserve: (c: string) => meta!.reserves?.[c] ?? null,
    eau: assemblerEau(commune),
    maj: dep.maj,
  };
}

function assemblerEau(commune: CommuneBreve): ServiceEau | null {
  const m = meta?.eau;
  const dep = eauDep.get(commune.dep);
  const v = m && dep ? dep.c[commune.code] : undefined;
  if (!m || !dep || !v) return null;
  const [prix, nom, gestion, operateur] = v;
  return {
    prix,
    nom,
    gestion,
    operateur,
    annee: dep.annee,
    median: m.prixMedian,
    competence: m.competence,
  };
}

/* --- mémoire du choix : on ne redemande pas sa commune à chaque visite --- */

export function memoriser(c: CommuneBreve | null): void {
  try {
    if (c) localStorage.setItem(CLE_MEMOIRE, JSON.stringify(c));
    else localStorage.removeItem(CLE_MEMOIRE);
  } catch {
    // Navigation privée, stockage refusé : le choix vaut pour la session, c'est tout.
  }
}

export function memorisee(): CommuneBreve | null {
  try {
    const brut = localStorage.getItem(CLE_MEMOIRE);
    return brut ? (JSON.parse(brut) as CommuneBreve) : null;
  } catch {
    return null;
  }
}
