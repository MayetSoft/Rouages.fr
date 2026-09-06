/**
 * « Chez moi » : résoudre les compétences qui varient selon le territoire.
 *
 * Partout ailleurs le site répond « variable selon le territoire ». C'est
 * honnête, et c'est une impasse pour l'usager. Ici on répond vraiment, à partir
 * des transferts de compétences que BANATIC publie, groupement par groupement.
 *
 * Deux fichiers, chargés seulement quand on en a besoin : un index de recherche
 * léger, puis le détail du seul département concerné. Personne ne télécharge la
 * France entière pour chercher sa commune.
 */

export interface CommuneBreve {
  code: string;
  nom: string;
  cp: string;
  dep: string;
}

export interface Structure {
  siren: string;
  nom: string;
  /** Code de nature juridique : CC, CU, SIVU, PETR… */
  nature: string;
  natureLibelle: string;
  /** Compétences de Rouages que cette structure exerce ici. */
  competences: string[];
}

/**
 * Ce qu'on peut dire d'une compétence sur un territoire donné.
 *
 * Trois états, pas deux. Le registre a des trous : dans la Sarthe, 15 % des
 * communes seulement ont un exerçant identifié pour la concession électrique,
 * contre 94 % au niveau national. Conclure « la commune s'en charge » y serait
 * faux — et faux avec aplomb, ce qui est le pire défaut possible pour ce site.
 */
export type Verdict =
  | { etat: 'transferee'; structures: Structure[] }
  | { etat: 'communale' }
  | { etat: 'non-renseigne'; couvertureDep: number; couvertureNationale: number };

export interface Territoire {
  commune: CommuneBreve;
  population: number;
  structures: Structure[];
  /** compétence Rouages -> structures qui l'exercent sur ce territoire. */
  parCompetence: Map<string, Structure[]>;
  /** compétence Rouages -> ce qu'on peut honnêtement en dire ici. */
  verdict(competence: string): Verdict;
  maj: string;
}

const BASE = '/territoires';
const CLE_MEMOIRE = 'rouages.commune';

let index: CommuneBreve[] | null = null;
let meta: {
  codes: Record<string, string[]>;
  natures: Record<string, string>;
  couverture: Record<string, number>;
  maj: string;
} | null = null;
const departements = new Map<string, unknown>();

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
}

/** Sans accents ni casse : personne ne tape « Saint-Étienne » correctement. */
export function aplatir(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function chargerIndex(): Promise<CommuneBreve[]> {
  if (index) return index;
  const brut = await json<{ maj: string; c: [string, string, string, string][] }>(`${BASE}/index.json`);
  index = brut.c.map(([code, nom, cp, dep]) => ({ code, nom, cp, dep }));
  return index;
}

export async function chercher(requete: string, limite = 8): Promise<CommuneBreve[]> {
  const q = aplatir(requete);
  if (q.length < 2) return [];
  const liste = await chargerIndex();
  const parCode = /^\d{2,5}$/.test(q);
  const resultats: { c: CommuneBreve; rang: number }[] = [];
  for (const c of liste) {
    if (parCode) {
      if (c.cp.startsWith(q) || c.code.startsWith(q)) resultats.push({ c, rang: 0 });
    } else {
      const n = aplatir(c.nom);
      // Un début de nom vaut mieux qu'une occurrence au milieu.
      if (n.startsWith(q)) resultats.push({ c, rang: 0 });
      else if (n.includes(q)) resultats.push({ c, rang: 1 });
    }
    if (resultats.length > 400) break;
  }
  return resultats
    .sort((a, b) => a.rang - b.rang || a.c.nom.localeCompare(b.c.nom, 'fr'))
    .slice(0, limite)
    .map((r) => r.c);
}

export async function resoudre(commune: CommuneBreve): Promise<Territoire> {
  meta ??= await json(`${BASE}/meta.json`);
  if (!departements.has(commune.dep)) {
    departements.set(commune.dep, await json(`${BASE}/dep/${commune.dep}.json`));
  }
  const dep = departements.get(commune.dep) as {
    maj: string;
    g: [string, string, string, string[]][];
    c: [string, string, number, number[]][];
    couverture: Record<string, number>;
  };
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
  const verdict = (competence: string): Verdict => {
    const trouves = parCompetence.get(competence);
    if (trouves && trouves.length > 0) return { etat: 'transferee', structures: trouves };
    const dansLeDep = dep.couverture?.[competence] ?? 0;
    const enFrance = meta!.couverture?.[competence] ?? 0;
    if (enFrance >= 0.5 && dansLeDep < enFrance * 0.5) {
      return { etat: 'non-renseigne', couvertureDep: dansLeDep, couvertureNationale: enFrance };
    }
    return { etat: 'communale' };
  };

  return { commune, population: ligne[2], structures, parCompetence, verdict, maj: dep.maj };
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
