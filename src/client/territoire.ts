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
  /** Le premier code postal, celui qu'on affiche. */
  cp: string;
  /** Tous les codes postaux : une commune étendue en a plusieurs. */
  cps: string[];
  /** Numéro du département : sert à charger le bon fichier. */
  dep: string;
  /** Son nom : « Sarthe » se reconnaît, « 72 » non. */
  depNom: string;
  population: number;
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
  /**
   * La loi transfère cette compétence de plein droit à cette catégorie
   * d'intercommunalité, que le registre l'ait enregistré ou non.
   */
  | { etat: 'transferee-par-loi'; structures: Structure[] }
  | { etat: 'communale' }
  | { etat: 'non-renseigne'; couvertureDep: number; couvertureNationale: number };

export interface Repere {
  id: string;
  nom: string;
  explication: string;
  /** Le flux du réseau que ce repère chiffre, quand la correspondance est exacte. */
  flux?: string;
  /** Euros par habitant pour cette commune, ou null si non renseigné. */
  valeur: number | null;
  /** Médiane des communes de la même strate de population. */
  mediane: number | null;
  /**
   * La valeur de chaque exercice, du plus ancien au plus récent. Un chiffre
   * isolé ne se discute pas ; une série dit ce qui a changé.
   */
  serie: (number | null)[];
  /**
   * Variation entre le premier et le dernier exercice renseignés, en pour
   * cent. `null` quand la série est trop lacunaire pour conclure — ou quand
   * elle part de zéro, où le pourcentage n'aurait pas de sens.
   */
  evolution: number | null;
}

export interface Finances {
  annee: number;
  /** Les exercices de la série, du plus ancien au plus récent. */
  annees: number[];
  /** Le libellé de la strate à laquelle la commune est comparée. */
  strate: string;
  /**
   * Renseigné pour les communes dont le statut rend la comparaison trompeuse —
   * Paris, qui fusionne les fonctions communales et départementales. Les
   * chiffres restent affichés, la médiane est retirée.
   */
  statutParticulier?: string;
  reperes: Repere[];
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

/** Une implantation de service public dans la commune. */
export interface ServicePublic {
  famille: string;
  nom: string;
  /** École ou établissement de santé privé. */
  prive: boolean;
  /** Établissement de santé doté d'un service d'urgences. */
  urgences: boolean;
}

export interface Services {
  /** Ce qui est dans la commune, groupé par famille et dans l'ordre déclaré. */
  parFamille: Map<string, ServicePublic[]>;
  /**
   * Les communes du reste de l'intercommunalité qui accueillent une France
   * services. Elles ne déclarent pas leur ressort : c'est le rattachement
   * intercommunal qui les rend pertinentes, pas une distance à vol d'oiseau.
   *
   * `communes` est vide quand elles sont trop nombreuses pour être nommées
   * utilement — seul `nombre` est alors renseigné.
   */
  franceServicesVoisines: { nombre: number; communes: string[] };
  /**
   * Le service d'incendie compétent. Les casernes n'existent pas en open data
   * national : l'annuaire ne publie que les états-majors départementaux.
   */
  sdis: string | null;
  maj: string;
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
  /** Les comptes de la commune, en euros par habitant. */
  finances: Finances | null;
  /** Le service d'eau qui la dessert, et son prix. */
  eau: ServiceEau | null;
  /** Les services publics implantés sur son territoire. */
  services: Services | null;
  maj: string;
}

const BASE = '/territoires';
const CLE_MEMOIRE = 'rouages.commune';

let index: CommuneBreve[] | null = null;
/**
 * Les deux formes comparables d'un nom, calculées à la demande : le nom
 * normalisé, et le même sans son article initial.
 */
const formes = new Map<string, { nom: string; nu: string }>();

function formesDe(c: CommuneBreve): { nom: string; nu: string } {
  let f = formes.get(c.code);
  if (!f) {
    const nom = normaliser(c.nom);
    const nu = nom.replace(/^(le|la|les|l|aux|au) /, '');
    f = { nom, nu: nu === nom ? '' : nu };
    formes.set(c.code, f);
  }
  return f;
}
interface MetaFinances {
  annee: number;
  /** Les exercices de la série, du plus ancien au plus récent. */
  annees?: number[];
  reperes: { id: string; nom: string; explication: string; flux?: string }[];
  strates: string[];
  medianes: (number | null)[][];
  statutParticulier: Record<string, string>;
}

let meta: {
  codes: Record<string, string[]>;
  natures: Record<string, string>;
  couverture: Record<string, number>;
  /** Compétence -> catégories d'intercommunalité que la loi oblige. */
  obligatoires?: Record<string, string[]>;
  /** Compétence -> réserve à afficher avec la réponse. */
  reserves?: Record<string, string>;
  finances?: MetaFinances;
  eau?: { annee: number; indicateur: string; competence: string; prixMedian: number | null };
  services?: {
    maj: string;
    familles: string[];
    totaux: Record<string, number>;
    sdis: Record<string, string>;
  };
  maj: string;
} | null = null;
const departements = new Map<string, unknown>();
const financesDep = new Map<
  string,
  { annee: number; annees: number[]; h: Record<string, (number | null)[][]> } | null
>();
const eauDep = new Map<
  string,
  { annee: number; c: Record<string, [number | null, string, string, string]> } | null
>();
type ServicesDep = {
  maj: string;
  c: Record<string, [number, string, number][]>;
  sdis?: string;
  fs?: Record<string, { n: number; l: string[] }>;
};
const servicesDep = new Map<string, ServicesDep | null>();

/** Les strates de population, dans le même ordre qu'à l'ingestion. */
const BORNES = [500, 2000, 10000, 50000, Infinity];

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

/**
 * Normalise pour la comparaison : sans accents ni casse, et « St » développé.
 *
 * 3 885 communes commencent par Saint ou Sainte — plus d'une sur dix. Personne
 * ne les écrit en entier dans un champ de recherche ; ne pas développer
 * l'abréviation revient à rendre ce dixième introuvable.
 */
export function normaliser(s: string): string {
  return aplatir(s)
    .split(' ')
    .map((mot) => (mot === 'st' ? 'saint' : mot === 'ste' ? 'sainte' : mot))
    .join(' ');
}

export async function chargerIndex(): Promise<CommuneBreve[]> {
  if (index) return index;
  const brut = await json<{
    maj: string;
    deps: Record<string, string>;
    c: [string, string, string, string, number][];
  }>(`${BASE}/index.json`);
  index = brut.c.map(([code, nom, cps, dep, population]) => {
    const liste = cps ? cps.split(' ') : [];
    return {
      code,
      nom,
      cp: liste[0] ?? '',
      cps: liste,
      dep,
      depNom: brut.deps[dep] ?? dep,
      population,
    };
  });
  return index;
}

/**
 * Le classement est le cœur du problème : 1 481 noms de communes sont portés
 * par plusieurs communes, soit plus d'une sur dix. Taper « Mayet » doit donner
 * Mayet avant Le Mayet-d'École, et l'affichage doit permettre de trancher entre
 * deux homonymes — d'où le département en toutes lettres et la population.
 */
export async function chercher(requete: string, limite = 8): Promise<CommuneBreve[]> {
  return classer(await chargerIndex(), requete, limite);
}

/**
 * Le classement, isolé du chargement pour être vérifiable hors navigateur.
 * `scripts/verifier-recherche.ts` l'exerce sur l'index réel : une régression de
 * tri est invisible à l'œil et remonterait la mauvaise commune à quelqu'un qui
 * cherche la sienne.
 */
export function classer(liste: CommuneBreve[], requete: string, limite = 8): CommuneBreve[] {
  const q = normaliser(requete);
  if (q.length < 2) return [];
  const parCode = /^\d{2,5}$/.test(q);
  const resultats: { c: CommuneBreve; rang: number }[] = [];
  for (const c of liste) {
    if (parCode) {
      // Cinq chiffres, pour un habitant, c'est un code postal — pas un code
      // INSEE, qui occupe pourtant le même espace de valeurs. Le postal passe
      // donc devant : sans quoi taper 72360 remonte Trangé, dont c'est le code
      // INSEE, avant les communes dont c'est vraiment le code postal.
      if (c.cps.includes(q)) resultats.push({ c, rang: 0 });
      else if (c.cps.some((p) => p.startsWith(q))) resultats.push({ c, rang: 1 });
      else if (c.code === q) resultats.push({ c, rang: 2 });
      else if (c.code.startsWith(q)) resultats.push({ c, rang: 3 });
      continue;
    }
    const { nom, nu } = formesDe(c);
    if (nom === q || nu === q) resultats.push({ c, rang: 0 });
    else if (nom.startsWith(q)) resultats.push({ c, rang: 1 });
    else if (nu && nu.startsWith(q)) resultats.push({ c, rang: 2 });
    else if (nom.includes(q)) resultats.push({ c, rang: 3 });
  }
  return resultats
    .sort(
      (a, b) =>
        a.rang - b.rang ||
        // À rang égal, la plus peuplée d'abord : c'est le plus souvent celle
        // qu'on cherchait, et cela stabilise l'ordre entre homonymes.
        b.c.population - a.c.population ||
        a.c.nom.localeCompare(b.c.nom, 'fr'),
    )
    .slice(0, limite)
    .map((r) => r.c);
}

/**
 * Retrouve une commune par son code INSEE. Utilisé pour les liens partagés et
 * pour réhydrater un choix mémorisé : un code est sans ambiguïté, contrairement
 * à un nom — et tous ne sont pas numériques (2A004, en Corse).
 */
export async function trouverParCode(code: string): Promise<CommuneBreve | null> {
  const liste = await chargerIndex();
  return liste.find((c) => c.code === code) ?? null;
}

export async function resoudre(commune: CommuneBreve): Promise<Territoire> {
  meta ??= await json(`${BASE}/meta.json`);
  if (!departements.has(commune.dep)) {
    // Les deux fichiers en parallèle : ils concernent le même département et
    // arrivent ensemble, plutôt que l'un après l'autre.
    const [structure, argent, eau, servs] = await Promise.all([
      json(`${BASE}/dep/${commune.dep}.json`),
      json<{ annee: number; annees: number[]; h: Record<string, (number | null)[][]> }>(
        `${BASE}/dep/${commune.dep}-finances.json`,
      ).catch(() => null),
      json<{ annee: number; c: Record<string, [number | null, string, string, string]> }>(
        `${BASE}/dep/${commune.dep}-eau.json`,
      ).catch(() => null),
      json<ServicesDep>(`${BASE}/dep/${commune.dep}-services.json`).catch(() => null),
    ]);
    departements.set(commune.dep, structure);
    financesDep.set(commune.dep, argent);
    eauDep.set(commune.dep, eau);
    servicesDep.set(commune.dep, servs);
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

    // Avant de conclure quoi que ce soit du silence du registre : la loi a
    // peut-être déjà tranché. 54 % seulement des intercommunalités à fiscalité
    // propre déclarent à BANATIC le développement économique, que la loi leur
    // impose pourtant à toutes depuis 2017 — répondre « la commune » y était
    // faux presque une fois sur deux.
    const natures = meta!.obligatoires?.[competence] ?? [];
    if (natures.length > 0) {
      const tenues = structures.filter((s) => natures.includes(s.nature));
      if (tenues.length > 0) return { etat: 'transferee-par-loi', structures: tenues };
    }

    const dansLeDep = dep.couverture?.[competence] ?? 0;
    const enFrance = meta!.couverture?.[competence] ?? 0;
    if (enFrance >= 0.5 && dansLeDep < enFrance * 0.5) {
      return { etat: 'non-renseigne', couvertureDep: dansLeDep, couvertureNationale: enFrance };
    }
    return { etat: 'communale' };
  };

  return {
    commune,
    population: ligne[2],
    structures,
    parCompetence,
    verdict,
    reserve: (c: string) => meta!.reserves?.[c] ?? null,
    finances: assemblerFinances(commune, ligne[2]),
    eau: assemblerEau(commune),
    services: assemblerServices(commune),
    maj: dep.maj,
  };
}

/** Le service d'eau qui dessert la commune, avec son prix et son mode de gestion. */
export function assemblerServices(commune: CommuneBreve): Services | null {
  const m = meta?.services;
  const dep = servicesDep.get(commune.dep);
  if (!m || !dep) return null;
  const parFamille = new Map<string, ServicePublic[]>();
  // L'ordre des familles est celui des métadonnées : le fichier départemental
  // ne transporte qu'un index, ce qui évite de répéter 80 000 fois « ecole ».
  for (const [i, nom, drapeau] of dep.c[commune.code] ?? []) {
    const famille = m.familles[i];
    if (!famille) continue;
    if (!parFamille.has(famille)) parFamille.set(famille, []);
    parFamille.get(famille)!.push({
      famille,
      nom,
      prive: famille === 'sante' ? false : drapeau === 1,
      urgences: famille === 'sante' && drapeau === 1,
    });
  }
  // Les urgences en tête : c'est l'établissement qu'on cherche quand on
  // cherche vite, et il ne doit pas dépendre de l'ordre alphabétique.
  for (const l of parFamille.values()) {
    l.sort((a, b) => Number(b.urgences) - Number(a.urgences) || a.nom.localeCompare(b.nom, 'fr'));
  }
  const brut = dep.fs?.[commune.code];
  const voisines = { nombre: brut?.n ?? 0, communes: brut?.l ?? [] };
  const services: Services = {
    parFamille,
    franceServicesVoisines: voisines,
    sdis: dep.sdis ?? m.sdis?.[commune.dep] ?? null,
    maj: dep.maj,
  };
  const vide = parFamille.size === 0 && voisines.nombre === 0 && services.sdis === null;
  return vide ? null : services;
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

/**
 * Un montant brut ne dit rien : chaque repère est donc accompagné de la médiane
 * des communes de taille voisine. Comparer un village à une ville produirait un
 * écart spectaculaire et vide de sens.
 */
function assemblerFinances(commune: CommuneBreve, population: number): Finances | null {
  const m = meta?.finances;
  const dep = financesDep.get(commune.dep);
  if (!m || !dep) return null;
  const series = dep.h[commune.code];
  if (!series) return null;
  const strate = BORNES.findIndex((b) => population < b);
  const particulier = m.statutParticulier?.[commune.code];
  const annees = dep.annees ?? m.annees ?? [dep.annee];
  return {
    annee: dep.annee,
    annees,
    strate: m.strates[strate] ?? '',
    statutParticulier: particulier,
    reperes: m.reperes.map((r, i) => {
      const serie = series[i] ?? [];
      return {
        ...r,
        // Le dernier exercice est la dernière valeur de la série.
        valeur: serie.length > 0 ? (serie[serie.length - 1] ?? null) : null,
        // Pas de médiane quand la comparaison n'a pas de sens.
        mediane: particulier ? null : (m.medianes[strate]?.[i] ?? null),
        serie,
        evolution: variation(serie),
      };
    }),
  };
}

/**
 * L'écart entre le premier et le dernier exercice renseignés.
 *
 * On refuse de conclure sur moins de trois points : deux valeurs isolées à huit
 * ans d'écart peuvent tenir à un investissement exceptionnel plutôt qu'à une
 * tendance. Et une série qui part de zéro n'a pas de pourcentage — « +∞ % » ne
 * veut rien dire.
 */
export function variation(serie: (number | null)[]): number | null {
  const points = serie.filter((v): v is number => v !== null);
  if (points.length < 3) return null;
  const debut = points[0];
  const fin = points[points.length - 1];
  if (debut === 0) return null;
  return Math.round(((fin - debut) / Math.abs(debut)) * 100);
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
