/**
 * L'article 55 de la loi SRU : combien de logements sociaux, et où en est la
 * commune de son obligation.
 *
 * C'est l'une des rares obligations chiffrées, datées et sanctionnées qui pèse
 * sur une commune. L'inventaire annuel du ministère dit, pour chacune des
 * 2 206 communes concernées : le nombre de logements locatifs sociaux, le taux
 * atteint, la cible légale, si elle est déficitaire, si elle a été déclarée
 * carencée, et le prélèvement qu'elle paie. Aucune autre donnée du site ne
 * relie aussi directement une règle, un chiffre et une conséquence.
 *
 * **Les valeurs manquantes n'en sont pas.** Le Mans porte « Pas d'inventaire »
 * et un taux « >25% » : la commune dépasse la cible, l'inventaire détaillé ne
 * lui est donc pas demandé. Lire cela comme une donnée absente afficherait un
 * trou là où il y a une réponse. Le module conserve donc le texte quand il n'y
 * a pas de nombre, et le site l'affiche tel quel.
 *
 * **Les communes absentes du fichier ne sont pas en défaut** : elles ne sont
 * pas soumises à l'article 55, faute d'atteindre les seuils de population et
 * d'agglomération. Le site ne dit donc rien pour elles, plutôt que « 0 ».
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'identifiant change à chaque millésime — le fichier 2026 n'est pas le
 * fichier 2025. C'est la fragilité de cette source, et c'est pourquoi la
 * veille la surveille : sa disparition doit se voir, pas se deviner.
 */
const RESSOURCE = '2773f8ca-e06b-4a67-9844-ac165d52f47c';
const BASE = `https://tabular-api.data.gouv.fr/api/resources/${RESSOURCE}/data/`;
const PAGE = 100;

export interface Sru {
  /** Nombre de logements locatifs sociaux, ou null si le fichier donne un texte. */
  lls: number | null;
  /** Le texte du fichier quand il n'y a pas de nombre : « Pas d'inventaire ». */
  llsTexte: string | null;
  /** Taux atteint, en pourcentage, ou null quand le fichier écrit « >25% ». */
  taux: number | null;
  tauxTexte: string | null;
  /** Taux à atteindre : 20 ou 25 %. */
  cible: number | null;
  deficitaire: boolean | null;
  /** Carencée : l'État a constaté le manquement et peut se substituer au maire. */
  carencee: boolean;
  exemptee: boolean;
  /** Prélèvement net de l'année, en euros. Zéro quand le fichier écrit « - € ». */
  prelevement: number | null;
}

export interface InventaireSru {
  parCommune: Map<string, Sru>;
  maj: string;
}

/** « 30,15% » devient 30.15 ; « >25% » et « Entrée au dispositif » restent du texte. */
function pourcent(v: unknown): { n: number | null; t: string | null } {
  const s = String(v ?? '').trim();
  if (!s) return { n: null, t: null };
  const m = /^(\d+(?:,\d+)?)\s*%$/.exec(s);
  if (m) return { n: Number(m[1].replace(',', '.')), t: null };
  return { n: null, t: s };
}

/** « 109 660,39 € » devient 109660.39 ; « -   € » devient 0. */
function euros(v: unknown): number | null {
  const s = String(v ?? '').replace(/\s| /g, '').replace('€', '').trim();
  if (!s || s === '-') return 0;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function booleen(v: unknown): boolean | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

export async function collecterSru(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<InventaireSru | null> {
  type Ligne = Record<string, unknown>;
  type Reponse = { data: Ligne[]; meta: { total: number } };

  const premier = await json<Reponse>(`${BASE}?page_size=${PAGE}&page=1`);
  const total = premier.meta?.total ?? 0;
  if (total === 0) {
    dire('Inventaire SRU : aucune ligne, la ressource a changé de millésime ou de forme.');
    return null;
  }
  const pages = Math.ceil(total / PAGE);
  const lignes: Ligne[] = [...premier.data];
  for (let p = 2; p <= pages; p++) {
    lignes.push(...(await json<Reponse>(`${BASE}?page_size=${PAGE}&page=${p}`)).data);
  }
  if (lignes.length < total * 0.95) {
    throw new Error(
      `Inventaire SRU : ${lignes.length} lignes lues pour ${total} annoncées — des pages ` +
        `ont été perdues, mieux vaut échouer que publier un inventaire troué.`,
    );
  }

  // Les noms de colonnes portent des espaces et des millésimes : on les
  // retrouve par préfixe, pour qu'un changement d'année ne casse pas tout.
  const cles = Object.keys(lignes[0] ?? {});
  const parPrefixe = (p: string) => cles.find((k) => k.toLowerCase().startsWith(p.toLowerCase()));
  const cLls = parPrefixe('Nombre_lls');
  const cTaux = parPrefixe('Taux_SRU');
  const cCible = parPrefixe('Taux_cible');
  const cDef = parPrefixe('commune_deficitaire');
  const cCar = parPrefixe('Commune_carencee');
  const cExe = parPrefixe('Commune_exemptee');
  const cPre = parPrefixe('Prelevement');
  if (!cLls || !cTaux || !cCible) {
    throw new Error(
      `Inventaire SRU : colonnes introuvables (${cles.join(', ')}) — le fichier a changé de forme.`,
    );
  }

  const parCommune = new Map<string, Sru>();
  for (const l of lignes) {
    const code = String(l['Code_INSEE_commune'] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const brutLls = String(l[cLls] ?? '').trim();
    const nLls = /^\d+$/.test(brutLls) ? Number(brutLls) : null;
    const t = pourcent(l[cTaux]);
    const c = pourcent(l[cCible]);
    parCommune.set(code, {
      lls: nLls,
      llsTexte: nLls === null && brutLls ? brutLls : null,
      taux: t.n,
      tauxTexte: t.t,
      cible: c.n,
      deficitaire: cDef ? booleen(l[cDef]) : null,
      carencee: (cCar ? booleen(l[cCar]) : false) === true,
      exemptee: (cExe ? booleen(l[cExe]) : false) === true,
      prelevement: cPre ? euros(l[cPre]) : null,
    });
  }

  const deficitaires = [...parCommune.values()].filter((s) => s.deficitaire === true).length;
  const carencees = [...parCommune.values()].filter((s) => s.carencee).length;
  dire(
    `Inventaire SRU : ${parCommune.size.toLocaleString('fr-FR')} communes soumises, ` +
      `dont ${deficitaires.toLocaleString('fr-FR')} déficitaires et ${carencees} carencées.`,
  );
  return { parCommune, maj: new Date().toISOString().slice(0, 10) };
}

export function ecrireSru(
  sortie: string,
  dep: string,
  codes: string[],
  sru: InventaireSru,
): number {
  const c: Record<string, Sru> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const s = sru.parCommune.get(code);
    if (!s) continue;
    c[code] = s;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(join(sortie, 'dep', `${dep}-sru.json`), JSON.stringify({ dep, maj: sru.maj, c }));
  return n;
}
