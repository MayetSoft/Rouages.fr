/**
 * Le voisinage d'un nœud, rendu au build.
 *
 * C'est la version sans JavaScript de ce que montre l'explorateur, avec le même
 * encodage : une teinte et un tracé par famille de relation, une forme par type
 * de nœud, chaque relation nommée en toutes lettres. Elle existe pour les
 * moteurs de recherche, pour l'impression, et pour tous ceux dont le navigateur
 * ne fera pas tourner l'explorateur.
 */
import type { Noeud, Reseau, TypeArete } from '../modele/reseau.ts';
import {
  famille,
  FAMILLES,
  FLECHEE,
  LIBELLE_ARETE,
  LIBELLE_INVERSE,
  parPriorite,
  type Famille,
} from '../modele/relations.ts';
import { decalageTexte, formeNoeud, largeurPastille } from './formes.ts';
import { expansions, type Glossaire } from '../modele/glossaire.ts';
import { echapper, svg, couper } from './commun.ts';

export interface Voisin {
  noeud: Noeud;
  label: string;
  type: TypeArete;
  fam: Famille;
  sortante: boolean;
}

export function voisinsDe(reseau: Reseau, id: string): Voisin[] {
  const index = new Map(reseau.noeuds.map((n) => [n.id, n]));
  const vus = new Set([id]);
  const voisins: Voisin[] = [];
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
  const ordre = new Map(FAMILLES.map((f, i) => [f.id, i]));
  return voisins.sort(
    (a, b) => ordre.get(a.fam)! - ordre.get(b.fam)! || a.noeud.nom.localeCompare(b.noeud.nom, 'fr'),
  );
}

interface Boite {
  x: number;
  y: number;
  l: number;
  h: number;
}

export function schemaVoisinage(
  centre: Noeud,
  voisins: Voisin[],
  id = 'voisinage',
  glossaire?: Glossaire,
) {
  // La toile est dimensionnée d'après les libellés réellement présents : un
  // rayon fixe suffit tant que les noms sont courts, et se met à faire
  // chevaucher les pastilles dès qu'ils ne le sont plus.
  const lCentre = largeurPastille(centre.court, 15, 160) + 16;
  const lVoisin = (n: Noeud) => Math.min(290, largeurPastille(n.court, 13, 108));
  const lMax = Math.max(120, ...voisins.map((v) => lVoisin(v.noeud)));

  const rayonX = Math.max(230, Math.min(400, 190 + voisins.length * 8), lCentre / 2 + lMax / 2 + 56);
  const rayonY = Math.max(150, Math.min(270, 120 + voisins.length * 9));
  const LARGEUR = Math.round(rayonX * 2 + lMax + 60);
  const hauteur = rayonY * 2 + 150;
  const cx = LARGEUR / 2;
  const cy = hauteur / 2;

  const bCentre: Boite = { x: cx, y: cy, l: lCentre, h: 46 };
  const aretes: string[] = [];
  const noeuds: string[] = [];

  voisins.forEach((v, i) => {
    const angle = (i / voisins.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rayonX;
    const y = cy + Math.sin(angle) * rayonY;
    const l = lVoisin(v.noeud);
    const b: Boite = { x, y, l, h: 32 };

    const depart = bord(bCentre, x - cx, y - cy);
    const arrivee = bord(b, cx - x, cy - y);
    const [p1, p2] = v.sortante ? [depart, arrivee] : [arrivee, depart];
    const fleche = FLECHEE[v.fam] ? ` marker-end="url(#fleche-${v.fam}-${id})"` : '';

    aretes.push(
      `<path class="a a--f-${v.fam}" d="${courbe(p1.x, p1.y, p2.x, p2.y)}"${fleche}><title>${echapper(
        `${centre.nom} — ${v.label} — ${v.noeud.nom}`,
      )}</title></path>`,
    );
    aretes.push(
      `<text class="a-label" x="${cx + (x - cx) * 0.62}" y="${cy + (y - cy) * 0.62 - 9}" text-anchor="middle">${echapper(
        v.label,
      )}</text>`,
    );
    noeuds.push(pastille(v.noeud, b, 12.5, false, glossaire));
  });

  const defs = FAMILLES.filter((f) => FLECHEE[f.id])
    .map(
      (f) =>
        `<marker id="fleche-${f.id}-${id}" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path class="a-pointe--${f.id}" d="M 0 0 L 8 3 L 0 6 z" /></marker>`,
    )
    .join('');

  const contenu =
    `<defs>${defs}</defs>` +
    `<g class="couche-aretes">${aretes.join('')}</g>` +
    `<g class="couche-noeuds">${noeuds.join('')}${pastille(centre, bCentre, 15, true, glossaire)}</g>`;

  const description = `${centre.nom} : ${voisins.map((v) => `${v.label} ${v.noeud.nom}`).join(' ; ')}.`;
  return {
    titre: 'Ses relations',
    svg: svg(id, hauteur, `Relations de ${centre.nom}`, description, contenu, LARGEUR),
    tableau: tableau(voisins),
  };
}

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

function pastille(
  n: Noeud,
  b: Boite,
  taille: number,
  centre = false,
  glossaire?: Glossaire,
): string {
  // Un SVG n'accepte pas <abbr> : le développé des sigles est donc collé à
  // l'infobulle du nœud, qui est de toute façon la seule chose lisible ici.
  const glose = glossaire ? expansions(glossaire, n.nom, n.court, n.resume) : '';
  const texte = couper(n.court, b.l - 22, taille)[0];
  const formes = formeNoeud(n.type, b.l, b.h)
    .map(
      (e) =>
        `<${e.balise} ${Object.entries(e.attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')} />`,
    )
    .join('');
  return (
    `<a href="/n/${n.id}" class="n n--${n.type}${centre ? ' n--centre' : ''}" transform="translate(${b.x - b.l / 2} ${b.y - b.h / 2})">` +
    formes +
    `<text class="n-nom" x="${b.l / 2 + decalageTexte(n.type)}" y="${b.h / 2 + taille * 0.35}" text-anchor="middle" style="font-size:${taille}px${centre ? ';font-weight:650' : ''}">${echapper(texte)}</text>` +
    `<title>${echapper([n.resume || n.nom, glose].filter(Boolean).join(' '))}</title>` +
    `</a>`
  );
}

function tableau(voisins: Voisin[]): string {
  const lignes = voisins
    .map(
      (v) =>
        `<tr><th scope="row">${echapper(v.label)}</th><td><a href="/n/${v.noeud.id}">${echapper(
          v.noeud.nom,
        )}</a></td><td>${echapper(v.noeud.resume)}</td></tr>`,
    )
    .join('');
  return `<table class="v-tableau"><caption>Relations</caption><thead><tr><th scope="col">Relation</th><th scope="col">Vers</th><th scope="col">Ce que c’est</th></tr></thead><tbody>${lignes}</tbody></table>`;
}
