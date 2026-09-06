/**
 * Le graphe, mis en forme pour être affiché.
 *
 * Deux lectures d'un même réseau :
 *
 * — la **carte d'ensemble** ne montre que les acteurs, rangés en colonnes par
 *   échelon, reliés par l'argent et par les compétences qu'ils se partagent.
 *   Les compétences y sont agrégées en une arête par paire d'acteurs : sans
 *   cette agrégation, cinquante nœuds et deux cents arêtes ne montrent rien.
 *
 * — le **focus** ouvre un acteur et déplie ce que la carte avait replié : ses
 *   compétences, ses partenaires, les processus où il intervient.
 *
 * Les positions de la carte sont calculées ici, au build : le même graphe donne
 * toujours la même image, ce qui permet de la citer et de la comparer.
 */
import { LIBELLE_ECHELON, ECHELONS, type Echelon, type Sigle } from './schemas.ts';
import { chargerGraphe, type Graphe } from './graphe.ts';
import { largeurPastille } from '../vues/formes.ts';

export type TypeNoeud = 'acteur' | 'competence' | 'processus' | 'document';

export interface Lien {
  type: string;
  titre: string;
  url: string;
}

export interface Noeud {
  id: string;
  type: TypeNoeud;
  nom: string;
  /** Étiquette portée sur les schémas ; à défaut, le nom complet. */
  court: string;
  resume: string;
  echelon: Echelon;
  confiance: string;
  liens: Lien[];
  /** Nombre de relations : donne sa taille au nœud sur la carte. */
  degre: number;
  /** Codes BANATIC, quand la compétence se résout commune par commune. */
  banatic?: string[];
  /** Position sur la carte d'ensemble (acteurs uniquement). */
  x?: number;
  y?: number;
}

export type TypeArete =
  | 'detient'
  | 'partage'
  | 'flux'
  | 'intervient'
  | 'peut-agir'
  | 'produit'
  | 'exerce';

export interface Arete {
  de: string;
  vers: string;
  type: TypeArete;
  label?: string;
  /** Nombre de relations agrégées, pour l'épaisseur du trait. */
  poids: number;
  nature?: string;
}

export interface Reseau {
  noeuds: Noeud[];
  aretes: Arete[];
  /** Le glossaire voyage avec le réseau : le panneau en a besoin côté client. */
  sigles: Sigle[];
  /** Arêtes acteur↔acteur de la carte d'ensemble, déjà agrégées. */
  carte: {
    aretes: Arete[];
    largeur: number;
    hauteur: number;
    /** Étendue verticale réellement occupée par des nœuds. */
    hautNoeuds: number;
    basNoeuds: number;
    colonnes: { echelon: Echelon; libelle: string; x: number; largeur: number; haut: number; bas: number }[];
  };
}

export const LIBELLE_ARETE: Record<TypeArete, string> = {
  detient: 'détient',
  partage: 'partage avec',
  flux: 'verse à',
  intervient: 'intervient dans',
  'peut-agir': 'peut agir sur',
  produit: 'produit',
  exerce: 'met en œuvre',
};

const HAUTEUR_LIGNE = 92;
const MARGE_HAUT = 54;
/** Vide entre deux colonnes, une fois les pastilles dimensionnées. */
const ECART_COLONNES = 44;

let cache: Reseau | undefined;

export function construireReseau(g: Graphe = chargerGraphe()): Reseau {
  if (cache) return cache;

  const liensDe = (ids: string[]): Lien[] =>
    ids
      .map((id) => g.sources.get(id))
      .filter(Boolean)
      .map((s) => ({ type: s!.type, titre: s!.titre, url: s!.url }));

  const noeuds = new Map<string, Noeud>();
  const ajouter = (n: Omit<Noeud, 'degre'>) => noeuds.set(n.id, { ...n, degre: 0 });

  for (const a of g.acteurs.values()) {
    ajouter({
      id: a.id,
      type: 'acteur',
      nom: a.nom,
      court: a.nom_court ?? a.nom,
      resume: a.resume,
      echelon: a.echelon,
      confiance: a.confiance,
      liens: liensDe(a.liens),
    });
  }
  for (const c of g.competences.values()) {
    ajouter({
      id: c.id,
      type: 'competence',
      nom: c.nom,
      court: c.nom_court ?? c.nom,
      resume: c.resume,
      echelon: g.acteurs.get(c.acteur)?.echelon ?? 'etat',
      confiance: c.confiance,
      liens: liensDe(c.liens),
      ...(c.banatic.length > 0 ? { banatic: c.banatic } : {}),
    });
  }
  for (const p of g.processus.values()) {
    ajouter({
      id: p.id,
      type: 'processus',
      nom: p.nom,
      court: p.nom,
      resume: p.resume,
      echelon: g.acteurs.get(p.decideur)?.echelon ?? 'commune',
      confiance: p.confiance,
      liens: liensDe(p.liens),
    });
  }
  for (const d of g.documents.values()) {
    ajouter({
      id: d.id,
      type: 'document',
      nom: d.nom,
      court: d.nom,
      resume: d.resume ?? '',
      echelon: 'commune',
      confiance: 'etabli',
      liens: liensDe(d.liens),
    });
  }

  const aretes: Arete[] = [];
  const relier = (de: string, vers: string, type: TypeArete, label?: string, nature?: string) => {
    if (!noeuds.has(de) || !noeuds.has(vers) || de === vers) return;
    aretes.push({ de, vers, type, label, poids: 1, nature });
  };

  for (const c of g.competences.values()) {
    relier(c.acteur, c.id, 'detient');
    for (const a of c.partagee_avec) relier(a, c.id, 'partage');
  }
  for (const f of g.flux.values()) {
    for (const v of f.vers) relier(f.de, v, 'flux', f.nom ?? f.resume, f.nature);
  }
  for (const p of g.processus.values()) {
    for (const c of p.competences) relier(p.id, c, 'exerce');
    for (const a of new Set(p.etapes.map((e) => e.acteur))) relier(a, p.id, 'intervient');
    for (const d of new Set(p.etapes.flatMap((e) => e.produit))) relier(p.id, d, 'produit');
    for (const l of p.leviers) relier(l.acteur, p.id, 'peut-agir', l.quand);
  }

  for (const a of aretes) {
    noeuds.get(a.de)!.degre++;
    noeuds.get(a.vers)!.degre++;
  }

  const carte = disposerCarte(noeuds, aretes);
  cache = { noeuds: [...noeuds.values()], aretes, sigles: [...g.sigles.values()], carte };
  return cache;
}

/**
 * Carte d'ensemble : une colonne par échelon, les acteurs empilés dedans, et
 * les compétences repliées en une seule arête par paire d'acteurs.
 */
function disposerCarte(noeuds: Map<string, Noeud>, aretes: Arete[]): Reseau['carte'] {
  const acteurs = [...noeuds.values()].filter((n) => n.type === 'acteur');
  const presents = ECHELONS.filter((e) => acteurs.some((a) => a.echelon === e));

  // Chaque colonne prend la largeur de son plus long libellé : sinon les
  // pastilles se chevauchent dès qu'un acteur porte un nom un peu long.
  const contenus = presents.map((echelon) => ({
    echelon,
    dedans: acteurs
      .filter((a) => a.echelon === echelon)
      .sort((a, b) => b.degre - a.degre || a.nom.localeCompare(b.nom, 'fr')),
  }));
  const largeurs = contenus.map((c) => Math.max(104, ...c.dedans.map((a) => largeurPastille(a.court))));

  const hauteurMax = Math.max(...contenus.map((c) => c.dedans.length)) * HAUTEUR_LIGNE;
  let hautNoeuds = Infinity;
  let basNoeuds = 0;
  let curseur = ECART_COLONNES;
  const colonnes = contenus.map((c, i) => {
    const x = Math.round(curseur + largeurs[i] / 2);
    curseur += largeurs[i] + ECART_COLONNES;
    // Chaque pile est centrée verticalement : la carte respire, et l'œil suit
    // les traits horizontaux plutôt que des rangées artificielles.
    const decalage = MARGE_HAUT + (hauteurMax - c.dedans.length * HAUTEUR_LIGNE) / 2;
    c.dedans.forEach((a, j) => {
      a.x = x;
      a.y = Math.round(decalage + j * HAUTEUR_LIGNE);
      hautNoeuds = Math.min(hautNoeuds, a.y);
      basNoeuds = Math.max(basNoeuds, a.y);
    });
    return {
      echelon: c.echelon,
      libelle: LIBELLE_ECHELON[c.echelon],
      x,
      largeur: Math.round(largeurs[i]),
      haut: Math.round(decalage),
      bas: Math.round(decalage + (c.dedans.length - 1) * HAUTEUR_LIGNE),
    };
  });

  const LARGEUR_CARTE = Math.round(curseur);
  const hauteur = MARGE_HAUT + hauteurMax;

  // Deux acteurs sont reliés sur la carte s'ils partagent une compétence, ou si
  // l'un verse quelque chose à l'autre. Le poids est le nombre de raisons.
  const paires = new Map<string, Arete>();
  const cumuler = (de: string, vers: string, type: TypeArete, nature?: string) => {
    const cle = `${type}:${[de, vers].sort().join('|')}`;
    const existante = paires.get(cle);
    if (existante) existante.poids++;
    else paires.set(cle, { de, vers, type, poids: 1, nature });
  };

  const detenteur = new Map<string, string>();
  for (const a of aretes) if (a.type === 'detient') detenteur.set(a.vers, a.de);
  for (const a of aretes) {
    if (a.type === 'partage') {
      const proprietaire = detenteur.get(a.vers);
      if (proprietaire) cumuler(proprietaire, a.de, 'partage');
    } else if (a.type === 'flux') {
      cumuler(a.de, a.vers, 'flux', a.nature);
    }
  }

  return {
    aretes: [...paires.values()],
    largeur: LARGEUR_CARTE,
    hauteur: hauteur + 34,
    hautNoeuds: hautNoeuds - 30,
    basNoeuds: basNoeuds + 30,
    colonnes,
  };
}

/** Les relations d'un nœud, groupées par type — sert au focus et aux pages. */
export function voisinage(reseau: Reseau, id: string) {
  const sortantes = reseau.aretes.filter((a) => a.de === id);
  const entrantes = reseau.aretes.filter((a) => a.vers === id);
  return { sortantes, entrantes };
}
