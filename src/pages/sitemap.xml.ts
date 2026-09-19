/**
 * L'index des plans de site.
 *
 * Un plan unique ne convient pas : la norme plafonne à 50 000 adresses et
 * 50 Mo par fichier, et les 34 875 communes tiennent tout juste sous la
 * première limite — sans marge pour grandir. Un index qui renvoie vers un plan
 * par département résout les deux, et donne au passage une granularité utile :
 * un moteur qui recrawle l'Allier ne relit pas la France.
 */
import type { APIRoute } from 'astro';
import { communes } from '../modele/territoires.ts';

export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://rouages.fr';
  const deps = [...new Set(communes().map((c) => c.dep))].sort();
  const plans = ['pages', ...deps.map((d) => `communes-${d}`)];
  const corps = plans
    .map((p) => `  <sitemap><loc>${base}/sitemap-${p}.xml</loc></sitemap>`)
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${corps}\n</sitemapindex>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
