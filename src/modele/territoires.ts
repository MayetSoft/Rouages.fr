/**
 * Lire, au moment du build, ce que l'ingestion a écrit.
 *
 * Les fichiers de `public/territoires` sont produits par `npm run territoires`
 * pour être consommés par le navigateur. Les pages de commune les relisent
 * depuis le disque : la jointure coûteuse a déjà été faite une fois, il serait
 * absurde de la refaire ici, et deux calculs indépendants finiraient par
 * diverger.
 *
 * Tout est mis en cache par département : un département compte en moyenne
 * 345 communes, et relire son fichier pour chacune multiplierait par autant le
 * temps de génération.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verdictDe, type StructureExercante, type Verdict } from './verdict.ts';

const BASE = join(process.cwd(), 'public', 'territoires');

export interface CommuneIndex {
  code: string;
  nom: string;
  cp: string;
  dep: string;
  depNom: string;
  population: number;
}

interface Meta {
  maj: string;
  codes: Record<string, string[]>;
  obligatoires?: Record<string, string[]>;
  reserves?: Record<string, string>;
  aDefaut?: Record<string, 'region' | 'departement' | 'etat'>;
  regions?: Record<string, string>;
  natures: Record<string, string>;
  couverture?: Record<string, number>;
  services?: { familles: string[]; sdis?: Record<string, string> };
}

interface DepStructure {
  maj: string;
  g: [string, string, string, string[]][];
  c: [string, string, number, number[]][];
  couverture?: Record<string, number>;
}

type ServicesDep = {
  maj: string;
  c: Record<string, ([number, string, number] | [number, string, number, string])[]>;
  sdis?: string;
  v?: Record<string, Record<string, { n: number; l: string[] }>>;
};
type ElusDep = { maj: string; c: Record<string, [string, string, string]> };
type EcolesDep = { rentrees: number[]; h: Record<string, [(number | null)[], (number | null)[]]> };
type SruDep = { maj: string; c: Record<string, Record<string, unknown>> };

function lire<T>(chemin: string): T | null {
  const p = join(BASE, chemin);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

let meta: Meta | null | undefined;
export function metaTerritoires(): Meta | null {
  if (meta === undefined) meta = lire<Meta>('meta.json');
  return meta;
}

/** Toutes les communes, pour engendrer les chemins. */
export function communes(): CommuneIndex[] {
  const idx = lire<{ deps: Record<string, string>; c: [string, string, string, string, number][] }>(
    'index.json',
  );
  if (!idx) return [];
  return idx.c.map(([code, nom, cp, dep, population]) => ({
    code,
    nom,
    cp,
    dep,
    depNom: idx.deps[dep] ?? dep,
    population,
  }));
}

const cacheDep = new Map<string, DepStructure | null>();
const cacheServices = new Map<string, ServicesDep | null>();
const cacheElus = new Map<string, ElusDep | null>();
const cacheEcoles = new Map<string, EcolesDep | null>();
const cacheSru = new Map<string, SruDep | null>();

function enCache<T>(c: Map<string, T | null>, dep: string, f: string): T | null {
  if (!c.has(dep)) c.set(dep, lire<T>(f));
  return c.get(dep) ?? null;
}

export interface Fiche {
  commune: CommuneIndex;
  /** Les groupements dont la commune dépend, dans l'ordre du fichier. */
  structures: (StructureExercante & { competences: string[] })[];
  /** Compétence de Rouages -> ce qu'on peut en dire ici. */
  verdicts: Map<string, Verdict>;
  reserve: (competence: string) => string | null;
  maire: { prenom: string; nom: string; depuis: string } | null;
  services: { famille: string; nom: string; prive: boolean; ecole?: { classes: (number | null)[]; eleves: (number | null)[]; rentrees: number[] } }[];
  /** Ce qui n'est pas dans la commune mais dans son intercommunalité. */
  voisines: Record<string, { n: number; l: string[] }>;
  sdis: string | null;
  soumiseSru: boolean;
  maj: string;
}

/**
 * Tout ce qu'une page de commune affiche, rassemblé une fois.
 *
 * `competences` est la liste des identifiants à résoudre — elle vient du
 * réseau, pas des données : c'est le contenu qui décide de ce qu'on cherche à
 * savoir, pas le référentiel.
 */
export function ficheCommune(c: CommuneIndex, competences: { id: string; banatic: string[] }[]): Fiche | null {
  const m = metaTerritoires();
  const dep = enCache(cacheDep, c.dep, `dep/${c.dep}.json`);
  if (!m || !dep) return null;
  const ligne = dep.c.find((x) => x[0] === c.code);
  if (!ligne) return null;

  const structures = ligne[3].map((i) => {
    const [siren, nom, nature, codes] = dep.g[i];
    return {
      siren,
      nom,
      nature,
      natureLibelle: m.natures[nature] ?? nature,
      competences: [...new Set(codes.flatMap((k) => m.codes[k] ?? []))].sort(),
    };
  });

  const verdicts = new Map<string, Verdict>();
  for (const comp of competences) {
    if (comp.banatic.length === 0) continue;
    verdicts.set(
      comp.id,
      verdictDe({
        exercants: structures.filter((s) => s.competences.includes(comp.id)),
        structures,
        obligatoirePour: m.obligatoires?.[comp.id] ?? [],
        aDefaut: m.aDefaut?.[comp.id],
        region: m.regions?.[c.dep],
        departement: c.depNom,
        couvertureDep: dep.couverture?.[comp.id] ?? 0,
        couvertureNationale: m.couverture?.[comp.id] ?? 0,
      }),
    );
  }

  const elus = enCache(cacheElus, c.dep, `dep/${c.dep}-elus.json`);
  const brutMaire = elus?.c[c.code];

  const servs = enCache(cacheServices, c.dep, `dep/${c.dep}-services.json`);
  const ecoles = enCache(cacheEcoles, c.dep, `dep/${c.dep}-ecoles.json`);
  const familles = m.services?.familles ?? [];
  const services = (servs?.c[c.code] ?? []).map((e) => {
    const uai = e.length === 4 ? e[3] : undefined;
    const serie = uai && ecoles ? ecoles.h[uai] : undefined;
    return {
      famille: familles[e[0]] ?? '',
      nom: e[1],
      prive: familles[e[0]] !== 'sante' && e[2] === 1,
      ...(serie ? { ecole: { classes: serie[0], eleves: serie[1], rentrees: ecoles!.rentrees } } : {}),
    };
  });

  const sru = enCache(cacheSru, c.dep, `dep/${c.dep}-sru.json`);

  return {
    commune: c,
    structures,
    verdicts,
    reserve: (comp) => m.reserves?.[comp] ?? null,
    maire: brutMaire ? { prenom: brutMaire[0], nom: brutMaire[1], depuis: brutMaire[2] } : null,
    services,
    voisines: servs?.v?.[c.code] ?? {},
    sdis: servs?.sdis ?? m.services?.sdis?.[c.dep] ?? null,
    soumiseSru: !!sru?.c[c.code],
    maj: dep.maj,
  };
}
