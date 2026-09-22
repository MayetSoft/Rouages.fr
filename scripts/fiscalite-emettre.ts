/**
 * Ce qui est prélevé ici, et par qui.
 *
 * Le site savait dire combien une commune dépense par habitant. Il ne savait
 * pas dire **ce que son propriétaire paie**, ni surtout à qui. Or la ligne
 * « taxe foncière » d'un avis d'imposition n'est pas un taux mais une somme de
 * taux votés par des assemblées différentes — la commune, l'intercommunalité,
 * un syndicat, un établissement public foncier, la gestion des milieux
 * aquatiques — et c'est exactement le genre de chose que ce site existe pour
 * démêler.
 *
 * La vérification a porté sur Rennes : 45,66 % pour la commune, 1,73 % pour la
 * métropole, le reste en taxes annexes, **47,70 % au total** — le chiffre que
 * publient les réutilisateurs du fichier à la troisième décimale près. Le total
 * n'est donc pas un agrégat hasardeux : il est la somme exhaustive des taux
 * que la trace du fichier déclare applicables au foncier bâti.
 *
 * **Deux rappels que la page porte.** La taxe d'habitation sur la résidence
 * principale n'existe plus depuis 2023 ; le taux qui subsiste ne frappe que les
 * résidences secondaires et les logements vacants. Et le taux communal de
 * taxe foncière a absorbé en 2021 l'ancienne part départementale (article 16 de
 * la loi de finances pour 2020) : le comparer à celui de 2020 n'a pas de sens.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Le jeu Opendatasoft qui porte les millésimes du REI en pièces jointes. */
const JEU =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'impots-locaux-fichier-de-recensement-des-elements-dimposition-a-la-fiscalite-dir';

/**
 * Les taux qui s'additionnent sur la ligne « foncier bâti » d'un avis.
 *
 * L'ordre est celui de l'affichage, et les index voyagent dans les fichiers
 * publiés : **on ajoute à la fin, on ne réordonne pas.**
 */
export const PERCEPTEURS = [
  'Commune',
  'Intercommunalité',
  'Syndicats',
  'Taxes spéciales d’équipement',
  'Gestion des milieux aquatiques',
] as const;

/** Les colonnes du REI derrière chaque percepteur, pour le foncier bâti. */
const COLONNES_FB = [
  ['E12'],
  ['E32'],
  ['E22'],
  ['E52', 'E52A', 'E52TASA'],
  ['E52gGEMAPI'],
];

/**
 * La taxe d'habitation des résidences secondaires, en deux parts seulement.
 *
 * Elle ne frappe plus qu'une minorité de logements : la détailler comme le
 * foncier bâti coûterait trois nombres par commune pour une ligne que la
 * plupart des lecteurs ne verront jamais sur leur avis.
 */
const TH_COMMUNE = ['H12'];
const TH_AUTRES = ['H32', 'H22', 'H52', 'H52A', 'H52gGEMAPI'];

/** Qui perçoit la taxe d'enlèvement des ordures ménagères, selon `F71`. */
export const PERCEPTEUR_TEOM = ['', 'la commune', 'un syndicat', 'l’intercommunalité'];

/**
 * Une commune, en onze nombres.
 *
 * Le tuple plutôt que des clés nommées : trente-cinq mille fois « fb », « th »
 * et « cfe » pèsent plus que les taux eux-mêmes, et la forme est documentée
 * ici une fois pour toutes.
 */
export type FiscaliteCommune = [
  /** Les cinq taux de foncier bâti, dans l'ordre de `PERCEPTEURS`. */
  fb: number[],
  /** Taxe d'habitation des résidences secondaires : la part communale… */
  thCommune: number,
  /** …et tout le reste additionné. */
  thAutres: number,
  /** Majoration votée sur les résidences secondaires, en pour cent. */
  majoration: number,
  /** Taux de la TEOM… */
  omTaux: number,
  /** …et l'index dans `PERCEPTEUR_TEOM` de qui la perçoit. */
  omQui: number,
  /** Cotisation foncière des entreprises : la commune… */
  cfeCommune: number,
  /** …et l'intercommunalité. */
  cfeGroupement: number,
  /** Foncier non bâti : la commune… */
  fnbCommune: number,
  /** …et l'intercommunalité. */
  fnbGroupement: number,
];

export interface Fiscalite {
  maj: string;
  /** Le millésime du fichier : les taux sont ceux votés pour cette année-là. */
  millesime: number;
  communes: Map<string, FiscaliteCommune>;
  /** Médiane nationale du total de foncier bâti, pour situer le sien. */
  medianeFb: number;
  /** Médiane nationale du taux de TEOM, là où elle est perçue. */
  medianeOm: number;
}

/** Lit un fichier d'une archive en flux : cent dix mégaoctets, un seul passage. */
function enFluxDeZip(archive: string, entree: RegExp): (c: string) => AsyncIterable<Uint8Array> {
  return () => {
    // `unzip -p` sans nom exact ne marche pas : on liste, on choisit, on lit.
    async function* flux(): AsyncIterable<Uint8Array> {
      const liste = await new Promise<string>((ok, ko) => {
        const p = spawn('unzip', ['-Z1', archive]);
        let out = '';
        p.stdout.setEncoding('utf8');
        p.stdout.on('data', (m: string) => (out += m));
        p.on('error', () => ko(new Error('« unzip » est requis pour lire le fichier REI')));
        p.on('close', (c) => (c === 0 ? ok(out) : ko(new Error(`unzip a rendu ${c}`))));
      });
      const nom = liste.split('\n').find((n) => entree.test(n.trim()));
      if (!nom) throw new Error('l’archive REI ne porte pas le fichier attendu');
      const p = spawn('unzip', ['-p', archive, nom.trim()]);
      for await (const bloc of p.stdout) yield bloc as Uint8Array;
    }
    return flux();
  };
}

export async function collecterFiscalite(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lignesDe: (
    lire: (chemin: string) => AsyncIterable<Uint8Array>,
  ) => AsyncIterable<Record<string, string>>,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Fiscalite | null> {
  // Le millésime est choisi sur l'intitulé des pièces jointes, jamais sur leur
  // identifiant : celui de 2025 porte une coquille (« tracezip »), l'intitulé
  // non. Et c'est le plus récent qu'on veut, pas celui qu'on connaissait.
  let piece: { id: string; annee: number } | null = null;
  try {
    const d = await json<{ attachments?: { id: string; title: string }[] }>(JEU);
    for (const a of d.attachments ?? []) {
      const m = /REI[-_](\d{4})/i.exec(a.title);
      if (!m) continue;
      const annee = Number(m[1]);
      if (!piece || annee > piece.annee) piece = { id: a.id, annee };
    }
  } catch {
    dire('Fiscalité : le catalogue du REI n’a pas répondu.');
    return null;
  }
  if (!piece) {
    dire('Fiscalité : aucune pièce jointe « REI » — le jeu a changé de forme.');
    return null;
  }

  const fichier = join(cache, 'rei.zip');
  try {
    await telecharger(`${JEU}/attachments/${piece.id}`, fichier);
  } catch {
    dire('Fiscalité : le fichier REI n’a pas répondu, le précédent reste en place.');
    return null;
  }

  const communes = new Map<string, FiscaliteCommune>();
  const totauxFb: number[] = [];
  const tauxOm: number[] = [];
  const somme = (l: Record<string, string>, cols: string[]): number =>
    cols.reduce((s, c) => s + (Number(l[c]) || 0), 0);

  for await (const l of lignesDe(enFluxDeZip(fichier, /^REI_\d{4}\.csv$/i))) {
    const dep = (l['DEP'] ?? '').trim();
    const com = (l['COM'] ?? '').trim();
    if (!dep || !com) continue;
    // Le code INSEE est la concaténation des deux, cadrée à cinq caractères :
    // le département tient sur deux chiffres en métropole et trois outre-mer,
    // la commune sur le complément.
    const code = dep + com.padStart(5 - dep.length, '0');
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;

    const fb = COLONNES_FB.map((cols) => Number(somme(l, cols).toFixed(3)));
    const omTaux = Number(l['F22']) || 0;
    communes.set(code, [
      fb,
      Number(somme(l, TH_COMMUNE).toFixed(3)),
      Number(somme(l, TH_AUTRES).toFixed(3)),
      Number(l['TXMAJOTHRS']) || 0,
      omTaux,
      Math.min(Math.max(Number(l['F71']) || 0, 0), PERCEPTEUR_TEOM.length - 1),
      Number(l['P12']) || 0,
      Number(l['P32']) || 0,
      Number(l['B12']) || 0,
      Number(l['B32']) || 0,
    ]);
    const total = fb.reduce((s, x) => s + x, 0);
    if (total > 0) totauxFb.push(total);
    if (omTaux > 0) tauxOm.push(omTaux);
  }

  if (communes.size === 0) {
    dire('Fiscalité : aucune commune lue — le fichier a changé de forme.');
    return null;
  }
  const mediane = (v: number[]): number =>
    v.length === 0 ? 0 : Number([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(2));
  const medianeFb = mediane(totauxFb);
  const medianeOm = mediane(tauxOm);
  dire(
    `Fiscalité ${piece.annee} : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `foncier bâti médian ${medianeFb} %, TEOM médiane ${medianeOm} % ` +
      `(${tauxOm.length.toLocaleString('fr-FR')} communes la perçoivent).`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    millesime: piece.annee,
    communes,
    medianeFb,
    medianeOm,
  };
}

/** Un fichier par département, comme le reste. */
export function ecrireFiscalite(
  sortie: string,
  dep: string,
  codes: string[],
  f: Fiscalite,
): number {
  const c: Record<string, FiscaliteCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const x = f.communes.get(code);
    if (!x) continue;
    c[code] = x;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-fiscalite.json`),
    JSON.stringify({
      maj: f.maj,
      millesime: f.millesime,
      percepteurs: PERCEPTEURS,
      teom: PERCEPTEUR_TEOM,
      medianeFb: f.medianeFb,
      medianeOm: f.medianeOm,
      c,
    }),
  );
  return n;
}
