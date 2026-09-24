/**
 * Des noms sans empreinte pour ce que le navigateur télécharge.
 *
 * Avec l'empreinte, retoucher une règle de CSS changeait le nom de la feuille,
 * donc la balise qui la cite dans chacune des 35 000 pages, donc toutes les
 * pages à renvoyer au serveur. Sans elle, une page ne change que si son contenu
 * change.
 *
 * Le cache ne s'y perd pas : le `.htaccess` fait revalider ces fichiers à
 * chaque visite — une réponse 304 de quelques octets —, et le déploiement
 * purge Cloudflare.
 *
 * Les scripts viennent de la cible `client`. Les feuilles de style, elles, sont
 * émises par le rendu des pages (cible `server`), dont les autres morceaux ne
 * quittent jamais la machine de build : on n'y renomme que le CSS, sans quoi
 * ces modules atterriraient dans `dist/_astro/`.
 */
export function nomsFixes() {
  return {
    name: 'rouages-noms-fixes',
    hooks: {
      'astro:build:setup': ({ vite, target }) => {
        vite.build ??= {};
        vite.build.rollupOptions ??= {};
        const sortie = vite.build.rollupOptions.output;
        const fusion = (o) => {
          const avant = o?.assetFileNames;
          const assets = (info) => {
            const nom = info.names?.[0] ?? info.name ?? '';
            if (nom.endsWith('.css')) return '_astro/[name][extname]';
            if (target === 'client') return '_astro/[name][extname]';
            return typeof avant === 'function' ? avant(info) : (avant ?? '_astro/[name].[hash][extname]');
          };
          return target === 'client'
            ? { ...(o ?? {}), entryFileNames: '_astro/[name].js', chunkFileNames: '_astro/[name].js', assetFileNames: assets }
            : { ...(o ?? {}), assetFileNames: assets };
        };
        vite.build.rollupOptions.output = Array.isArray(sortie) ? sortie.map(fusion) : fusion(sortie);
      },
    },
  };
}
