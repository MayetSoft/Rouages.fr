/**
 * Les délibérations publiées en données ouvertes.
 *
 * C'est ici que se décide ce que le reste du site décrit : une compétence
 * transférée l'a été par une délibération, un budget voté l'est en séance, un
 * marché est autorisé par une autorisation de signature. Le site montrait le
 * résultat sans jamais montrer l'acte.
 *
 * **La couverture est partielle, et le site le dit plutôt que de le masquer.**
 * Il n'existe aucune consolidation nationale : l'ordonnance n° 2021-1310
 * impose depuis le 1er juillet 2022 de publier les actes en ligne, mais sur le
 * site de la collectivité — elle n'a créé aucun dépôt central, et l'open data
 * reste facultatif. Une collectivité absente d'ici n'est donc pas une
 * collectivité qui ne délibère pas : c'est une collectivité qui ne verse pas
 * ses délibérations en données ouvertes. Le bloc n'apparaît que là où il y a
 * quelque chose, et ne vaut jamais zéro.
 *
 * Deux robinets alimentent le collecteur :
 *
 *   — **la découverte**, par l'attribut de schéma que data.gouv expose. Tout
 *     jeu déclaré conforme au SCDL « délibérations » est ingéré sans qu'on ait
 *     à le connaître, et la couverture grossit d'elle-même ;
 *   — **une liste déclarée**, pour les agrégateurs qui publient au schéma sans
 *     le déclarer sur leurs ressources. Mégalis Bretagne est le plus gros à ce
 *     jour — 1 932 collectivités — et la découverte seule le manquerait.
 *
 * **Ce qui n'est pas corrigé : les apostrophes manquantes.** Un producteur les
 * retire de ses intitulés — « en application de larticle L2122-22 », « demande
 * dinscription ». C'est un défaut de la source, pas du décodage, et le
 * réparer demanderait de distinguer « larticle » de « larve », donc un
 * dictionnaire. Le site rend l'intitulé tel qu'il a été publié, comme il rend
 * les majuscules sans accents des marchés publics : corriger serait réécrire.
 *
 * **Ce qui est écarté : les délibérations dont l'objet nomme quelqu'un.** Un
 * objet sur trois cents en porte une — « Cession de la parcelle AC 0151 à
 * Madame X », « aide sociale à M. Y » — et ce sont précisément celles qui
 * statuent sur le cas d'une personne. Le filtre réutilise le motif qui interdit
 * déjà un nom dans `contenu/` (`src/modele/civilites.ts`), et il est grossier :
 * un nom sans civilité lui échappe. Il ne dispense pas de la précaution qui
 * vaut pour tout le bloc — le site **relaie un intitulé et un lien**, jamais le
 * document, qui reste chez la collectivité qui l'a publié.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nommeUnePersonne } from '../src/modele/civilites.ts';

/**
 * Les neuf familles de la nomenclature ACTES, celle que les collectivités
 * emploient pour classer leurs actes auprès du contrôle de légalité.
 *
 * Le code fait foi, pas le libellé : un producteur écrit « Finances locales »,
 * un autre « finances locales », un troisième abrège. Le premier chiffre du
 * code, lui, ne bouge pas.
 */
export const FAMILLES_ACTES = [
  'Commande publique',
  'Urbanisme',
  'Domaine et patrimoine',
  'Fonction publique',
  'Institutions et vie politique',
  'Libertés publiques et pouvoirs de police',
  'Finances locales',
  'Domaines de compétences par thèmes',
  'Autres domaines de compétences',
] as const;

/**
 * Les agrégateurs qui publient au schéma sans le déclarer sur leurs
 * ressources. Sans cette liste, la découverte les manquerait — et avec eux la
 * quasi-totalité du volume.
 */
const DECLAREES = [
  'https://static.data.gouv.fr/resources/deliberations-des-organismes-adherents-de-megalis-bretagne/20260920-001343/deliberation-2026.csv',
  'https://static.data.gouv.fr/resources/deliberations-des-organismes-adherents-de-megalis-bretagne/20260905-001350/deliberation-2025.csv',
  'https://static.data.gouv.fr/resources/deliberations-des-organismes-adherents-de-megalis-bretagne/20260904-001352/deliberation-2024.csv',
];

/** Combien de délibérations le fichier du département porte, par collectivité. */
const PAR_COLLECTIVITE = 5;

/** Au-delà, l'intitulé cesse d'informer et pèse sur chaque ligne. */
const MAX_OBJET = 130;

export interface Deliberation {
  date: string;
  /** Index dans `FAMILLES_ACTES`, ou -1 quand le code est absent ou illisible. */
  famille: number;
  objet: string;
  /** L'acte lui-même, chez la collectivité qui l'a publié. */
  url: string;
}

export interface Deliberations {
  maj: string;
  /** L'exercice le plus ancien rencontré : le bloc dit depuis quand il voit. */
  depuis: string;
  /** SIREN -> ses délibérations les plus récentes. */
  parCollectivite: Map<string, Deliberation[]>;
  /** SIREN -> nombre total, avant troncature. */
  totaux: Map<string, number>;
  /** SIREN -> nombre par famille d'actes. */
  parFamille: Map<string, number[]>;
  /** Combien de collectivités publient, tous échelons confondus. */
  collectivites: number;
  /** Combien d'objets ont été écartés parce qu'ils nommaient quelqu'un. */
  ecartees: number;
}

/**
 * Le délimiteur change d'un producteur à l'autre : Mégalis écrit en
 * point-virgule, la mairie de Bouloc en virgule. On tranche sur l'en-tête,
 * qui porte les mêmes noms de colonnes dans les deux cas.
 */
function delimiteur(entete: string): string {
  return (entete.match(/;/g)?.length ?? 0) > (entete.match(/,/g)?.length ?? 0) ? ';' : ',';
}

function decouper(ligne: string, sep: string): string[] {
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
    } else if (c === sep && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

/** Une ligne peut contenir un saut de ligne dans un champ entre guillemets. */
function* lignesDe(texte: string): Iterable<string> {
  let courant = '';
  let dansGuillemets = false;
  for (const c of texte) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    if (c === '\n' && !dansGuillemets) {
      yield courant.replace(/\r$/, '');
      courant = '';
    } else courant += c;
  }
  if (courant.trim()) yield courant.replace(/\r$/, '');
}

/**
 * Tous les producteurs n'écrivent pas en UTF-8.
 *
 * Un fichier breton rendait « Délégation » en caractères de remplacement : il
 * est en Windows-1252, comme souvent ce qui sort d'un tableur. Le décodage
 * strict échoue sur ces octets — c'est précisément ce qui les signale, sans
 * avoir à deviner. Aucun en-tête ne l'annonce, et se fier au nom du producteur
 * ne tiendrait pas une saison.
 */
function decoder(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

function lireCsv(texte: string): Record<string, string>[] {
  const it = lignesDe(texte)[Symbol.iterator]();
  const premiere = it.next();
  if (premiere.done) return [];
  const sep = delimiteur(premiere.value);
  const entetes = decouper(premiere.value, sep).map((h) => h.trim().replace(/^﻿/, ''));
  const out: Record<string, string>[] = [];
  for (let l = it.next(); !l.done; l = it.next()) {
    const champs = decouper(l.value, sep);
    if (champs.length < 4) continue;
    const r: Record<string, string> = {};
    for (const [i, h] of entetes.entries()) r[h] = (champs[i] ?? '').trim();
    out.push(r);
  }
  return out;
}

const TAILLE_PAGE = 50;

/** Les jeux que data.gouv déclare conformes au schéma. */
async function decouvrir(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<string[]> {
  const urls: string[] = [];
  let pagesLues = 0;
  try {
    type Jeu = { resources?: { url?: string; schema?: { name?: string } | null }[] };
    for (let page = 1; page <= 5; page++) {
      const d = await json<{ data?: Jeu[] }>(
        `https://www.data.gouv.fr/api/1/datasets/?schema=scdl%2Fdeliberations` +
          `&page_size=${TAILLE_PAGE}&page=${page}`,
      );
      const jeux = d.data ?? [];
      if (jeux.length === 0) break;
      pagesLues++;
      for (const j of jeux) {
        for (const r of j.resources ?? []) {
          if (r.url && (r.schema?.name ?? '').includes('deliberations')) urls.push(r.url);
        }
      }
      // Une page incomplète est la dernière : demander la suivante ferait
      // remonter une erreur de pagination qu'on signalerait comme un incident.
      if (jeux.length < TAILLE_PAGE) break;
    }
  } catch {
    // La découverte est un supplément : son échec ne doit pas emporter les
    // agrégateurs déclarés, qui portent l'essentiel du volume. Une page
    // manquante n'est pas un échec — le catalogue s'arrête là où il s'arrête,
    // et annoncer « pas de réponse » après en avoir lu deux serait faux.
    dire(
      pagesLues === 0
        ? '  la découverte par schéma n’a pas répondu, on s’en tient aux sources déclarées.'
        : `  la découverte s’est arrêtée après ${pagesLues} page(s) du catalogue.`,
    );
  }
  return urls;
}

export async function collecterDeliberations(
  octetsDe: (url: string) => Promise<Uint8Array>,
  json: <T>(url: string) => Promise<T>,
  /** Les SIREN que le site sait rattacher : communes et groupements suivis. */
  sirensSuivis: Set<string>,
  dire: (m: string) => void,
): Promise<Deliberations | null> {
  const decouvertes = await decouvrir(json, dire);
  const sources = [...new Set([...DECLAREES, ...decouvertes])];
  dire(
    `Délibérations : ${sources.length} fichiers (${DECLAREES.length} déclarés, ` +
      `${decouvertes.length} découverts par le schéma).`,
  );

  const brut = new Map<string, Map<string, Deliberation>>();
  const totaux = new Map<string, number>();
  const parFamille = new Map<string, number[]>();
  let ecartees = 0;
  let depuis = '9999';
  let lus = 0;
  let echecs = 0;

  for (const url of sources) {
    let lignes: Record<string, string>[];
    try {
      lignes = lireCsv(decoder(await octetsDe(url)));
    } catch {
      echecs++;
      continue;
    }
    for (const l of lignes) {
      const siren = (l['COLL_SIRET'] ?? '').replace(/\s/g, '').slice(0, 9);
      if (siren.length !== 9 || !sirensSuivis.has(siren)) continue;
      const objet = (l['DELIB_OBJET'] ?? '').trim();
      const date = (l['DELIB_DATE'] ?? '').slice(0, 10);
      if (!objet || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // Celles qui statuent sur le cas d'une personne restent chez la
      // collectivité : le site n'a pas à les relayer ni à les indexer.
      if (nommeUnePersonne(objet)) {
        ecartees++;
        continue;
      }
      lus++;
      if (date < depuis) depuis = date;

      const code = (l['DELIB_MATIERE_CODE'] ?? '').trim();
      const rang = Number.parseInt(code.split('.')[0] ?? '', 10);
      const famille = Number.isFinite(rang) && rang >= 1 && rang <= 9 ? rang - 1 : -1;

      let m = brut.get(siren);
      if (!m) {
        m = new Map();
        brut.set(siren, m);
      }
      // L'identifiant de la délibération quand il existe, sinon la date et
      // l'objet : un même acte est parfois republié d'un millésime à l'autre.
      const cle = (l['DELIB_ID'] ?? '').trim() || `${date}|${objet}`;
      if (m.has(cle)) continue;
      m.set(cle, {
        date,
        famille,
        objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
        url: (l['DELIB_URL'] ?? '').trim(),
      });
      totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
      if (famille >= 0) {
        let f = parFamille.get(siren);
        if (!f) {
          f = new Array<number>(FAMILLES_ACTES.length).fill(0);
          parFamille.set(siren, f);
        }
        f[famille]++;
      }
    }
  }

  if (brut.size === 0) {
    dire('Délibérations : aucune collectivité rattachée, rien à écrire.');
    return null;
  }

  const parCollectivite = new Map<string, Deliberation[]>();
  for (const [siren, m] of brut) {
    parCollectivite.set(
      siren,
      [...m.values()]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, PAR_COLLECTIVITE),
    );
  }

  dire(
    `Délibérations : ${lus.toLocaleString('fr-FR')} retenues depuis ${depuis.slice(0, 4)} pour ` +
      `${brut.size.toLocaleString('fr-FR')} collectivités` +
      (ecartees > 0 ? `, ${ecartees.toLocaleString('fr-FR')} écartées (objet nommant une personne)` : '') +
      (echecs > 0 ? `, ${echecs} fichier(s) injoignable(s)` : '') +
      '.',
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    depuis,
    parCollectivite,
    totaux,
    parFamille,
    collectivites: brut.size,
    ecartees,
  };
}

/**
 * Un fichier par département, indexé par SIREN — comme les marchés, et pour la
 * même raison : c'est le client qui sait de quelles structures dépend une
 * commune, et le fichier n'a pas à le redire.
 */
export function ecrireDeliberations(
  sortie: string,
  dep: string,
  sirens: string[],
  sirenDeCommune: Map<string, string>,
  d: Deliberations,
): number {
  const h: Record<string, { n: number; f: number[]; d: Deliberation[] }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = d.parCollectivite.get(siren);
    if (!liste || liste.length === 0) continue;
    h[siren] = {
      n: d.totaux.get(siren) ?? liste.length,
      f: d.parFamille.get(siren) ?? [],
      d: liste,
    };
    n++;
  }
  if (n === 0) return 0;
  const com: Record<string, string> = {};
  for (const [code, siren] of [...sirenDeCommune].sort()) {
    if (h[siren]) com[code] = siren;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-deliberations.json`),
    JSON.stringify({
      maj: d.maj,
      depuis: d.depuis,
      familles: FAMILLES_ACTES,
      com,
      h,
    }),
  );
  return n;
}
