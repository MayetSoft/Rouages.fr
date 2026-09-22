/**
 * Ce qui se construit réellement, une fois la règle écrite.
 *
 * Le site dit maintenant qui écrit le plan d'urbanisme. Il manquait l'autre
 * moitié : **ce qui en sort**. Une commune sous plan intercommunal où rien ne
 * se construit et une commune sous le même plan où trente logements sont
 * autorisés par an ne vivent pas la même chose, et la différence ne se lit
 * dans aucun document réglementaire.
 *
 * La source est Sitadel, le recensement des autorisations d'urbanisme tenu par
 * le service statistique du ministère chargé du logement. Le fichier publie,
 * commune par commune et mois par mois depuis 2013, les logements **autorisés**
 * et les logements **commencés**.
 *
 * **Trois précautions que la page reprend.** Un logement n'est pas un permis :
 * un permis d'immeuble en porte vingt, et c'est bien des logements qu'on
 * compte. La série est en *date de prise en compte* — le mois où l'autorisation
 * entre dans le système, non celui où le maire l'a signée. Et autoriser n'est
 * pas construire : l'écart entre les deux colonnes est une information en soi,
 * que le site montre plutôt que de la moyenner.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ressourcesDuJeu } from './donnees-ouvertes.ts';

/**
 * Le jeu des séries mensuelles communales, par son identifiant : son intitulé
 * change de millésime, et l'adresse du fichier avec lui.
 */
const JEU = '689c430033671e3d26466245';

/** Les dernières années pleines retenues. Dix ans lissent les à-coups. */
const ANNEES = 10;

/** Le libellé du sous-ensemble des maisons, tel que le fichier l'écrit. */
const INDIVIDUEL = 'Individuel pur';

/** Celui de l'ensemble, qui est la série principale. */
const TOUS = 'Tous Logements';

export interface LogementsCommune {
  /** Logements autorisés, année par année, dans l'ordre de `annees`. */
  a: number[];
  /** Logements commencés, même fenêtre, en tout. */
  c: number;
  /** Maisons individuelles parmi les logements autorisés de la fenêtre. */
  i: number;
}

export interface Logements {
  maj: string;
  /** Le dernier mois que le fichier porte, AAAA-MM. */
  arrete: string;
  /** Les années pleines de la fenêtre, dans l'ordre. */
  annees: number[];
  communes: Map<string, LogementsCommune>;
  /** Médiane nationale des autorisés pour mille habitants sur la fenêtre. */
  mediane: number;
  /** Total national autorisé sur la fenêtre, pour situer l'échelle. */
  total: number;
}

export async function collecterLogements(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lignes: (
    chemin: string,
  ) => AsyncIterable<Record<string, string>>,
  populations: Map<string, number>,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Logements | null> {
  const adresses = await ressourcesDuJeu(JEU, 'csv', json, dire);
  // La ressource utile est le fichier lui-même, non la page de catalogue qui
  // l'accompagne : on garde l'adresse qui sert un fichier.
  const adresse = adresses.find((u) => /\/csv$|\.csv$/.test(u));
  if (!adresse) {
    dire('Logements : la série communale Sitadel est introuvable.');
    return null;
  }

  const fichier = join(cache, 'sitadel-logements-communes.csv');
  try {
    await telecharger(adresse, fichier);
  } catch {
    dire('Logements : Sitadel n’a pas répondu, les fichiers précédents restent en place.');
    return null;
  }

  // Premier passage : tout retenir par année, puis fermer la fenêtre sur les
  // années pleines. On ne sait qu'à la fin où le fichier s'arrête, et une
  // année tronquée affichée à côté de dix années pleines se lirait comme un
  // effondrement de la construction.
  const parAnnee = new Map<string, Map<number, [number, number]>>();
  const individuel = new Map<string, Map<number, number>>();
  let dernierMois = '';
  let moisDeDerniereAnnee = new Set<string>();
  let derniereAnnee = 0;
  for await (const l of lignes(fichier)) {
    const code = (l['CODE_INSEE'] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const annee = Number(l['ANNEE']);
    const mois = (l['MOIS'] ?? '').trim();
    if (!Number.isFinite(annee) || annee < 2000) continue;
    if (annee > derniereAnnee) {
      derniereAnnee = annee;
      moisDeDerniereAnnee = new Set();
    }
    if (annee === derniereAnnee) moisDeDerniereAnnee.add(mois);
    const horodatage = `${annee}-${mois}`;
    if (horodatage > dernierMois) dernierMois = horodatage;

    const type = (l['TYPE_LGT'] ?? '').trim();
    const autorises = Number(l['LOG_AUT']) || 0;
    if (type === TOUS) {
      let m = parAnnee.get(code);
      if (!m) parAnnee.set(code, (m = new Map()));
      const v = m.get(annee) ?? [0, 0];
      v[0] += autorises;
      v[1] += Number(l['LOG_COM']) || 0;
      m.set(annee, v);
    } else if (type === INDIVIDUEL) {
      let m = individuel.get(code);
      if (!m) individuel.set(code, (m = new Map()));
      m.set(annee, (m.get(annee) ?? 0) + autorises);
    }
  }

  if (parAnnee.size === 0) {
    dire('Logements : aucune ligne lue — le fichier a changé de forme.');
    return null;
  }

  // L'année en cours n'est pleine que si ses douze mois sont là.
  const derniereEntiere = moisDeDerniereAnnee.size === 12 ? derniereAnnee : derniereAnnee - 1;
  const annees: number[] = [];
  for (let a = derniereEntiere - ANNEES + 1; a <= derniereEntiere; a++) annees.push(a);

  const communes = new Map<string, LogementsCommune>();
  let total = 0;
  for (const [code, m] of parAnnee) {
    const a = annees.map((an) => m.get(an)?.[0] ?? 0);
    const c = annees.reduce((s, an) => s + (m.get(an)?.[1] ?? 0), 0);
    const i = annees.reduce((s, an) => s + (individuel.get(code)?.get(an) ?? 0), 0);
    const somme = a.reduce((s, x) => s + x, 0);
    // Une commune où rien n'a été autorisé ni commencé en dix ans n'a pas de
    // fichier à porter : c'est l'absence de ligne qui le dira, pas dix zéros.
    if (somme === 0 && c === 0) continue;
    total += somme;
    communes.set(code, { a, c, i });
  }

  // La médiane porte sur toutes les communes peuplées, celles où rien ne s'est
  // construit comprises : c'est à ce silence-là qu'on se compare.
  const taux: number[] = [];
  for (const [code, pop] of populations) {
    if (pop > 0) {
      const f = communes.get(code);
      taux.push(((f ? f.a.reduce((s, x) => s + x, 0) : 0) / pop) * 1000);
    }
  }
  taux.sort((x, y) => x - y);
  const mediane = taux.length > 0 ? taux[Math.floor(taux.length / 2)] : 0;

  dire(
    `Logements : ${total.toLocaleString('fr-FR')} autorisés de ${annees[0]} à ` +
      `${annees[annees.length - 1]} dans ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `médiane ${mediane.toFixed(1)} pour mille habitants sur dix ans ` +
      `(fichier arrêté au ${dernierMois}).`,
  );

  return {
    maj: new Date().toISOString().slice(0, 10),
    arrete: dernierMois,
    annees,
    communes,
    mediane: Number(mediane.toFixed(2)),
    total,
  };
}

/** Un fichier par département, comme le reste. */
export function ecrireLogements(
  sortie: string,
  dep: string,
  codes: string[],
  g: Logements,
): number {
  const c: Record<string, [number[], number, number]> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = g.communes.get(code);
    if (!f) continue;
    c[code] = [f.a, f.c, f.i];
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-logements.json`),
    JSON.stringify({
      maj: g.maj,
      arrete: g.arrete,
      annees: g.annees,
      mediane: g.mediane,
      c,
    }),
  );
  return n;
}
