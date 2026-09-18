/**
 * Les marchés publics d'une commune et de ses groupements.
 *
 * Les données essentielles de la commande publique disent à quoi une
 * collectivité passe commande : voirie, restauration scolaire, collecte des
 * déchets, assurance. C'est la forme la plus concrète de « où va l'argent »,
 * et elle nomme l'objet, pas seulement le montant.
 *
 * **Ce que ce module refuse de faire, et c'est l'essentiel : additionner.**
 * Un accord-cadre multi-attributaires produit une ligne par lot, et chaque
 * ligne déclare le plafond de l'accord entier. La ville de Paris a ainsi sept
 * marchés distincts portant chacun 21 M€ pour un même accord-cadre de travaux :
 * les sommer donnerait 147 M€. Sur les 661 873 marchés notifiés depuis 2023,
 * une addition naïve attribue 185 Md€ au seul bloc communal en trois ans —
 * davantage que la commande publique française entière. Le total serait faux
 * d'un ordre de grandeur, et faux avec aplomb.
 *
 * Ce qui reste vrai ligne à ligne : l'objet, la date de notification, la
 * procédure, et le montant **déclaré pour ce marché** — étant entendu qu'un
 * accord-cadre déclare un plafond, pas une dépense. Le site montre cela, et
 * dit qu'il ne totalise pas.
 *
 * La jointure est sûre, elle : `acheteur_id` est un SIRET dont les neuf
 * premiers chiffres sont le SIREN de l'acheteur, et le site connaît le SIREN
 * de chaque commune (découpage Etalab) comme de chaque groupement (BANATIC).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DECP =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides';

/**
 * Depuis 2023 : avant, le recensement est trop lacunaire pour qu'une absence
 * veuille dire quelque chose — 12 630 marchés notifiés en 2021 contre 254 191
 * en 2025. Montrer 2021 laisserait croire qu'une commune ne commandait rien.
 */
export const DEPUIS = '2023-01-01';

/** Au-delà, la liste cesse d'informer : ce sont les plus récents qui disent ce qui se passe. */
const PAR_ACHETEUR = 5;

interface LigneDecp {
  acheteur_id: string | null;
  objet: string | null;
  montant: number | null;
  datenotification: string | null;
  procedure: string | null;
}

export interface Marche {
  /** Objet du marché, tronqué : la phrase entière tient rarement en un panneau. */
  objet: string;
  /** Montant déclaré, à l'euro près. Pour un accord-cadre, c'est un plafond. */
  montant: number | null;
  /** Date de notification (AAAA-MM-JJ). */
  date: string;
  /** Indice dans `PROCEDURES` : le libellé se répète des milliers de fois. */
  procedure: number;
  /** Nombre de lignes identiques regroupées : les lots d'un même accord-cadre. */
  lots: number;
}

/**
 * Les procédures, énumérées une fois.
 *
 * Le libellé « Procédure adaptée » revient sur la moitié des marchés : le
 * répéter en toutes lettres pèserait plus lourd que tout le reste du fichier.
 * L'ordre fait foi, comme pour les familles de services.
 */
export const PROCEDURES = [
  'Procédure adaptée',
  "Appel d'offres ouvert",
  'Marché passé sans publicité ni mise en concurrence préalable',
  'Procédure avec négociation',
  "Appel d'offres restreint",
  'Dialogue compétitif',
] as const;

export interface Marches {
  /** SIREN de l'acheteur -> ses marchés les plus récents. */
  parAcheteur: Map<string, Marche[]>;
  /** SIREN -> nombre total de marchés notifiés depuis `DEPUIS`, avant troncature. */
  totaux: Map<string, number>;
  depuis: string;
  maj: string;
}

const MAX_OBJET = 90;

/**
 * Un caractère de remplacement traîne dans 3 603 objets sur 661 873 : `¿` y
 * tient la place d'une apostrophe — « d¿un tracteur », « D¿IMPRESSION ». C'est
 * un accident d'encodage à la source, toujours entre deux lettres, et le
 * remplacer là et seulement là ne peut rien abîmer d'autre.
 *
 * Ce qu'on ne corrige pas : les majuscules sans accents, les fautes de frappe,
 * ni les libellés jumeaux d'un même marché publié deux fois. Le premier serait
 * de la réécriture, le dernier une devinette.
 */
function nettoyer(objet: string): string {
  return objet.replace(/(\p{L})\u00bf(\p{L})/gu, '$1\u2019$2').trim();
}

export async function collecterMarches(
  json: <T>(url: string) => Promise<T>,
  sirensSuivis: Set<string>,
  dire: (m: string) => void,
): Promise<Marches | null> {
  const url =
    `${DECP}/exports/json?select=acheteur_id,objet,montant,datenotification,procedure` +
    `&where=${encodeURIComponent(`datenotification>=date'${DEPUIS}'`)}`;
  const lignes = await json<LigneDecp[]>(url);
  if (lignes.length === 0) {
    dire('Marchés publics : aucune ligne, le jeu a changé de forme.');
    return null;
  }

  // Regroupées avant d'être comptées : un accord-cadre multi-attributaires
  // publie une ligne par lot, avec le même objet, le même montant et la même
  // date. Les afficher sept fois ferait passer une commande pour sept.
  const brut = new Map<string, Map<string, Marche>>();
  const totaux = new Map<string, number>();
  const inconnues = new Set<string>();
  for (const l of lignes) {
    const siren = String(l.acheteur_id ?? '').slice(0, 9);
    if (siren.length !== 9 || !sirensSuivis.has(siren)) continue;
    const objet = nettoyer(l.objet ?? '');
    const date = (l.datenotification ?? '').slice(0, 10);
    if (!objet || !date) continue;

    const cle = `${objet}|${l.montant}|${date}`;
    let m = brut.get(siren);
    if (!m) {
      m = new Map();
      brut.set(siren, m);
    }
    const vu = m.get(cle);
    if (vu) {
      vu.lots++;
    } else {
      // −1 quand le libellé n'est pas dans la liste : le client n'affichera
      // alors pas de procédure, plutôt que d'en inventer une.
      const proc = PROCEDURES.indexOf((l.procedure ?? '').trim() as (typeof PROCEDURES)[number]);
      if (proc === -1 && (l.procedure ?? '').trim()) inconnues.add((l.procedure ?? '').trim());
      m.set(cle, {
        objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
        // Arrondi à l'euro : les centimes d'un marché de 489 025,50 € ne
        // changent rien à ce qu'on en comprend, et pèsent sur chaque ligne.
        montant:
          typeof l.montant === 'number' && Number.isFinite(l.montant) ? Math.round(l.montant) : null,
        date,
        procedure: proc,
        lots: 1,
      });
    }
    totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
  }

  const parAcheteur = new Map<string, Marche[]>();
  for (const [siren, m] of brut) {
    const liste = [...m.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.montant ?? 0) - (a.montant ?? 0),
    );
    parAcheteur.set(siren, liste.slice(0, PAR_ACHETEUR));
  }

  if (inconnues.size > 0) {
    // Pas une erreur : la liste des procédures évolue, et une procédure non
    // reconnue vaut mieux affichée comme absente qu'écrite de travers. Mais on
    // le dit, sinon la liste se périmerait sans qu'on le sache.
    dire(`  procédure(s) hors liste, à ajouter à PROCEDURES : ${[...inconnues].join(' ; ')}`);
  }

  const retenus = [...totaux.values()].reduce((a, b) => a + b, 0);
  dire(
    `Marchés publics : ${lignes.length.toLocaleString('fr-FR')} notifiés depuis ${DEPUIS.slice(0, 4)}, ` +
      `dont ${retenus.toLocaleString('fr-FR')} pour ${parAcheteur.size.toLocaleString('fr-FR')} ` +
      `acheteurs du bloc communal.`,
  );
  return { parAcheteur, totaux, depuis: DEPUIS, maj: new Date().toISOString().slice(0, 10) };
}

/**
 * Un fichier par département, indexé par SIREN d'acheteur — commune ou
 * groupement, indifféremment : c'est le client qui sait de qui il dépend.
 */
export function ecrireMarches(
  sortie: string,
  dep: string,
  sirens: string[],
  /**
   * Code INSEE -> SIREN, pour les communes du département. Le client connaît
   * le SIREN de chaque groupement — BANATIC le lui donne — mais pas celui de
   * sa propre commune : il n'a jamais servi jusqu'ici.
   */
  sirenDeCommune: Map<string, string>,
  marches: Marches,
): number {
  const h: Record<string, { n: number; m: Marche[] }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = marches.parAcheteur.get(siren);
    if (!liste || liste.length === 0) continue;
    h[siren] = { n: marches.totaux.get(siren) ?? liste.length, m: liste };
    n++;
  }
  if (n === 0) return 0;
  const com: Record<string, string> = {};
  for (const [code, siren] of [...sirenDeCommune].sort()) {
    if (h[siren]) com[code] = siren;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-marches.json`),
    JSON.stringify({
      dep,
      depuis: marches.depuis,
      maj: marches.maj,
      procedures: PROCEDURES,
      com,
      h,
    }),
  );
  return n;
}
