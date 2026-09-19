/**
 * Écrire un plan de site.
 *
 * Volontairement sans `lastmod`, `changefreq` ni `priority` : les trois sont
 * facultatifs, les deux derniers sont ignorés par les principaux moteurs, et
 * une date de dernière modification fausse vaut moins que pas de date. Le site
 * date déjà chaque fiche dans son contenu, là où un lecteur la voit.
 */
export function plan(base: string, chemins: string[]): Response {
  const corps = chemins
    .map((c) => `  <url><loc>${base}${c === '/' ? '/' : c}</loc></url>`)
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${corps}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
