/**
 * Les droits de mutation : ce que rapporte une vente immobilière, et à qui.
 *
 * C'est le malentendu le plus répandu de toute la fiscalité locale. Ce qu'on
 * appelle « frais de notaire » est à environ 80 % de l'impôt, et cet impôt ne
 * va pas au notaire : il va au **département** et aux **communes**, deux
 * échelons que le site décrit déjà. Le notaire le collecte et le reverse.
 *
 * Bercy publie les recettes mois par mois, par département et par bénéficiaire.
 * Le site en fait des totaux annuels, parce que le mois ne veut rien dire ici —
 * une vente se dénoue quand elle se dénoue — et parce que la série annuelle
 * montre ce qui compte : dans l'Allier, 42,7 M€ pour le département en 2021,
 * 32,8 M€ en 2024. Un budget départemental qui perd un quart de cette recette
 * en trois ans, cela se voit ailleurs, en fermetures et en reports.
 *
 * **La part communale est départementale, elle aussi.** La taxe additionnelle
 * est encaissée pour l'ensemble des communes du département, pas commune par
 * commune : le site dit donc « les communes du département » et jamais
 * « votre commune ».
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DMTO =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/dmto_attrib';

interface LigneDmto {
  date: string | null;
  collectivite_attributaire: string | null;
  nature_attributaire: string | null;
  recettes: number | null;
}

export interface Dmto {
  /** Les exercices complets retenus, du plus ancien au plus récent. */
  annees: number[];
  /** Code de département -> recettes du département, par exercice. */
  departement: Map<string, (number | null)[]>;
  /** Code de département -> recettes des communes de ce département. */
  communes: Map<string, (number | null)[]>;
  maj: string;
}

/**
 * Un exercice ne compte que s'il est complet.
 *
 * La publication est mensuelle : l'année en cours n'a que sept mois au moment
 * où ces lignes sont écrites. L'afficher ferait lire une chute de 35 % là où il
 * n'y a qu'un calendrier.
 */
const MOIS_COMPLETS = 12;

export async function collecterDmto(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Dmto | null> {
  const url =
    `${DMTO}/exports/json?select=date,collectivite_attributaire,nature_attributaire,recettes`;
  const lignes = await json<LigneDmto[]>(url);
  if (lignes.length === 0) {
    dire('Droits de mutation : aucune ligne, le jeu a changé de forme.');
    return null;
  }

  // Combien de mois distincts par exercice : c'est ce qui dit si l'année est
  // close, et non la date du jour.
  const moisParAnnee = new Map<number, Set<string>>();
  for (const l of lignes) {
    const d = String(l.date ?? '');
    const an = Number(d.slice(0, 4));
    if (!Number.isFinite(an)) continue;
    if (!moisParAnnee.has(an)) moisParAnnee.set(an, new Set());
    moisParAnnee.get(an)!.add(d.slice(0, 7));
  }
  const annees = [...moisParAnnee.entries()]
    .filter(([, mois]) => mois.size >= MOIS_COMPLETS)
    .map(([an]) => an)
    .sort((a, b) => a - b);
  if (annees.length === 0) {
    dire('Droits de mutation : aucun exercice complet.');
    return null;
  }
  const rang = new Map(annees.map((a, i) => [a, i]));

  const departement = new Map<string, (number | null)[]>();
  const communes = new Map<string, (number | null)[]>();
  const ajouter = (index: Map<string, (number | null)[]>, dep: string, i: number, v: number) => {
    let s = index.get(dep);
    if (!s) {
      s = new Array<number | null>(annees.length).fill(null);
      index.set(dep, s);
    }
    s[i] = (s[i] ?? 0) + v;
  };

  let ignorees = 0;
  for (const l of lignes) {
    const i = rang.get(Number(String(l.date ?? '').slice(0, 4)));
    if (i === undefined) continue;
    // Le code arrive parfois sans son zéro initial : « 3 » pour l'Allier. Les
    // codes corses et d'outre-mer, eux, ne sont pas numériques.
    const brut = String(l.collectivite_attributaire ?? '').trim().toUpperCase();
    if (!brut) continue;
    const dep = /^\d+$/.test(brut) ? brut.padStart(2, '0') : brut;
    const v = Number(l.recettes);
    if (!Number.isFinite(v)) continue;
    if (l.nature_attributaire === 'Département') ajouter(departement, dep, i, v);
    else if (l.nature_attributaire === 'Communes') ajouter(communes, dep, i, v);
    else ignorees++;
  }

  dire(
    `Droits de mutation : ${lignes.length.toLocaleString('fr-FR')} lignes mensuelles, ` +
      `${departement.size} départements, exercices ${annees[0]} à ${annees[annees.length - 1]}` +
      (ignorees > 0 ? ` (${ignorees.toLocaleString('fr-FR')} lignes régionales écartées)` : '') +
      '.',
  );
  return { annees, departement, communes, maj: new Date().toISOString().slice(0, 10) };
}

/**
 * Un seul fichier national : cent une lignes de deux séries pèsent moins qu'une
 * requête de plus, et le découper par département n'économiserait rien.
 */
export function ecrireDmto(sortie: string, dmto: Dmto): number {
  const d: Record<string, { dep: (number | null)[]; com: (number | null)[] }> = {};
  for (const code of [...dmto.departement.keys()].sort()) {
    d[code] = {
      // Arrondi au millier d'euros : la précision à l'euro d'une recette de
      // 32 millions n'apprend rien et triple le poids du fichier.
      dep: (dmto.departement.get(code) ?? []).map((v) => (v === null ? null : Math.round(v / 1000))),
      com: (dmto.communes.get(code) ?? []).map((v) => (v === null ? null : Math.round(v / 1000))),
    };
  }
  writeFileSync(
    join(sortie, 'dmto.json'),
    JSON.stringify({ annees: dmto.annees, maj: dmto.maj, unite: 'milliers d’euros', d }),
  );
  return Object.keys(d).length;
}
