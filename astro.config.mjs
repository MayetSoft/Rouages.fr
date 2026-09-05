import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rouages.fr',
  // Site statique : les schémas sont générés au build, lisibles sans JavaScript,
  // indexables et imprimables. Voir docs/06-stack-technique.md.
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  markdown: { shikiConfig: { theme: 'github-light' } },
});
