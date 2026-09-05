/**
 * Le voisinage d'un nœud, rendu au build.
 *
 * C'est la version sans JavaScript de ce que montre l'explorateur : le nœud au
 * centre, ses relations autour, chacune nommée en toutes lettres. Elle existe
 * pour les moteurs de recherche, pour l'impression, et pour tous ceux dont le
 * navigateur ne fera pas tourner l'explorateur.
 */
import type { Noeud, Reseau, TypeArete } from '../modele/reseau.ts';
import { echapper, svg, couper } from './commun.ts';

const LARGEUR = 900;

const LIBELLE: Record<TypeArete, [string, string]> = {
  detient: ['détient', 'détenue par'],
  partage: ['partage', 'partagée avec'],
  flux: ['verse à', 'reçoit de'],
  intervient: ['intervient dans', 'fait intervenir'],
  'peut-agir': ['peut agir sur', 'ouvert à'],
  produit: ['produit', 'produit par'],
  exerce: ['met en œuvre', 'mis en œuvre par'],
};

export interface Voisin {
  noeud: Noeud;
  label: string;
  type: TypeArete;
}

export function voisinsDe(reseau: Reseau, id: string): Voisin[] {
  const index = new Map(reseau.noeuds.map((n) => [n.id, n]));
  const vus = new Set([id]);
  const voisins: Voisin[] = [];
  for (const a of reseau.aretes) {
    const [sortant, entrant] = LIBELLE[a.type];
    const autre = a.de === id ? a.vers : a.vers === id ? a.de : null;
    if (!autre || vus.has(autre)) continue;
    const n = index.get(autre);
    if (!n) continue;
    vus.add(autre);
    voisins.push({ noeud: n, label: a.de === id ? sortant : entrant, type: a.type });
  }
  return voisins.sort((a, b) => a.type.localeCompare(b.type) || a.noeud.nom.localeCompare(b.noeud.nom, 'fr'));
}

export function schemaVoisinage(centre: Noeud, voisins: Voisin[], id = 'voisinage') {
  const rayonX = Math.min(360, 190 + voisins.length * 6);
  const rayonY = Math.min(250, 110 + voisins.length * 7);
  const hauteur = rayonY * 2 + 150;
  const cx = LARGEUR / 2;
  const cy = hauteur / 2;

  const aretes: string[] = [];
  const noeuds: string[] = [];

  voisins.forEach((v, i) => {
    const angle = (i / voisins.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rayonX;
    const y = cy + Math.sin(angle) * rayonY;

    aretes.push(
      `<path class="a a--${v.type}" fill="none" d="M ${cx} ${cy} C ${cx + (x - cx) * 0.4} ${cy}, ${x - (x - cx) * 0.4} ${y}, ${x} ${y}" />`,
    );
    aretes.push(
      `<text class="a-label" x="${cx + (x - cx) * 0.5}" y="${cy + (y - cy) * 0.5 - 9}" text-anchor="middle">${echapper(v.label)}</text>`,
    );
    noeuds.push(pastille(v.noeud, x, y, 13, 32));
  });

  const contenu = `<g class="couche-aretes">${aretes.join('')}</g><g class="couche-noeuds">${noeuds.join(
    '',
  )}${pastille(centre, cx, cy, 15, 44, true)}</g>`;

  const description = `${centre.nom} : ${voisins.map((v) => `${v.label} ${v.noeud.nom}`).join(' ; ')}.`;
  return {
    titre: 'Ses relations',
    svg: svg(id, hauteur, `Relations de ${centre.nom}`, description, contenu, LARGEUR),
    tableau: tableau(voisins),
  };
}

function pastille(n: Noeud, x: number, y: number, taille: number, h: number, centre = false): string {
  const lignes = couper(n.court, 260, taille);
  const l = Math.max(100, Math.min(300, lignes[0].length * taille * 0.62 + 30));
  const classe = `n n--${n.type}${centre ? ' n--centre' : ''}`;
  return (
    `<a href="/n/${n.id}" class="${classe}">` +
    `<rect class="n-fond" x="${x - l / 2}" y="${y - h / 2}" width="${l}" height="${h}" rx="${h / 2}" />` +
    `<text class="n-nom" x="${x}" y="${y + taille / 2 - 1}" text-anchor="middle" style="font-size:${taille}px">${echapper(lignes[0])}</text>` +
    `</a>`
  );
}

function tableau(voisins: Voisin[]): string {
  const lignes = voisins
    .map(
      (v) =>
        `<tr><th scope="row">${echapper(v.label)}</th><td><a href="/n/${v.noeud.id}">${echapper(v.noeud.nom)}</a></td><td>${echapper(v.noeud.resume)}</td></tr>`,
    )
    .join('');
  return `<table class="v-tableau"><caption>Relations</caption><thead><tr><th scope="col">Relation</th><th scope="col">Vers</th><th scope="col">Ce que c’est</th></tr></thead><tbody>${lignes}</tbody></table>`;
}
