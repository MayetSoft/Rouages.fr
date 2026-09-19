/**
 * Un plan de site par département : 345 communes en moyenne, 691 au maximum.
 */
import type { APIRoute } from 'astro';
import { communes } from '../modele/territoires.ts';
import { plan } from '../modele/sitemap.ts';

export function getStaticPaths() {
  const deps = [...new Set(communes().map((c) => c.dep))].sort();
  return deps.map((dep) => ({ params: { dep } }));
}

export const GET: APIRoute = ({ site, params }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://rouages.fr';
  const liste = communes()
    .filter((c) => c.dep === params.dep)
    .map((c) => `/commune/${c.code}`);
  return plan(base, liste);
};
