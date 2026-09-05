/**
 * L'explorateur : la seule page du site, ou presque.
 *
 * Deux états. La **carte** montre tous les acteurs rangés par échelon et ce qui
 * circule entre eux. Le **focus** ouvre un nœud et déplie ses relations. On
 * passe de l'un à l'autre en cliquant ; rien n'est rédigé, tout renvoie vers
 * les pages qui font autorité.
 *
 * Pas de bibliothèque : le rendu est du SVG construit à la main, et les deux
 * dispositions sont déterministes — la même donnée donne toujours la même
 * image.
 */
import type { Reseau, Noeud, TypeArete } from '../modele/reseau.ts';

const LIBELLE_ARETE: Record<TypeArete, string> = {
  detient: 'détient',
  partage: 'partage avec',
  flux: 'verse à',
  intervient: 'intervient dans',
  'peut-agir': 'peut agir sur',
  produit: 'produit',
  exerce: 'met en œuvre',
};

const LIBELLE_INVERSE: Record<TypeArete, string> = {
  detient: 'détenue par',
  partage: 'partagée avec',
  flux: 'reçoit de',
  intervient: 'fait intervenir',
  'peut-agir': 'ouvert à',
  produit: 'produit par',
  exerce: 'mise en œuvre par',
};

const LIBELLE_TYPE: Record<Noeud['type'], string> = {
  acteur: 'Acteur',
  competence: 'Compétence',
  processus: 'Processus',
  document: 'Document',
};

const LIBELLE_LIEN: Record<string, string> = {
  wikipedia: 'Wikipédia',
  droit: 'Le texte',
  page_officielle: 'Page officielle',
  donnees_ouvertes: 'Données ouvertes',
  etude: 'Étude',
  presse: 'Presse',
};

const NS = 'http://www.w3.org/2000/svg';

interface Etat {
  mode: 'carte' | 'focus';
  focus: string | null;
  filtres: { partage: boolean; flux: boolean };
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
  if (!toileEventuelle || !panneauEventuel) return;
  // Réaffectés après le garde : les fonctions déclarées plus bas ne bénéficient
  // pas du rétrécissement de type appliqué au-dessus.
  const toile = toileEventuelle;
  const panneau = panneauEventuel;

  const index = new Map(reseau.noeuds.map((n) => [n.id, n]));
  const etat: Etat = { mode: 'carte', focus: null, filtres: { partage: true, flux: true } };
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

  /** Largeur approximative d'un libellé : suffisant pour dimensionner une boîte. */
  const largeurTexte = (t: string, taille = 13) => t.length * taille * 0.58;

  function dessinerNoeud(b: Boite, role: 'centre' | 'normal' = 'normal'): SVGGElement {
    const g = el('g', {
      class: `n n--${b.noeud.type} ${role === 'centre' ? 'n--centre' : ''}`,
      transform: `translate(${b.x - b.l / 2} ${b.y - b.h / 2})`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${LIBELLE_TYPE[b.noeud.type]} : ${b.noeud.nom}`,
      'data-nom': b.noeud.nom,
      'data-id': b.noeud.id,
    });
    g.append(el('rect', { class: 'n-fond', width: b.l, height: b.h, rx: b.h / 2 }));
    const t = el('text', { class: 'n-nom', x: b.l / 2, y: b.h / 2 + 4, 'text-anchor': 'middle' });
    t.textContent = b.noeud.court;
    g.append(t);
    g.addEventListener('click', () => ouvrir(b.noeud.id));
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        ouvrir(b.noeud.id);
      }
    });
    return g;
  }

  function defsFleche(): SVGDefsElement {
    const defs = el('defs');
    const m = el('marker', {
      id: 'fleche',
      markerWidth: 9,
      markerHeight: 9,
      refX: 8,
      refY: 3,
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });
    m.append(el('path', { class: 'a-pointe', d: 'M 0 0 L 8 3 L 0 6 z' }));
    defs.append(m);
    return defs;
  }

  function courbe(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.abs(x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  /* ---------------------------------------------------------------- *
   * La carte d'ensemble
   * ---------------------------------------------------------------- */

  function rendreCarte() {
    toile.textContent = '';
    const { colonnes, aretes } = reseau.carte;
    cadrerCarte();
    appliquerVue();

    toile.append(defsFleche());
    const gAretes = el('g', { class: 'couche-aretes' });
    const gNoeuds = el('g', { class: 'couche-noeuds' });

    for (const col of colonnes) {
      const t = el('text', { class: 'c-colonne', x: col.x, y: 26, 'text-anchor': 'middle' });
      t.textContent = col.libelle;
      gAretes.append(t);
    }

    const boites = new Map<string, Boite>();
    for (const n of reseau.noeuds) {
      if (n.type !== 'acteur' || n.x === undefined || n.y === undefined) continue;
      const l = Math.max(96, largeurTexte(n.court) + 26);
      const b: Boite = { noeud: n, x: n.x, y: n.y, l, h: 32 };
      boites.set(n.id, b);
    }

    for (const a of aretes) {
      if (a.type === 'partage' && !etat.filtres.partage) continue;
      if (a.type === 'flux' && !etat.filtres.flux) continue;
      const d = boites.get(a.de);
      const v = boites.get(a.vers);
      if (!d || !v) continue;
      // Le trait part toujours de l'émetteur, quelle que soit sa colonne : la
      // flèche indique alors le sens réel du versement, que la disposition en
      // colonnes ne dit pas.
      const versDroite = d.x <= v.x;
      const depart = versDroite ? d.x + d.l / 2 : d.x - d.l / 2;
      const arrivee = versDroite ? v.x - v.l / 2 : v.x + v.l / 2;
      const chemin = el('path', {
        class: `a a--${a.type}`,
        d: courbe(depart, d.y, arrivee, v.y),
        'stroke-width': Math.min(4, 0.8 + a.poids * 0.5),
        'data-de': a.de,
        'data-vers': a.vers,
        ...(a.type === 'flux' ? { 'marker-end': 'url(#fleche)' } : {}),
      });
      const titre = el('title');
      titre.textContent =
        a.type === 'flux'
          ? `${index.get(a.de)?.nom} verse à ${index.get(a.vers)?.nom}`
          : `${index.get(a.de)?.nom} et ${index.get(a.vers)?.nom} partagent ${a.poids} compétence${a.poids > 1 ? 's' : ''}`;
      chemin.append(titre);
      gAretes.append(chemin);
    }

    for (const b of boites.values()) gNoeuds.append(dessinerNoeud(b));
    toile.append(gAretes, gNoeuds);
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

    const voisins: { noeud: Noeud; label: string; type: TypeArete }[] = [];
    const vus = new Set<string>([id]);
    const ajouter = (autre: string, label: string, type: TypeArete) => {
      const n = index.get(autre);
      if (!n || vus.has(autre)) return;
      vus.add(autre);
      voisins.push({ noeud: n, label, type });
    };
    for (const a of reseau.aretes) {
      if (a.de === id) ajouter(a.vers, LIBELLE_ARETE[a.type], a.type);
      else if (a.vers === id) ajouter(a.de, LIBELLE_INVERSE[a.type], a.type);
    }
    voisins.sort((a, b) => a.type.localeCompare(b.type) || a.noeud.nom.localeCompare(b.noeud.nom, 'fr'));

    const L = 1000;
    const rayon = Math.min(360, 150 + voisins.length * 11);
    const H = rayon * 2 + 190;
    vue = { x: -L / 2, y: -H / 2, l: L, h: H };
    appliquerVue();

    const gAretes = el('g', { class: 'couche-aretes' });
    const gNoeuds = el('g', { class: 'couche-noeuds' });

    const lCentre = Math.max(150, largeurTexte(centre.court, 15) + 40);
    const bCentre: Boite = { noeud: centre, x: 0, y: 0, l: lCentre, h: 44 };

    voisins.forEach((v, i) => {
      // Départ à midi, puis on tourne : l'ordre est stable d'une visite à l'autre.
      const angle = (i / voisins.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * rayon * 1.28;
      const y = Math.sin(angle) * rayon * 0.82;
      const l = Math.max(104, Math.min(300, largeurTexte(v.noeud.court) + 26));
      const b: Boite = { noeud: v.noeud, x, y, l, h: 32 };

      const chemin = el('path', { class: `a a--${v.type}`, d: courbe(0, 0, x, y) });
      const titre = el('title');
      titre.textContent = `${centre.nom} — ${v.label} — ${v.noeud.nom}`;
      chemin.append(titre);
      gAretes.append(chemin);

      // Le libellé de la relation, posé au tiers du trait, côté centre.
      const etiq = el('text', {
        class: 'a-label',
        x: x * 0.5,
        y: y * 0.5 - 9,
        'text-anchor': 'middle',
      });
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

  function ecrirePanneauAccueil() {
    panneau.innerHTML = `
      <p class="p-intro">
        Chaque colonne est un échelon, chaque pastille un acteur. Les traits
        pleins sont de l’argent qui circule&nbsp;; les traits pointillés, des
        compétences que deux acteurs se partagent.
      </p>
      <p class="p-intro">Cliquez sur un acteur pour déplier ses rouages.</p>
      <dl class="p-chiffres">
        <div><dt>Acteurs</dt><dd>${reseau.noeuds.filter((n) => n.type === 'acteur').length}</dd></div>
        <div><dt>Compétences</dt><dd>${reseau.noeuds.filter((n) => n.type === 'competence').length}</dd></div>
        <div><dt>Relations</dt><dd>${reseau.aretes.length}</dd></div>
        <div><dt>Pages liées</dt><dd>${new Set(reseau.noeuds.flatMap((n) => n.liens.map((l) => l.url))).size}</dd></div>
      </dl>`;
  }

  function ecrirePanneau(n: Noeud, voisins: { noeud: Noeud; label: string }[]) {
    const parType = new Map<string, typeof n.liens>();
    for (const l of n.liens) {
      if (!parType.has(l.type)) parType.set(l.type, []);
      parType.get(l.type)!.push(l);
    }

    const liens = [...parType.entries()]
      .map(
        ([type, liste]) => `
        <div class="p-groupe">
          <h3>${LIBELLE_LIEN[type] ?? type}</h3>
          <ul>${liste
            .map((l) => `<li><a href="${l.url}" target="_blank" rel="noopener">${echapper(l.titre)}</a></li>`)
            .join('')}</ul>
        </div>`,
      )
      .join('');

    const relations = voisins
      .map(
        (v) =>
          `<li><span class="p-relation">${echapper(v.label)}</span> <button type="button" data-aller="${v.noeud.id}">${echapper(v.noeud.nom)}</button></li>`,
      )
      .join('');

    panneau.innerHTML = `
      <p class="p-type">${LIBELLE_TYPE[n.type]}${n.confiance !== 'etabli' ? ` · <span class="p-confiance">${n.confiance === 'variable_selon_territoire' ? 'variable selon le territoire' : 'à confirmer'}</span>` : ''}</p>
      <h2 class="p-nom">${echapper(n.nom)}</h2>
      ${n.resume ? `<p class="p-resume">${echapper(n.resume)}</p>` : ''}
      <h3 class="p-titre-section">Pour en savoir plus</h3>
      ${liens || '<p class="p-vide">Aucune page liée.</p>'}
      <h3 class="p-titre-section">${voisins.length} relations</h3>
      <ul class="p-relations">${relations}</ul>
      <p class="p-permalien"><a href="/n/${n.id}">Page de ce nœud, sans JavaScript</a></p>`;

    panneau.querySelectorAll<HTMLButtonElement>('[data-aller]').forEach((b) => {
      b.addEventListener('click', () => ouvrir(b.dataset.aller!));
    });
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  function ouvrir(id: string) {
    etat.mode = 'focus';
    etat.focus = id;
    history.replaceState(null, '', `#${id}`);
    rendreFocus(id);
  }

  function versCarte() {
    etat.mode = 'carte';
    etat.focus = null;
    history.replaceState(null, '', location.pathname);
    rendreCarte();
  }

  retour?.addEventListener('click', versCarte);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && etat.mode === 'focus') versCarte();
  });

  for (const filtre of ['partage', 'flux'] as const) {
    const c = document.getElementById(`filtre-${filtre}`) as HTMLInputElement | null;
    c?.addEventListener('change', () => {
      etat.filtres[filtre] = c.checked;
      if (etat.mode === 'carte') rendreCarte();
    });
  }

  /* --- recherche : indispensable dès que la carte grossit ---------- */
  recherche?.addEventListener('input', () => {
    const q = recherche.value.trim().toLowerCase();
    if (!resultats) return;
    if (q.length < 2) {
      resultats.innerHTML = '';
      return;
    }
    const trouves = reseau.noeuds
      .filter((n) => n.nom.toLowerCase().includes(q) || n.resume.toLowerCase().includes(q))
      .slice(0, 8);
    resultats.innerHTML = trouves
      .map((n) => `<li><button type="button" data-aller="${n.id}">${echapper(n.nom)} <span>${LIBELLE_TYPE[n.type]}</span></button></li>`)
      .join('');
    resultats.querySelectorAll<HTMLButtonElement>('[data-aller]').forEach((b) => {
      b.addEventListener('click', () => {
        ouvrir(b.dataset.aller!);
        recherche.value = '';
        resultats.innerHTML = '';
      });
    });
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
    if (r.width >= 700 || r.width === 0) {
      vue = { x: 0, y: 0, l: largeur, h: hauteur };
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
  const ancre = location.hash.slice(1);
  if (ancre && index.has(ancre)) ouvrir(ancre);
  else rendreCarte();
}

function echapper(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
