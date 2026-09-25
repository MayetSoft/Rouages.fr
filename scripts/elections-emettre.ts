/**
 * Le dernier scrutin municipal, commune par commune.
 *
 * Le site dit qui décide ; celui-ci dit dans quelles conditions ce décideur a
 * été désigné. C'est le pendant civique du bloc « qui est le maire » : combien
 * d'électeurs se sont déplacés, combien ont glissé un bulletin blanc ou nul,
 * combien de listes se présentaient, et combien de sièges le conseil compte —
 * au conseil municipal comme au conseil communautaire.
 *
 * **Ce que ce module ne collecte pas, et c'est délibéré : les nuances
 * politiques.** Le fichier les porte, liste par liste. Les republier
 * reviendrait à relier des personnes à une opinion, ce que `docs/07-risques.md`
 * interdit explicitement — la règle n'a pas été levée quand le site s'est mis à
 * nommer les maires, elle a été précisée. Le nom d'un titulaire est une donnée
 * d'annuaire ; sa couleur politique est autre chose. Le fichier des résultats
 * par commune ne porte d'ailleurs aucun nom de candidat : ils sont dans un
 * fichier séparé, que le site n'ouvre pas.
 *
 * Ce qui reste est structurel et se compare : la participation, le refus
 * exprimé par un bulletin blanc ou nul, le nombre de listes en présence, et le
 * poids de la commune dans son intercommunalité.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Municipales 2026. L'adresse porte l'horodatage de la publication, si bien
 * qu'elle changera au prochain scrutin : la veille surveille le jeu de données
 * plutôt que le fichier, pour que sa disparition se voie au lieu de se deviner.
 */
const SCRUTIN = 'municipales 2026';
const TOURS = [
  {
    tour: 1,
    url:
      'https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-premier-tour/' +
      '20260320-164339/municipales-2026-resultats-communes-2026-03-20.csv',
  },
  {
    tour: 2,
    url:
      'https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-scond-tour/' +
      '20260323-180124/municipales-2026-resultats-communes-2026-03-23-16h14.csv',
  },
] as const;

/** Un tour, tel qu'il se lit pour une commune. */
export interface TourCommune {
  inscrits: number;
  votants: number;
  exprimes: number;
  /** Blancs et nuls confondus : ils disent la même chose — être venu sans choisir. */
  refus: number;
  /** Combien de listes se présentaient. Une seule dans deux communes sur trois. */
  listes: number;
  /**
   * Les voix de la liste arrivée en tête. Rapportées aux inscrits, elles
   * disent quelle part du corps électoral a choisi la liste qui tient le
   * conseil — la prime majoritaire lui donne la moitié des sièges, qu'elle ait
   * réuni 30 % des inscrits ou 80 %.
   */
  tete: number;
}

export interface ElectionCommune {
  t1: TourCommune;
  /** Le second tour, dans les 1 526 communes qui en ont eu un. */
  t2?: TourCommune;
  /** Le tour qui a attribué les sièges : le premier, ou le second là où il a eu lieu. */
  decisif: 1 | 2;
  /** Sièges au conseil municipal. */
  cm: number;
  /** Sièges de la commune au conseil communautaire : son poids dans l'intercommunalité. */
  cc: number;
}

export interface Elections {
  scrutin: string;
  maj: string;
  /** Repères nationaux, tour par tour : un taux seul ne se discute pas. */
  medianes: { participation: number; refus: number }[];
  /** Part des communes où une seule liste se présentait au premier tour. */
  partListeUnique: number;
  /** La médiane nationale des voix de la liste en tête, en part des inscrits, au tour décisif. */
  medianeTete: number;
  communes: Map<string, ElectionCommune>;
}

/**
 * Le fichier du ministère : point-virgule, guillemets, et un bloc de colonnes
 * répété autant de fois qu'il y a de listes — jusqu'à treize.
 */
function lireCsv(texte: string): Record<string, string>[] {
  const lignes = texte.split(/\r?\n/);
  const entetes = decouper(lignes.shift() ?? '');
  const out: Record<string, string>[] = [];
  for (const l of lignes) {
    if (!l.trim()) continue;
    const champs = decouper(l);
    if (champs.length < 5) continue;
    const r: Record<string, string> = {};
    for (const [i, h] of entetes.entries()) r[h] = champs[i] ?? '';
    out.push(r);
  }
  return out;
}

function decouper(ligne: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else dansGuillemets = !dansGuillemets;
    } else if (c === ';' && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

const entier = (v: string | undefined): number => {
  const n = Number.parseInt((v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** La médiane d'une série, ou 0 quand elle est vide. */
function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const t = [...valeurs].sort((a, b) => a - b);
  return Math.round(t[Math.floor(t.length / 2)] * 10) / 10;
}

/**
 * Le nombre de listes, et les sièges qu'elles ont obtenus.
 *
 * Les colonnes sont numérotées : `Voix 1`, `Voix 2`… On s'arrête à la première
 * absente plutôt que de fixer un maximum, parce que le ministère en ajoute
 * autant que nécessaire — treize dans la commune la plus disputée.
 */
function listesDe(r: Record<string, string>): { listes: number; cm: number; cc: number; tete: number; teteIns: number | null } {
  let listes = 0;
  let cm = 0;
  let cc = 0;
  let tete = 0;
  let teteIns: number | null = null;
  for (let i = 1; ; i++) {
    if (r[`Voix ${i}`] === undefined) break;
    if ((r[`Voix ${i}`] ?? '').trim() === '') continue;
    listes++;
    cm += entier(r[`Sièges au CM ${i}`]);
    cc += entier(r[`Sièges au CC ${i}`]);
    const voix = entier(r[`Voix ${i}`]);
    if (voix > tete) {
      tete = voix;
      // Le pourcentage que publie le ministère, pour recouper le nôtre.
      const p = Number.parseFloat((r[`% Voix/inscrits ${i}`] ?? '').replace('%', '').replace(',', '.'));
      teteIns = Number.isFinite(p) ? p : null;
    }
  }
  return { listes, cm, cc, tete, teteIns };
}

export async function collecterElections(
  texteDe: (url: string) => Promise<string>,
  dire: (m: string) => void,
): Promise<Elections | null> {
  const communes = new Map<string, ElectionCommune>();
  const medianes: { participation: number; refus: number }[] = [];
  let listeUnique = 0;
  let ecarts = 0;
  let recoupees = 0;

  for (const { tour, url } of TOURS) {
    let lignes: Record<string, string>[];
    try {
      lignes = lireCsv(await texteDe(url));
    } catch {
      dire(`Élections : le tour ${tour} n'a pas répondu.`);
      // Un second tour manquant laisse le premier en place ; un premier tour
      // manquant ne laisse rien, et mieux vaut alors ne rien écrire du tout.
      if (tour === 1) return null;
      continue;
    }
    if (lignes.length === 0) {
      if (tour === 1) return null;
      continue;
    }

    const participations: number[] = [];
    const refus: number[] = [];
    for (const l of lignes) {
      const code = (l['Code commune'] ?? '').trim();
      if (code.length !== 5) continue;
      const inscrits = entier(l['Inscrits']);
      const votants = entier(l['Votants']);
      const t: TourCommune = {
        inscrits,
        votants,
        exprimes: entier(l['Exprimés']),
        refus: entier(l['Blancs']) + entier(l['Nuls']),
        listes: 0,
        tete: 0,
      };
      const { listes, cm, cc, tete, teteIns } = listesDe(l);
      t.listes = listes;
      t.tete = tete;
      if (teteIns !== null && inscrits > 0) {
        recoupees++;
        if (Math.abs((tete / inscrits) * 100 - teteIns) > 0.01) ecarts++;
      }
      if (inscrits > 0) participations.push((votants / inscrits) * 100);
      if (votants > 0) refus.push((t.refus / votants) * 100);

      if (tour === 1) {
        if (listes === 1) listeUnique++;
        communes.set(code, { t1: t, decisif: 1, cm, cc });
      } else {
        const deja = communes.get(code);
        if (!deja) continue;
        deja.t2 = t;
        // Les sièges ne sont attribués qu'au tour qui élit le conseil : dans
        // ces 1 526 communes, le premier tour en a attribué zéro.
        if (cm > 0) {
          deja.cm = cm;
          deja.decisif = 2;
        }
        if (cc > 0) deja.cc = cc;
      }
    }
    medianes[tour - 1] = {
      participation: mediane(participations),
      refus: mediane(refus),
    };
    dire(
      `  tour ${tour} : ${lignes.length.toLocaleString('fr-FR')} communes, ` +
        `participation médiane ${medianes[tour - 1].participation} %, ` +
        `blancs et nuls ${medianes[tour - 1].refus} %.`,
    );
  }

  const partListeUnique = communes.size > 0 ? Math.round((listeUnique / communes.size) * 100) : 0;
  // Au tour qui a attribué les sièges : c'est la liste arrivée en tête de
  // celui-là qui tient le conseil.
  const parts: number[] = [];
  for (const c of communes.values()) {
    const t = c.decisif === 2 && c.t2 ? c.t2 : c.t1;
    if (t.inscrits > 0 && t.tete > 0) parts.push((t.tete / t.inscrits) * 100);
  }
  const medianeTete = mediane(parts);
  if (ecarts > 0) dire(`Élections : ${ecarts} communes où nos voix sur inscrits s'écartent de celles du ministère.`);
  dire(
    `  liste en tête : médiane ${medianeTete} % des inscrits au tour décisif ; ` +
      `${recoupees.toLocaleString('fr-FR')} pourcentages recoupés avec ceux du ministère.`,
  );
  dire(
    `Élections (${SCRUTIN}) : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${listeUnique.toLocaleString('fr-FR')} avec une seule liste au premier tour (${partListeUnique} %).`,
  );
  return {
    scrutin: SCRUTIN,
    maj: new Date().toISOString().slice(0, 10),
    medianes,
    partListeUnique,
    medianeTete,
    communes,
  };
}

/**
 * Un fichier par département. Les repères nationaux y sont recopiés — quelques
 * dizaines d'octets — pour que le fichier se suffise à lui-même.
 */
export function ecrireElections(
  sortie: string,
  dep: string,
  codes: string[],
  e: Elections,
): number {
  const c: Record<string, ElectionCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const fiche = e.communes.get(code);
    if (!fiche) continue;
    c[code] = fiche;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-elections.json`),
    JSON.stringify({
      scrutin: e.scrutin,
      maj: e.maj,
      medianes: e.medianes,
      listeUnique: e.partListeUnique,
      medianeTete: e.medianeTete,
      c,
    }),
  );
  return n;
}
