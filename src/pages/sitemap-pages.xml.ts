/**
 * Les pages du réseau : les fiches de nœuds et les quelques pages fixes.
 *
 * Elles sont séparées des communes parce qu'elles ne changent pas au même
 * rythme : une fiche bouge quand le contenu bouge, une page de commune quand la
 * donnée est réingérée.
 */
import type { APIRoute } from 'astro';
import { construireReseau } from '../modele/reseau.ts';
import { plan } from '../modele/sitemap.ts';

export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://rouages.fr';
  const fixes = ['/', '/etat', '/glossaire', '/methode', '/signaler'];
  const noeuds = construireReseau().noeuds.map((n) => `/n/${n.id}`);
  return plan(base, [...fixes, ...noeuds]);
};
