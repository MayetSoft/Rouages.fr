/**
 * Repérer qu'un texte nomme une personne physique.
 *
 * La règle du projet tient en une phrase : le graphe décrit des fonctions, et
 * le nom d'un titulaire est une donnée d'annuaire, jamais un nœud
 * (`docs/07-risques.md`). Deux usages en découlent, et c'est pour qu'ils ne
 * divergent pas que le motif vit ici plutôt que dans l'un des deux :
 *
 *   — `scripts/valider.ts` refuse un nom écrit en dur dans `contenu/` ;
 *   — `scripts/deliberations-emettre.ts` écarte les délibérations dont l'objet
 *     nomme quelqu'un, parce que ce sont précisément celles qui statuent sur
 *     le cas d'une personne — une cession de parcelle, une aide sociale, une
 *     préemption.
 *
 * Contrôle grossier — une civilité suivie d'une majuscule — mais il attrape
 * l'écart le plus probable. Il ne prétend pas être complet : « Vente Dupont »
 * y échappe, et aucune expression régulière ne rattrapera cela. Il rend la
 * relecture obligatoire, il ne la remplace pas.
 */
export const CIVILITES = /\b(M\.|MM\.|Mme|Mmes|Monsieur|Madame|Maître|Mlle)\s+[A-ZÉÈÀÂÎÔÛÇ]/;

export function nommeUnePersonne(texte: string): boolean {
  return CIVILITES.test(texte);
}
