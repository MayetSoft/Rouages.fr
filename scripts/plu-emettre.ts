/**
 * Ce qui s'applique aujourd'hui, et ce qui va s'appliquer.
 *
 * L'enquête SuDocUH dit quel document d'urbanisme couvre chaque commune, mais
 * elle est annuelle : elle connaît les approbations jusqu'à sa clôture et pas
 * au-delà. Le Géoportail de l'urbanisme, lui, est alimenté au fil de l'eau par
 * les collectivités elles-mêmes. Les deux ne disent pas la même chose, et
 * l'écart est précisément ce qu'un habitant a besoin de savoir.
 *
 * Le standard CNIG distingue deux états que le langage courant confond :
 *
 *   — **03, « opposable »** : le document est approuvé *et* a fait l'objet de
 *     toutes les transmissions et publicités nécessaires. C'est lui qui fonde
 *     un permis aujourd'hui ;
 *   — **07, « approuvé »** : la délibération d'approbation est prise, mais ces
 *     formalités ne sont pas achevées. Le document ne s'applique pas encore.
 *
 * Le Mayet-de-Montagne est le cas d'école : SuDocUH donne un document
 * intercommunal approuvé le 31 mars 2022, et le Géoportail un plan
 * intercommunal de Vichy Communauté approuvé le 8 janvier 2026 mais encore à
 * l'état 07. Dire « le plan de 2026 s'applique » serait faux ; ne rien dire
 * laisserait un habitant préparer son projet sur un texte en sursis.
 *
 * **Le périmètre réel d'un plan intercommunal** est l'autre apport. Le plan de
 * Vichy Communauté ne couvre que quinze des trente-neuf communes du
 * groupement : le suffixe du nom de document — `_A` dans
 * `200071363_PLUi_20260108_A` — marque justement les cas où plusieurs plans
 * coexistent dans un même périmètre. Aucune page officielle ne dit à une
 * commune si le plan « de son intercommunalité » la concerne.
 *
 * **Ce que cette collecte ne fait pas, et ce qu'il en coûterait.** La couche
 * `zone_urba` porte, zone par zone, le libellé long et jusqu'à la page du
 * règlement qui la décrit — `200071363_reglement_20260108_A.pdf#page=38`. Elle
 * compte 1 341 261 entités, soit environ 1,1 Mo par page de cinq mille et
 * quelque 290 Mo en tout ; la pagination profonde met une vingtaine de
 * secondes par page. C'est faisable et ce n'est pas gratuit : à faire quand le
 * site saura quoi en montrer, sachant qu'un zonage se rapporte au document et
 * non à la commune — sans géométrie, on ne peut pas dire laquelle de ces zones
 * couvre une adresse, et le prétendre serait pire que se taire.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCUMENTS } from '../src/modele/urbanisme.ts';

/** Le service de la Géoplateforme qui expose le Géoportail de l'urbanisme. */
const WFS = 'https://data.geopf.fr/wfs/ows';

/** Où le Géoportail sert les pièces écrites, une fois le document connu. */
const ANNEXES = 'https://data.geopf.fr/annexes/gpu/documents';

/** Opposable : approuvé et publié. C'est lui qui fonde un permis aujourd'hui. */
const OPPOSABLE = '03';

/** Approuvé : délibéré, mais les formalités de publicité ne sont pas achevées. */
const APPROUVE = '07';

/** Pagination : au-delà, le service met plusieurs dizaines de secondes. */
const PAGE = 5000;

/**
 * Le Géoportail écrit le même type de deux façons — « PLUI » et « PLUi » — et
 * son vocabulaire n'est pas tout à fait celui du site. On le ramène à celui de
 * `DOCUMENTS`, faute de quoi la page afficherait deux libellés pour une même
 * chose.
 */
function normaliser(brut: string | null): string {
  if (!brut) return '';
  const h = brut.trim().toUpperCase();
  const connu = DOCUMENTS.find((d) => d.toUpperCase() === h);
  return connu ?? '';
}

export interface PluDocument {
  /** Le type, ramené au vocabulaire de `DOCUMENTS`. */
  t: string;
  /** Date d'approbation, AAAA-MM-JJ. */
  d: string;
  /** Combien de communes ce document couvre — un plan intercommunal en couvre plusieurs. */
  n: number;
  /** Adresse du règlement, vide quand le Géoportail n'en publie pas. */
  r: string;
}

export interface PluCommune {
  /**
   * Le document opposable au Géoportail. Collecté pour servir de garde-fou —
   * il n'est pas publié, voir l'en-tête.
   */
  o?: PluDocument;
  /** Le document approuvé mais pas encore opposable, absent s'il n'y en a pas. */
  a?: PluDocument;
}

export interface Plu {
  maj: string;
  communes: Map<string, PluCommune>;
  /** Combien de communes attendent un document approuvé mais pas encore opposable. */
  enAttente: number;
}

interface Entite {
  properties: Record<string, string | null>;
}

/**
 * Lit une couche entière, page par page.
 *
 * `PROPERTYNAME` écarte la géométrie : sans lui, la même requête rapatrie des
 * polygones dont on n'a que faire, et le volume est sans commune mesure.
 */
async function couche(
  nom: string,
  champs: string[],
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Entite[]> {
  const tout: Entite[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const url =
      `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=wfs_du:${nom}&OUTPUTFORMAT=application/json` +
      `&PROPERTYNAME=${champs.join(',')}&COUNT=${PAGE}&STARTINDEX=${debut}`;
    const page = await json<{ features?: Entite[] }>(url);
    const lues = page.features ?? [];
    tout.push(...lues);
    if (lues.length < PAGE) break;
  }
  dire(`Géoportail de l’urbanisme : ${tout.length.toLocaleString('fr-FR')} lignes dans « ${nom} ».`);
  return tout;
}

/**
 * AAAAMMJJ du Géoportail en date civile.
 *
 * Le champ n'est pas contrôlé à la saisie : le fichier porte des `00000000`,
 * un `08040101` et une approbation datée de 2035. Une date hors de portée est
 * traitée comme absente plutôt que recopiée.
 */
function enIso(brut: string | null): string {
  if (!brut || !/^\d{8}$/.test(brut)) return '';
  const an = Number(brut.slice(0, 4));
  if (an < 1960 || an > new Date().getUTCFullYear() + 1) return '';
  const mois = Number(brut.slice(4, 6));
  const jour = Number(brut.slice(6));
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return '';
  return `${brut.slice(0, 4)}-${brut.slice(4, 6)}-${brut.slice(6)}`;
}

export async function collecterPlu(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Plu | null> {
  const documents = await couche(
    'doc_urba',
    ['partition', 'idurba', 'typedoc', 'datappro', 'etat', 'nomreg'],
    json,
    dire,
  );
  const couvertures = await couche('doc_urba_com', ['partition', 'idurba', 'insee'], json, dire);
  // La table « document » porte l'identifiant interne sans lequel les pièces
  // écrites ne sont pas adressables : l'adresse du règlement s'écrit
  // <annexes>/<partition>/<identifiant>/<nom du fichier>.
  const dossiers = await couche('document', ['partition', 'id'], json, dire);

  if (documents.length === 0 || couvertures.length === 0) {
    dire('Géoportail de l’urbanisme : aucune donnée exploitable.');
    return null;
  }

  const identifiant = new Map<string, string>();
  for (const d of dossiers) {
    const p = d.properties.partition;
    if (p && d.properties.id) identifiant.set(p, d.properties.id);
  }

  // Combien de communes chaque document couvre, et lesquelles.
  //
  // La clé est `idurba`, jamais `partition`. Une partition est un **lot de
  // dépôt**, pas un document : la direction départementale des territoires de
  // l'Allier a versé cent trente-neuf documents sous la seule `DU_03053`.
  // Joindre là-dessus faisait d'une carte communale de 2016 un document
  // couvrant cent vingt-neuf communes — et l'attribuait au Mayet-de-Montagne,
  // qui relève d'un plan intercommunal.
  const couvertes = new Map<string, Set<string>>();
  for (const c of couvertures) {
    const id = c.properties.idurba;
    const insee = c.properties.insee;
    if (!id || !insee) continue;
    const l = couvertes.get(id);
    if (l) l.add(insee);
    else couvertes.set(id, new Set([insee]));
  }

  const communes = new Map<string, PluCommune>();
  let enAttente = 0;

  for (const etat of [OPPOSABLE, APPROUVE]) {
    for (const d of documents) {
      if (d.properties.etat !== etat) continue;
      const id = d.properties.idurba;
      const p = d.properties.partition;
      if (!id || !p) continue;
      const liste = couvertes.get(id);
      if (!liste) continue;

      const nomreg = d.properties.nomreg ?? '';
      const dossier = identifiant.get(p);
      const type = normaliser(d.properties.typedoc);
      if (!type) continue;
      const doc: PluDocument = {
        t: type,
        d: enIso(d.properties.datappro),
        n: liste.size,
        r: nomreg && dossier ? `${ANNEXES}/${p}/${dossier}/${nomreg}` : '',
      };

      for (const insee of liste) {
        const f = communes.get(insee) ?? {};
        // Une commune peut relever de plusieurs documents du même état — un
        // plan communal et un plan intercommunal déposés à des dates
        // différentes. À état égal, le plus récemment approuvé l'emporte.
        const place = etat === OPPOSABLE ? 'o' : 'a';
        const dejaLa = f[place];
        if (dejaLa && dejaLa.d >= doc.d) continue;
        f[place] = doc;
        communes.set(insee, f);
      }
    }
  }

  // Un document seulement approuvé n'est une nouvelle que s'il est postérieur
  // à l'opposable : sinon c'est une trace ancienne, pas une échéance. Et une
  // date illisible ne permet rien d'en dire.
  for (const [insee, f] of communes) {
    if (f.a && !f.a.d) delete f.a;
    if (f.a && f.o && f.a.d <= f.o.d) delete f.a;
    if (f.a) enAttente++;
    if (!f.o && !f.a) communes.delete(insee);
  }

  dire(
    `Géoportail de l’urbanisme : ${communes.size.toLocaleString('fr-FR')} communes situées, ` +
      `dont ${enAttente.toLocaleString('fr-FR')} avec un document approuvé mais pas encore opposable.`,
  );

  return { maj: new Date().toISOString().slice(0, 10), communes, enAttente };
}

/**
 * N'écrit que ce dont on peut répondre.
 *
 * Le Géoportail sert ici une seule chose : **un document approuvé que SuDocUH
 * ne pouvait pas connaître**. L'enquête dit elle-même jusqu'à quelle date elle
 * a vu les approbations ; au-delà, elle est muette par construction, et ce que
 * le Géoportail ajoute est une nouvelle. En deçà, les deux sources ont eu la
 * même occasion de voir le document et n'en disent pas la même chose — sans
 * moyen de trancher, le site se tait plutôt que de choisir.
 *
 * Le filtre coûte cher et c'est voulu : sur les 7 535 communes que le
 * Géoportail porte à l'état « approuvé », il en reste environ 4 900. Les
 * autres sont des lignes jamais repassées à l'état « opposable » — le fichier
 * en compte encore des dizaines datées d'avant 2015.
 */
export function ecrirePlu(
  sortie: string,
  dep: string,
  codes: string[],
  p: Plu,
  horizonSudocuh: string,
): number {
  const c: Record<string, { a: PluDocument }> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = p.communes.get(code);
    if (!f?.a) continue;
    if (horizonSudocuh && f.a.d <= horizonSudocuh) continue;
    c[code] = { a: f.a };
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(join(sortie, 'dep', `${dep}-plu.json`), JSON.stringify({ maj: p.maj, c }));
  return n;
}
