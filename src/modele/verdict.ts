/**
 * Qui exerce une compétence sur un territoire donné.
 *
 * Cette fonction est le cœur éditorial du site, et elle vit ici — hors du
 * client — parce que deux rendus la consultent désormais : le panneau
 * interactif de la carte, et la page statique de chaque commune. Si chacun
 * gardait sa copie, ils finiraient par se contredire, et la page indexée par
 * les moteurs dirait autre chose que le panneau. Une même question doit
 * recevoir une même réponse, quel que soit le chemin par lequel on arrive.
 *
 * Cinq états, dans un ordre qui n'est pas négociable :
 *
 * 1. le registre nomme une structure ;
 * 2. sinon, la loi transfère la compétence de plein droit à une catégorie
 *    d'intercommunalité — 54 % seulement des intercommunalités à fiscalité
 *    propre déclarent le développement économique que la loi leur impose
 *    pourtant à toutes depuis 2017, et conclure « la commune » du silence du
 *    registre y était faux une fois sur deux ;
 * 3. sinon, la loi désigne un échelon à défaut — la région pour la mobilité ;
 * 4. sinon, le registre est-il assez renseigné dans ce département pour qu'on
 *    puisse conclure de son silence ? Dans la Sarthe, 15 % des communes ont un
 *    exerçant identifié pour la concession électrique contre 94 % en France :
 *    y répondre « la commune » serait faux avec aplomb ;
 * 5. alors seulement, la commune.
 */

export interface StructureExercante {
  siren: string;
  nom: string;
  /** Code de nature juridique : CC, CU, SIVU, PETR… */
  nature: string;
  natureLibelle: string;
}

export type Verdict =
  | { etat: 'transferee'; structures: StructureExercante[] }
  /** La loi opère le transfert, que le registre l'ait enregistré ou non. */
  | { etat: 'transferee-par-loi'; structures: StructureExercante[] }
  /** Personne ne s'en est saisi localement : la loi nomme qui prend le relais. */
  | { etat: 'a-defaut'; echelon: 'region' | 'departement' | 'etat'; qui: string }
  | { etat: 'communale' }
  | { etat: 'non-renseigne'; couvertureDep: number; couvertureNationale: number };

/** Ce qu'il faut savoir du territoire pour trancher, et rien de plus. */
export interface ContexteVerdict {
  /** Les structures qui exercent cette compétence d'après le registre. */
  exercants: StructureExercante[];
  /** Toutes les structures dont la commune dépend, pour la règle de la loi. */
  structures: StructureExercante[];
  /** Natures d'intercommunalité auxquelles la loi transfère de plein droit. */
  obligatoirePour: string[];
  /** Échelon désigné par la loi à défaut d'exercice local. */
  aDefaut?: 'region' | 'departement' | 'etat';
  /** Nom de la région de la commune, pour pouvoir la nommer. */
  region?: string;
  /** Nom du département, même raison. */
  departement?: string;
  /** Part des communes du département ayant un exerçant identifié. */
  couvertureDep: number;
  /** La même part, au niveau national. */
  couvertureNationale: number;
}

/**
 * Le seuil au-delà duquel le silence du registre devient interprétable.
 *
 * Un département qui couvre moins de la moitié de la moyenne nationale est
 * probablement mal renseigné, pas dépourvu. Et la comparaison n'a de sens que
 * si la moyenne nationale est elle-même significative — d'où la seconde
 * condition. Le cimetière, couvert à 5 % en France parce que la loi impose à
 * chaque commune d'en avoir un, ne déclenche donc jamais ce cas : son silence
 * veut bien dire « la commune ».
 */
const COUVERTURE_SIGNIFICATIVE = 0.5;
const DECROCHAGE = 0.5;

export function verdictDe(c: ContexteVerdict): Verdict {
  if (c.exercants.length > 0) return { etat: 'transferee', structures: c.exercants };

  if (c.obligatoirePour.length > 0) {
    const tenues = c.structures.filter((s) => c.obligatoirePour.includes(s.nature));
    if (tenues.length > 0) return { etat: 'transferee-par-loi', structures: tenues };
  }

  if (c.aDefaut) {
    const qui =
      c.aDefaut === 'region'
        ? (c.region ?? 'la région')
        : c.aDefaut === 'departement'
          ? (c.departement ?? 'le département')
          : "l'État";
    return { etat: 'a-defaut', echelon: c.aDefaut, qui };
  }

  if (
    c.couvertureNationale >= COUVERTURE_SIGNIFICATIVE &&
    c.couvertureDep < c.couvertureNationale * DECROCHAGE
  ) {
    return {
      etat: 'non-renseigne',
      couvertureDep: c.couvertureDep,
      couvertureNationale: c.couvertureNationale,
    };
  }
  return { etat: 'communale' };
}

/**
 * Le verdict en une phrase.
 *
 * Le panneau rend chaque état avec ses nuances ; un signalement d'erreur ou une
 * page statique ont besoin d'une seule ligne. Le compilateur exige de cette
 * fonction qu'elle traite les cinq états, ce qui interdit à un nouvel état
 * d'apparaître sans qu'on décide comment il se dit.
 */
export function resumerVerdict(v: Verdict): string {
  switch (v.etat) {
    case 'transferee':
      return v.structures.map((s) => `${s.nom} (${s.natureLibelle})`).join(' · ');
    case 'transferee-par-loi':
      return (
        v.structures.map((s) => `${s.nom} (${s.natureLibelle})`).join(' · ') +
        ' — transfert prévu de plein droit par la loi'
      );
    case 'a-defaut':
      return `${v.qui} — la loi l'y oblige à défaut`;
    case 'communale':
      return 'la commune (aucun transfert enregistré)';
    case 'non-renseigne':
      return (
        `non renseigné ici — ${Math.round(v.couvertureDep * 100)} % des communes du ` +
        `département ont un exerçant identifié, contre ` +
        `${Math.round(v.couvertureNationale * 100)} % en France`
      );
  }
}

/**
 * D'où sort la réponse.
 *
 * Écrire « d'après BANATIC » sous une réponse que le registre ne contient pas
 * serait une fausse citation — c'est le cas des transferts de plein droit et
 * des compétences exercées à défaut.
 */
export function origineVerdict(v: Verdict, maj: string): string {
  switch (v.etat) {
    case 'transferee':
      return `transferts déclarés à BANATIC, mise à jour ${maj}`;
    case 'transferee-par-loi':
      return `la loi, qui opère le transfert de plein droit ; BANATIC (${maj}) ne l'enregistre pas`;
    case 'a-defaut':
      return `la loi, qui désigne cet échelon à défaut d'exercice local ; BANATIC (${maj}) est muet`;
    case 'communale':
      return `absence de transfert déclaré à BANATIC, mise à jour ${maj}`;
    case 'non-renseigne':
      return `BANATIC (${maj}), incomplet pour ce département`;
  }
}
