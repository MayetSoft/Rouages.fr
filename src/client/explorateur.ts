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
import {
  chercher as chercherCommune,
  memorisee,
  memoriser,
  resoudre,
  trouverParCode,
  type CommuneBreve,
  type Territoire,
} from './territoire.ts';

const NS = 'http://www.w3.org/2000/svg';

interface Etat {
  mode: 'carte' | 'focus';
  focus: string | null;
  /** Familles affichées. La légende est la commande. */
  visibles: Set<Famille>;
}

interface Boite {
  noeud: Noeud;
  x: number;
  y: number;
  l: number;
  h: number;
}

const donnees = document.getElementById('donnees-reseau');
if (donnees) demarrer(JSON.parse(donnees.textContent ?? '{}') as Reseau);

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

    const L = 1060;
    const rayon = Math.min(370, 160 + voisins.length * 11);
    const H = rayon * 2 + 170;
    vue = { x: -L / 2, y: -H / 2, l: L, h: H };
    appliquerVue();

    toile.append(defsFleches());
    const gAretes = el('g', { class: 'couche-aretes' });
    const gNoeuds = el('g', { class: 'couche-noeuds' });

    const lCentre = largeurPastille(centre.court, 15, 160) + 16;
    const bCentre: Boite = { noeud: centre, x: 0, y: 0, l: lCentre, h: 46 };

    voisins.forEach((v, i) => {
      // Départ à midi puis rotation : l'ordre est stable d'une visite à l'autre.
      const angle = (i / voisins.length) * Math.PI * 2 - Math.PI / 2;
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
    retour?.removeAttribute('hidden');
    ecrirePanneau(centre, voisins);
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
      if (v.etat === 'transferee') {
        const ul = document.createElement('ul');
        ul.className = 'p-structures';
        for (const s of v.structures) {
          const li = document.createElement('li');
          li.append(glose('strong', '', s.nom), ligne('span', 'p-nature-jur', s.natureLibelle));
          ul.append(li);
        }
        bloc.append(ul);
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
      return bloc;
    }

    // Vue d'ensemble : toutes les compétences que ce territoire déplace.
    bloc.append(ligne('h3', 'p-titre-section', `Chez vous, à ${territoire.commune.nom}`));
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
      if (v.etat === 'transferee') dd.append(fragmentGlose(v.structures.map((s) => s.nom).join(' · ')));
      else if (v.etat === 'communale') dd.append(ligne('span', 'p-commune-seule', 'la commune'));
      else dd.append(ligne('span', 'p-incertain', 'non renseigné ici'));
      d.append(dt, dd);
      dl.append(d);
    }
    bloc.append(dl);
    bloc.append(
      ligne(
        'p',
        'p-source-territoire',
        `D'après les transferts de compétences déclarés à BANATIC (${territoire.maj}). ` +
          `Une compétence exercée sans transfert déclaré — par convention, par exemple — n'y figure pas.`,
      ),
    );
    return bloc;
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
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  function ouvrir(id: string) {
    etat.mode = 'focus';
    etat.focus = id;
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    rendreFocus(id);
  }

  function versCarte() {
    etat.mode = 'carte';
    etat.focus = null;
    history.replaceState(null, '', location.pathname + location.search);
    rendreCarte();
  }

  retour?.addEventListener('click', versCarte);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && etat.mode === 'focus') versCarte();
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
  if (ancre && index.has(ancre)) ouvrir(ancre);
  else rendreCarte();

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
