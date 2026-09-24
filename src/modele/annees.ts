/**
 * Ce qu'on accepte comme année de convention de subvention.
 *
 * Une date illisible se lit comme une année impossible : Quimper Bretagne
 * Occidentale publiait trois conventions de subvention « de 1735 » dont
 * l'objet dit 2025. Afficher cette année serait publier un chiffre qu'on sait
 * faux. Ni avant 2000 — ces données sont bien plus récentes —, ni plus d'un
 * an dans l'avenir.
 */
export function anneePlausible(annee: string): boolean {
  const n = Number(annee);
  return /^\d{4}$/.test(annee) && n >= 2000 && n <= new Date().getFullYear() + 1;
}
