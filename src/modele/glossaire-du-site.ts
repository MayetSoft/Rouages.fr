/**
 * Le glossaire du site, construit une fois par build.
 *
 * `Glose` le reconstruisait à chaque appel — tri des sigles, compilation d'une
 * expression régulière — et la page d'une commune l'appelle désormais pour
 * chaque acheteur, chaque structure, chaque collectivité qui délibère : des
 * dizaines de fois par page, trente-quatre mille fois de suite.
 */
import { chargerGraphe } from './graphe.ts';
import { construireGlossaire, type Glossaire } from './glossaire.ts';

let cache: Glossaire | null = null;

export function glossaireDuSite(): Glossaire {
  cache ??= construireGlossaire([...chargerGraphe().sigles.values()]);
  return cache;
}
