/**
 * « Chez moi » : résoudre les compétences qui varient selon le territoire.
 *
 * Partout ailleurs le site répond « variable selon le territoire ». C'est
 * honnête, et c'est une impasse pour l'usager. Ici on répond vraiment, à partir
 * des transferts de compétences que BANATIC publie, groupement par groupement.
 *
 * Deux fichiers, chargés seulement quand on en a besoin : un index de recherche
 * léger, puis le détail du seul département concerné. Personne ne télécharge la
 * France entière pour chercher sa commune.
 */

import {
  origineVerdict,
  resumerVerdict,
  verdictDe,
  type StructureExercante,
  type Verdict,
} from '../modele/verdict.ts';

export { origineVerdict, resumerVerdict, type Verdict };

export interface CommuneBreve {
  code: string;
  nom: string;
  /** Le premier code postal, celui qu'on affiche. */
  cp: string;
  /** Tous les codes postaux : une commune étendue en a plusieurs. */
  cps: string[];
  /** Numéro du département : sert à charger le bon fichier. */
  dep: string;
  /** Son nom : « Sarthe » se reconnaît, « 72 » non. */
  depNom: string;
  population: number;
}

/**
 * Une structure telle que le panneau l'affiche : ce dont le verdict a besoin,
 * plus la liste de ce qu'elle exerce ici — utile au panneau, inutile à la
 * décision, donc absente du modèle partagé.
 */
export interface Structure extends StructureExercante {
  competences: string[];
}

export interface Repere {
  id: string;
  nom: string;
  explication: string;
  /** Le flux du réseau que ce repère chiffre, quand la correspondance est exacte. */
  flux?: string;
  /** Euros par habitant pour cette commune, ou null si non renseigné. */
  valeur: number | null;
  /** Médiane des communes de la même strate de population. */
  mediane: number | null;
  /**
   * La valeur de chaque exercice, du plus ancien au plus récent. Un chiffre
   * isolé ne se discute pas ; une série dit ce qui a changé.
   */
  serie: (number | null)[];
  /**
   * Variation entre le premier et le dernier exercice renseignés, en pour
   * cent. `null` quand la série est trop lacunaire pour conclure — ou quand
   * elle part de zéro, où le pourcentage n'aurait pas de sens.
   */
  evolution: number | null;
}

export interface Finances {
  annee: number;
  /** Les exercices de la série, du plus ancien au plus récent. */
  annees: number[];
  /** Le libellé de la strate à laquelle la commune est comparée. */
  strate: string;
  /**
   * Renseigné pour les communes dont le statut rend la comparaison trompeuse —
   * Paris, qui fusionne les fonctions communales et départementales. Les
   * chiffres restent affichés, la médiane est retirée.
   */
  statutParticulier?: string;
  reperes: Repere[];
}

/**
 * Un flux perçu par l'intercommunalité plutôt que par la commune.
 *
 * La taxe d'enlèvement des ordures ménagères et le versement mobilité ne sont
 * presque jamais dans les comptes communaux : les chercher là ne trouve rien,
 * et « la commune ne perçoit rien » serait exact et sans intérêt. Le site sait
 * quelle structure sert la commune ; il lui manquait le chiffre en face.
 */
export interface FluxPercu {
  nom: string;
  explication: string;
  /** La structure qui perçoit, nommée : c'est elle qu'on ira voir. */
  structure: string;
  natureLibelle: string;
  /** Euros par habitant, dernier exercice. */
  valeur: number;
  /** Médiane des seuls groupements qui perçoivent effectivement. */
  mediane: number | null;
  /** Combien de groupements perçoivent : l'absence ailleurs se dit en chiffres. */
  percepteurs: number;
  serie: (number | null)[];
  evolution: number | null;
}

/**
 * Le maire en fonction.
 *
 * Le graphe garde la fonction — « le maire » — et ne nomme personne ; le nom
 * de son titulaire est une donnée territoriale, au même titre que le nom de la
 * communauté de communes. Une date est affichée avec lui : un nom sans date
 * vieillit en silence, et envoyer quelqu'un écrire à un élu qui n'est plus en
 * poste serait pire que ne rien dire.
 *
 * Cette date est celle du **mandat en cours**, jamais l'ancienneté : le
 * répertoire la remet à zéro à chaque scrutin.
 */
export interface Maire {
  prenom: string;
  nom: string;
  /**
   * Début du mandat en cours, au format ISO — pas l'ancienneté dans la
   * fonction : le répertoire la remet à zéro à chaque scrutin.
   */
  depuis: string;
}

/**
 * Ce qu'un acheteur public a commandé.
 *
 * L'objet d'un marché dit ce qu'une collectivité fait de son argent bien mieux
 * qu'un agrégat comptable : « collecte des ordures ménagères », « réhabilitation
 * des réseaux d'assainissement », « maison médicale ». C'est la forme la plus
 * concrète de « où va l'argent ».
 *
 * Les montants ne s'additionnent pas, et le site ne les additionne pas : un
 * accord-cadre déclare un plafond, et chacun de ses lots le redéclare en
 * entier. Sept marchés parisiens portent ainsi 21 M€ chacun pour un seul
 * accord-cadre.
 */
export interface Marche {
  objet: string;
  /** Montant déclaré pour ce marché. Pour un accord-cadre, c'est un plafond. */
  montant: number | null;
  date: string;
  /** Libellé de la procédure, ou null si le référentiel a changé. */
  procedure: string | null;
  /** Nombre de lots regroupés sous cette ligne. */
  lots: number;
}

export interface AcheteurMarches {
  /** Le SIREN, pour aller chercher la suite de la liste à la demande. */
  siren: string;
  /** La commune elle-même, ou l'un de ses groupements. */
  nom: string;
  natureLibelle: string | null;
  /** Nombre total de marchés notifiés depuis `depuis`, avant troncature. */
  total: number;
  /** Les plus récents seulement. */
  liste: Marche[];
}

/**
 * Les droits de mutation chez vous.
 *
 * La part communale est le point qui mérite l'attention : elle ne revient à la
 * commune que si celle-ci dépasse 5 000 habitants. En dessous, la même taxe
 * alimente un fonds de péréquation départemental, redistribué selon un barème
 * voté par le conseil départemental. Le site connaît la population : il peut
 * donc dire lequel des deux régimes s'applique, au lieu de décrire les deux.
 */
export interface Dmto {
  annees: number[];
  /** Recettes du département, en euros, par exercice. */
  departement: (number | null)[];
  /** Recettes de l'ensemble des communes du département, en euros. */
  communes: (number | null)[];
  /** Vrai si la part communale revient directement à la commune (art. 1584). */
  partDirecte: boolean;
  maj: string;
}

/**
 * Les comptes d'un échelon supérieur, prêts à afficher.
 *
 * La médiane porte sur toutes les collectivités du même échelon que l'OFGL
 * publie — 97 départements, 17 régions. Pas de strate de population ici : il
 * n'y en a pas assez pour qu'une strate ait un sens, et la comparaison directe
 * reste lisible tant qu'on dit sur combien elle porte.
 */
export interface ComptesEchelon {
  /** « le département de l'Allier », « la région Auvergne-Rhône-Alpes ». */
  nom: string;
  annees: number[];
  /** La taille de l'échelon, pour situer la comparaison. */
  effectif: number;
  reperes: (Repere & {
    /**
     * Combien de collectivités entrent dans la médiane de *ce* repère.
     *
     * Les régions n'ont plus de dotation globale de fonctionnement depuis
     * 2018 : quelques-unes en déclarent encore une, et annoncer « médiane des
     * dix-sept régions » sous ce repère ferait passer une poignée de cas
     * particuliers pour la norme.
     */
    effectif: number;
  })[];
}

/**
 * Ce qu'une collectivité verse aux associations.
 *
 * Aucun total, et la raison est dans le texte : l'obligation de publier ne
 * porte que sur les conventions de plus de 23 000 €. Certaines collectivités
 * publient tout, d'autres s'en tiennent au seuil, et sommer les deux donnerait
 * un chiffre sous-estimé d'un facteur inconnu, variable d'une commune à
 * l'autre. Les lignes, elles, restent vraies une à une.
 */
export interface Subvention {
  /** Le bénéficiaire — une association, jamais une personne. */
  qui: string;
  montant: number | null;
  annee: string;
  objet: string;
}

export interface CollectiviteSubventionne {
  nom: string;
  natureLibelle: string | null;
  /** Nombre de lignes publiées, avant troncature. */
  total: number;
  /** Le plus ancien et le plus récent exercice publiés. */
  exercices: [string, string];
  liste: Subvention[];
}

/**
 * Ce qu'une collectivité a délibéré, tel que le panneau l'affiche.
 *
 * La couverture est partielle et le bloc ne vaut jamais zéro : il n'existe pas
 * de consolidation nationale des délibérations, et une collectivité absente
 * d'ici n'est pas une collectivité qui ne délibère pas — c'est une
 * collectivité qui ne verse pas ses actes en données ouvertes. Le bloc
 * n'apparaît donc que là où il y a quelque chose.
 */
export interface Deliberation {
  date: string;
  /** La famille de la nomenclature ACTES, ou null quand le code manque. */
  famille: string | null;
  objet: string;
  /** L'acte chez la collectivité qui l'a publié : le site lie, il ne copie pas. */
  url: string;
}

export interface CollectiviteDelibere {
  nom: string;
  natureLibelle: string | null;
  /** Nombre total publié, avant troncature. */
  total: number;
  /** Les familles les plus fréquentes, pour dire de quoi il est question. */
  familles: { nom: string; nombre: number }[];
  liste: Deliberation[];
}

/**
 * Le dernier scrutin municipal, tel que le panneau l'affiche.
 *
 * Le site dit qui décide ; ceci dit dans quelles conditions ce décideur a été
 * désigné. Aucune nuance politique, aucun nom de candidat : `docs/07-risques.md`
 * interdit de relier une personne à une opinion, et le fichier des résultats
 * par commune ne porte de toute façon aucun nom.
 */
export interface Scrutin {
  /** « municipales 2026 ». */
  nom: string;
  tours: {
    numero: number;
    inscrits: number;
    votants: number;
    /** Blancs et nuls confondus : venir sans choisir est une réponse unique. */
    refus: number;
    listes: number;
    /** Participation médiane nationale de ce tour-là. */
    medianeParticipation: number;
    /** Part médiane de blancs et nuls, sur les votants. */
    medianeRefus: number;
  }[];
  /** Sièges au conseil municipal. */
  sieges: number;
  /** Sièges de la commune au conseil communautaire : son poids dans l'intercommunalité. */
  siegesCc: number;
  /**
   * L'intercommunalité où la commune siège, quand elle en a une à fiscalité
   * propre — un syndicat n'a pas de conseil élu.
   */
  conseilCc: string | null;
  /**
   * Vrai quand la commune est représentée sans que ses sièges soient élus.
   *
   * Sous mille habitants, les conseillers communautaires ne sont pas élus au
   * scrutin fléché : ce sont les conseillers municipaux désignés dans l'ordre
   * du tableau (article L273-11 du code électoral). Le fichier des résultats
   * ne porte donc aucun siège pour elles — vingt-quatre des trente-neuf
   * communes de Vichy Communauté, par exemple. Se taire laisserait croire
   * qu'elles ne siègent pas.
   */
  ccDesignes: boolean;
  /** Part des communes où une seule liste se présentait, en pour cent. */
  partListeUnique: number;
  maj: string;
}

/**
 * Les risques majeurs d'une commune, prêts à afficher.
 *
 * Deux listes, et elles ne se recouvrent pas. `recenses` dit ce à quoi l'État
 * estime la commune exposée ; `catnat` dit ce qui est arrivé. Au
 * Mayet-de-Montagne la première retient le séisme et le feu de forêt, la
 * seconde compte trois inondations, une sécheresse, une tempête et un mouvement
 * de terrain. Les fondre en une seule liste serait plus simple et faux.
 */
export interface Risques {
  /**
   * Les risques du dossier départemental, tels que le préfet les recense :
   * la famille, puis ses sous-types quand le dossier les précise.
   */
  recenses: { nom: string; sous: string[] }[];
  /** Ce qui a été reconnu, par nature : le libellé, le nombre, le plus récent. */
  catnat: { nom: string; nombre: number; dernier: string }[];
  /** Le total, pour le comparer à la médiane nationale. */
  totalCatnat: number;
  /** Nombre médian d'arrêtés par commune : 34 699 sur 34 875 en ont au moins un. */
  medianeCatnat: number;
  /** Les plans de prévention qui produisent un effet. */
  plans: { modele: string; nom: string; etat: string; date: string }[];
  /** L'année du document d'information communal, ou null s'il n'y en a pas. */
  dicrim: string | null;
  maj: string;
}

function assemblerConseil(commune: CommuneBreve): Conseil | null {
  const d = conseilsDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f || f.n === 0) return null;
  return {
    elus: f.n,
    femmes: f.f,
    ageMedian: f.age,
    groupes: f.p.map(([i, n]) => ({ nom: d.groupes[i] ?? '', nombre: n })).filter((g) => g.nom),
    communautaires: f.cc,
    partFemmesNationale: d.femmes,
    ageMedianNational: d.age,
    maj: d.maj,
  };
}

/**
 * La population de la commune, recensement après recensement.
 *
 * Les valeurs manquantes voyagent en zéro dans le fichier — un recensement
 * antérieur à l'existence de la commune, l'outre-mer avant 1954 — et
 * redeviennent `null` ici : zéro habitant tracerait une courbe qui plonge.
 */
function assemblerPopulation(commune: CommuneBreve): Population | null {
  const d = popDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const [brut, anneeSommet, valeurSommet] = f;
  const serie = brut.map((x) => (x > 0 ? x : null));
  // La dernière année renseignée, qui n'est pas toujours la dernière colonne.
  let dernier = -1;
  for (const [i, v] of serie.entries()) if (v !== null) dernier = i;
  if (dernier === -1 || valeurSommet === 0) return null;
  const actuelle = serie[dernier]!;
  return {
    annees: d.annees,
    serie,
    actuelle,
    anneeActuelle: d.annees[dernier],
    sommet: [anneeSommet, valeurSommet],
    ecart: Math.round(((actuelle - valeurSommet) / valeurSommet) * 100),
    maj: d.maj,
  };
}

/**
 * Ce qui se crée en associations dans la commune.
 *
 * Des créations, pas des associations vivantes : le répertoire national ne dit
 * pas si une association fonctionne encore, et son fichier d'avant Waldec ne
 * porte aucun code de commune. Une date de création, elle, est un fait daté —
 * et Waldec est complet pour tout ce qui se crée depuis 2010.
 */
export interface Associations {
  /** Créations sur la fenêtre. */
  total: number;
  /** Les années de la fenêtre, et ce qui s'y est créé. */
  annees: number[];
  parAnnee: number[];
  /** Par domaine déclaré, du plus fourni au moins fourni. */
  domaines: { nom: string; nombre: number }[];
  /** Les plus récentes, avec leur mois. */
  recentes: { mois: string; titre: string; domaine: string | null }[];
  /** Créations pour mille habitants sur la fenêtre, ici et à la médiane. */
  taux: number;
  medianeTaux: number;
  maj: string;
}

/**
 * La population dans le temps, prête à afficher.
 *
 * Tous les autres chiffres du site sont par habitant : sans cette série, une
 * dotation qui baisse se lit comme une décision de l'État alors qu'elle suit
 * souvent une population qui s'en va.
 */
export interface Population {
  annees: number[];
  serie: (number | null)[];
  /** La dernière valeur connue, et son année. */
  actuelle: number;
  anneeActuelle: number;
  /** Le maximum de la série entière : l'année, puis la valeur. */
  sommet: [number, number];
  /** L'écart au sommet, en pour cent — négatif quand la commune a décru. */
  ecart: number;
  maj: string;
}

/**
 * De quoi le conseil municipal est fait — sans nommer personne.
 *
 * Le site nomme le maire et s'arrête là. Ce qui est repris ici ne permet de
 * revenir à personne : un effectif, une part de femmes, un âge médian, huit
 * compteurs. C'est pourtant une information politique de premier ordre — neuf
 * retraités et aucun ouvrier dans une commune ouvrière se voit d'un coup
 * d'œil, et aucune liste de noms ne le dirait.
 */
export interface Conseil {
  /** Conseillers en fonction, qui n'est pas toujours le nombre de sièges. */
  elus: number;
  femmes: number;
  ageMedian: number;
  /** Par groupe socioprofessionnel, du plus fourni au moins fourni. */
  groupes: { nom: string; nombre: number }[];
  /** Représentants de la commune au conseil communautaire. */
  communautaires: number;
  /** Les mêmes chiffres pour l'ensemble des conseils du pays. */
  partFemmesNationale: number;
  ageMedianNational: number;
  maj: string;
}

export interface ServiceEau {
  /** Euros TTC par m³, pour la consommation de référence de 120 m³. */
  prix: number | null;
  nom: string;
  /** Régie ou délégation. */
  gestion: string;
  /** Le délégataire, s'il y en a un. */
  operateur: string;
  annee: number;
  /** Prix médian national, pour situer le sien. */
  median: number | null;
  /** La compétence à laquelle rattacher cette information. */
  competence: string;
}

/** Une implantation de service public dans la commune. */
export interface ServicePublic {
  famille: string;
  nom: string;
  /** École ou établissement de santé privé. */
  prive: boolean;
  /** Établissement de santé doté d'un service d'urgences. */
  urgences: boolean;
  /**
   * Pour une école du premier degré : ce qu'elle est devenue.
   *
   * C'est la seule chose que le site sache dire d'une décision, et il ne
   * prétend pas en dire plus : le nombre de classes a changé telle année. Le
   * motif ne se publie nulle part.
   */
  ecole?: {
    rentrees: number[];
    classes: (number | null)[];
    eleves: (number | null)[];
    /** La dernière variation du nombre de classes : { rentree, ecart }. */
    dernierChangement: { rentree: number; ecart: number } | null;
  };
}

export interface Services {
  /** Ce qui est dans la commune, groupé par famille et dans l'ordre déclaré. */
  parFamille: Map<string, ServicePublic[]>;
  /**
   * Les communes du reste de l'intercommunalité qui accueillent une France
   * services. Elles ne déclarent pas leur ressort : c'est le rattachement
   * intercommunal qui les rend pertinentes, pas une distance à vol d'oiseau.
   *
   * `communes` est vide quand elles sont trop nombreuses pour être nommées
   * utilement — seul `nombre` est alors renseigné.
   */
  voisines: Map<string, { nombre: number; communes: string[] }>;
  /**
   * Le service d'incendie compétent. Les casernes n'existent pas en open data
   * national : l'annuaire ne publie que les états-majors départementaux.
   */
  sdis: string | null;
  maj: string;
}

export interface Territoire {
  commune: CommuneBreve;
  population: number;
  structures: Structure[];
  /** compétence Rouages -> structures qui l'exercent sur ce territoire. */
  parCompetence: Map<string, Structure[]>;
  /** compétence Rouages -> ce qu'on peut honnêtement en dire ici. */
  verdict(competence: string): Verdict;
  /** La réserve déclarée par la compétence, quand elle en porte une. */
  reserve(competence: string): string | null;
  /** Les comptes de la commune, en euros par habitant. */
  finances: Finances | null;
  /** Le service d'eau qui la dessert, et son prix. */
  eau: ServiceEau | null;
  /** Les services publics implantés sur son territoire. */
  services: Services | null;
  /** Les comptes du département, puis ceux de la région. */
  comptesEchelons: ComptesEchelon[];
  /** La date de lecture des comptes des échelons supérieurs. */
  echelonsMaj: string | null;
  /** Ce que rapportent les droits de mutation dans le département. */
  dmto: Dmto | null;
  /** Ce à quoi l'endroit est exposé, et ce qui y est déjà arrivé. */
  risques: Risques | null;
  /** Ce qui s'y crée en associations, quand il s'en est créé. */
  associations: Associations | null;
  /** Combien d'habitants, et depuis quand. */
  histoire: Population | null;
  /** De quoi le conseil municipal est fait. */
  conseil: Conseil | null;
  /** Le dernier scrutin municipal, quand le ministère l'a publié. */
  scrutin: Scrutin | null;
  /** Ce qui a été délibéré, là où la collectivité publie ses actes. */
  deliberations: CollectiviteDelibere[];
  /** L'exercice le plus ancien vu, et la date de lecture. */
  delibDepuis: string | null;
  /** Ce qui est versé aux associations, là où la collectivité le publie. */
  subventions: CollectiviteSubventionne[];
  /** Le seuil légal de publication, pour dire ce qui manque forcément. */
  subventionsSeuil: number | null;
  /** L'obligation SRU, quand la commune y est soumise. */
  sru: Sru | null;
  /** La date de l'inventaire SRU. */
  sruMaj: string | null;
  /** Ce que la commune et ses groupements ont commandé, acheteur par acheteur. */
  marches: AcheteurMarches[];
  /** L'année à partir de laquelle les marchés sont recensés, et la date de lecture. */
  marchesDepuis: string | null;
  /** Le maire en fonction, quand le répertoire national le publie. */
  maire: Maire | null;
  /** La date de lecture du répertoire des élus. */
  majElus: string | null;
  /** Ce que perçoit l'intercommunalité, quand l'OFGL le chiffre. */
  fluxPercus: FluxPercu[];
  /** Les exercices de la série des flux intercommunaux. */
  anneesFlux: number[];
  maj: string;
}

const BASE = '/territoires';
const CLE_MEMOIRE = 'rouages.commune';

let index: CommuneBreve[] | null = null;
/**
 * Les deux formes comparables d'un nom, calculées à la demande : le nom
 * normalisé, et le même sans son article initial.
 */
const formes = new Map<string, { nom: string; nu: string }>();

function formesDe(c: CommuneBreve): { nom: string; nu: string } {
  let f = formes.get(c.code);
  if (!f) {
    const nom = normaliser(c.nom);
    const nu = nom.replace(/^(le|la|les|l|aux|au) /, '');
    f = { nom, nu: nu === nom ? '' : nu };
    formes.set(c.code, f);
  }
  return f;
}
interface MetaFinances {
  annee: number;
  /** Les exercices de la série, du plus ancien au plus récent. */
  annees?: number[];
  reperes: { id: string; nom: string; explication: string; flux?: string }[];
  strates: string[];
  medianes: (number | null)[][];
  statutParticulier: Record<string, string>;
}

let meta: {
  codes: Record<string, string[]>;
  natures: Record<string, string>;
  couverture: Record<string, number>;
  /** Compétence -> catégories d'intercommunalité que la loi oblige. */
  obligatoires?: Record<string, string[]>;
  /** Compétence -> réserve à afficher avec la réponse. */
  reserves?: Record<string, string>;
  /** Compétence -> échelon qui répond quand personne ne s'en est saisi. */
  aDefaut?: Record<string, 'region' | 'departement' | 'etat'>;
  /** Département -> nom de sa région. */
  regions?: Record<string, string>;
  /** Département -> code de sa région, pour retrouver ses comptes. */
  codesRegion?: Record<string, string>;
  finances?: MetaFinances;
  eau?: { annee: number; indicateur: string; competence: string; prixMedian: number | null };
  services?: {
    maj: string;
    familles: string[];
    totaux: Record<string, number>;
    sdis: Record<string, string>;
  };
  maj: string;
} | null = null;
/** Le fichier d'un département : ses groupements, puis ses communes. */
type DepStructure = {
  maj: string;
  g: [string, string, string, string[]][];
  /** Par commune : code, nom, population, groupements, codes postaux. */
  c: [string, string, number, number[], string?][];
  couverture?: Record<string, number>;
};
const departements = new Map<string, unknown>();
/**
 * Les départements dont *tous* les fichiers ont été chargés.
 *
 * `departements` ne porte que la structure, et `trouverParCode` la remplit
 * seul pour éviter un second téléchargement. S'en servir comme garde
 * sauterait les onze autres fichiers — finances, services, marchés, risques —
 * et le panneau s'afficherait à moitié sans rien signaler.
 */
const depComplets = new Set<string>();
const financesDep = new Map<
  string,
  { annee: number; annees: number[]; h: Record<string, (number | null)[][]> } | null
>();
const eauDep = new Map<
  string,
  { annee: number; c: Record<string, [number | null, string, string, string]> } | null
>();
type ServicesDep = {
  maj: string;
  /** [famille, nom, drapeau] — et le numéro UAI en quatrième pour une école. */
  c: Record<string, ([number, string, number] | [number, string, number, string])[]>;
  sdis?: string;
  /** code INSEE -> famille -> ce que les communes voisines accueillent. */
  v?: Record<string, Record<string, { n: number; l: string[] }>>;
};

/** Les effectifs des écoles du département, par numéro UAI. */
type EcolesDep = {
  rentrees: number[];
  h: Record<string, [(number | null)[], (number | null)[]]>;
};
const ecolesDep = new Map<string, EcolesDep | null>();

/**
 * L'obligation de logements sociaux, pour les communes qui y sont soumises.
 *
 * Les autres ne sont pas en défaut : elles n'atteignent pas les seuils de
 * population et d'agglomération de l'article 55. Le site ne dit donc rien
 * pour elles, plutôt que « 0 » — qui se lirait comme un manquement.
 */
export interface Sru {
  lls: number | null;
  llsTexte: string | null;
  taux: number | null;
  tauxTexte: string | null;
  cible: number | null;
  deficitaire: boolean | null;
  carencee: boolean;
  exemptee: boolean;
  prelevement: number | null;
}
type SruDep = { maj: string; c: Record<string, Sru> };
const sruDep = new Map<string, SruDep | null>();

/**
 * Les risques du département. Les tables de libellés y sont recopiées — une
 * quarantaine d'entrées — pour que le fichier se suffise à lui-même.
 */
type RisquesDep = {
  maj: string;
  risques: string[];
  jo: string[];
  modeles: string[];
  etats: string[];
  mediane: number;
  c: Record<
    string,
    {
      ddrm: [number, number[]][];
      catnat: [number, number, string][];
      ppr: { m: number; nom: string; e: number; date: string }[];
      dicrim?: string;
    }
  >;
};
const risquesDep = new Map<string, RisquesDep | null>();

/**
 * Les créations d'associations du département. La table des domaines y est
 * recopiée — vingt-neuf entrées — pour que le fichier se suffise à lui-même.
 */
type AssoDep = {
  maj: string;
  annees: number[];
  domaines: string[];
  mediane: number;
  effectif: number;
  c: Record<
    string,
    {
      n: number;
      a: number[];
      d: [number, number][];
      r: [string, string, number][];
    }
  >;
};
const assoDep = new Map<string, AssoDep | null>();

/** Les séries de population du département. */
type PopDep = { maj: string; annees: number[]; c: Record<string, [number[], number, number]> };
const popDep = new Map<string, PopDep | null>();

/** La composition des conseils du département. */
type ConseilsDep = {
  maj: string;
  groupes: string[];
  femmes: number;
  age: number;
  c: Record<string, { n: number; f: number; age: number; p: [number, number][]; cc: number }>;
};
const conseilsDep = new Map<string, ConseilsDep | null>();

/** Le dernier scrutin municipal du département. */
type ElectionsDep = {
  scrutin: string;
  maj: string;
  medianes: { participation: number; refus: number }[];
  listeUnique: number;
  c: Record<
    string,
    {
      t1: { inscrits: number; votants: number; exprimes: number; refus: number; listes: number };
      t2?: { inscrits: number; votants: number; exprimes: number; refus: number; listes: number };
      cm: number;
      cc: number;
    }
  >;
};
const electionsDep = new Map<string, ElectionsDep | null>();

/** Les délibérations du département, indexées par SIREN comme les marchés. */
type DelibDep = {
  maj: string;
  depuis: string;
  familles: string[];
  com: Record<string, string>;
  /** SIREN du département puis de sa région, quand ils publient. */
  echelons?: string[];
  h: Record<
    string,
    { n: number; f: number[]; d: { date: string; famille: number; objet: string; url: string }[] }
  >;
};
const delibDep = new Map<string, DelibDep | null>();

/** Les subventions du département, indexées par SIREN comme les marchés. */
type SubvDep = {
  maj: string;
  seuil: number;
  com: Record<string, string>;
  /** SIREN du département puis de sa région, quand ils publient. */
  echelons?: string[];
  h: Record<
    string,
    {
      n: number;
      e: [string, string];
      s: { qui: string; montant: number | null; annee: string; objet: string; rna: string }[];
    }
  >;
};
const subvDep = new Map<string, SubvDep | null>();

/**
 * Ce que rapportent les droits de mutation, et à qui.
 *
 * Un fichier national : cent une lignes de deux séries pèsent moins qu'une
 * requête de plus.
 */
type DmtoNational = {
  annees: number[];
  maj: string;
  /** Code de département -> séries en milliers d'euros. */
  d: Record<string, { dep: (number | null)[]; com: (number | null)[] }>;
};
let dmtoNational: DmtoNational | null = null;

/**
 * Les comptes du département et de la région : mêmes repères qu'à l'échelon
 * communal, pour que les ordres de grandeur se comparent d'un coup d'œil.
 */
type ComptesFichier = {
  annees: number[];
  medianes: (number | null)[];
  /** Combien de collectivités entrent dans chaque médiane. */
  effectifs: number[];
  /** La taille de l'échelon tel que l'OFGL le publie. */
  effectif: number;
  h: Record<string, (number | null)[][]>;
};
type EchelonsFichier = {
  maj: string;
  reperes: { id: string; nom: string }[];
  departements: ComptesFichier | null;
  regions: ComptesFichier | null;
};
let echelons: EchelonsFichier | null = null;

/** Les marchés publics des acheteurs du département, par SIREN. */
type MarchesDep = {
  depuis: string;
  maj: string;
  procedures: string[];
  /** Code INSEE -> SIREN, pour les communes qui ont passé des marchés. */
  com: Record<string, string>;
  h: Record<string, { n: number; m: MarcheBrut[] }>;
};
type MarcheBrut = {
  objet: string;
  montant: number | null;
  date: string;
  procedure: number;
  lots: number;
};
const marchesDep = new Map<string, MarchesDep | null>();

/** Le maire de chaque commune : [prénom, nom, début du mandat en cours]. */
type ElusDep = { maj: string; c: Record<string, [string, string, string]> };
const elusDep = new Map<string, ElusDep | null>();
const servicesDep = new Map<string, ServicesDep | null>();

/**
 * Les flux perçus par les groupements : un seul fichier national, chargé une
 * fois. Il pèse 88 ko et ne dépend pas du département — le découper coûterait
 * plus en requêtes qu'il ne ferait gagner en octets.
 */
interface FichierFlux {
  annees: number[];
  reperes: {
    id: string;
    nom: string;
    explication: string;
    flux?: string;
    mediane: number | null;
    percepteurs: number;
  }[];
  h: Record<string, (number | null)[][]>;
}
let fluxGfp: FichierFlux | null = null;

/** Les strates de population, dans le même ordre qu'à l'ingestion. */
const BORNES = [500, 2000, 10000, 50000, Infinity];

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
}

/** Sans accents ni casse : personne ne tape « Saint-Étienne » correctement. */
export function aplatir(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Normalise pour la comparaison : sans accents ni casse, et « St » développé.
 *
 * 3 885 communes commencent par Saint ou Sainte — plus d'une sur dix. Personne
 * ne les écrit en entier dans un champ de recherche ; ne pas développer
 * l'abréviation revient à rendre ce dixième introuvable.
 */
export function normaliser(s: string): string {
  return aplatir(s)
    .split(' ')
    .map((mot) => (mot === 'st' ? 'saint' : mot === 'ste' ? 'sainte' : mot))
    .join(' ');
}

export async function chargerIndex(): Promise<CommuneBreve[]> {
  if (index) return index;
  const brut = await json<{
    maj: string;
    deps: Record<string, string>;
    c: [string, string, string, string, number][];
  }>(`${BASE}/index.json`);
  index = brut.c.map(([code, nom, cps, dep, population]) => {
    const liste = cps ? cps.split(' ') : [];
    return {
      code,
      nom,
      cp: liste[0] ?? '',
      cps: liste,
      dep,
      depNom: brut.deps[dep] ?? dep,
      population,
    };
  });
  return index;
}

/**
 * Le classement est le cœur du problème : 1 481 noms de communes sont portés
 * par plusieurs communes, soit plus d'une sur dix. Taper « Mayet » doit donner
 * Mayet avant Le Mayet-d'École, et l'affichage doit permettre de trancher entre
 * deux homonymes — d'où le département en toutes lettres et la population.
 */
export async function chercher(requete: string, limite = 8): Promise<CommuneBreve[]> {
  return classer(await chargerIndex(), requete, limite);
}

/**
 * Le classement, isolé du chargement pour être vérifiable hors navigateur.
 * `scripts/verifier-recherche.ts` l'exerce sur l'index réel : une régression de
 * tri est invisible à l'œil et remonterait la mauvaise commune à quelqu'un qui
 * cherche la sienne.
 */
export function classer(liste: CommuneBreve[], requete: string, limite = 8): CommuneBreve[] {
  const q = normaliser(requete);
  if (q.length < 2) return [];
  const parCode = /^\d{2,5}$/.test(q);
  const resultats: { c: CommuneBreve; rang: number }[] = [];
  for (const c of liste) {
    if (parCode) {
      // Cinq chiffres, pour un habitant, c'est un code postal — pas un code
      // INSEE, qui occupe pourtant le même espace de valeurs. Le postal passe
      // donc devant : sans quoi taper 72360 remonte Trangé, dont c'est le code
      // INSEE, avant les communes dont c'est vraiment le code postal.
      if (c.cps.includes(q)) resultats.push({ c, rang: 0 });
      else if (c.cps.some((p) => p.startsWith(q))) resultats.push({ c, rang: 1 });
      else if (c.code === q) resultats.push({ c, rang: 2 });
      else if (c.code.startsWith(q)) resultats.push({ c, rang: 3 });
      continue;
    }
    const { nom, nu } = formesDe(c);
    if (nom === q || nu === q) resultats.push({ c, rang: 0 });
    else if (nom.startsWith(q)) resultats.push({ c, rang: 1 });
    else if (nu && nu.startsWith(q)) resultats.push({ c, rang: 2 });
    else if (nom.includes(q)) resultats.push({ c, rang: 3 });
  }
  return resultats
    .sort(
      (a, b) =>
        a.rang - b.rang ||
        // À rang égal, la plus peuplée d'abord : c'est le plus souvent celle
        // qu'on cherchait, et cela stabilise l'ordre entre homonymes.
        b.c.population - a.c.population ||
        a.c.nom.localeCompare(b.c.nom, 'fr'),
    )
    .slice(0, limite)
    .map((r) => r.c);
}

/**
 * Retrouve une commune par son code INSEE. Utilisé pour les liens partagés et
 * pour réhydrater un choix mémorisé : un code est sans ambiguïté, contrairement
 * à un nom — et tous ne sont pas numériques (2A004, en Corse).
 */
export async function trouverParCode(code: string): Promise<CommuneBreve | null> {
  const deja = index?.find((c) => c.code === code);
  if (deja) return deja;
  // L'index national pèse 1,4 Mo — les deux tiers de tout ce qu'une visite
  // télécharge — et il n'est utile qu'à la recherche par nom. Pour un code
  // déjà connu, le fichier du département suffit : il porte le nom, la
  // population et les codes postaux, et `resoudre` va le charger juste après
  // de toute façon. Reste le nom du département, deux kilo-octets à part.
  const dep = code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
  const [fichier, noms] = await Promise.all([
    (departements.get(dep) as DepStructure | undefined) ??
      json<DepStructure>(`${BASE}/dep/${dep}.json`)
        .then((d) => {
          // Rangé tout de suite : `resoudre` le demande juste après, et le
          // télécharger deux fois annulerait une part de ce qu'on vient de
          // gagner.
          departements.set(dep, d);
          return d;
        })
        .catch(() => null),
    chargerNomsDep(),
  ]);
  const ligne = fichier?.c.find((c) => c[0] === code);
  if (!ligne) {
    // Une commune fusionnée, ou un code inventé : l'index tranche, et lui seul.
    return (await chargerIndex()).find((c) => c.code === code) ?? null;
  }
  const cps = (ligne[4] ?? '').split(' ').filter(Boolean);
  return {
    code: ligne[0],
    nom: ligne[1],
    cp: cps[0] ?? '',
    cps,
    dep,
    depNom: noms[dep] ?? dep,
    population: ligne[2],
  };
}

/** Les noms de département, deux kilo-octets, chargés une fois. */
let nomsDep: Record<string, string> | null = null;
async function chargerNomsDep(): Promise<Record<string, string>> {
  nomsDep ??= await json<Record<string, string>>(`${BASE}/deps.json`).catch(() => ({}));
  return nomsDep;
}

export async function resoudre(commune: CommuneBreve): Promise<Territoire> {
  meta ??= await json(`${BASE}/meta.json`);
  // Absent tant qu'aucun repère ne se mesure sur un groupement : le site doit
  // continuer à fonctionner sans, pas échouer.
  fluxGfp ??= await json<FichierFlux>(`${BASE}/flux.json`).catch(() => null);
  dmtoNational ??= await json<DmtoNational>(`${BASE}/dmto.json`).catch(() => null);
  echelons ??= await json<EchelonsFichier>(`${BASE}/echelons.json`).catch(() => null);
  if (!depComplets.has(commune.dep)) {
    // Les deux fichiers en parallèle : ils concernent le même département et
    // arrivent ensemble, plutôt que l'un après l'autre.
    const [structure, argent, eau, servs, ecoles, elus, mar, inv, risq, scr, del, sub, asso, pop, cons] =
      await Promise.all([
      departements.get(commune.dep) ?? json(`${BASE}/dep/${commune.dep}.json`),
      json<{ annee: number; annees: number[]; h: Record<string, (number | null)[][]> }>(
        `${BASE}/dep/${commune.dep}-finances.json`,
      ).catch(() => null),
      json<{ annee: number; c: Record<string, [number | null, string, string, string]> }>(
        `${BASE}/dep/${commune.dep}-eau.json`,
      ).catch(() => null),
      json<ServicesDep>(`${BASE}/dep/${commune.dep}-services.json`).catch(() => null),
      json<EcolesDep>(`${BASE}/dep/${commune.dep}-ecoles.json`).catch(() => null),
      json<ElusDep>(`${BASE}/dep/${commune.dep}-elus.json`).catch(() => null),
      json<MarchesDep>(`${BASE}/dep/${commune.dep}-marches.json`).catch(() => null),
      json<SruDep>(`${BASE}/dep/${commune.dep}-sru.json`).catch(() => null),
      json<RisquesDep>(`${BASE}/dep/${commune.dep}-risques.json`).catch(() => null),
      json<ElectionsDep>(`${BASE}/dep/${commune.dep}-elections.json`).catch(() => null),
      json<DelibDep>(`${BASE}/dep/${commune.dep}-deliberations.json`).catch(() => null),
      json<SubvDep>(`${BASE}/dep/${commune.dep}-subventions.json`).catch(() => null),
      json<AssoDep>(`${BASE}/dep/${commune.dep}-associations.json`).catch(() => null),
      json<PopDep>(`${BASE}/dep/${commune.dep}-population.json`).catch(() => null),
      json<ConseilsDep>(`${BASE}/dep/${commune.dep}-conseils.json`).catch(() => null),
    ]);
    departements.set(commune.dep, structure);
    financesDep.set(commune.dep, argent);
    eauDep.set(commune.dep, eau);
    servicesDep.set(commune.dep, servs);
    ecolesDep.set(commune.dep, ecoles);
    elusDep.set(commune.dep, elus);
    marchesDep.set(commune.dep, mar);
    sruDep.set(commune.dep, inv);
    risquesDep.set(commune.dep, risq);
    electionsDep.set(commune.dep, scr);
    delibDep.set(commune.dep, del);
    subvDep.set(commune.dep, sub);
    assoDep.set(commune.dep, asso);
    popDep.set(commune.dep, pop);
    conseilsDep.set(commune.dep, cons);
    depComplets.add(commune.dep);
  }
  const dep = departements.get(commune.dep) as DepStructure;
  const ligne = dep.c.find((c) => c[0] === commune.code);
  if (!ligne) throw new Error(`commune absente du département : ${commune.code}`);

  const structures: Structure[] = ligne[3].map((i) => {
    const [siren, nom, nature, codes] = dep.g[i];
    const competences = [...new Set(codes.flatMap((c) => meta!.codes[c] ?? []))].sort();
    return { siren, nom, nature, natureLibelle: meta!.natures[nature] ?? nature, competences };
  });

  const parCompetence = new Map<string, Structure[]>();
  for (const s of structures) {
    for (const c of s.competences) {
      if (!parCompetence.has(c)) parCompetence.set(c, []);
      parCompetence.get(c)!.push(s);
    }
  }

  /**
   * On ne conclut « la commune » que si le registre est renseigné pour ce
   * département. Le repère est la couverture nationale : un département qui
   * décroche nettement signale un trou de saisie, pas 350 communes qui auraient
   * gardé la compétence.
   */
  // La décision elle-même est dans `src/modele/verdict.ts` : la page statique
  // de chaque commune la consulte aussi, et deux copies finiraient par se
  // contredire. Ici on ne fait que rassembler ce dont elle a besoin.
  const verdict = (competence: string): Verdict =>
    verdictDe({
      exercants: parCompetence.get(competence) ?? [],
      structures,
      obligatoirePour: meta!.obligatoires?.[competence] ?? [],
      aDefaut: meta!.aDefaut?.[competence],
      region: meta!.regions?.[commune.dep],
      departement: commune.depNom,
      couvertureDep: dep.couverture?.[competence] ?? 0,
      couvertureNationale: meta!.couverture?.[competence] ?? 0,
    });

  return {
    commune,
    population: ligne[2],
    structures,
    parCompetence,
    verdict,
    reserve: (c: string) => meta!.reserves?.[c] ?? null,
    finances: assemblerFinances(commune, ligne[2]),
    eau: assemblerEau(commune),
    services: assemblerServices(commune),
    comptesEchelons: assemblerEchelons(commune),
    echelonsMaj: echelons?.maj ?? null,
    dmto: assemblerDmto(commune, ligne[2]),
    risques: assemblerRisques(commune),
    associations: assemblerAssociations(commune, ligne[2]),
    histoire: assemblerPopulation(commune),
    conseil: assemblerConseil(commune),
    scrutin: assemblerScrutin(commune, structures),
    deliberations: assemblerDeliberations(commune, structures),
    delibDepuis: delibDep.get(commune.dep)?.depuis ?? null,
    subventions: assemblerSubventions(commune, structures),
    subventionsSeuil: subvDep.get(commune.dep)?.seuil ?? null,
    sru: sruDep.get(commune.dep)?.c[commune.code] ?? null,
    sruMaj: sruDep.get(commune.dep)?.maj ?? null,
    marches: assemblerMarches(commune, structures),
    marchesDepuis: marchesDep.get(commune.dep)?.depuis ?? null,
    maire: assemblerMaire(commune),
    majElus: elusDep.get(commune.dep)?.maj ?? null,
    fluxPercus: assemblerFluxPercus(structures),
    anneesFlux: fluxGfp?.annees ?? [],
    maj: dep.maj,
  };
}

/**
 * Les marchés de la commune, puis ceux de chacun de ses groupements.
 *
 * L'ordre n'est pas neutre : la commune d'abord, parce que c'est d'elle qu'on
 * part, puis les syndicats, qui sont souvent ceux qui dépensent le plus et que
 * personne ne pense à regarder. Le syndicat d'eau de Mayet a passé un marché à
 * bons de commande de 2 M€ que la commune n'aurait jamais porté seule.
 */
function assemblerMarches(commune: CommuneBreve, structures: Structure[]): AcheteurMarches[] {
  const d = marchesDep.get(commune.dep);
  if (!d) return [];
  const out: AcheteurMarches[] = [];
  const lire = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.m.length === 0) return;
    out.push({
      siren,
      nom,
      natureLibelle,
      total: e.n,
      liste: e.m.map((m) => ({
        objet: m.objet,
        montant: m.montant,
        date: m.date,
        procedure: d.procedures[m.procedure] ?? null,
        lots: m.lots,
      })),
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lire(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lire(s.siren, s.nom, s.natureLibelle);
  return out;
}

/** « La région — Centre-Val de Loire » : `meta.json` la nomme par département. */
function nomRegion(commune: CommuneBreve): string {
  const nom = meta?.regions?.[commune.dep];
  return nom ? `La région — ${nom}` : 'La région';
}

/**
 * Ce que la commune et ses groupements versent aux associations.
 *
 * Même jointure par SIREN que les marchés et les délibérations : le club
 * subventionné par l'agglomération l'est autant que celui subventionné par la
 * commune, et personne ne pense à aller le chercher là-bas.
 */
function assemblerSubventions(
  commune: CommuneBreve,
  structures: Structure[],
): CollectiviteSubventionne[] {
  const d = subvDep.get(commune.dep);
  if (!d) return [];
  const out: CollectiviteSubventionne[] = [];
  const lire = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.s.length === 0) return;
    out.push({
      nom,
      natureLibelle,
      total: e.n,
      exercices: e.e,
      liste: e.s.map((x) => ({
        qui: x.qui,
        montant: x.montant,
        annee: x.annee,
        objet: x.objet,
      })),
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lire(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lire(s.siren, s.nom, s.natureLibelle);
  // Le département et sa région viennent en dernier : ils versent le plus, et
  // ce n'est pas d'eux qu'on part quand on cherche sa commune.
  for (const [i, siren] of (d.echelons ?? []).entries()) {
    lire(siren, i === 0 ? `Le département — ${commune.depNom}` : nomRegion(commune), null);
  }
  return out;
}

/**
 * Ce que la commune et ses groupements ont délibéré.
 *
 * Même jointure que les marchés — par SIREN — et pour la même raison : une
 * délibération de la communauté d'agglomération ou du syndicat d'eau engage la
 * commune autant que la sienne, et personne ne pense à aller la chercher.
 */
function assemblerDeliberations(
  commune: CommuneBreve,
  structures: Structure[],
): CollectiviteDelibere[] {
  const d = delibDep.get(commune.dep);
  if (!d) return [];
  const out: CollectiviteDelibere[] = [];
  const lire = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.d.length === 0) return;
    out.push({
      nom,
      natureLibelle,
      total: e.n,
      familles: (e.f ?? [])
        .map((nombre, i) => ({ nom: d.familles[i] ?? '', nombre }))
        .filter((f) => f.nombre > 0 && f.nom)
        .sort((a, b) => b.nombre - a.nombre)
        .slice(0, 3),
      liste: e.d.map((x) => ({
        date: x.date,
        famille: d.familles[x.famille] ?? null,
        objet: x.objet,
        url: x.url,
      })),
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lire(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lire(s.siren, s.nom, s.natureLibelle);
  for (const [i, siren] of (d.echelons ?? []).entries()) {
    lire(siren, i === 0 ? `Le département — ${commune.depNom}` : nomRegion(commune), null);
  }
  return out;
}

/**
 * Le dernier scrutin municipal de la commune.
 *
 * Les deux tours quand il y en a eu deux ; dans 1 526 communes seulement. Les
 * médianes nationales voyagent avec, parce qu'un taux de participation seul ne
 * se discute pas — 57 % n'est ni bon ni mauvais tant qu'on ignore que la
 * médiane est à 63 %.
 */
/**
 * Les natures dont le conseil est élu au suffrage fléché. Un syndicat n'en est
 * pas : ses délégués sont désignés par les conseils municipaux, et parler de
 * sièges à son propos serait faux.
 */
const FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'SAN', 'EPT']);

function assemblerScrutin(commune: CommuneBreve, structures: Structure[]): Scrutin | null {
  const d = electionsDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  // L'intercommunalité à fiscalité propre, et il n'y en a qu'une : c'est la
  // seule dont le conseil est élu au suffrage fléché.
  const conseil = structures.find((st) => FISCALITE_PROPRE.has(st.nature));
  const tour = (numero: number, t: (typeof f)['t1'] | undefined) => {
    if (!t) return null;
    const m = d.medianes[numero - 1];
    return {
      numero,
      inscrits: t.inscrits,
      votants: t.votants,
      refus: t.refus,
      listes: t.listes,
      medianeParticipation: m?.participation ?? 0,
      medianeRefus: m?.refus ?? 0,
    };
  };
  const tours = [tour(1, f.t1), tour(2, f.t2)].filter((t): t is NonNullable<typeof t> => !!t);
  if (tours.length === 0) return null;
  return {
    nom: d.scrutin,
    tours,
    sieges: f.cm,
    siegesCc: f.cc,
    conseilCc: conseil?.nom ?? null,
    ccDesignes: f.cc === 0 && !!conseil,
    partListeUnique: d.listeUnique,
    maj: d.maj,
  };
}

/**
 * Les risques majeurs de la commune.
 *
 * Rien n'est assemblé quand le fichier ne dit rien d'elle : une commune sans
 * risque recensé, sans arrêté et sans plan n'a pas de bloc — mieux vaut ne
 * rien écrire que « aucun risque », que le site n'est pas en mesure d'affirmer.
 */
function assemblerRisques(commune: CommuneBreve): Risques | null {
  const d = risquesDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const catnat = f.catnat.map(([i, n, date]) => ({
    nom: d.jo[i] ?? '',
    nombre: n,
    dernier: date,
  }));
  return {
    recenses: f.ddrm
      .map(([i, sous]) => ({
        nom: d.risques[i] ?? '',
        sous: sous.map((j) => d.risques[j] ?? '').filter(Boolean),
      }))
      .filter((r) => r.nom),
    catnat,
    totalCatnat: catnat.reduce((a, b) => a + b.nombre, 0),
    medianeCatnat: d.mediane,
    plans: f.ppr.map((p) => ({
      modele: d.modeles[p.m] ?? '',
      nom: p.nom,
      etat: d.etats[p.e] ?? '',
      date: p.date,
    })),
    dicrim: f.dicrim ?? null,
    maj: d.maj,
  };
}

/**
 * Ce qui se crée en associations dans la commune.
 *
 * Rien n'est assemblé là où il ne s'est rien créé sur la fenêtre : « zéro »
 * serait exact mais illisible — c'est le cas de près d'une commune sur cinq, et
 * le plus souvent d'une commune de deux cents habitants. La médiane, elle, les
 * compte : elle porte sur toutes les communes peuplées, silences compris.
 */
function assemblerAssociations(commune: CommuneBreve, population: number): Associations | null {
  const d = assoDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  return {
    total: f.n,
    annees: d.annees,
    parAnnee: f.a,
    domaines: f.d.map(([i, n]) => ({ nom: d.domaines[i] ?? '', nombre: n })).filter((x) => x.nom),
    recentes: f.r.map(([mois, titre, dom]) => ({
      mois,
      titre,
      domaine: dom >= 0 ? (d.domaines[dom] ?? null) : null,
    })),
    taux: population > 0 ? (f.n / population) * 1000 : 0,
    medianeTaux: d.mediane,
    maj: d.maj,
  };
}

/**
 * La suite de la liste des marchés d'un acheteur, chargée quand on la demande.
 *
 * Le fichier du département ne porte que les cinq plus récents de chacun :
 * emporter les quatre cent huit marchés de la communauté d'agglomération avec
 * le reste du panneau ferait payer à tout le monde ce que peu de gens ouvrent.
 * Le fichier par acheteur ne descend donc qu'au clic, et une fois.
 *
 * Les libellés de procédure viennent du fichier du département, déjà chargé :
 * c'est lui qui a affiché les cinq premiers.
 */
const suitesMarches = new Map<string, Marche[]>();

export async function suiteMarches(dep: string, siren: string): Promise<Marche[]> {
  const deja = suitesMarches.get(siren);
  if (deja) return deja;
  const procedures = marchesDep.get(dep)?.procedures ?? [];
  const f = await json<{ m: MarcheBrut[] }>(`${BASE}/marches/${siren}.json`).catch(() => null);
  const liste = (f?.m ?? []).map((m) => ({
    objet: m.objet,
    montant: m.montant,
    date: m.date,
    procedure: procedures[m.procedure] ?? null,
    lots: m.lots,
  }));
  // Un échec n'est pas mis en mémoire : aucun fichier n'est écrit vide, donc
  // une liste vide ne peut venir que d'une requête ratée, et la retenir
  // condamnerait le bouton pour le reste de la visite.
  if (liste.length > 0) suitesMarches.set(siren, liste);
  return liste;
}

/**
 * Le seuil de 5 000 habitants décide du destinataire de la part communale.
 *
 * Au-dessus, l'article 1584 la verse à la commune ; au-dessous, l'article
 * 1595 bis l'oriente vers un fonds départemental. Les stations de tourisme
 * classées font exception et relèvent du premier régime quelle que soit leur
 * taille — le site ne connaît pas ce classement, et le dit plutôt que de
 * l'ignorer.
 */
const SEUIL_PART_COMMUNALE = 5000;

/**
 * Les comptes du département puis ceux de la région.
 *
 * Dans cet ordre : le département est celui qu'on touche le plus souvent sans
 * le savoir, et c'est de lui qu'on part quand on remonte d'une commune.
 */
function assemblerEchelons(commune: CommuneBreve): ComptesEchelon[] {
  const e = echelons;
  if (!e) return [];
  const out: ComptesEchelon[] = [];
  const lire = (c: ComptesFichier | null, code: string | undefined, nom: string) => {
    if (!c || !code) return;
    const series = c.h[code];
    if (!series) return;
    const dernier = c.annees.length - 1;
    out.push({
      nom,
      annees: c.annees,
      effectif: c.effectif,
      reperes: e.reperes.map((r, i) => {
        const serie = series[i] ?? [];
        return {
          ...r,
          // Les explications de `reperes.yaml` parlent de la commune : elles
          // seraient fausses ici, et le bloc dit lui-même ce qu'il montre.
          explication: '',
          valeur: serie[dernier] ?? null,
          mediane: c.medianes[i] ?? null,
          effectif: c.effectifs?.[i] ?? c.effectif,
          serie,
          evolution: variation(serie),
        };
      }),
    });
  };
  lire(e.departements, commune.dep, `Le département — ${commune.depNom}`);
  // Le nom pour l'afficher, le code pour retrouver la ligne de comptes :
  // `meta.json` porte les deux, département par département.
  const nomRegion = meta?.regions?.[commune.dep];
  const codeRegion = meta?.codesRegion?.[commune.dep];
  if (nomRegion) lire(e.regions, codeRegion, `La région — ${nomRegion}`);
  return out;
}

function assemblerDmto(commune: CommuneBreve, population: number): Dmto | null {
  const n = dmtoNational;
  if (!n) return null;
  const s = n.d[commune.dep];
  if (!s) return null;
  // Le fichier est en milliers d'euros : on rend des euros, le rendu décidera
  // de l'échelle à afficher.
  const enEuros = (l: (number | null)[]) => l.map((v) => (v === null ? null : v * 1000));
  return {
    annees: n.annees,
    departement: enEuros(s.dep),
    communes: enEuros(s.com),
    partDirecte: population > SEUIL_PART_COMMUNALE,
    maj: n.maj,
  };
}

function assemblerMaire(commune: CommuneBreve): Maire | null {
  const l = elusDep.get(commune.dep)?.c[commune.code];
  if (!l) return null;
  const [prenom, nom, depuis] = l;
  return { prenom, nom, depuis };
}

/**
 * Ce que perçoit l'intercommunalité, structure par structure.
 *
 * Une commune relève de plusieurs groupements — sa communauté, un syndicat de
 * déchets, un syndicat d'énergie. On interroge chacun : c'est celui qui perçoit
 * qui répond, et il est nommé, parce que « votre intercommunalité » ne dit pas
 * à qui écrire.
 */
function assemblerFluxPercus(structures: Structure[]): FluxPercu[] {
  if (!fluxGfp) return [];
  const out: FluxPercu[] = [];
  for (const [i, r] of fluxGfp.reperes.entries()) {
    for (const s of structures) {
      const serie = fluxGfp.h[s.siren]?.[i];
      if (!serie) continue;
      const valeur = serie[serie.length - 1];
      // Une série qui s'arrête avant le dernier exercice ne se lit pas comme un
      // zéro : le groupement a pu cesser de percevoir, ou fusionner.
      if (valeur === null || valeur === undefined) continue;
      out.push({
        nom: r.nom,
        explication: r.explication,
        structure: s.nom,
        natureLibelle: s.natureLibelle,
        valeur,
        mediane: r.mediane,
        percepteurs: r.percepteurs,
        serie,
        evolution: variation(serie),
      });
      break;
    }
  }
  return out;
}

/** Le service d'eau qui dessert la commune, avec son prix et son mode de gestion. */
export function assemblerServices(commune: CommuneBreve): Services | null {
  const m = meta?.services;
  const dep = servicesDep.get(commune.dep);
  if (!m || !dep) return null;
  const parFamille = new Map<string, ServicePublic[]>();
  // L'ordre des familles est celui des métadonnées : le fichier départemental
  // ne transporte qu'un index, ce qui évite de répéter 80 000 fois « ecole ».
  const ecoles = ecolesDep.get(commune.dep);
  for (const entree of dep.c[commune.code] ?? []) {
    const [i, nom, drapeau] = entree;
    const uai = entree.length === 4 ? entree[3] : undefined;
    const famille = m.familles[i];
    if (!famille) continue;
    if (!parFamille.has(famille)) parFamille.set(famille, []);
    const serie = uai && ecoles ? ecoles.h[uai] : undefined;
    parFamille.get(famille)!.push({
      famille,
      nom,
      prive: famille === 'sante' ? false : drapeau === 1,
      urgences: famille === 'sante' && drapeau === 1,
      ...(serie
        ? {
            ecole: {
              rentrees: ecoles!.rentrees,
              classes: serie[0],
              eleves: serie[1],
              dernierChangement: dernierChangement(serie[0], ecoles!.rentrees),
            },
          }
        : {}),
    });
  }
  // Les urgences en tête : c'est l'établissement qu'on cherche quand on
  // cherche vite, et il ne doit pas dépendre de l'ordre alphabétique.
  for (const l of parFamille.values()) {
    l.sort((a, b) => Number(b.urgences) - Number(a.urgences) || a.nom.localeCompare(b.nom, 'fr'));
  }
  const voisines = new Map<string, { nombre: number; communes: string[] }>();
  for (const [famille, brut] of Object.entries(dep.v?.[commune.code] ?? {})) {
    if (brut.n > 0) voisines.set(famille, { nombre: brut.n, communes: brut.l ?? [] });
  }
  const services: Services = {
    parFamille,
    voisines,
    sdis: dep.sdis ?? m.sdis?.[commune.dep] ?? null,
    maj: dep.maj,
  };
  const vide = parFamille.size === 0 && voisines.size === 0 && services.sdis === null;
  return vide ? null : services;
}

function assemblerEau(commune: CommuneBreve): ServiceEau | null {
  const m = meta?.eau;
  const dep = eauDep.get(commune.dep);
  const v = m && dep ? dep.c[commune.code] : undefined;
  if (!m || !dep || !v) return null;
  const [prix, nom, gestion, operateur] = v;
  return {
    prix,
    nom,
    gestion,
    operateur,
    annee: dep.annee,
    median: m.prixMedian,
    competence: m.competence,
  };
}

/**
 * Un montant brut ne dit rien : chaque repère est donc accompagné de la médiane
 * des communes de taille voisine. Comparer un village à une ville produirait un
 * écart spectaculaire et vide de sens.
 */
function assemblerFinances(commune: CommuneBreve, population: number): Finances | null {
  const m = meta?.finances;
  const dep = financesDep.get(commune.dep);
  if (!m || !dep) return null;
  const series = dep.h[commune.code];
  if (!series) return null;
  const strate = BORNES.findIndex((b) => population < b);
  const particulier = m.statutParticulier?.[commune.code];
  const annees = dep.annees ?? m.annees ?? [dep.annee];
  return {
    annee: dep.annee,
    annees,
    strate: m.strates[strate] ?? '',
    statutParticulier: particulier,
    reperes: m.reperes.map((r, i) => {
      const serie = series[i] ?? [];
      return {
        ...r,
        // Le dernier exercice est la dernière valeur de la série.
        valeur: serie.length > 0 ? (serie[serie.length - 1] ?? null) : null,
        // Pas de médiane quand la comparaison n'a pas de sens.
        mediane: particulier ? null : (m.medianes[strate]?.[i] ?? null),
        serie,
        evolution: variation(serie),
      };
    }),
  };
}

/**
 * La dernière fois que le nombre de classes a bougé.
 *
 * C'est le fait, et le site s'en tient là : « une classe de moins à la rentrée
 * 2025 ». Pourquoi, personne ne le publie — ni les seuils d'ouverture appliqués
 * cette année-là, ni l'arbitrage du rectorat. Prétendre l'expliquer serait
 * inventer ; le taire serait cacher ce qui est vérifiable.
 */
export function dernierChangement(
  classes: (number | null)[],
  rentrees: number[],
): { rentree: number; ecart: number } | null {
  let precedent: number | null = null;
  let trouve: { rentree: number; ecart: number } | null = null;
  for (const [i, v] of classes.entries()) {
    if (v === null) continue;
    // Une rentrée manquante au milieu ne fabrique pas un saut : on compare au
    // dernier chiffre connu, pas à la case précédente.
    if (precedent !== null && v !== precedent) {
      trouve = { rentree: rentrees[i], ecart: v - precedent };
    }
    precedent = v;
  }
  return trouve;
}

/**
 * L'écart entre le premier et le dernier exercice renseignés.
 *
 * On refuse de conclure sur moins de trois points : deux valeurs isolées à huit
 * ans d'écart peuvent tenir à un investissement exceptionnel plutôt qu'à une
 * tendance. Et une série qui part de zéro n'a pas de pourcentage — « +∞ % » ne
 * veut rien dire.
 */
export function variation(serie: (number | null)[]): number | null {
  const points = serie.filter((v): v is number => v !== null);
  if (points.length < 3) return null;
  const debut = points[0];
  const fin = points[points.length - 1];
  if (debut === 0) return null;
  return Math.round(((fin - debut) / Math.abs(debut)) * 100);
}



/* --- mémoire du choix : on ne redemande pas sa commune à chaque visite --- */

export function memoriser(c: CommuneBreve | null): void {
  try {
    if (c) localStorage.setItem(CLE_MEMOIRE, JSON.stringify(c));
    else localStorage.removeItem(CLE_MEMOIRE);
  } catch {
    // Navigation privée, stockage refusé : le choix vaut pour la session, c'est tout.
  }
}

export function memorisee(): CommuneBreve | null {
  try {
    const brut = localStorage.getItem(CLE_MEMOIRE);
    return brut ? (JSON.parse(brut) as CommuneBreve) : null;
  } catch {
    return null;
  }
}
