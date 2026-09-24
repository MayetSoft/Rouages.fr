/**
 * Trouver une commune par son nom ou son code postal.
 *
 * Séparé du reste de `territoire.ts` parce que l'en-tête de chaque page s'en
 * sert : la recherche ne doit pas y embarquer tout ce que la carte sait faire
 * d'une commune. L'index national (1,4 Mo) n'est chargé qu'à la première
 * frappe, jamais à l'ouverture de la page.
 *
 * `scripts/verifier-recherche.ts` exerce le classement sur l'index réel.
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

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
}

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

/** L'index, s'il est déjà chargé : un code connu se retrouve sans le télécharger. */
export function indexCharge(): CommuneBreve[] | null {
  return index;
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
  }>('/territoires/index.json');
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
