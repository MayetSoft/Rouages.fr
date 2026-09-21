/**
 * L'explorateur : la seule page du site, ou presque.
 *
 * Deux états. La **carte** montre tous les acteurs rangés par échelon et ce qui
 * circule entre eux. Le **focus** ouvre un nœud et déplie ses relations.
 *
 * Trois principes de lecture, dans l'ordre d'importance :
 *
 * 1. La couleur ne dit qu'une chose : la famille de relation. Le type d'un nœud
 *    passe par sa forme, son échelon par sa colonne.
 * 2. Survoler une famille éteint les autres. Sur un graphe dense, mettre en
 *    retrait vaut mieux que masquer : la structure d'ensemble reste visible
 *    pendant qu'on lit une couche.
 * 3. Survoler un nœud ne garde que son voisinage. C'est la même idée appliquée
 *    à un point du réseau plutôt qu'à une couche.
 *
 * Pas de bibliothèque, et deux dispositions calculées, non simulées : la même
 * donnée donne toujours la même image, donc elle est citable et comparable.
 */
import type { Reseau, Noeud, TypeArete } from '../modele/reseau.ts';
import {
  famille,
  FAMILLES,
  FLECHEE,
  LIBELLE_ARETE,
  LIBELLE_INVERSE,
  LIBELLE_LIEN,
  LIBELLE_TYPE_NOEUD,
  parPriorite,
  type Famille,
} from '../modele/relations.ts';
import { decalageTexte, formeNoeud, largeurPastille } from '../vues/formes.ts';
import { construireGlossaire, expansions } from '../modele/glossaire.ts';
import { urlSignaler } from '../modele/signalement.ts';
import type { ServicePublic } from './territoire.ts';
import {
  chercher as chercherCommune,
  memorisee,
  memoriser,
  variation,
  resoudre,
  suiteMarches,
  trouverParCode,
  type AcheteurMarches,
  type CommuneBreve,
  type Marche,
  type Territoire,
} from './territoire.ts';

const NS = 'http://www.w3.org/2000/svg';

interface Etat {
  mode: 'carte' | 'focus';
  focus: string | null;
  /** Familles affichées. La légende est la commande. */
  visibles: Set<Famille>;
  /**
   * La famille dépliée dans un voisinage replié. `null` = les grappes.
   * Volontairement hors de l'URL : c'est un état d'affichage, pas un endroit
   * où l'on se trouve, et l'empiler dans l'historique rendrait le bouton
   * Retour imprévisible.
   */
  familleDepliee: Famille | null;
}

interface Boite {
  noeud: Noeud;
  x: number;
  y: number;
  l: number;
  h: number;
}

/**
 * Au-delà d'une poignée de voisins, la couronne devient illisible : « Vous »
 * en compte 41, « La commune » 33, et les étiquettes se recouvrent bien avant.
 * Le voisinage se replie alors en une grappe par famille de relation — cinq
 * nœuds au lieu de quarante — que l'on déplie d'un clic.
 *
 * Le seuil n'est pas une préférence : c'est le nombre au-delà duquel les
 * étiquettes de relation ne tiennent plus sur le pourtour.
 */
const SEUIL_REPLI_VOISINAGE = 14;

const donnees = document.getElementById('donnees-reseau');
if (donnees) demarrer(JSON.parse(donnees.textContent ?? '{}') as Reseau);

/**
 * L'ordre d'affichage, et le pluriel. Un libellé qui compte évite d'écrire
 * « Écoles (1) » — la parenthèse est un aveu de gabarit.
 */
const LIBELLE_FAMILLE: [string, (n: number) => string][] = [
  ['ecole', (n) => (n > 1 ? `${n} écoles` : 'Une école')],
  ['college', (n) => (n > 1 ? `${n} collèges` : 'Un collège')],
  ['lycee', (n) => (n > 1 ? `${n} lycées` : 'Un lycée')],
  ['france-services', (n) => (n > 1 ? `${n} France services` : 'Une France services')],
  ['ccas', () => 'Action sociale'],
  ['sante', (n) => (n > 1 ? `${n} établissements de santé` : 'Un établissement de santé')],
  ['point-justice', (n) => (n > 1 ? `${n} points-justice` : 'Un point-justice')],
];

/**
 * Les familles qu'on signale aussi dans les communes voisines, avec de quoi
 * écrire la phrase : le libellé, et l'article qui s'accorde avec lui.
 */
const VOISINAGE: [string, string, 'un' | 'une'][] = [
  ['france-services', 'France services', 'une'],
  ['point-justice', 'Point-justice', 'un'],
];

/** Au-delà, la liste d'une famille se replie derrière son décompte. */
const SEUIL_REPLI = 6;

function demarrer(reseau: Reseau) {
  const toileEventuelle = document.getElementById('toile') as SVGSVGElement | null;
  const panneauEventuel = document.getElementById('panneau');
  const recherche = document.getElementById('recherche') as HTMLInputElement | null;
  const resultats = document.getElementById('resultats');
  const retour = document.getElementById('retour-carte');
  const aide = document.getElementById('aide');
  const aideFamille = document.getElementById('aide-famille');
  if (!toileEventuelle || !panneauEventuel) return;
  // Réaffectés après le garde : les fonctions déclarées plus bas ne bénéficient
  // pas du rétrécissement de type appliqué au-dessus.
  const toile = toileEventuelle;
  const panneau = panneauEventuel;

  const index = new Map(reseau.noeuds.map((n) => [n.id, n]));
  const glossaire = construireGlossaire(reseau.sigles ?? []);
  /** La résolution territoriale, quand une commune a été choisie. */
  let territoire: Territoire | null = null;
  const etat: Etat = {
    mode: 'carte',
    focus: null,
    visibles: new Set(FAMILLES.map((f) => f.id)),
    familleDepliee: null,
  };
  let vue = { x: 0, y: 0, l: reseau.carte.largeur, h: reseau.carte.hauteur };

  /* ---------------------------------------------------------------- *
   * Fabrication d'éléments SVG
   * ---------------------------------------------------------------- */

  const el = <K extends keyof SVGElementTagNameMap>(
    nom: K,
    attrs: Record<string, string | number> = {},
  ): SVGElementTagNameMap[K] => {
    const e = document.createElementNS(NS, nom);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };

  function dessinerNoeud(b: Boite, role: 'centre' | 'normal' = 'normal'): SVGGElement {
    const g = el('g', {
      class: `n n--${b.noeud.type}${role === 'centre' ? ' n--centre' : ''}`,
      transform: `translate(${b.x - b.l / 2} ${b.y - b.h / 2})`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${LIBELLE_TYPE_NOEUD[b.noeud.type]} : ${b.noeud.nom}`,
      'data-id': b.noeud.id,
    });

    for (const e of formeNoeud(b.noeud.type, b.l, b.h)) g.append(el(e.balise, e.attrs));

    const taille = role === 'centre' ? 15.5 : 13;
    const t = el('text', {
      class: 'n-nom',
      x: b.l / 2 + decalageTexte(b.noeud.type),
      y: b.h / 2 + taille * 0.35,
      'text-anchor': 'middle',
    });
    t.textContent = b.noeud.court;
    g.append(t);

    const titre = el('title');
    const dev = expansions(glossaire, b.noeud.nom, b.noeud.court, b.noeud.resume);
    const local = exercantsLocaux(b.noeud.id);
    titre.textContent = [
      `${b.noeud.nom} — ${b.noeud.resume}`,
      local.length > 0 ? `Chez vous : ${local.map((s) => s.nom).join(', ')}.` : '',
      dev,
    ]
      .filter(Boolean)
      .join(' ');
    g.append(titre);

    // Une pastille pleine marque les compétences résolues sur votre territoire :
    // c'est ce qui distingue « en général » de « chez vous ».
    if (local.length > 0) {
      g.classList.add('n--resolu');
      g.append(el('circle', { class: 'n-resolu', cx: b.l - 11, cy: b.h / 2, r: 3.5 }));
    }

    g.addEventListener('click', () => ouvrir(b.noeud.id));
    g.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        ouvrir(b.noeud.id);
      }
    });
    g.addEventListener('pointerenter', () => eclairerVoisinage(b.noeud.id));
    g.addEventListener('focus', () => eclairerVoisinage(b.noeud.id));
    g.addEventListener('pointerleave', rallumer);
    g.addEventListener('blur', rallumer);
    return g;
  }

  /** Les structures qui exercent réellement cette compétence sur le territoire choisi. */
  function exercantsLocaux(idNoeud: string) {
    return territoire?.parCompetence.get(idNoeud) ?? [];
  }
  void exercantsLocaux;

  function defsFleches(): SVGDefsElement {
    const defs = el('defs');
    for (const f of FAMILLES) {
      if (!FLECHEE[f.id]) continue;
      const m = el('marker', {
        id: `fleche-${f.id}`,
        markerWidth: 9,
        markerHeight: 9,
        refX: 8,
        refY: 3,
        orient: 'auto',
        markerUnits: 'userSpaceOnUse',
      });
      m.append(el('path', { class: `a-pointe--${f.id}`, d: 'M 0 0 L 8 3 L 0 6 z' }));
      defs.append(m);
    }
    return defs;
  }

  /**
   * Le point où le trait rencontre le bord d'une pastille, dans la direction
   * donnée. Approximation par rectangle : suffisante, et sans trigonométrie
   * coûteuse à chaque rendu.
   */
  function bord(b: Boite, dx: number, dy: number): { x: number; y: number } {
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const t = 1 / Math.max(Math.abs(ux) / (b.l / 2), Math.abs(uy) / (b.h / 2));
    return { x: b.x + ux * t, y: b.y + uy * t };
  }

  function courbe(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.abs(x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  /** Une arête, avec sa famille, son tracé et son comportement au survol. */
  function dessinerArete(
    d: string,
    fam: Famille,
    infobulle: string,
    options: { poids?: number; flechee?: boolean } = {},
  ): SVGPathElement {
    const chemin = el('path', {
      class: `a a--f-${fam}${etat.visibles.has(fam) ? '' : ' masque'}`,
      d,
      'data-famille': fam,
      ...(options.poids ? { 'stroke-width': Math.min(4.5, 1.4 + options.poids * 0.55) } : {}),
      ...(options.flechee !== false && FLECHEE[fam] ? { 'marker-end': `url(#fleche-${fam})` } : {}),
    });
    const titre = el('title');
    titre.textContent = infobulle;
    chemin.append(titre);
    chemin.addEventListener('pointerenter', () => accentuer(fam));
    chemin.addEventListener('pointerleave', rallumer);
    return chemin;
  }

  /* ---------------------------------------------------------------- *
   * Mise en retrait
   * ---------------------------------------------------------------- */

  /**
   * Accentuer une famille : les autres passent en retrait, et les nœuds que
   * cette famille ne touche pas aussi — sinon on éteint les traits mais on
   * garde un mur de pastilles, et on n'a rien gagné en lisibilité.
   */
  function accentuer(fam: Famille) {
    if (!etat.visibles.has(fam)) return;
    toile.setAttribute('data-accent', fam);
    const f = FAMILLES.find((x) => x.id === fam);
    if (aide && aideFamille && f) {
      aideFamille.textContent = `${f.libelle} — ${f.aide}`;
      aide.classList.add('aide--famille');
    }
    const touches = new Set<string>();
    for (const a of toile.querySelectorAll<SVGPathElement>(`.a[data-famille="${fam}"]`)) {
      if (a.dataset.de) touches.add(a.dataset.de);
      if (a.dataset.vers) touches.add(a.dataset.vers);
    }
    for (const n of toile.querySelectorAll<SVGGElement>('.couche-noeuds .n')) {
      n.classList.toggle('vif', touches.has(n.dataset.id ?? ''));
    }
  }

  function rallumer() {
    toile.removeAttribute('data-accent');
    if (aide && aideFamille) {
      aideFamille.textContent = '';
      aide.classList.remove('aide--famille');
    }
    for (const e of toile.querySelectorAll('.eteint, .vif')) e.classList.remove('eteint', 'vif');
  }

  /** Survol d'un nœud : on ne garde que ce qui le touche. */
  function eclairerVoisinage(id: string) {
    toile.removeAttribute('data-accent');
    const proches = new Set<string>([id]);
    for (const a of reseau.aretes) {
      if (a.de === id) proches.add(a.vers);
      else if (a.vers === id) proches.add(a.de);
    }
    for (const a of reseau.carte.aretes) {
      if (a.de === id) proches.add(a.vers);
      else if (a.vers === id) proches.add(a.de);
    }
    for (const n of toile.querySelectorAll<SVGGElement>('.couche-noeuds .n')) {
      const proche = proches.has(n.dataset.id ?? '');
      n.classList.toggle('eteint', !proche);
      n.classList.toggle('vif', n.dataset.id === id);
    }
    for (const a of toile.querySelectorAll<SVGPathElement>('.couche-aretes .a')) {
      const touche = a.dataset.de === id || a.dataset.vers === id;
      a.classList.toggle('eteint', !touche);
      a.classList.toggle('vif', touche);
    }
    for (const l of toile.querySelectorAll<SVGTextElement>('.a-label')) {
      l.classList.toggle('eteint', l.dataset.de !== id && l.dataset.vers !== id);
    }
  }

  function appliquerVisibilite() {
    for (const e of toile.querySelectorAll<SVGElement>('[data-famille]')) {
      e.classList.toggle('masque', !etat.visibles.has(e.dataset.famille as Famille));
    }
  }

  /* ---------------------------------------------------------------- *
   * La carte d'ensemble
   * ---------------------------------------------------------------- */

  function rendreCarte() {
    toile.textContent = '';
    rallumer();
    const { colonnes, aretes, hautNoeuds } = reseau.carte;
    cadrerCarte();
    appliquerVue();

    toile.append(defsFleches());
    const gBandes = el('g', { class: 'couche-bandes' });
    const gAretes = el('g', { class: 'couche-aretes' });
    const gNoeuds = el('g', { class: 'couche-noeuds' });

    // Une bande une colonne sur deux : l'œil retrouve les échelons sans qu'on
    // ait à tracer des séparateurs, qui seraient de l'encre pour rien.
    colonnes.forEach((col, i) => {
      // La bande épouse la pile de sa colonne, pas la hauteur de la carte :
      // une colonne courte ne traîne pas un rectangle vide derrière elle.
      if (i % 2 === 1) {
        const l = col.largeur + 26;
        gBandes.append(
          el('rect', {
            class: 'c-bande',
            x: col.x - l / 2,
            y: col.haut - 30,
            width: l,
            height: col.bas - col.haut + 60,
            rx: 16,
          }),
        );
      }
      const t = el('text', { class: 'c-colonne', x: col.x, y: hautNoeuds - 12, 'text-anchor': 'middle' });
      t.textContent = col.libelle;
      gBandes.append(t);
    });

    const boites = new Map<string, Boite>();
    for (const n of reseau.noeuds) {
      if (n.type !== 'acteur' || n.x === undefined || n.y === undefined) continue;
      boites.set(n.id, { noeud: n, x: n.x, y: n.y, l: largeurPastille(n.court), h: 34 });
    }

    for (const a of aretes) {
      const d = boites.get(a.de);
      const v = boites.get(a.vers);
      if (!d || !v) continue;
      const fam = famille(a);

      // Le trait part toujours de l'émetteur, quelle que soit sa colonne : la
      // flèche indique alors le sens réel du versement, que la disposition en
      // colonnes ne dit pas.
      const versDroite = d.x <= v.x;
      const depart = versDroite ? d.x + d.l / 2 : d.x - d.l / 2;
      const arrivee = versDroite ? v.x - v.l / 2 : v.x + v.l / 2;

      const infobulle =
        fam === 'partage'
          ? `${d.noeud.nom} et ${v.noeud.nom} partagent ${a.poids} compétence${a.poids > 1 ? 's' : ''}`
          : `${d.noeud.nom} → ${v.noeud.nom}`;
      const chemin = dessinerArete(courbe(depart, d.y, arrivee, v.y), fam, infobulle, { poids: a.poids });
      chemin.dataset.de = a.de;
      chemin.dataset.vers = a.vers;
      gAretes.append(chemin);
    }

    for (const b of boites.values()) gNoeuds.append(dessinerNoeud(b));
    toile.append(gBandes, gAretes, gNoeuds);
    retour?.setAttribute('hidden', '');
    ecrirePanneauAccueil();
  }

  /* ---------------------------------------------------------------- *
   * Le focus sur un nœud
   * ---------------------------------------------------------------- */

  function rendreFocus(id: string) {
    const centre = index.get(id);
    if (!centre) return;
    toile.textContent = '';
    rallumer();

    const voisins: { noeud: Noeud; label: string; type: TypeArete; fam: Famille; sortante: boolean }[] = [];
    const vus = new Set<string>([id]);
    for (const a of parPriorite(reseau.aretes)) {
      const autre = a.de === id ? a.vers : a.vers === id ? a.de : null;
      if (!autre || vus.has(autre)) continue;
      const n = index.get(autre);
      if (!n) continue;
      vus.add(autre);
      voisins.push({
        noeud: n,
        label: a.de === id ? LIBELLE_ARETE[a.type] : LIBELLE_INVERSE[a.type],
        type: a.type,
        fam: famille(a),
        sortante: a.de === id,
      });
    }
    // Groupés par famille : les couches se lisent alors comme des secteurs.
    const ordre = new Map(FAMILLES.map((f, i) => [f.id, i]));
    voisins.sort(
      (a, b) => ordre.get(a.fam)! - ordre.get(b.fam)! || a.noeud.nom.localeCompare(b.noeud.nom, 'fr'),
    );

    // Replier ou non, et sur quoi. Une famille dépliée qui ne contient rien —
    // parce qu'on vient d'un autre nœud — revient d'elle-même aux grappes.
    const parFamille = new Map<Famille, typeof voisins>();
    for (const v of voisins) {
      const l = parFamille.get(v.fam);
      if (l) l.push(v);
      else parFamille.set(v.fam, [v]);
    }
    if (etat.familleDepliee && !parFamille.has(etat.familleDepliee)) etat.familleDepliee = null;
    const dense = voisins.length > SEUIL_REPLI_VOISINAGE;
    const grappes = dense && !etat.familleDepliee;
    const affiches = etat.familleDepliee ? parFamille.get(etat.familleDepliee)! : voisins;

    const couronne = grappes ? [...parFamille.keys()] : affiches;

    const L = 1060;
    const rayon = Math.min(370, 160 + couronne.length * 11);
    const H = rayon * 2 + 170;
    vue = { x: -L / 2, y: -H / 2, l: L, h: H };
    appliquerVue();

    toile.append(defsFleches());
    const gAretes = el('g', { class: 'couche-aretes' });
    const gNoeuds = el('g', { class: 'couche-noeuds' });

    const lCentre = largeurPastille(centre.court, 15, 160) + 16;
    const bCentre: Boite = { noeud: centre, x: 0, y: 0, l: lCentre, h: 46 };

    if (grappes) {
      dessinerGrappes(centre, bCentre, parFamille, rayon, gAretes, gNoeuds);
      toile.append(gAretes, gNoeuds);
      gNoeuds.append(dessinerNoeud(bCentre, 'centre'));
      cadrerSurContenu();
      retour?.removeAttribute('hidden');
      ecrirePanneau(centre, voisins);
      return;
    }

    affiches.forEach((v, i) => {
      // Départ à midi puis rotation : l'ordre est stable d'une visite à l'autre.
      const angle = (i / affiches.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * rayon * 1.3;
      const y = Math.sin(angle) * rayon * 0.86;
      const l = Math.min(300, largeurPastille(v.noeud.court, 13, 108));
      const b: Boite = { noeud: v.noeud, x, y, l, h: 32 };

      // Le trait s'arrête au bord des deux pastilles, jamais en leur centre :
      // sinon la flèche disparaît dessous. Et il va toujours de l'émetteur vers
      // le destinataire, pour que ce soit le sens réel qui soit fléché.
      const depart = bord(bCentre, x, y);
      const arrivee = bord(b, -x, -y);
      const chemin = dessinerArete(
        v.sortante
          ? courbe(depart.x, depart.y, arrivee.x, arrivee.y)
          : courbe(arrivee.x, arrivee.y, depart.x, depart.y),
        v.fam,
        `${centre.nom} — ${v.label} — ${v.noeud.nom}`,
      );
      chemin.dataset.de = centre.id;
      chemin.dataset.vers = v.noeud.id;
      gAretes.append(chemin);

      const etiq = el('text', {
        class: `a-label a-label--f-${v.fam}${etat.visibles.has(v.fam) ? '' : ' masque'}`,
        x: x * 0.6,
        y: y * 0.6 - 9,
        'text-anchor': 'middle',
        'data-famille': v.fam,
      });
      etiq.dataset.de = centre.id;
      etiq.dataset.vers = v.noeud.id;
      etiq.textContent = v.label;
      gAretes.append(etiq);

      gNoeuds.append(dessinerNoeud(b));
    });

    gNoeuds.append(dessinerNoeud(bCentre, 'centre'));
    toile.append(gAretes, gNoeuds);
    cadrerSurContenu();
    retour?.removeAttribute('hidden');
    ecrirePanneau(centre, voisins);
  }

  /**
   * Une grappe par famille de relation, au lieu de quarante pastilles qui se
   * recouvrent. Le compte est sur la grappe : on sait ce qu'on ne voit pas.
   */
  function dessinerGrappes(
    centre: Noeud,
    bCentre: Boite,
    parFamille: Map<Famille, { noeud: Noeud; label: string; fam: Famille; sortante: boolean }[]>,
    rayon: number,
    gAretes: SVGGElement,
    gNoeuds: SVGGElement,
  ) {
    const familles = [...parFamille.keys()];
    familles.forEach((fam, i) => {
      const membres = parFamille.get(fam)!;
      const angle = (i / familles.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * rayon * 1.15;
      const y = Math.sin(angle) * rayon * 0.8;
      const libelle = FAMILLES.find((f) => f.id === fam)?.libelle ?? fam;
      const texte = `${libelle} · ${membres.length}`;
      const l = largeurPastille(texte, 13, 132);
      const b = { x, y, l, h: 38 };

      const depart = bord(bCentre, x, y);
      const arrivee = bord({ ...b, noeud: centre }, -x, -y);
      const chemin = dessinerArete(
        courbe(depart.x, depart.y, arrivee.x, arrivee.y),
        fam,
        `${membres.length} relation(s) de type « ${libelle} »`,
      );
      gAretes.append(chemin);

      const g = el('g', {
        class: `n n--grappe${etat.visibles.has(fam) ? '' : ' masque'}`,
        transform: `translate(${x - l / 2} ${y - b.h / 2})`,
        tabindex: 0,
        role: 'button',
        'aria-label': `Déplier les ${membres.length} relations « ${libelle} » de ${centre.nom}`,
        'data-famille': fam,
      });
      g.append(el('rect', { class: 'n-fond', width: l, height: b.h, rx: 8 }));
      const t = el('text', { class: 'n-nom', x: l / 2, y: b.h / 2 + 4.5, 'text-anchor': 'middle' });
      t.textContent = texte;
      g.append(t);
      const titre = el('title');
      titre.textContent = membres.map((m) => m.noeud.nom).join(' · ');
      g.append(titre);

      const deplier = () => {
        etat.familleDepliee = fam;
        rendreFocus(centre.id);
      };
      g.addEventListener('click', deplier);
      g.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          deplier();
        }
      });
      gNoeuds.append(g);
    });
  }

  /* ---------------------------------------------------------------- *
   * Le panneau : c'est lui qui porte les liens sortants
   * ---------------------------------------------------------------- */

  function vider(e: HTMLElement) {
    while (e.firstChild) e.removeChild(e.firstChild);
  }

  /** Les libellés viennent du contenu : on les insère en texte, jamais en HTML. */
  function ligne(balise: string, classe: string, contenu: string): HTMLElement {
    const e = document.createElement(balise);
    e.className = classe;
    e.textContent = contenu;
    return e;
  }

  /**
   * Comme `ligne`, mais les sigles y deviennent des <abbr> explicités au survol.
   * Construit nœud par nœud, jamais par concaténation de HTML : le contenu est
   * de la donnée, il ne doit pas pouvoir devenir du balisage.
   */
  function glose(balise: string, classe: string, contenu: string): HTMLElement {
    const e = document.createElement(balise);
    e.className = classe;
    e.append(fragmentGlose(contenu));
    return e;
  }

  function fragmentGlose(contenu: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    for (const s of glossaire.decouper(contenu)) {
      if (!s.sigle) {
        frag.append(document.createTextNode(s.texte));
        continue;
      }
      const abbr = document.createElement('abbr');
      abbr.title = s.sigle.definition ? `${s.sigle.developpe} — ${s.sigle.definition}` : s.sigle.developpe;
      abbr.textContent = s.texte;
      frag.append(abbr);
    }
    return frag;
  }

  /**
   * Le bloc « chez vous ». C'est la réponse que le site ne savait pas donner :
   * ailleurs il dit « variable selon le territoire », ici il nomme la structure.
   */
  function blocTerritoire(idCompetence?: string): HTMLElement | null {
    if (!territoire) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-territoire';

    if (idCompetence) {
      const v = territoire.verdict(idCompetence);
      bloc.append(ligne('h3', 'p-titre-section', `Chez vous, à ${territoire.commune.nom}`));
      if (v.etat === 'transferee' || v.etat === 'transferee-par-loi') {
        const ul = document.createElement('ul');
        ul.className = 'p-structures';
        for (const s of v.structures) {
          const li = document.createElement('li');
          li.append(glose('strong', '', s.nom), ligne('span', 'p-nature-jur', s.natureLibelle));
          ul.append(li);
        }
        bloc.append(ul);
        // Dire d'où vient la réponse : ici ce n'est pas le registre des
        // transferts déclarés, c'est la loi elle-même.
        if (v.etat === 'transferee-par-loi') {
          bloc.append(
            ligne(
              'p',
              'p-par-loi',
              `La loi transfère cette compétence de plein droit à cette catégorie ` +
                `d'intercommunalité, même quand le registre des transferts ne l'a pas enregistré.`,
            ),
          );
        }
        const prix = blocPrixEau(idCompetence);
        if (prix) bloc.append(prix);
      } else if (v.etat === 'a-defaut') {
        // Nommer celui qui répond, plutôt que de constater que personne n'a
        // rien déclaré. C'est la même exigence que partout ailleurs ici : une
        // réponse vaut mieux qu'une mise en garde.
        bloc.append(
          ligne('p', 'p-verdict p-verdict--defaut', `${v.qui} — la loi l'y oblige à défaut.`),
        );
      } else if (v.etat === 'communale') {
        bloc.append(
          ligne('p', 'p-verdict', 'Aucun transfert enregistré : la compétence reste exercée par la commune.'),
        );
      } else {
        bloc.append(
          ligne(
            'p',
            'p-verdict p-verdict--incertain',
            `Non renseigné pour ce département : ${Math.round(v.couvertureDep * 100)} % de ses communes ` +
              `ont un exerçant identifié, contre ${Math.round(v.couvertureNationale * 100)} % en France. ` +
              `Le registre est probablement incomplet ici — nous préférons ne pas conclure.`,
          ),
        );
      }
      // La réserve vaut quelle que soit la réponse : elle dit ce que la
      // réponse, même exacte, laisse de côté.
      const reserve = territoire.reserve(idCompetence);
      if (reserve) bloc.append(ligne('p', 'p-reserve', reserve));
      return bloc;
    }

    // Vue d'ensemble : toutes les compétences que ce territoire déplace.
    bloc.append(ligne('h3', 'p-titre-section', `Chez vous, à ${territoire.commune.nom}`));
    // La page de la commune est l'adresse de tout ceci : c'est elle qu'on
    // partage, et c'est elle que les moteurs lisent. Le panneau y conduit.
    const permalienCommune = document.createElement('p');
    permalienCommune.className = 'p-permalien-commune';
    const versCommune = document.createElement('a');
    versCommune.href = `/commune/${territoire.commune.code}`;
    versCommune.textContent = 'La page de cette commune, sans JavaScript';
    permalienCommune.append(versCommune);
    bloc.append(permalienCommune);
    const qui = blocMaire();
    if (qui) bloc.append(qui);
    const vote = blocScrutin();
    if (vote) bloc.append(vote);
    const resolvables = reseau.noeuds.filter((n) => n.banatic && n.banatic.length > 0);
    const dl = document.createElement('dl');
    dl.className = 'p-resolution';
    for (const n of resolvables.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
      const v = territoire.verdict(n.id);
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      const b = document.createElement('button');
      b.type = 'button';
      b.append(fragmentGlose(n.court));
      b.addEventListener('click', () => ouvrir(n.id));
      dt.append(b);
      const dd = document.createElement('dd');
      if (v.etat === 'transferee' || v.etat === 'transferee-par-loi') {
        dd.append(fragmentGlose(v.structures.map((s) => s.nom).join(' · ')));
        if (v.etat === 'transferee-par-loi') {
          dd.append(ligne('span', 'p-incise-loi', 'transfert prévu par la loi'));
        }
        const e = territoire.eau;
        if (e && e.competence === n.id && e.prix !== null) {
          dd.append(ligne('span', 'p-prix-incise', `${e.prix.toLocaleString('fr-FR')} €/m³`));
        }
      }
      else if (v.etat === 'a-defaut') {
        dd.append(fragmentGlose(v.qui));
        dd.append(ligne('span', 'p-incise-loi', "à défaut d'intercommunalité, par la loi"));
      } else if (v.etat === 'communale') dd.append(ligne('span', 'p-commune-seule', 'la commune'));
      else dd.append(ligne('span', 'p-incertain', 'non renseigné ici'));
      d.append(dt, dd);
      dl.append(d);
    }
    bloc.append(dl);
    const argent = blocFinances();
    if (argent) bloc.append(argent);
    const percus = blocFluxPercus();
    if (percus) bloc.append(percus);
    const echelons = blocEchelons();
    if (echelons) bloc.append(echelons);
    const mutation = blocDmto();
    if (mutation) bloc.append(mutation);
    const exposition = blocRisques();
    if (exposition) bloc.append(exposition);
    const obligation = blocSru();
    if (obligation) bloc.append(obligation);
    const commandes = blocMarches();
    if (commandes) bloc.append(commandes);
    const actes = blocDeliberations();
    if (actes) bloc.append(actes);
    const aides = blocSubventions();
    if (aides) bloc.append(aides);
    const equipements = blocServices();
    if (equipements) bloc.append(equipements);

    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les transferts de compétences déclarés à BANATIC (${territoire.maj}). ` +
          `Une compétence exercée sans transfert déclaré — par convention, par exemple — n'y figure pas.` +
          (territoire.majElus
            ? ` Le maire vient du répertoire national des élus (${territoire.majElus}).`
            : ''),
      ),
    );
    return bloc;
  }

  /**
   * Où sont les services publics.
   *
   * Le reste du panneau dit qui décide ; celui-ci dit où l'on va. Ce sont deux
   * questions différentes, et la seconde est souvent la première qu'on se pose.
   */
  function blocServices(): HTMLElement | null {
    const s = territoire?.services;
    if (!s) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-services';
    bloc.append(ligne('h4', 'p-titre-bloc', 'Les services publics sur place'));

    for (const [famille, libelle] of LIBELLE_FAMILLE) {
      const liste = s.parFamille.get(famille);
      if (!liste || liste.length === 0) continue;

      const ul = document.createElement('ul');
      for (const e of liste) {
        const li = document.createElement('li');
        li.append(ligne('span', 'p-service-nom', e.nom));
        // Deux nuances qui changent la démarche : une école privée ne relève
        // pas de la carte scolaire, un hôpital sans urgences ne se présente
        // pas de la même façon un dimanche soir.
        if (e.prive) li.append(ligne('span', 'p-service-note', 'privé'));
        if (e.urgences) li.append(ligne('span', 'p-service-note p-service-note--fort', 'urgences'));
        const chiffres = chiffresEcole(e.ecole);
        if (chiffres) li.append(chiffres);
        ul.append(li);
      }

      // Le Mans compte 87 écoles : les nommer toutes dans un panneau latéral,
      // c'est n'en montrer aucune. Au-delà d'une poignée, la liste se replie
      // derrière son décompte — un `details` natif, qui marche sans script et
      // que les lecteurs d'écran annoncent déjà.
      if (liste.length > SEUIL_REPLI) {
        const d = document.createElement('details');
        d.className = 'p-service-groupe';
        const resume = document.createElement('summary');
        resume.className = 'p-service-famille';
        resume.textContent = libelle(liste.length);
        d.append(resume, ul);
        bloc.append(d);
      } else {
        const d = document.createElement('div');
        d.className = 'p-service-groupe';
        d.append(ligne('span', 'p-service-famille', libelle(liste.length)));
        d.append(ul);
        bloc.append(d);
      }
    }

    // Ce qui n'est pas dans la commune mais la concerne quand même. Un
    // point-justice ou une France services existe par bassin de vie : ne rien
    // afficher quand il n'est pas sur place reviendrait à répondre « rien » à
    // quelqu'un qui a un interlocuteur à vingt kilomètres.
    for (const [famille, libelle, article] of VOISINAGE) {
      const v = s.voisines.get(famille);
      if (!v || s.parFamille.has(famille) || v.nombre === 0) continue;
      const p = document.createElement('p');
      p.className = 'p-service-voisin';
      // Le nom de commune est présenté après un deux-points plutôt qu'après une
      // préposition : « à Le Lude » n'existe pas en français, et contracter
      // correctement demanderait de connaître le genre et l'article de 34 875
      // noms de communes.
      const ou =
        v.communes.length > 0
          ? `Dans votre intercommunalité : ${v.communes.join(', ')}.`
          : `${v.nombre} communes de votre intercommunalité en accueillent ${article}.`;
      p.append(
        ligne('span', 'p-service-famille', libelle),
        ligne('span', '', `${article === 'une' ? 'aucune' : 'aucun'} dans la commune. ${ou}`),
      );
      bloc.append(p);
    }

    if (s.sdis) {
      bloc.append(
        ligne(
          'p',
          'p-source-territoire',
          `Secours : ${s.sdis}. Les centres de secours ne sont pas publiés en open data ` +
            `national — seuls les états-majors départementaux le sont, nous ne situons donc ` +
            `pas la caserne la plus proche.`,
        ),
      );
    }
    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après l'Annuaire de l'administration, l'Annuaire de l'éducation et le répertoire ` +
          `FINESS (${s.maj}). Les effectifs et le nombre de classes viennent du recensement ` +
          `annuel des écoles du premier degré : les collèges et lycées n'y figurent pas.`,
      ),
    );
    return bloc;
  }

  /**
   * Le prix de l'eau. Il n'a de sens qu'attaché au service qui la distribue —
   * c'est le même mètre cube, mais ni le même exploitant ni le même tarif d'une
   * commune à l'autre.
   */
  function blocPrixEau(idCompetence: string): HTMLElement | null {
    const e = territoire?.eau;
    if (!e || e.competence !== idCompetence || e.prix === null) return null;
    const p = document.createElement('p');
    p.className = 'p-prix-eau';
    p.append(
      ligne('span', 'p-prix', `${e.prix.toLocaleString('fr-FR')} € / m³`),
      ligne(
        'span',
        'p-prix-detail',
        `TTC en ${e.annee}, pour 120 m³ · médiane nationale ${e.median?.toLocaleString('fr-FR')} €` +
          (e.gestion ? ` · ${e.gestion.toLowerCase()}` : '') +
          (e.operateur ? ` (${e.operateur})` : ''),
      ),
    );
    return p;
  }

  /**
   * Les comptes de la commune. Un montant seul ne dit rien : chacun est posé
   * sur une réglette dont le repère central est la médiane des communes de
   * taille voisine. La position du point vaut mieux qu'un pourcentage, qui
   * demande un calcul mental à chaque ligne.
   */
  function blocFinances(): HTMLElement | null {
    const f = territoire?.finances;
    if (!f) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-finances';
    bloc.append(ligne('h3', 'p-titre-section', `Ses comptes, en ${f.annee}`));
    bloc.append(
      f.statutParticulier
        ? ligne(
            'p',
            'p-strate p-strate--particulier',
            `Statut particulier : cette commune exerce aussi des fonctions départementales. ` +
              `Ses comptes ne se comparent à ceux d'aucune autre — les montants sont donnés seuls.`,
          )
        : ligne(
            'p',
            'p-strate',
            `Par habitant — sinon rien n'est comparable — et rapportés aux communes ${f.strate}.`,
          ),
    );

    const dl = document.createElement('dl');
    dl.className = 'p-reperes';
    for (const r of f.reperes) {
      if (r.valeur === null) continue;
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = r.nom;
      dt.title = r.explication;
      const dd = document.createElement('dd');
      dd.append(
        ligne('span', 'p-montant', `${r.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`),
      );
      if (r.mediane !== null && r.mediane > 0) {
        dd.append(reglette(r.valeur, r.mediane));
        dd.append(
          ligne(
            'span',
            'p-mediane',
            `médiane ${r.mediane.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`,
          ),
        );
      }
      const courbe = tendance(r.serie, f.annees);
      if (courbe) {
        // Sur sa propre ligne : la première porte déjà le montant, la réglette
        // et la médiane, et y ajouter la série la ferait déborder.
        const rang = document.createElement('span');
        rang.className = 'p-tendance-ligne';
        rang.append(courbe);
        if (r.evolution !== null) {
          // Le signe compte plus que le chiffre : c'est lui qui fait poser la
          // question. On ne colore pas pour autant en « bon » ou « mauvais » —
          // une dette qui baisse et un investissement qui baisse ne se lisent
          // pas de la même façon, et ce n'est pas au site d'en juger.
          rang.append(
            ligne(
              'span',
              'p-evolution',
              // Un vrai signe moins (U+2212), pas le trait d'union du clavier :
              // il s'aligne sur le plus et sur les chiffres.
              `${r.evolution >= 0 ? '+' : '\u2212'}${Math.abs(r.evolution)} % depuis ` +
                `${debutSerie(r.serie, f.annees) ?? f.annees[0]}`,
            ),
          );
        }
        dd.append(rang);
      }
      d.append(dt, dd);
      dl.append(d);
    }
    bloc.append(dl);
    return bloc;
  }

  /**
   * Les comptes du département, puis ceux de la région.
   *
   * Le panneau nomme le département à chaque écran — pour les collèges, les
   * routes, l'aide sociale — sans jamais dire ce qu'il dépense. Ces deux
   * échelons décident d'une part de ce qui arrive à un habitant, et leurs
   * comptes sont publics au même endroit que ceux de la commune.
   *
   * Pas de strate ici : ils sont trop peu nombreux pour qu'une strate ait un
   * sens. La médiane porte sur l'échelon entier — l'OFGL en publie 97 et 17 —
   * et le bloc dit sur combien de collectivités elle porte.
   */
  function blocEchelons(): HTMLElement | null {
    const comptes = territoire?.comptesEchelons;
    if (!comptes || comptes.length === 0) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-finances p-echelons';
    bloc.append(ligne('h4', 'p-titre-bloc', 'Les comptes des échelons au-dessus'));

    for (const c of comptes) {
      const lignes = c.reperes.filter((r) => r.valeur !== null);
      if (lignes.length === 0) continue;
      const derniere = c.annees[c.annees.length - 1];
      bloc.append(ligne('h5', 'p-titre-echelon', `${c.nom}, en ${derniere}`));
      bloc.append(
        ligne(
          'p',
          'p-strate',
          `Par habitant, et rapportés aux ${c.effectif.toLocaleString('fr-FR')} ` +
            `collectivités du même échelon.`,
        ),
      );

      const dl = document.createElement('dl');
      dl.className = 'p-reperes';
      for (const r of lignes) {
        const d = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = r.nom;
        const dd = document.createElement('dd');
        dd.append(
          ligne(
            'span',
            'p-montant',
            `${r.valeur!.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`,
          ),
        );
        if (r.mediane !== null && r.mediane > 0) {
          // Quand le repère n'est pas renseigné partout, la médiane ne porte que
          // sur ceux qui le déclarent, et le dire évite de faire passer une
          // poignée de cas particuliers pour la norme de l'échelon.
          const partiel = r.effectif > 0 && r.effectif < c.effectif;
          dd.append(
            reglette(
              r.valeur!,
              r.mediane,
              partiel ? 'la médiane de celles qui en déclarent' : "la médiane de l'échelon",
            ),
          );
          dd.append(
            ligne(
              'span',
              'p-mediane',
              `médiane ${r.mediane.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €` +
                (partiel ? ` sur ${r.effectif.toLocaleString('fr-FR')}` : ''),
            ),
          );
        }
        const courbe = tendance(r.serie, c.annees);
        if (courbe) {
          const rang = document.createElement('span');
          rang.className = 'p-tendance-ligne';
          rang.append(courbe);
          if (r.evolution !== null) {
            rang.append(
              ligne(
                'span',
                'p-evolution',
                `${r.evolution >= 0 ? '+' : '\u2212'}${Math.abs(r.evolution)} % depuis ` +
                  `${debutSerie(r.serie, c.annees) ?? c.annees[0]}`,
              ),
            );
          }
          dd.append(rang);
        }
        d.append(dt, dd);
        dl.append(d);
      }
      bloc.append(dl);
    }
    if (!bloc.querySelector('dl')) return null;
    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les comptes des collectivités publiés par l'OFGL` +
          (territoire?.echelonsMaj ? ` (${territoire.echelonsMaj})` : '') +
          `, budget principal seul — les budgets annexes sont comptés à part.`,
      ),
    );
    return bloc;
  }

  /**
   * Ce que perçoit l'intercommunalité.
   *
   * « Ses comptes » dit ce que la commune encaisse et dépense. Mais la taxe
   * d'enlèvement des ordures ménagères et le versement mobilité n'y sont pas :
   * c'est le groupement qui les perçoit. Sans ce bloc, le site montrait un
   * budget communal amputé des deux flux dont on parle le plus à un habitant.
   *
   * La structure est nommée. « Votre intercommunalité » ne dit pas à qui
   * écrire, et c'est tout l'objet du site.
   */
  function blocFluxPercus(): HTMLElement | null {
    const t = territoire;
    if (!t || t.fluxPercus.length === 0) return null;
    const liste = t.fluxPercus;
    const annees = t.anneesFlux;
    const bloc = document.createElement('section');
    bloc.className = 'p-finances p-flux-percus';
    bloc.append(ligne('h3', 'p-titre-section', "Ce que perçoit l'intercommunalité"));
    bloc.append(
      ligne(
        'p',
        'p-strate',
        "Par habitant, et rapporté aux seules intercommunalités qui perçoivent : y " +
          "compter les autres pour zéro ferait passer un taux ordinaire pour une anomalie.",
      ),
    );

    const dl = document.createElement('dl');
    dl.className = 'p-reperes';
    for (const f of liste) {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.append(document.createTextNode(f.nom));
      dt.title = f.explication;
      dt.append(glose('span', 'p-percepteur', `${f.structure} — ${f.natureLibelle}`));
      const dd = document.createElement('dd');
      dd.append(
        ligne('span', 'p-montant', `${f.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} \u20ac`),
      );
      if (f.mediane !== null && f.mediane > 0) {
        dd.append(reglette(f.valeur, f.mediane, 'la médiane de celles qui perçoivent'));
        dd.append(
          ligne(
            'span',
            'p-mediane',
            // « sur 886 » seul ne dit pas sur 886 quoi : le mot compte plus que
            // la place qu'il prend.
            `médiane ${f.mediane.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} \u20ac, ` +
              `sur ${f.percepteurs.toLocaleString('fr-FR')} intercommunalités`,
          ),
        );
      }
      const courbe = tendance(f.serie, annees);
      if (courbe) {
        const rang = document.createElement('span');
        rang.className = 'p-tendance-ligne';
        rang.append(courbe);
        if (f.evolution !== null) {
          rang.append(
            ligne(
              'span',
              'p-evolution',
              `${f.evolution >= 0 ? '+' : '\u2212'}${Math.abs(f.evolution)} % depuis ` +
                `${debutSerie(f.serie, annees) ?? annees[0]}`,
            ),
          );
        }
        dd.append(rang);
      }
      d.append(dt, dd);
      dl.append(d);
    }
    bloc.append(dl);
    return bloc;
  }

  /**
   * L'année du premier chiffre réellement renseigné.
   *
   * `variation()` calcule l'écart entre le premier et le dernier point non
   * nuls ; écrire « depuis 2018 » sous prétexte que la fenêtre commence là
   * serait faux dès qu'une série démarre plus tard. La communauté de communes
   * Sud Sarthe n'a de taxe d'enlèvement qu'à partir de 2022, et le site
   * annonçait pourtant « + 6 % depuis 2018 ».
   */
  function debutSerie(serie: (number | null)[], annees: number[]): number | null {
    const i = serie.findIndex((v) => v !== null);
    return i === -1 ? null : (annees[i] ?? null);
  }

  /**
   * Ce qu'est devenue une école.
   *
   * C'est la seule décision que le site sache montrer, et il ne montre que le
   * fait : le nombre de classes a changé telle rentrée. Le motif ne se publie
   * nulle part — ni le seuil appliqué cette année-là, ni l'arbitrage. Ce que le
   * site apporte, c'est le nom de celui qui décide : le rectorat, pas le maire,
   * même quand c'est la commune qui possède les murs.
   */
  function chiffresEcole(e: ServicePublic['ecole']): HTMLElement | null {
    if (!e) return null;
    const i = e.classes.reduce<number>((d, v, k) => (v !== null ? k : d), -1);
    if (i === -1) return null;
    const bloc = document.createElement('span');
    bloc.className = 'p-ecole';
    const classes = e.classes[i]!;
    const eleves = e.eleves[i];
    bloc.append(
      ligne(
        'span',
        'p-ecole-chiffres',
        `${classes} classe${classes > 1 ? 's' : ''}` +
          (eleves !== null && eleves !== undefined ? ` · ${eleves} élèves` : '') +
          ` en ${e.rentrees[i]}`,
      ),
    );
    const c = e.dernierChangement;
    if (c) {
      const n = Math.abs(c.ecart);
      bloc.append(
        ligne(
          'span',
          `p-ecole-changement p-ecole-changement--${c.ecart < 0 ? 'moins' : 'plus'}`,
          `${c.ecart < 0 ? '\u2212' : '+'}${n} classe${n > 1 ? 's' : ''} à la rentrée ${c.rentree}`,
        ),
      );
    }
    const courbe = tendance(e.eleves, e.rentrees);
    if (courbe) bloc.append(courbe);
    return bloc;
  }

  /**
   * Qui est le maire.
   *
   * Le graphe n'a jamais nommé personne, et il continue : le nœud reste « le
   * maire », la fonction. Mais « la commune décide » ne dit pas à qui écrire,
   * et c'est la question qui amène le plus de monde. Le nom est donc une
   * précision de donnée, affichée là où le site répond « chez vous » — au même
   * rang que le nom de la communauté de communes.
   *
   * La date de prise de fonction l'accompagne toujours. Un nom sans date
   * vieillit en silence, et envoyer quelqu'un écrire à un élu qui n'est plus en
   * poste serait pire que de ne rien dire.
   */
  function blocMaire(): HTMLElement | null {
    const m = territoire?.maire;
    if (!m) return null;
    const p = document.createElement('p');
    p.className = 'p-maire';
    p.append(ligne('span', 'p-maire-fonction', 'Maire'));
    p.append(ligne('span', 'p-maire-nom', `${m.prenom} ${m.nom}`));
    const depuis = moisAnnee(m.depuis);
    if (depuis) p.append(ligne('span', 'p-maire-depuis', `en fonction depuis ${depuis}`));
    return p;
  }

  /** « 2026-03-20 » devient « mars 2026 » : le jour exact n'apprend rien. */
  function moisAnnee(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  /**
   * Ce que la commune et ses syndicats commandent.
   *
   * L'objet d'un marché dit ce qu'une collectivité fait de son argent mieux
   * qu'un agrégat comptable : « collecte des ordures ménagères »,
   * « réhabilitation des réseaux d'assainissement », « maison médicale ». Les
   * syndicats viennent après la commune, mais ce sont eux qui dépensent le
   * plus souvent le plus gros, et personne ne pense à les regarder.
   *
   * **Aucun total n'est affiché, et c'est le point important.** Un accord-cadre
   * déclare un plafond, et chacun de ses lots le redéclare en entier : sept
   * marchés parisiens portent 21 M€ chacun pour un seul accord. Additionner
   * donnerait un chiffre faux d'un ordre de grandeur, et faux avec aplomb.
   */
  function blocMarches(): HTMLElement | null {
    const liste = territoire?.marches;
    if (!liste || liste.length === 0) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-marches';
    bloc.append(ligne('h3', 'p-titre-section', 'Ce qui est commandé'));
    bloc.append(
      ligne(
        'p',
        'p-strate',
        `Marchés notifiés depuis ${(territoire?.marchesDepuis ?? '').slice(0, 4)}, du plus récent au ` +
          `plus ancien. Les montants ne s'additionnent pas : un accord-cadre déclare un plafond, et ` +
          `chacun de ses lots le redéclare en entier. Un même marché peut aussi figurer deux fois, ` +
          `publié sous deux libellés — le recensement n'est pas dédoublonné à la source.`,
      ),
    );

    for (const [rang, a] of liste.entries()) {
      // La commune est ouverte, ses syndicats sont repliés. Six acheteurs à
      // cinq marchés font trente lignes : déplié, le bloc chasse tout le reste
      // du panneau, et sur un téléphone il le remplace. Le décompte reste
      // visible sur chaque en-tête, c'est lui qui donne envie d'ouvrir.
      const replie = rang > 0;
      const groupe = document.createElement(replie ? 'details' : 'div');
      groupe.className = 'p-marche-acheteur';
      const titre = document.createElement(replie ? 'summary' : 'p');
      titre.className = 'p-marche-qui';
      titre.append(glose('span', 'p-marche-nom', a.nom));
      if (a.natureLibelle) titre.append(ligne('span', 'p-marche-nature', a.natureLibelle));
      titre.append(
        ligne(
          'span',
          'p-marche-total',
          `${a.total.toLocaleString('fr-FR')} marché${a.total > 1 ? 's' : ''}` +
            (a.total > a.liste.length ? `, les ${a.liste.length} plus récents` : ''),
        ),
      );
      groupe.append(titre);

      const ul = document.createElement('ul');
      for (const m of a.liste) ul.append(ligneMarche(m));
      groupe.append(ul);
      // Les cinq premiers sont dans le fichier du département ; le reste a son
      // propre fichier, et ne descend que si on le demande.
      const suite = boutonSuite(a, ul);
      if (suite) groupe.append(suite);
      bloc.append(groupe);
    }
    return bloc;
  }

  /** Une ligne de marché : le montant à gauche, l'objet et son contexte à droite. */
  function ligneMarche(m: Marche): HTMLLIElement {
    const li = document.createElement('li');
    li.append(ligne('span', 'p-marche-montant', montantCourt(m.montant)));
    const droite = document.createElement('span');
    droite.append(ligne('span', 'p-marche-objet', m.objet));
    const sous: string[] = [moisAnnee(m.date) ?? m.date];
    if (m.procedure) sous.push(m.procedure.toLowerCase());
    if (m.lots > 1) sous.push(`${m.lots} lots`);
    droite.append(ligne('span', 'p-marche-detail', sous.join(' · ')));
    li.append(droite);
    return li;
  }

  /** Par pas de vingt-cinq : au-delà, on fait défiler sans plus rien lire. */
  const PAS_MARCHES = 25;

  /**
   * « Voir les 403 autres ».
   *
   * Deux temps, délibérément. Le premier clic va chercher le fichier de
   * l'acheteur — quelques kilo-octets, une fois ; les suivants n'ajoutent que
   * vingt-cinq lignes de plus, parce qu'une liste de 5 523 marchés dépliée d'un
   * coup ne se lit pas et fige le panneau sur un téléphone.
   *
   * Le bouton dit toujours combien il reste : c'est ce chiffre qui donne la
   * mesure de ce qu'une collectivité commande, bien plus que les cinq lignes
   * visibles.
   */
  function boutonSuite(a: AcheteurMarches, ul: HTMLUListElement): HTMLElement | null {
    const dep = territoire?.commune.dep;
    if (!dep || a.total <= a.liste.length) return null;
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'p-marche-suite';
    let affiches = a.liste.length;
    let reste: Marche[] | null = null;
    let echec: HTMLElement | null = null;

    // Avant le chargement, le décompte du recensement — celui que porte
    // l'en-tête. Après, le nombre exact de lignes : un accord-cadre publie une
    // ligne par lot, le site les regroupe, et 1,4 % des lignes en réunissent
    // plusieurs. L'écart est petit, et le corriger vaut mieux que promettre
    // trois lignes qui ne viendront pas.
    const direRestant = () => {
      const fin = reste ? a.liste.length + reste.length : a.total;
      bouton.textContent = `Voir les ${(fin - affiches).toLocaleString('fr-FR')} autres`;
    };
    direRestant();

    bouton.addEventListener('click', async () => {
      if (!reste) {
        bouton.disabled = true;
        bouton.textContent = 'Chargement…';
        const charge = await suiteMarches(dep, a.siren);
        bouton.disabled = false;
        if (charge.length === 0) {
          // Aucun fichier n'est écrit vide : une liste vide vient donc d'une
          // requête qui a échoué. On le dit, et on laisse le bouton — un
          // réseau qui revient doit pouvoir servir au clic suivant.
          if (!echec) {
            echec = ligne('p', 'p-marche-detail', 'La suite ne s\'est pas chargée. À réessayer.');
            bouton.after(echec);
          }
          direRestant();
          return;
        }
        echec?.remove();
        echec = null;
        reste = charge;
      }
      const lot = reste.slice(affiches - a.liste.length, affiches - a.liste.length + PAS_MARCHES);
      for (const m of lot) ul.append(ligneMarche(m));
      affiches += lot.length;
      if (affiches >= a.liste.length + reste.length) bouton.remove();
      else direRestant();
    });
    return bouton;
  }

  /**
   * Ce qui est versé aux associations.
   *
   * Le troisième canal par lequel l'argent public sort d'une commune, après
   * ses dépenses propres et ses marchés — et le plus visible dans un village :
   * le club de foot, l'école de musique, le comité des fêtes.
   *
   * **Aucun total, et cette fois la raison est dans le texte.** L'obligation de
   * publier ne porte que sur les conventions de plus de 23 000 €. Certaines
   * collectivités publient tout, d'autres s'en tiennent au seuil, et sommer les
   * deux donnerait un chiffre sous-estimé d'un facteur inconnu, variable d'une
   * commune à l'autre. Les lignes, elles, restent vraies une à une.
   */
  function blocSubventions(): HTMLElement | null {
    const liste = territoire?.subventions;
    if (!liste || liste.length === 0) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-marches p-subventions';
    bloc.append(ligne('h3', 'p-titre-section', 'Ce qui est versé aux associations'));

    for (const [rang, c] of liste.entries()) {
      const replie = rang > 0;
      const groupe = document.createElement(replie ? 'details' : 'div');
      groupe.className = 'p-marche-acheteur';
      const titre = document.createElement(replie ? 'summary' : 'p');
      titre.className = 'p-marche-qui';
      titre.append(glose('span', 'p-marche-nom', c.nom));
      if (c.natureLibelle) titre.append(ligne('span', 'p-marche-nature', c.natureLibelle));
      const [debut, fin] = c.exercices;
      titre.append(
        ligne(
          'span',
          'p-marche-total',
          `${c.total.toLocaleString('fr-FR')} subvention${c.total > 1 ? 's' : ''} publiée${c.total > 1 ? 's' : ''}` +
            (debut && fin ? (debut === fin ? `, ${debut}` : `, ${debut}‑${fin}`) : '') +
            (c.total > c.liste.length ? `, les ${c.liste.length} plus grosses` : ''),
        ),
      );
      groupe.append(titre);

      const ul = document.createElement('ul');
      for (const sv of c.liste) {
        const li = document.createElement('li');
        li.append(ligne('span', 'p-marche-montant', montantCourt(sv.montant)));
        const droite = document.createElement('span');
        droite.append(ligne('span', 'p-marche-objet', sv.qui));
        const sous: string[] = [sv.annee];
        // L'objet ne répète pas toujours le nom du bénéficiaire : quand il le
        // fait, l'afficher deux fois ne dit rien de plus.
        const memeChose = sv.objet.toLowerCase().includes(sv.qui.toLowerCase().slice(0, 18));
        if (sv.objet && !memeChose) sous.push(sv.objet);
        droite.append(ligne('span', 'p-marche-detail', sous.join(' · ')));
        li.append(droite);
        ul.append(li);
      }
      groupe.append(ul);
      bloc.append(groupe);
    }

    const seuil = territoire?.subventionsSeuil;
    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les données essentielles des subventions, versées au schéma national. ` +
          `Les montants ne sont pas additionnés` +
          (seuil
            ? ` : l'obligation de publier ne porte que sur les conventions de plus de ` +
              `${seuil.toLocaleString('fr-FR')} €, et chaque collectivité choisit d'en publier ` +
              `davantage ou non. Un total serait sous-estimé d'une part qu'on ne connaît pas`
            : '') +
          `. Une collectivité qui n'apparaît pas ici publie ses subventions sur son propre ` +
          `site, sans les verser en données ouvertes. Les aides versées à une personne ne sont ` +
          `pas reprises.`,
      ),
    );
    return bloc;
  }

  /**
   * Ce qui a été délibéré.
   *
   * C'est ici que se décide ce que le reste du panneau décrit : une compétence
   * transférée l'a été par une délibération, un budget voté l'est en séance.
   * Le site montrait le résultat sans jamais montrer l'acte.
   *
   * **La couverture est partielle, et le bloc ne vaut jamais zéro.** Il
   * n'existe aucune consolidation nationale : l'ordonnance de 2021 impose de
   * publier les actes en ligne, sur le site de la collectivité, sans créer de
   * dépôt central. Une collectivité absente d'ici n'est donc pas une
   * collectivité qui ne délibère pas — c'est une collectivité qui ne verse pas
   * ses actes en données ouvertes. Le bloc n'apparaît que là où il y a quelque
   * chose, et la phrase de source le dit.
   */
  function blocDeliberations(): HTMLElement | null {
    const liste = territoire?.deliberations;
    if (!liste || liste.length === 0) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-marches p-delibs';
    bloc.append(ligne('h3', 'p-titre-section', 'Ce qui a été délibéré'));

    for (const [rang, c] of liste.entries()) {
      // Même pli que les marchés : la commune ouverte, ses groupements repliés.
      const replie = rang > 0;
      const groupe = document.createElement(replie ? 'details' : 'div');
      groupe.className = 'p-marche-acheteur';
      const titre = document.createElement(replie ? 'summary' : 'p');
      titre.className = 'p-marche-qui';
      titre.append(glose('span', 'p-marche-nom', c.nom));
      if (c.natureLibelle) titre.append(ligne('span', 'p-marche-nature', c.natureLibelle));
      titre.append(
        ligne(
          'span',
          'p-marche-total',
          `${c.total.toLocaleString('fr-FR')} délibération${c.total > 1 ? 's' : ''}` +
            (c.total > c.liste.length ? `, les ${c.liste.length} plus récentes` : ''),
        ),
      );
      groupe.append(titre);

      // De quoi il est question, avant le détail : trois familles suffisent à
      // dire si une assemblée passe son temps sur ses finances ou sur son
      // urbanisme.
      if (c.familles.length > 0) {
        groupe.append(
          ligne(
            'p',
            'p-delib-familles',
            c.familles.map((f) => `${f.nom.toLowerCase()} (${f.nombre})`).join(' · '),
          ),
        );
      }

      const ul = document.createElement('ul');
      for (const d of c.liste) {
        const li = document.createElement('li');
        li.className = 'p-delib';
        li.append(ligne('span', 'p-delib-date', moisAnnee(d.date) ?? d.date));
        const droite = document.createElement('span');
        // L'acte lui-même quand la collectivité en donne l'adresse : le site
        // renvoie vers le document, il ne l'héberge pas.
        if (d.url) {
          const a = document.createElement('a');
          a.className = 'p-marche-objet';
          a.href = d.url;
          a.rel = 'noopener';
          a.textContent = d.objet;
          droite.append(a);
        } else droite.append(ligne('span', 'p-marche-objet', d.objet));
        if (d.famille) droite.append(ligne('span', 'p-marche-detail', d.famille.toLowerCase()));
        li.append(droite);
        ul.append(li);
      }
      groupe.append(ul);
      bloc.append(groupe);
    }

    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les délibérations versées en données ouvertes au schéma national` +
          (territoire?.delibDepuis ? `, depuis ${territoire.delibDepuis.slice(0, 4)}` : '') +
          `. Il n'existe pas de recensement national : une collectivité qui n'apparaît pas ici ` +
          `publie ses actes sur son propre site, comme la loi l'y oblige depuis 2022, sans les ` +
          `verser en données ouvertes. Les délibérations dont l'objet nomme une personne ne sont ` +
          `pas reprises.`,
      ),
    );
    return bloc;
  }

  /**
   * Un montant lisible d'un coup d'œil : 489 k€, 2,0 M€.
   *
   * L'euro près n'apprend rien sur un marché public, et « 489 025 € » se lit
   * plus lentement que « 489 k€ » quand on parcourt une liste.
   */
  function montantCourt(v: number | null): string {
    if (v === null) return '—';
    if (Math.abs(v) >= 1_000_000) {
      return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M\u20ac`;
    }
    if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000).toLocaleString('fr-FR')} k\u20ac`;
    return `${Math.round(v).toLocaleString('fr-FR')} \u20ac`;
  }

  /**
   * Comment le conseil municipal a été élu.
   *
   * Le bloc précédent nomme le maire ; celui-ci dit dans quelles conditions il
   * a été désigné. Trois chiffres, chacun rapporté à sa médiane nationale —
   * 57 % de participation n'est ni bon ni mauvais tant qu'on ignore que la
   * médiane est à 63 %.
   *
   * **Aucune nuance politique, aucun nom de candidat.** Le site nomme le maire
   * parce qu'un annuaire le publie et qu'il faut savoir à qui écrire ; relier
   * une personne à une opinion est une autre affaire, et reste interdit.
   */
  function blocScrutin(): HTMLElement | null {
    const sc = territoire?.scrutin;
    if (!sc) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-scrutin';
    bloc.append(ligne('h4', 'p-titre-bloc', `Comment le conseil a été élu — ${sc.nom}`));

    for (const t of sc.tours) {
      if (t.inscrits === 0) continue;
      const d = document.createElement('div');
      d.className = 'p-scrutin-tour';
      if (sc.tours.length > 1) {
        d.append(ligne('span', 'p-service-famille', t.numero === 1 ? 'Premier tour' : 'Second tour'));
      }
      const dl = document.createElement('dl');
      dl.className = 'p-reperes';

      const taux = (valeur: number, total: number) => (total > 0 ? (valeur / total) * 100 : 0);
      const lignes: { nom: string; valeur: number; mediane: number; detail: string }[] = [
        {
          nom: 'Participation',
          valeur: taux(t.votants, t.inscrits),
          mediane: t.medianeParticipation,
          detail: `${t.votants.toLocaleString('fr-FR')} votants sur ${t.inscrits.toLocaleString('fr-FR')} inscrits`,
        },
        {
          nom: 'Bulletins blancs ou nuls',
          valeur: taux(t.refus, t.votants),
          mediane: t.medianeRefus,
          detail: `${t.refus.toLocaleString('fr-FR')} sur ${t.votants.toLocaleString('fr-FR')} votants`,
        },
      ];
      for (const l of lignes) {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = l.nom;
        const dd = document.createElement('dd');
        dd.append(
          ligne(
            'span',
            'p-montant',
            `${l.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`,
          ),
        );
        if (l.mediane > 0) {
          dd.append(reglette(l.valeur, l.mediane, 'la médiane nationale'));
          dd.append(
            ligne(
              'span',
              'p-mediane',
              `médiane ${l.mediane.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`,
            ),
          );
        }
        dd.append(ligne('span', 'p-scrutin-detail', l.detail));
        div.append(dt, dd);
        dl.append(div);
      }
      d.append(dl);

      // Le nombre de listes dit s'il y avait un choix. Deux communes sur trois
      // n'en avaient qu'une : c'est le chiffre qui donne sa mesure au cas local.
      if (t.listes > 0) {
        d.append(
          ligne(
            'p',
            'p-scrutin-listes',
            t.listes === 1
              ? `Une seule liste se présentait, comme dans ${sc.partListeUnique} % des communes.`
              : `${t.listes} listes se présentaient. Dans ${sc.partListeUnique} % des communes, ` +
                `il n'y en avait qu'une.`,
          ),
        );
      }
      bloc.append(d);
    }

    // Les sièges au conseil communautaire : le poids de la commune là où se
    // décident les compétences transférées, que tout le reste du panneau décrit.
    const sieges: string[] = [];
    if (sc.sieges > 0) sieges.push(`${sc.sieges} sièges au conseil municipal`);
    if (sc.siegesCc > 0) sieges.push(`${sc.siegesCc} au conseil communautaire`);
    if (sieges.length > 0) bloc.append(ligne('p', 'p-scrutin-sieges', `${sieges.join(', ')}.`));

    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les résultats publiés par le ministère de l'Intérieur (${sc.maj}). ` +
          `Les nuances politiques ne sont pas reprises : le site nomme des fonctions et des ` +
          `chiffres, pas des opinions.`,
      ),
    );
    return bloc;
  }

  /**
   * À quoi l'endroit est exposé, et ce qui y est déjà arrivé.
   *
   * Le reste du panneau dit qui décide ; celui-ci dit ce qui arrive. C'est la
   * première question qu'on se pose en arrivant quelque part, bien avant de
   * savoir qui exerce la compétence voirie.
   *
   * **Deux listes, et elles ne se recouvrent pas.** Le dossier départemental
   * recense ce à quoi l'État estime la commune exposée ; les arrêtés disent ce
   * qui est arrivé. Au Mayet-de-Montagne, le premier retient le séisme et le
   * feu de forêt, le second compte trois inondations, une sécheresse, une
   * tempête et un mouvement de terrain. Les fondre serait plus simple et faux :
   * ce sont deux instruments, l'un prospectif et l'autre constaté.
   */
  function blocRisques(): HTMLElement | null {
    const r = territoire?.risques;
    if (!r) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-risques';
    bloc.append(ligne('h3', 'p-titre-section', 'À quoi la commune est exposée'));

    if (r.recenses.length > 0) {
      const d = document.createElement('div');
      d.className = 'p-risque-groupe';
      d.append(ligne('span', 'p-service-famille', 'Recensés au dossier départemental'));
      const ul = document.createElement('ul');
      for (const e of r.recenses) {
        const li = document.createElement('li');
        li.append(ligne('span', 'p-risque-nom', e.nom));
        // Le sous-type sous sa famille : « Inondation » puis « par une crue à
        // débordement lent ». GASPAR les met au même niveau, ce qui les ferait
        // lire comme deux risques distincts.
        if (e.sous.length > 0) {
          li.append(
            ligne(
              'span',
              'p-risque-detail',
              e.sous.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(' · '),
            ),
          );
        }
        ul.append(li);
      }
      d.append(ul);
      bloc.append(d);
    }

    if (r.catnat.length > 0) {
      const d = document.createElement('div');
      d.className = 'p-risque-groupe';
      // Le nombre médian tient lieu de référence : presque toutes les communes
      // ont au moins un arrêté, donc le chiffre brut ne distingue personne.
      d.append(
        ligne(
          'span',
          'p-service-famille',
          `Reconnaissances de catastrophe naturelle depuis 1982 — ` +
            `${r.totalCatnat.toLocaleString('fr-FR')}, médiane nationale ${r.medianeCatnat}`,
        ),
      );
      const ul = document.createElement('ul');
      for (const c of r.catnat) {
        const li = document.createElement('li');
        li.append(ligne('span', 'p-risque-nombre', String(c.nombre)));
        const droite = document.createElement('span');
        droite.append(ligne('span', 'p-risque-nom', c.nom));
        const annee = c.dernier.slice(0, 4);
        if (annee) {
          droite.append(
            ligne('span', 'p-risque-detail', c.nombre > 1 ? `dernier en ${annee}` : `en ${annee}`),
          );
        }
        li.append(droite);
        ul.append(li);
      }
      d.append(ul);
      bloc.append(d);
    }

    if (r.plans.length > 0) {
      const d = document.createElement('div');
      d.className = 'p-risque-groupe';
      d.append(ligne('span', 'p-service-famille', 'Plans de prévention'));
      const ul = document.createElement('ul');
      for (const p of r.plans) {
        const li = document.createElement('li');
        li.className = 'p-risque-plan';
        li.append(ligne('span', 'p-risque-nom', p.nom || p.modele));
        const sous: string[] = [];
        if (p.nom && p.modele) sous.push(p.modele);
        // « Opposable » est le mot qui compte : le plan s'impose alors aux
        // permis, et le dire autrement le ferait passer pour un avis.
        if (p.etat) sous.push(p.etat.toLowerCase());
        const annee = p.date.slice(0, 4);
        if (annee) sous.push(annee);
        li.append(ligne('span', 'p-risque-detail', sous.join(' · ')));
        ul.append(li);
      }
      d.append(ul);
      bloc.append(d);
    }

    // Le document d'information communal : l'un des rares endroits où le site
    // peut dire qu'une obligation n'est pas remplie. La nuance compte : la
    // périodicité biennale ne s'impose que là où un plan est prescrit ou
    // approuvé, et le site sait lequel des deux cas s'applique.
    const soumise = r.plans.length > 0;
    bloc.append(
      ligne(
        'p',
        r.dicrim ? 'p-risque-dicrim' : 'p-risque-dicrim p-risque-dicrim--absent',
        r.dicrim
          ? `Document d'information communal publié en ${r.dicrim}. Il se demande en mairie.`
          : soumise
            ? `Aucun document d'information communal recensé. La commune ayant un plan de ` +
              `prévention, le maire doit en établir un et informer la population tous les deux ans.`
            : `Aucun document d'information communal recensé. Son absence ne dit rien des ` +
              `risques eux-mêmes — seulement que cette information n'a pas été faite.`,
      ),
    );

    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après GASPAR, la base du ministère de la Transition écologique (${r.maj}). ` +
          `Les risques recensés et les catastrophes reconnues sont deux listes distinctes : ` +
          `la première dit ce à quoi l'État estime la commune exposée, la seconde ce qui est arrivé.`,
      ),
    );
    return bloc;
  }

  /**
   * L'obligation de logements sociaux.
   *
   * C'est l'une des rares obligations chiffrées, datées et sanctionnées qui
   * pèse sur une commune : un taux à atteindre, un écart constaté, et un
   * prélèvement quand il n'est pas comblé. Le reste du site dit qui décide ;
   * ici, il dit ce que la loi exige et où en est la commune.
   *
   * Rien n'est affiché pour les communes absentes de l'inventaire : elles ne
   * sont pas soumises à l'article 55, et écrire « 0 » se lirait comme un
   * manquement.
   */
  function blocSru(): HTMLElement | null {
    const s = territoire?.sru;
    if (!s) return null;
    const bloc = document.createElement('section');
    bloc.className = 'p-sru';
    bloc.append(ligne('h3', 'p-titre-section', 'Logement social : ce que la loi exige'));

    const dl = document.createElement('dl');
    dl.className = 'p-sru-liste';
    const item = (cle: string, valeur: string, classe = '') => {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = cle;
      d.append(dt, ligne('dd', classe, valeur));
      dl.append(d);
    };

    if (s.lls !== null) item('Logements sociaux', s.lls.toLocaleString('fr-FR'));
    else if (s.llsTexte) item('Logements sociaux', s.llsTexte);

    const taux = s.taux !== null ? `${s.taux.toLocaleString('fr-FR')} %` : s.tauxTexte;
    if (taux) {
      item(
        'Taux atteint',
        s.cible !== null ? `${taux} — cible ${s.cible.toLocaleString('fr-FR')} %` : taux,
      );
    }
    bloc.append(dl);

    // L'état de la commune, en une phrase. Trois situations distinctes, et la
    // troisième — la carence — est la seule où l'État peut se substituer au
    // maire pour délivrer les permis.
    if (s.exemptee) {
      bloc.append(ligne('p', 'p-sru-etat', 'Commune exemptée de l’obligation pour la période en cours.'));
    } else if (s.carencee) {
      bloc.append(
        ligne(
          'p',
          'p-sru-etat p-sru-etat--carence',
          'Commune déclarée carencée : le préfet peut se substituer au maire pour délivrer ' +
            'les permis et majorer le prélèvement.',
        ),
      );
    } else if (s.deficitaire === true) {
      bloc.append(ligne('p', 'p-sru-etat p-sru-etat--deficit', 'Commune déficitaire : la cible n’est pas atteinte.'));
    } else if (s.deficitaire === false) {
      bloc.append(ligne('p', 'p-sru-etat', 'Obligation respectée.'));
    }

    if (s.prelevement !== null && s.prelevement > 0) {
      bloc.append(
        ligne(
          'p',
          'p-sru-prelevement',
          `Prélèvement de l’année : ${Math.round(s.prelevement).toLocaleString('fr-FR')} \u20ac.`,
        ),
      );
    }

    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `Inventaire annuel de l’article 55 de la loi SRU${territoire?.sruMaj ? ` (${territoire.sruMaj})` : ''}. ` +
          `Les communes qui n’y figurent pas ne sont pas soumises à l’obligation : elles n’atteignent ` +
          `pas les seuils de population et d’agglomération.`,
      ),
    );
    return bloc;
  }

  /**
   * Les droits de mutation : ce qu'une vente rapporte, et à qui.
   *
   * C'est le malentendu le plus répandu de la fiscalité locale. Ce qu'on
   * appelle « frais de notaire » est à environ 80 % de l'impôt, et cet impôt ne
   * va pas au notaire : il va au département et aux communes — deux échelons
   * que ce panneau décrit déjà. Le notaire le collecte et le reverse.
   *
   * La part communale est le point qui mérite l'attention, et le site peut
   * trancher parce qu'il connaît la population : au-dessus de 5 000 habitants
   * elle revient à la commune, en dessous elle alimente un fonds départemental
   * redistribué selon un barème voté par le conseil départemental.
   */
  function blocDmto(): HTMLElement | null {
    const d = territoire?.dmto;
    if (!d) return null;
    const dernier = d.departement.reduce<number>((k, v, i) => (v !== null ? i : k), -1);
    if (dernier === -1) return null;

    const bloc = document.createElement('section');
    bloc.className = 'p-finances p-dmto';
    bloc.append(ligne('h3', 'p-titre-section', 'Ce que rapporte une vente immobilière'));
    bloc.append(
      ligne(
        'p',
        'p-strate',
        `Les droits de mutation — l'essentiel de ce qu'on appelle « frais de notaire » — ` +
          `sont un impôt, et le notaire ne fait que le collecter. Recettes de ` +
          `${d.annees[dernier]}.`,
      ),
    );

    const dl = document.createElement('dl');
    dl.className = 'p-reperes';
    const rang = (nom: string, aide: string, serie: (number | null)[]) => {
      const v = serie[dernier];
      if (v === null || v === undefined) return;
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = nom;
      dt.title = aide;
      const dd = document.createElement('dd');
      dd.append(ligne('span', 'p-montant', montantCourt(v)));
      const courbe = tendance(serie, d.annees, montantCourt);
      if (courbe) {
        const l = document.createElement('span');
        l.className = 'p-tendance-ligne';
        l.append(courbe);
        const ev = variation(serie);
        if (ev !== null) {
          l.append(
            ligne(
              'span',
              'p-evolution',
              `${ev >= 0 ? '+' : '\u2212'}${Math.abs(ev)} % depuis ` +
                `${debutSerie(serie, d.annees) ?? d.annees[0]}`,
            ),
          );
        }
        dd.append(l);
      }
      div.append(dt, dd);
      dl.append(div);
    };
    rang(
      'Au département',
      "Taxe départementale de publicité foncière et droits départementaux d'enregistrement.",
      d.departement,
    );
    rang(
      'Aux communes du département',
      'Taxe communale additionnelle, encaissée pour l’ensemble des communes du département.',
      d.communes,
    );
    bloc.append(dl);

    // Le seul endroit du site où une règle de droit change de réponse selon la
    // population de la commune, et où le site sait laquelle s'applique.
    bloc.append(
      ligne(
        'p',
        'p-dmto-part',
        d.partDirecte
          ? `Votre commune dépassant 5 000 habitants, la part communale lui revient directement.`
          : `Votre commune comptant 5 000 habitants ou moins, cette part ne lui revient pas ` +
              `directement : elle alimente un fonds de péréquation départemental, redistribué ` +
              `selon un barème voté par le conseil départemental. Les stations de tourisme ` +
              `classées font exception, et le site ne connaît pas ce classement.`,
      ),
    );
    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `Recettes mensuelles publiées par la direction générale des finances publiques, ` +
          `totalisées par exercice complet (${d.maj}). Le taux voté par chaque conseil ` +
          `départemental est publié à part : le site n'en recopie pas la table.`,
      ),
    );
    return bloc;
  }

  /** Une réglette : le trait est la médiane, le point la commune. */
  function reglette(valeur: number, mediane: number, reference = 'la médiane de la strate'): SVGSVGElement {
    const L = 108;
    const H = 14;
    // L'échelle va de 0 à deux fois la médiane : au-delà, on bute au bord et le
    // point le montre plutôt que d'écraser toutes les autres lignes.
    const x = Math.max(4, Math.min(L - 4, (valeur / (mediane * 2)) * L));
    const s = el('svg', { class: 'reglette', width: L, height: H, viewBox: `0 0 ${L} ${H}` });
    const titre = el('title');
    const ecart = Math.round((valeur / mediane - 1) * 100);
    titre.textContent = `${ecart >= 0 ? '+' : ''}${ecart} % par rapport à ${reference}`;
    s.append(
      titre,
      el('line', { class: 'reglette-axe', x1: 2, y1: H / 2, x2: L - 2, y2: H / 2 }),
      el('line', { class: 'reglette-mediane', x1: L / 2, y1: 2, x2: L / 2, y2: H - 2 }),
      el('circle', { class: 'reglette-anneau', cx: x, cy: H / 2, r: 5.5 }),
      el('circle', { class: 'reglette-point', cx: x, cy: H / 2, r: 4 }),
    );
    return s;
  }

  /**
   * La série d'un repère, en courbe minuscule.
   *
   * Un chiffre isolé ne se discute pas ; une série dit ce qui a changé, et
   * c'est de là que part toute question à un élu. L'échelle est propre à chaque
   * repère et part de zéro : une dotation qui passe de 300 à 280 € doit se voir
   * comme une inflexion, pas comme un effondrement — ce qu'un cadrage sur les
   * seuls extrêmes ferait croire.
   */
  function tendance(
    serie: (number | null)[],
    annees: number[],
    /**
     * Comment écrire un montant dans l'infobulle. Les repères communaux sont
     * en euros par habitant et se lisent tels quels ; les droits de mutation
     * se comptent en millions, où « 31 134 000 € » se déchiffre au lieu de se
     * lire.
     */
    formater: (v: number) => string = (v) => `${v.toLocaleString('fr-FR')} \u20ac`,
  ): SVGSVGElement | null {
    const points = serie
      .map((v, i) => ({ v, i }))
      .filter((p): p is { v: number; i: number } => p.v !== null);
    if (points.length < 3) return null;
    const L = 108;
    const H = 20;
    const haut = Math.max(...points.map((p) => p.v), 0);
    const bas = Math.min(...points.map((p) => p.v), 0);
    const etendue = haut - bas || 1;
    const x = (i: number) => 2 + (i / Math.max(1, serie.length - 1)) * (L - 4);
    const y = (v: number) => H - 3 - ((v - bas) / etendue) * (H - 6);
    const d = points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');

    const s = el('svg', { class: 'tendance', width: L, height: H, viewBox: `0 0 ${L} ${H}` });
    const titre = el('title');
    const premier = points[0];
    const dernier = points[points.length - 1];
    titre.textContent =
      `${annees[premier.i]} : ${formater(premier.v)} · ${annees[dernier.i]} : ${formater(dernier.v)}`;
    s.append(
      titre,
      el('path', { class: 'tendance-trait', d }),
      el('circle', { class: 'tendance-fin', cx: x(dernier.i), cy: y(dernier.v), r: 2.6 }),
    );
    return s;
  }

  function ecrirePanneauAccueil() {
    vider(panneau);
    panneau.append(
      ligne(
        'p',
        'p-intro',
        'Chaque colonne est un échelon, chaque pastille un acteur. Survolez une famille de relations dans la légende pour ne garder qu’elle ; survolez un acteur pour ne garder que son voisinage.',
      ),
      ligne('p', 'p-intro', 'Cliquez sur un acteur pour déplier ses rouages.'),
    );

    const chiffres = document.createElement('dl');
    chiffres.className = 'p-chiffres';
    const compte: [string, number][] = [
      ['Acteurs', reseau.noeuds.filter((n) => n.type === 'acteur').length],
      ['Compétences', reseau.noeuds.filter((n) => n.type === 'competence').length],
      ['Relations', reseau.aretes.length],
      ['Pages liées', new Set(reseau.noeuds.flatMap((n) => n.liens.map((l) => l.url))).size],
    ];
    for (const [nom, valeur] of compte) {
      const d = document.createElement('div');
      d.append(ligne('dt', '', nom), ligne('dd', '', String(valeur)));
      chiffres.append(d);
    }
    panneau.append(chiffres);

    const chezVous = blocTerritoire();
    if (chezVous) panneau.append(chezVous);

    // Les procédures ne sont pas sur la carte, qui ne montre que des acteurs :
    // sans cette liste, le contenu le plus utile du site serait invisible.
    const procedures = reseau.noeuds
      .filter((n) => n.type === 'processus')
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (procedures.length > 0) {
      panneau.append(ligne('h3', 'p-titre-section', 'Où vous pouvez agir'));
      const ul = document.createElement('ul');
      ul.className = 'p-procedures';
      for (const n of procedures) {
        const b = document.createElement('button');
        b.type = 'button';
        b.append(fragmentGlose(n.nom));
        b.addEventListener('click', () => ouvrir(n.id));
        const li = document.createElement('li');
        li.append(b, glose('span', 'v-nature', n.resume));
        ul.append(li);
      }
      panneau.append(ul);
    }

    // Légende des formes : le type d'un nœud ne passe pas par la couleur.
    panneau.append(ligne('h3', 'p-titre-section', 'La forme dit le type'));
    const formes = document.createElement('ul');
    formes.className = 'p-formes';
    for (const [type, texte] of [
      ['acteur', 'Acteur — pastille'],
      ['competence', 'Compétence — plaque'],
      ['processus', 'Processus — barre de départ'],
      ['document', 'Document — coin replié'],
    ] as const) {
      const li = document.createElement('li');
      const s = el('svg', { width: 46, height: 20, viewBox: '0 0 46 20', 'aria-hidden': 'true' });
      const g = el('g', { class: `n n--${type}` });
      for (const e of formeNoeud(type, 44, 18)) g.append(el(e.balise, { ...e.attrs, transform: 'translate(1 1)' }));
      s.append(g);
      li.append(s, ligne('span', '', texte));
      formes.append(li);
    }
    panneau.append(formes);

    // La carte n'a pas de pied de page : sans ce lien, le signalement serait
    // hors d'atteinte depuis la page où le site se lit le plus.
    const signaler = document.createElement('p');
    signaler.className = 'p-signaler';
    const vers = document.createElement('a');
    vers.href = urlSignaler(undefined, territoire?.commune.code, '/');
    vers.textContent = 'Signaler une erreur';
    signaler.append(vers);
    panneau.append(signaler);
  }

  function ecrirePanneau(n: Noeud, voisins: { noeud: Noeud; label: string; fam: Famille }[]) {
    vider(panneau);

    const type = document.createElement('p');
    type.className = 'p-type';
    type.append(document.createTextNode(LIBELLE_TYPE_NOEUD[n.type]));
    if (n.confiance !== 'etabli') {
      type.append(
        document.createTextNode(' · '),
        ligne(
          'span',
          'p-confiance',
          n.confiance === 'variable_selon_territoire' ? 'variable selon le territoire' : 'à confirmer',
        ),
      );
    }
    panneau.append(type, glose('h2', 'p-nom', n.nom));
    if (n.resume) panneau.append(glose('p', 'p-resume', n.resume));

    if (n.banatic && n.banatic.length > 0) {
      const chez = blocTerritoire(n.id);
      if (chez) panneau.append(chez);
      else panneau.append(ligne('p', 'p-invite-commune', 'Cette compétence varie selon le territoire — indiquez votre commune pour savoir qui l’exerce chez vous.'));
    }

    panneau.append(ligne('h3', 'p-titre-section', 'Pour en savoir plus'));
    const parType = new Map<string, typeof n.liens>();
    for (const l of n.liens) {
      if (!parType.has(l.type)) parType.set(l.type, []);
      parType.get(l.type)!.push(l);
    }
    if (parType.size === 0) panneau.append(ligne('p', 'p-vide', 'Aucune page liée.'));
    for (const [t, liste] of parType) {
      const groupe = document.createElement('div');
      groupe.className = 'p-groupe';
      groupe.append(ligne('h3', '', LIBELLE_LIEN[t] ?? t));
      const ul = document.createElement('ul');
      for (const l of liste) {
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = l.titre;
        const li = document.createElement('li');
        li.append(a);
        ul.append(li);
      }
      groupe.append(ul);
      panneau.append(groupe);
    }

    panneau.append(ligne('h3', 'p-titre-section', `${voisins.length} relations`));
    const ul = document.createElement('ul');
    ul.className = 'p-relations';
    for (const v of voisins) {
      const li = document.createElement('li');
      li.append(ligne('span', `p-cle p-cle--${v.fam}`, ''));
      const bloc = document.createElement('span');
      const b = document.createElement('button');
      b.type = 'button';
      b.append(fragmentGlose(v.noeud.nom));
      b.addEventListener('click', () => ouvrir(v.noeud.id));
      bloc.append(ligne('span', 'p-relation', v.label), b);
      li.append(bloc);
      ul.append(li);
    }
    panneau.append(ul);

    const permalien = document.createElement('p');
    permalien.className = 'p-permalien';
    const a = document.createElement('a');
    a.href = `/n/${n.id}`;
    a.textContent = 'Page de ce nœud, sans JavaScript';
    permalien.append(a);
    panneau.append(permalien);

    // Le signalement part d'où l'erreur se voit, et emporte ce que le lecteur
    // avait sous les yeux — la fiche, et la commune s'il en a choisi une. Un
    // formulaire de contact générique produirait des messages incorrigeables.
    const signaler = document.createElement('p');
    signaler.className = 'p-signaler';
    const s = document.createElement('a');
    s.href = urlSignaler(n.id, territoire?.commune.code);
    s.textContent = 'Signaler une erreur sur cette fiche';
    signaler.append(s);
    panneau.append(signaler);
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  /**
   * Ouvrir un nœud est une navigation, pas un changement d'affichage : elle
   * ajoute une entrée à l'historique, et le bouton Retour du navigateur y
   * ramène. Sans cela, parcourir dix nœuds n'en laissait aucune trace et le
   * Retour faisait sortir du site.
   *
   * `remplacer` sert au démarrage et aux retours arrière, qui restituent un
   * état déjà présent dans l'historique plutôt que d'en empiler un de plus.
   */
  function ouvrir(id: string, remplacer = false) {
    etat.mode = 'focus';
    // Changer de nœud referme la famille dépliée : elle appartenait au nœud
    // précédent, la reporter sur le suivant n'aurait pas de sens.
    if (etat.focus !== id) etat.familleDepliee = null;
    etat.focus = id;
    const url = `${location.pathname}${location.search}#${id}`;
    if (remplacer) history.replaceState({ noeud: id }, '', url);
    else history.pushState({ noeud: id }, '', url);
    rendreFocus(id);
  }

  function versCarte(remplacer = false) {
    etat.mode = 'carte';
    etat.focus = null;
    const url = location.pathname + location.search;
    if (remplacer) history.replaceState({ noeud: null }, '', url);
    else history.pushState({ noeud: null }, '', url);
    rendreCarte();
  }

  /**
   * L'URL fait foi : Retour, Suivant, et un lien `#id` collé dans la barre
   * d'adresse d'une page déjà ouverte passent tous par ici. Auparavant ce
   * dernier cas ne redessinait rien — le fragment changeait, l'écran non.
   */
  window.addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    if (id && index.has(id)) {
      etat.mode = 'focus';
      if (etat.focus !== id) etat.familleDepliee = null;
      etat.focus = id;
      rendreFocus(id);
    } else {
      etat.mode = 'carte';
      etat.focus = null;
      rendreCarte();
    }
  });

  /**
   * Depuis une famille dépliée, on remonte d'abord aux grappes : c'est l'écran
   * d'où l'on vient. Sans cela, déplier puis vouloir revenir renverrait
   * directement à la carte, deux crans trop loin.
   */
  function remonter() {
    if (etat.mode === 'focus' && etat.familleDepliee && etat.focus) {
      etat.familleDepliee = null;
      rendreFocus(etat.focus);
      return;
    }
    versCarte();
  }

  retour?.addEventListener('click', remonter);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && etat.mode === 'focus') remonter();
  });

  /* --- la légende commande l'affichage ----------------------------- */
  for (const cle of document.querySelectorAll<HTMLButtonElement>('.cle')) {
    const fam = cle.dataset.famille as Famille;
    cle.addEventListener('click', () => {
      const affichee = etat.visibles.has(fam);
      if (affichee) etat.visibles.delete(fam);
      else etat.visibles.add(fam);
      cle.setAttribute('aria-pressed', String(!affichee));
      appliquerVisibilite();
    });
    // Survoler une clé de légende éteint les autres familles : c'est la façon
    // la moins destructive de lire une couche dans un graphe dense.
    cle.addEventListener('pointerenter', () => accentuer(fam));
    cle.addEventListener('focus', () => accentuer(fam));
    cle.addEventListener('pointerleave', rallumer);
    cle.addEventListener('blur', rallumer);
  }

  /* --- le choix de la commune ------------------------------------- */

  const boutonCommune = document.getElementById('ouvrir-commune');
  const zoneCommune = document.getElementById('choix-commune');
  const champCommune = document.getElementById('recherche-commune') as HTMLInputElement | null;
  const listeCommune = document.getElementById('resultats-commune');
  const etiquetteCommune = document.getElementById('etiquette-commune');
  const oublier = document.getElementById('oublier-commune');

  function afficherChoixCommune(ouvert: boolean) {
    if (!zoneCommune || !boutonCommune) return;
    zoneCommune.hidden = !ouvert;
    boutonCommune.setAttribute('aria-expanded', String(ouvert));
    if (ouvert) champCommune?.focus();
  }

  async function choisirCommune(c: CommuneBreve | null) {
    if (!c) {
      territoire = null;
      memoriser(null);
      if (etiquetteCommune) etiquetteCommune.textContent = 'Chez moi';
      oublier?.setAttribute('hidden', '');
      history.replaceState(null, '', location.pathname + location.hash);
    } else {
      try {
        territoire = await resoudre(c);
      } catch {
        // Département introuvable ou hors métropole : on ne prétend pas savoir.
        territoire = null;
        if (listeCommune) listeCommune.textContent = '';
        if (etiquetteCommune) etiquetteCommune.textContent = 'Chez moi';
        return;
      }
      memoriser(c);
      if (etiquetteCommune) etiquetteCommune.textContent = `${c.nom} · ${c.depNom ?? c.dep}`;
      oublier?.removeAttribute('hidden');
      const u = new URL(location.href);
      u.searchParams.set('commune', c.code);
      history.replaceState(null, '', u.toString());
    }
    afficherChoixCommune(false);
    if (champCommune) champCommune.value = '';
    if (listeCommune) listeCommune.textContent = '';
    // Le territoire change ce qui est dessiné : on redessine.
    if (etat.mode === 'focus' && etat.focus) rendreFocus(etat.focus);
    else rendreCarte();
  }

  boutonCommune?.addEventListener('click', () => {
    afficherChoixCommune(zoneCommune?.hidden !== false);
  });
  oublier?.addEventListener('click', () => void choisirCommune(null));

  let rechercheEnCours = 0;
  champCommune?.addEventListener('input', () => {
    const mien = ++rechercheEnCours;
    const q = champCommune.value;
    void chercherCommune(q).then((trouves) => {
      if (mien !== rechercheEnCours || !listeCommune) return;
      vider(listeCommune);
      for (const c of trouves) {
        const b = document.createElement('button');
        b.type = 'button';
        const gauche = document.createElement('span');
        gauche.className = 'commune-nom';
        gauche.append(
          document.createTextNode(c.nom),
          ligne('span', 'commune-dep', `${c.depNom} · ${c.cp}`),
        );
        b.append(
          gauche,
          ligne(
            'span',
            'commune-pop',
            `${c.population.toLocaleString('fr-FR')} hab.`,
          ),
        );
        b.addEventListener('click', () => void choisirCommune(c));
        const li = document.createElement('li');
        li.append(b);
        listeCommune.append(li);
      }
    });
  });

  /* --- recherche : indispensable dès que la carte grossit ---------- */
  recherche?.addEventListener('input', () => {
    const q = recherche.value.trim().toLowerCase();
    if (!resultats) return;
    vider(resultats);
    if (q.length < 2) return;
    for (const n of reseau.noeuds
      .filter((n) => n.nom.toLowerCase().includes(q) || n.resume.toLowerCase().includes(q))
      .slice(0, 8)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.append(document.createTextNode(n.nom), ligne('span', '', LIBELLE_TYPE_NOEUD[n.type]));
      b.addEventListener('click', () => {
        ouvrir(n.id);
        recherche.value = '';
        vider(resultats);
      });
      const li = document.createElement('li');
      li.append(b);
      resultats.append(li);
    }
  });

  /* --- déplacement et zoom ----------------------------------------- */

  function appliquerVue() {
    toile.setAttribute('viewBox', `${vue.x} ${vue.y} ${vue.l} ${vue.h}`);
  }

  /**
   * Cadre sur ce qui est réellement dessiné, au lieu d'un gabarit fixe.
   *
   * Le focus se cadrait sur 1 060 unités de large quelle que soit la fenêtre :
   * sur un téléphone de 390 px, tout était réduit d'un tiers et illisible ;
   * sur un grand écran, un voisinage replié en trois grappes flottait au
   * milieu du vide. `getBBox` donne l'emprise exacte du contenu, et on
   * l'élargit dans la dimension qui manque pour respecter les proportions de
   * la scène — sinon le navigateur rogne pour nous.
   */
  function cadrerSurContenu(marge = 46) {
    const r = toile.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    let bb: DOMRect;
    try {
      bb = (toile as SVGSVGElement).getBBox();
    } catch {
      return;
    }
    if (bb.width === 0 || bb.height === 0) return;
    const proportion = r.width / r.height;
    let l = bb.width + marge * 2;
    let h = bb.height + marge * 2;
    if (l / h < proportion) l = h * proportion;
    else h = l / proportion;
    vue = { x: bb.x + bb.width / 2 - l / 2, y: bb.y + bb.height / 2 - h / 2, l, h };
    appliquerVue();
  }

  /**
   * Sur un grand écran, on montre toute la carte. Sur un téléphone, la montrer
   * entière la rendrait illisible : on entre alors à taille lisible, près de
   * chez soi — la commune — et on se déplace.
   */
  function cadrerCarte() {
    const { largeur, hauteur, colonnes } = reseau.carte;
    const r = toile.getBoundingClientRect();
    if (r.width >= 760 || r.width === 0) {
      // Cadré sur ce qui est réellement dessiné : la hauteur nominale de la
      // carte inclut des marges que personne n'a besoin de voir.
      const haut = reseau.carte.hautNoeuds - 22;
      vue = { x: 0, y: haut, l: largeur, h: reseau.carte.basNoeuds + 46 - haut };
      return;
    }
    const l = 620;
    const h = l * (r.height / r.width);
    const cible = colonnes.find((c) => c.echelon === 'commune') ?? colonnes[colonnes.length - 1];
    vue = { x: cible.x - l / 2, y: hauteur / 2 - h / 2, l, h };
  }

  function zoomer(facteur: number) {
    const cx = vue.x + vue.l / 2;
    const cy = vue.y + vue.h / 2;
    const nl = Math.max(220, Math.min(4200, vue.l * facteur));
    const nh = (nl / vue.l) * vue.h;
    vue = { x: cx - nl / 2, y: cy - nh / 2, l: nl, h: nh };
    appliquerVue();
  }

  document.getElementById('zoom-plus')?.addEventListener('click', () => zoomer(1 / 1.35));
  document.getElementById('zoom-moins')?.addEventListener('click', () => zoomer(1.35));
  document.getElementById('ajuster')?.addEventListener('click', () => {
    if (etat.mode === 'focus' && etat.focus) rendreFocus(etat.focus);
    else {
      cadrerCarte();
      appliquerVue();
    }
  });

  toile.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const facteur = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const r = toile.getBoundingClientRect();
      const px = vue.x + ((e.clientX - r.left) / r.width) * vue.l;
      const py = vue.y + ((e.clientY - r.top) / r.height) * vue.h;
      const nl = Math.max(220, Math.min(4200, vue.l * facteur));
      const nh = (nl / vue.l) * vue.h;
      vue = { x: px - ((px - vue.x) * nl) / vue.l, y: py - ((py - vue.y) * nh) / vue.h, l: nl, h: nh };
      appliquerVue();
    },
    { passive: false },
  );

  let glisse: { x: number; y: number } | null = null;
  toile.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.n')) return;
    glisse = { x: e.clientX, y: e.clientY };
    toile.setPointerCapture(e.pointerId);
    toile.classList.add('deplace');
  });
  toile.addEventListener('pointermove', (e) => {
    if (!glisse) return;
    const r = toile.getBoundingClientRect();
    vue.x -= ((e.clientX - glisse.x) / r.width) * vue.l;
    vue.y -= ((e.clientY - glisse.y) / r.height) * vue.h;
    glisse = { x: e.clientX, y: e.clientY };
    appliquerVue();
  });
  const relacher = () => {
    glisse = null;
    toile.classList.remove('deplace');
  };
  toile.addEventListener('pointerup', relacher);
  toile.addEventListener('pointercancel', relacher);

  /* --- démarrage ---------------------------------------------------- */
  // Lu avant tout rendu : l'ouverture d'un nœud réécrit l'URL.
  const communeDemandee = new URL(location.href).searchParams.get('commune');
  const ancre = location.hash.slice(1);
  // Au chargement, l'entrée d'historique existe déjà : on la complète au lieu
  // d'en ajouter une seconde, sinon un premier Retour ne ferait rien.
  if (ancre && index.has(ancre)) ouvrir(ancre, true);
  else {
    history.replaceState({ noeud: null }, '', location.href);
    rendreCarte();
  }

  // La commune vient de l'URL — une adresse partagée doit montrer le même
  // territoire — sinon du choix précédent, qu'on ne redemande pas à chaque fois.
  // Toujours par code INSEE : un nom peut désigner plusieurs communes, un code
  // non. Le choix mémorisé est réhydraté depuis l'index, pour qu'un
  // enregistrement d'une version antérieure retrouve son département.
  const retenue = memorisee();
  const codeVoulu = communeDemandee ?? retenue?.code ?? null;
  if (codeVoulu) {
    void trouverParCode(codeVoulu).then((c) => {
      if (c) void choisirCommune(c);
    });
  }
}
