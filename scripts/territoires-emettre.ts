/**
 * Écriture des fichiers de résolution territoriale.
 *
 * Deux niveaux, pour ne pas faire télécharger la France entière à quelqu'un qui
 * cherche sa commune :
 *
 *   index.json      un index de recherche léger — code, nom, code postal ;
 *   dep/<dep>.json  le détail d'un département : ses communes, les groupements
 *                   dont elles dépendent, et les compétences que ceux-ci
 *                   exercent réellement.
 *
 * Les formats sont colonnaires et sans clés répétées : la donnée est faite pour
 * être transférée, pas pour être lue à l'œil nu — le script, lui, se relit.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { chargerGraphe } from '../src/modele/graphe.ts';
import { ecrireFinances, medianesParStrate, STRATES } from './finances-emettre.ts';

interface Groupement {
  siren: string;
  nom: string;
  nature: string;
  codes: Set<string>;
  membres: Set<string>;
}

interface DepartementEtalab {
  code: string;
  nom: string;
}

interface CommuneEtalab {
  code: string;
  nom: string;
  type: string;
  siren?: string;
  departement?: string;
  region?: string;
  codesPostaux?: string[];
  population?: number;
}

export function emettre(o: {
  graphe: ReturnType<typeof chargerGraphe>;
  groupements: Map<string, Groupement>;
  codesSuivis: Map<string, string[]>;
  dateExport: string;
  natures: Map<string, string>;
  finances: {
    annee: number;
    parCommune: Map<string, (number | null)[]>;
    statutParticulier: Map<string, string>;
  } | null;
  sortie: string;
  dire: (m: string) => void;
  VERT: string;
  RAZ: string;
  GRIS: string;
}) {
  const { groupements, codesSuivis, dateExport, natures, finances, sortie, dire, VERT, RAZ, GRIS } = o;
  const reperes = [...o.graphe.reperes.values()];

  // Le découpage administratif vient d'un paquet npm plutôt que d'une API :
  // le registre est autrement plus fiable qu'un service web, et la version est
  // épinglée dans package.json — donc reproductible.
  const lire = <T,>(f: string): T =>
    JSON.parse(
      readFileSync(createRequire(import.meta.url).resolve(`@etalab/decoupage-administratif/data/${f}`), 'utf8'),
    ) as T;
  const communes = lire<CommuneEtalab[]>('communes.json').filter(
    (c) => c.type === 'commune-actuelle' && c.siren && c.departement,
  );
  // Le nom du département, pas son numéro : « Sarthe » se reconnaît, « 72 » non.
  // Plus d'une commune sur dix porte un nom qu'une autre porte aussi.
  const nomsDep = new Map(lire<DepartementEtalab[]>('departements.json').map((d) => [d.code, d.nom]));
  dire(`${GRIS}${communes.length.toLocaleString('fr-FR')} communes au découpage Etalab.${RAZ}`);

  // Qui est membre de quoi. Un membre peut être une commune ou un autre
  // groupement : c'est ainsi qu'une commune se retrouve rattachée à un syndicat
  // auquel elle n'a jamais adhéré directement, via son intercommunalité.
  const appartient = new Map<string, string[]>();
  for (const g of groupements.values()) {
    for (const m of g.membres) {
      if (!appartient.has(m)) appartient.set(m, []);
      appartient.get(m)!.push(g.siren);
    }
  }

  /** Fermeture transitive : tous les groupements qui pèsent sur une commune. */
  const closure = (sirenCommune: string): string[] => {
    const vus = new Set<string>();
    const file = [sirenCommune];
    while (file.length > 0) {
      for (const g of appartient.get(file.shift()!) ?? []) {
        if (vus.has(g)) continue;
        vus.add(g);
        file.push(g);
      }
    }
    return [...vus];
  };

  const utiles = (sirens: string[]) =>
    sirens.filter((s) => (groupements.get(s)?.codes.size ?? 0) > 0);

  // --- index de recherche ------------------------------------------------
  // La population accompagne chaque entrée : entre deux homonymes, la taille
  // départage bien plus sûrement qu'un code postal que personne ne retient.
  // Tous les codes postaux, pas seulement le premier : une commune un peu
  // étendue en a plusieurs, et l'habitant ne connaît que le sien.
  const index = communes.map((c) => [
    c.code,
    c.nom,
    (c.codesPostaux ?? []).join(' '),
    c.departement!,
    c.population ?? 0,
  ]);
  ecrireJson(join(sortie, 'index.json'), {
    maj: dateExport,
    deps: Object.fromEntries(nomsDep),
    c: index,
  });

  // --- un fichier par département ---------------------------------------
  mkdirSync(join(sortie, 'dep'), { recursive: true });
  const parDep = new Map<string, CommuneEtalab[]>();
  for (const c of communes) {
    if (!parDep.has(c.departement!)) parDep.set(c.departement!, []);
    parDep.get(c.departement!)!.push(c);
  }

  // Couverture : la part des communes d'un département pour lesquelles un
  // exerçant est identifié, compétence par compétence.
  //
  // Elle n'est pas cosmétique. BANATIC a des trous : dans la Sarthe, 54 communes
  // sur 352 ont un exerçant identifié pour la concession électrique, contre
  // 391/391 dans l'Ain. Sans cette mesure, le site conclurait « la commune s'en
  // charge » là où le registre est simplement muet — se tromper avec aplomb est
  // exactement ce qu'on ne peut pas se permettre ici.
  const compsSuivies = [...new Set([...codesSuivis.values()].flat())];
  const codesDeComp = new Map(
    compsSuivies.map((c) => [c, [...codesSuivis].filter(([, v]) => v.includes(c)).map(([k]) => k)]),
  );
  const couvertureNationale = new Map<string, number>(compsSuivies.map((c) => [c, 0]));
  const totalCommunes = communes.length;

  let couvertes = 0;
  let sansRattachement = 0;
  for (const [dep, liste] of parDep) {
    const refs = new Map<string, number>();
    const table: [string, string, string, string[]][] = [];
    const rows = liste.map((c) => {
      const g = utiles(closure(c.siren!));
      if (g.length === 0) sansRattachement++;
      else couvertes++;
      const indices = g.map((siren) => {
        if (!refs.has(siren)) {
          const gr = groupements.get(siren)!;
          refs.set(siren, table.length);
          table.push([gr.siren, gr.nom, gr.nature, [...gr.codes]]);
        }
        return refs.get(siren)!;
      });
      return [c.code, c.nom, c.population ?? 0, indices];
    });

    // Une commune « couverte » pour une compétence est une commune dont l'un des
    // groupements porte l'un des codes de cette compétence.
    const couvertureDep: Record<string, number> = {};
    for (const comp of compsSuivies) {
      const codes = codesDeComp.get(comp)!;
      let n = 0;
      for (const r of rows) {
        const trouve = (r[3] as number[]).some((i) => table[i][3].some((c) => codes.includes(c)));
        if (trouve) n++;
      }
      couvertureDep[comp] = Math.round((n / rows.length) * 100) / 100;
      couvertureNationale.set(comp, couvertureNationale.get(comp)! + n);
    }

    ecrireJson(join(sortie, 'dep', `${dep}.json`), {
      dep,
      maj: dateExport,
      g: table,
      c: rows,
      couverture: couvertureDep,
    });

    if (finances) {
      ecrireFinances(
        sortie,
        dep,
        finances.annee,
        liste.map((c) => c.code),
        finances.parCommune,
      );
    }
  }

  // --- métadonnées : la correspondance est aussi de la donnée ------------
  ecrireJson(join(sortie, 'meta.json'), {
    maj: dateExport,
    source: 'BANATIC — export national des groupements de communes',
    decoupage: '@etalab/decoupage-administratif',
    // code BANATIC -> compétences de Rouages qu'il permet de résoudre
    codes: Object.fromEntries(codesSuivis),
    natures: Object.fromEntries(natures),
    // Part nationale des communes pour lesquelles un exerçant est identifié.
    couverture: Object.fromEntries(
      [...couvertureNationale].map(([k, v]) => [k, Math.round((v / totalCommunes) * 100) / 100]),
    ),
    ...(finances
      ? {
          finances: {
            annee: finances.annee,
            // L'ordre des repères est celui du contenu : les vecteurs de
            // valeurs y font référence par position.
            reperes: reperes.map((r) => ({ id: r.id, nom: r.nom, explication: r.explication, flux: r.flux })),
            strates: STRATES.map((s) => s.libelle),
            // Médiane par strate : la moyenne serait tirée par quelques
            // communes atypiques, et c'est à la médiane qu'on se compare.
            medianes: medianesParStrate(
              reperes,
              finances.parCommune,
              new Map(communes.map((c) => [c.code, c.population ?? 0])),
              finances.statutParticulier,
            ),
            // Rares — Paris seulement à ce jour — mais il faut le dire plutôt
            // que de proposer une comparaison qui n'a pas de sens.
            statutParticulier: Object.fromEntries(finances.statutParticulier),
          },
        }
      : {}),
  });

  dire(
    `${VERT}Écrit${RAZ} ${parDep.size} départements · ` +
      `${couvertes.toLocaleString('fr-FR')} communes rattachées à au moins un groupement suivi · ` +
      `${sansRattachement.toLocaleString('fr-FR')} sans rattachement.`,
  );
}

function ecrireJson(chemin: string, donnee: unknown) {
  writeFileSync(chemin, JSON.stringify(donnee));
}
