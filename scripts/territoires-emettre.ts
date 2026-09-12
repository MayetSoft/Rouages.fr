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
import type { Repere } from '../src/modele/schemas.ts';
import { ecrireFinances, medianesParStrate, STRATES } from './finances-emettre.ts';
import { ecrireFlux, type FluxGroupements } from './flux-emettre.ts';
import { ecrireEau, serviceDe, type Eau, type ServiceEau } from './eau-emettre.ts';
import {
  ecrireServices,
  replierArrondissements,
  FAMILLES_SERVICE,
  type Services,
} from './services-emettre.ts';

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
  /** Code de la région dont il relève. */
  region?: string;
}

interface RegionEtalab {
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
  /** Renseigné pour un arrondissement municipal : la commune dont il relève. */
  commune?: string;
}

export function emettre(o: {
  graphe: ReturnType<typeof chargerGraphe>;
  groupements: Map<string, Groupement>;
  codesSuivis: Map<string, string[]>;
  dateExport: string;
  natures: Map<string, string>;
  finances: {
    annee: number;
    annees: number[];
    series: Map<string, (number | null)[][]>;
    parCommune: Map<string, (number | null)[]>;
    statutParticulier: Map<string, string>;
  } | null;
  eau: Eau | null;
  services: Services | null;
  reperesGfp: Repere[];
  fluxGfp: FluxGroupements | null;
  sortie: string;
  dire: (m: string) => void;
  VERT: string;
  RAZ: string;
  GRIS: string;
}) {
  const { groupements, codesSuivis, dateExport, natures, finances, eau, services, sortie, dire, VERT, RAZ, GRIS } = o;
  // Seuls les repères mesurés sur la commune : leur ordre doit correspondre
  // colonne pour colonne aux séries collectées, sinon les médianes se
  // décaleraient d'un repère sans que rien ne le signale.
  const reperes = [...o.graphe.reperes.values()].filter((r) => r.echelon === 'commune');

  // Le découpage administratif vient d'un paquet npm plutôt que d'une API :
  // le registre est autrement plus fiable qu'un service web, et la version est
  // épinglée dans package.json — donc reproductible.
  const lire = <T,>(f: string): T =>
    JSON.parse(
      readFileSync(createRequire(import.meta.url).resolve(`@etalab/decoupage-administratif/data/${f}`), 'utf8'),
    ) as T;
  const toutesLesEntrees = lire<CommuneEtalab[]>('communes.json');
  const communes = toutesLesEntrees.filter(
    (c) => c.type === 'commune-actuelle' && c.siren && c.departement,
  );

  // Paris, Lyon et Marseille n'existent pas dans les référentiels de services :
  // une école parisienne est déposée sous le code de son arrondissement (75112),
  // jamais sous celui de la commune (75056). Sans ce repli, les trois plus
  // grandes villes de France apparaîtraient dépourvues d'école et d'hôpital.
  // Le rattachement vient du découpage lui-même, pas de plages de codes écrites
  // à la main.
  const communeDeArrondissement = new Map<string, string>();
  for (const c of toutesLesEntrees) {
    if (c.type === 'arrondissement-municipal' && c.commune) {
      communeDeArrondissement.set(c.code, c.commune);
    }
  }
  if (services) {
    const replies = replierArrondissements(services, communeDeArrondissement);
    if (replies > 0) {
      dire(
        `${GRIS}${replies.toLocaleString('fr-FR')} services d'arrondissement rattachés ` +
          `à Paris, Lyon et Marseille.${RAZ}`,
      );
    }
  }
  // Le nom du département, pas son numéro : « Sarthe » se reconnaît, « 72 » non.
  // Plus d'une commune sur dix porte un nom qu'une autre porte aussi.
  const departements = lire<DepartementEtalab[]>('departements.json');
  const nomsDep = new Map(departements.map((d) => [d.code, d.nom]));
  // La région de chaque département : c'est elle qui répond quand la loi la
  // désigne à défaut d'intercommunalité — pour la mobilité, notamment.
  const nomsRegion = new Map(lire<RegionEtalab[]>('regions.json').map((r) => [r.code, r.nom]));
  const regionDeDep = new Map(
    departements.filter((d) => d.region).map((d) => [d.code, nomsRegion.get(d.region!) ?? d.region!]),
  );
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

  // La compétence qui déclare un indicateur SISPEA : c'est elle qui dit quelle
  // structure interroger pour le prix.
  const compEau = [...o.graphe.competences.values()].find((c) => c.sispea)?.id;
  const codesEau = compEau ? (codesDeComp.get(compEau) ?? []) : [];
  let servicesEau = 0;

  // Une France services ne déclare pas le territoire qu'elle dessert. Mais la
  // commune qui n'en accueille pas appartient à une intercommunalité, et celle
  // d'à côté en a peut-être une : c'est un rattachement réel, que le site
  // résout déjà, là où une distance à vol d'oiseau ne dirait que la géométrie.
  const A_FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'EPT', 'SAN']);
  const epciDe = new Map<string, string>();
  for (const c of communes) {
    const epci = closure(c.siren!).find((s) => A_FISCALITE_PROPRE.has(groupements.get(s)?.nature ?? ''));
    if (epci) epciDe.set(c.code, epci);
  }
  const fsParEpci = new Map<string, { nom: string; commune: string; code: string }[]>();
  if (services) {
    for (const c of communes) {
      const epci = epciDe.get(c.code);
      if (!epci) continue;
      for (const s of services.parCommune.get(c.code) ?? []) {
        if (s.famille !== 'france-services') continue;
        if (!fsParEpci.has(epci)) fsParEpci.set(epci, []);
        fsParEpci.get(epci)!.push({ nom: s.nom, commune: c.nom, code: c.code });
      }
    }
  }
  let servicesEcrits = 0;

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

    if (eau && codesEau.length > 0) {
      const eauxCommunes = new Map<string, ServiceEau>();
      for (const c of liste) {
        const competents = closure(c.siren!).filter((s) =>
          [...(groupements.get(s)?.codes ?? [])].some((code) => codesEau.includes(code)),
        );
        const s = serviceDe(eau, c.siren!, c.code, competents);
        if (s) eauxCommunes.set(c.code, s);
      }
      servicesEau += eauxCommunes.size;
      ecrireEau(sortie, dep, eau, eauxCommunes);
    }

    if (finances) {
      ecrireFinances(
        sortie,
        dep,
        finances.annee,
        finances.annees,
        liste.map((c) => c.code),
        finances.series,
      );
    }

    if (services) {
      const voisines = new Map<string, { nom: string; commune: string }[]>();
      for (const c of liste) {
        const epci = epciDe.get(c.code);
        if (!epci) continue;
        const autres = (fsParEpci.get(epci) ?? []).filter((f) => f.code !== c.code);
        if (autres.length > 0) {
          voisines.set(c.code, autres.map((f) => ({ nom: f.nom, commune: f.commune })));
        }
      }
      servicesEcrits += ecrireServices(sortie, dep, liste.map((c) => c.code), services, voisines);
    }
  }

  // --- les flux perçus par les groupements, dans leur propre fichier -----
  // Il n'est chargé que si l'on ouvre un flux : le fondre dans meta.json, que
  // toute visite télécharge, ferait payer ce poids à qui ne le lira jamais.
  if (o.fluxGfp && o.reperesGfp.length > 0) {
    const n = ecrireFlux(sortie, o.reperesGfp, o.fluxGfp);
    dire(`${GRIS}Flux des groupements : ${n.toLocaleString('fr-FR')} structures chiffrées.${RAZ}`);
  }

  // --- métadonnées : la correspondance est aussi de la donnée ------------
  ecrireJson(join(sortie, 'meta.json'), {
    maj: dateExport,
    source: 'BANATIC — export national des groupements de communes',
    decoupage: '@etalab/decoupage-administratif',
    // code BANATIC -> compétences de Rouages qu'il permet de résoudre
    codes: Object.fromEntries(codesSuivis),
    // Compétence -> catégories d'intercommunalité auxquelles la loi la
    // transfère de plein droit. BANATIC n'enregistre que les transferts
    // déclarés, et il en manque beaucoup : conclure « la commune » de son
    // silence serait faux là où la loi a déjà tranché.
    obligatoires: Object.fromEntries(
      [...o.graphe.competences.values()]
        .filter((c) => c.obligatoire_pour.length > 0)
        .map((c) => [c.id, c.obligatoire_pour]),
    ),
    // Les réserves : ce que la réponse territoriale ne dit pas d'elle-même.
    reserves: Object.fromEntries(
      [...o.graphe.competences.values()].filter((c) => c.reserve).map((c) => [c.id, c.reserve]),
    ),
    // Qui répond quand personne ne s'est saisi de la compétence. Une réponse,
    // pas une incertitude : la loi désigne un échelon, et le site le nomme.
    aDefaut: Object.fromEntries(
      [...o.graphe.competences.values()].filter((c) => c.a_defaut).map((c) => [c.id, c.a_defaut]),
    ),
    // Département -> nom de sa région, pour pouvoir nommer celle qui répond.
    regions: Object.fromEntries(regionDeDep),
    natures: Object.fromEntries(natures),
    // Part nationale des communes pour lesquelles un exerçant est identifié.
    couverture: Object.fromEntries(
      [...couvertureNationale].map(([k, v]) => [k, Math.round((v / totalCommunes) * 100) / 100]),
    ),
    ...(services
      ? {
          services: {
            maj: services.maj,
            // L'ordre fait foi : les fichiers départementaux désignent une
            // famille par son index dans cette liste.
            familles: [...FAMILLES_SERVICE],
            totaux: services.totaux,
            // Les casernes n'existent pas en open data national : l'annuaire ne
            // publie que les états-majors départementaux. On nomme le SDIS
            // compétent plutôt que de situer une caserne qu'on ne connaît pas.
            sdis: Object.fromEntries(services.sdis),
          },
        }
      : {}),
    ...(eau
      ? {
          eau: {
            annee: eau.annee,
            indicateur: eau.indicateur,
            competence: compEau,
            prixMedian: eau.prixMedian,
          },
        }
      : {}),
    ...(finances
      ? {
          finances: {
            annee: finances.annee,
            // Les exercices de la série, du plus ancien au plus récent.
            annees: finances.annees,
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

  if (eau) {
    dire(
      `${GRIS}Prix de l'eau rattaché à ${servicesEau.toLocaleString('fr-FR')} communes ` +
        `sur ${communes.length.toLocaleString('fr-FR')}.${RAZ}`,
    );
  }
  if (services) {
    const communesServies = [...services.parCommune.keys()].length;
    dire(
      `${GRIS}Services publics : ${servicesEcrits.toLocaleString('fr-FR')} implantations ` +
        `dans ${communesServies.toLocaleString('fr-FR')} communes.${RAZ}`,
    );
  }
  dire(
    `${VERT}Écrit${RAZ} ${parDep.size} départements · ` +
      `${couvertes.toLocaleString('fr-FR')} communes rattachées à au moins un groupement suivi · ` +
      `${sansRattachement.toLocaleString('fr-FR')} sans rattachement.`,
  );
}

function ecrireJson(chemin: string, donnee: unknown) {
  writeFileSync(chemin, JSON.stringify(donnee));
}
