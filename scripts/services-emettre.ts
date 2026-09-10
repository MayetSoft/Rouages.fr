/**
 * Où sont les services publics, commune par commune.
 *
 * Trois référentiels nationaux, parce qu'aucun ne couvre l'ensemble :
 *
 *   — l'Annuaire de l'administration (DILA) pour les France services, les CCAS
 *     et les SDIS ;
 *   — l'Annuaire de l'éducation pour les écoles, collèges et lycées ;
 *   — le référentiel FINESS pour les établissements de santé.
 *
 * Deux absences méritent d'être dites plutôt que comblées à l'estime.
 *
 * **Les casernes de pompiers n'existent pas en open data national.** L'annuaire
 * ne connaît que les 98 états-majors départementaux ; les centres de secours ne
 * sont publiés que par quelques SDIS pour leur propre département — Marseille,
 * l'Hérault. On nomme donc le SDIS compétent, ce qui est vrai et utile, sans
 * prétendre situer la caserne la plus proche.
 *
 * **Une France services ne déclare pas son ressort.** Le champ qui pourrait le
 * dire ne contient, dans la quasi-totalité des cas, que la commune où elle est
 * implantée. Pour une commune qui n'en accueille pas, on regarde donc son
 * intercommunalité — un rattachement que le site résout déjà par ailleurs, et
 * qui dit quelque chose de réel, là où une distance à vol d'oiseau ne dirait
 * que la géométrie. Le raccourci ne tient que pour une intercommunalité de
 * taille humaine : la Métropole du Grand Paris en compte 131 communes, et y
 * énumérer quatre-vingts France services n'aiderait personne. Au-delà de
 * quelques communes, on donne donc le nombre sans la liste.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** L'ordre fait foi : c'est l'index qui est écrit dans les fichiers. */
export const FAMILLES_SERVICE = [
  'ecole',
  'college',
  'lycee',
  'france-services',
  'ccas',
  'sante',
] as const;
export type FamilleService = (typeof FAMILLES_SERVICE)[number];

export interface Service {
  famille: FamilleService;
  nom: string;
  /** École ou établissement de santé privé. */
  prive?: boolean;
  /** Établissement de santé doté d'un service d'urgences. */
  urgences?: boolean;
}

export interface Services {
  maj: string;
  /** Par code INSEE. */
  parCommune: Map<string, Service[]>;
  /** Par code de département : le SDIS, seul échelon publié pour les secours. */
  sdis: Map<string, string>;
  /** Comptes nationaux, pour situer ce qu'on montre. */
  totaux: Record<string, number>;
}

const TYPE_ECOLE: Record<string, FamilleService> = {
  Ecole: 'ecole',
  Collège: 'college',
  Lycée: 'lycee',
  EREA: 'lycee',
};

/** Le département d'un code INSEE, outre-mer compris. */
export function depDe(insee: string): string {
  return insee.startsWith('97') || insee.startsWith('98') ? insee.slice(0, 3) : insee.slice(0, 2);
}

/** Les champs imbriqués de l'annuaire arrivent en JSON encodé dans une chaîne. */
function imbrique<T>(brut: unknown): T[] {
  if (typeof brut !== 'string' || brut === '') return [];
  try {
    const v: unknown = JSON.parse(brut);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Les noms de l'annuaire répètent la commune : « Centre communal d'action
 * sociale (CCAS) - Gavrelle ». Affiché sous le nom de la commune, le rappel est
 * du bruit.
 */
function sansSuffixeCommune(nom: string): string {
  return nom.replace(/\s+-\s+[^-]+$/, '').trim() || nom;
}

export async function collecterServices(
  json: <T>(url: string) => Promise<T>,
  /** Le référentiel FINESS, déjà en cache : c'est l'appelant qui l'a rapatrié. */
  lignesFiness: () => AsyncIterable<Record<string, string>>,
  dire: (m: string) => void,
): Promise<Services> {
  const parCommune = new Map<string, Service[]>();
  const sdis = new Map<string, string>();
  const totaux: Record<string, number> = {};
  const ajouter = (insee: string, s: Service) => {
    if (!/^\d[\dAB]\d{3}$/.test(insee)) return;
    const l = parCommune.get(insee);
    if (l) l.push(s);
    else parCommune.set(insee, [s]);
    totaux[s.famille] = (totaux[s.famille] ?? 0) + 1;
  };

  // --- Écoles, collèges, lycées ------------------------------------------
  type Etab = {
    nom_etablissement: string | null;
    type_etablissement: string | null;
    statut_public_prive: string | null;
    code_commune: string | null;
  };
  const ecoles = await json<Etab[]>(
    'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json' +
      '?select=nom_etablissement,type_etablissement,statut_public_prive,code_commune' +
      '&where=etat%3D%22OUVERT%22',
  );
  for (const e of ecoles) {
    const famille = TYPE_ECOLE[e.type_etablissement ?? ''];
    if (!famille || !e.code_commune || !e.nom_etablissement) continue;
    ajouter(e.code_commune, {
      famille,
      nom: e.nom_etablissement,
      ...(e.statut_public_prive === 'Privé' ? { prive: true } : {}),
    });
  }
  dire(`Établissements scolaires : ${ecoles.length.toLocaleString('fr-FR')} lus.`);

  // --- France services, CCAS, SDIS ---------------------------------------
  type Organisme = { nom: string | null; pivot: string | null; code_insee_commune: string | null };
  const organismes = await json<Organisme[]>(
    'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json' +
      '?select=nom,pivot,code_insee_commune' +
      '&where=pivot%20like%20%22france_services%22%20or%20pivot%20like%20%22sdis%22%20or%20pivot%20like%20%22ccas%22',
  );
  for (const o of organismes) {
    if (!o.nom) continue;
    const types = imbrique<{ type_service_local?: string }>(o.pivot).map((p) => p.type_service_local);
    const insee = (o.code_insee_commune ?? '').trim();
    if (types.includes('sdis')) {
      if (insee) sdis.set(depDe(insee), o.nom);
      continue;
    }
    if (!insee) continue;
    if (types.includes('france_services')) {
      ajouter(insee, { famille: 'france-services', nom: sansSuffixeCommune(o.nom) });
    } else if (types.includes('ccas')) {
      ajouter(insee, { famille: 'ccas', nom: sansSuffixeCommune(o.nom) });
    }
  }
  dire(`Annuaire de l'administration : ${organismes.length.toLocaleString('fr-FR')} organismes lus.`);

  // --- Établissements de santé -------------------------------------------
  // `type=ET` retient l'établissement géographique — celui où l'on se rend —
  // et non l'entité juridique qui le gère, souvent domiciliée ailleurs.
  let sante = 0;
  let urgences = 0;
  for await (const r of lignesFiness()) {
    if (r.etat !== 'ACTUEL' || r.type !== 'ET' || r.san !== 'OUI') continue;
    const insee = (r.com_code ?? '').trim();
    const nom = (r.rs ?? '').trim();
    if (!insee || !nom) continue;
    sante++;
    const urg = r.san_urg === 'OUI';
    if (urg) urgences++;
    ajouter(insee, {
      famille: 'sante',
      nom,
      ...(urg ? { urgences: true } : {}),
    });
  }
  dire(`Établissements de santé : ${sante.toLocaleString('fr-FR')}, dont ${urgences} avec urgences.`);

  return { maj: new Date().toISOString().slice(0, 10), parCommune, sdis, totaux };
}

export const FINESS =
  'https://static.data.gouv.fr/resources/referentiel-finess-t-finess/20260519-105542/t-finess.csv';

/** Au-delà, on donne le nombre de communes plutôt que leur liste. */
export const MAX_VOISINES = 3;

/**
 * Un fichier par département, comme pour l'eau et les finances : le client ne
 * télécharge que le sien.
 *
 * `fs` porte les France services du reste de l'intercommunalité — celles qui
 * ne sont pas dans la commune mais qui la concernent quand même.
 */
export function ecrireServices(
  sortie: string,
  dep: string,
  codes: string[],
  services: Services,
  franceServicesVoisines: Map<string, { nom: string; commune: string }[]>,
): number {
  const c: Record<string, [number, string, number][]> = {};
  let n = 0;
  for (const code of codes) {
    const l = services.parCommune.get(code);
    if (!l || l.length === 0) continue;
    // Trié avant écriture : les API ne garantissent pas l'ordre de leurs
    // enregistrements, et sans cela deux ingestions des mêmes données
    // produisaient des fichiers différents — une centaine de départements
    // « modifiés » à chaque passage, où rien n'avait bougé. Un diff qui bruit
    // ainsi finit par ne plus être lu.
    l.sort(
      (a, b) =>
        FAMILLES_SERVICE.indexOf(a.famille) - FAMILLES_SERVICE.indexOf(b.famille) ||
        a.nom.localeCompare(b.nom, 'fr'),
    );
    // Drapeaux : 1 = privé (école) ou urgences (santé). Un seul entier plutôt
    // qu'un objet par service : le fichier est lu, pas relu.
    c[code] = l.map((s) => [
      FAMILLES_SERVICE.indexOf(s.famille),
      s.nom,
      s.prive || s.urgences ? 1 : 0,
    ]);
    n += l.length;
  }
  const voisines: Record<string, { n: number; l: string[] }> = {};
  for (const code of codes) {
    const v = franceServicesVoisines.get(code);
    if (!v || v.length === 0) continue;
    // Plusieurs France services dans la même commune ne font qu'un endroit où
    // aller : c'est la commune qui compte, pas le guichet.
    const communes = [...new Set(v.map((x) => x.commune))].sort((a, b) => a.localeCompare(b, 'fr'));
    voisines[code] = {
      n: communes.length,
      l: communes.length <= MAX_VOISINES ? communes : [],
    };
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-services.json`),
    JSON.stringify({
      dep,
      maj: services.maj,
      c,
      ...(services.sdis.has(dep) ? { sdis: services.sdis.get(dep) } : {}),
      ...(Object.keys(voisines).length > 0 ? { fs: voisines } : {}),
    }),
  );
  return n;
}

/**
 * Reverse les services déposés sous un code d'arrondissement municipal sur la
 * commune qui le porte.
 *
 * Paris, Lyon et Marseille n'existent pas dans les référentiels de services :
 * une école parisienne est enregistrée sous le code de son arrondissement
 * (75112), jamais sous celui de la commune (75056). Comme les fichiers sont
 * écrits commune par commune, ces entrées disparaîtraient — les trois plus
 * grandes villes de France seraient dépourvues d'école et d'hôpital.
 */
export function replierArrondissements(
  services: Services,
  communeDeArrondissement: Map<string, string>,
): number {
  let replies = 0;
  for (const [code, parent] of communeDeArrondissement) {
    const liste = services.parCommune.get(code);
    if (!liste || liste.length === 0) continue;
    const cible = services.parCommune.get(parent);
    if (cible) cible.push(...liste);
    else services.parCommune.set(parent, [...liste]);
    services.parCommune.delete(code);
    replies += liste.length;
  }
  return replies;
}
