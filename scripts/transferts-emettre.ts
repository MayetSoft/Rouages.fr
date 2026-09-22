/**
 * Ce que le registre des transferts a changé depuis la dernière fois.
 *
 * Le journal projette des faits datés : un marché porte sa date de
 * notification, une délibération sa date de séance. **BANATIC ne date rien.**
 * Le jour où une commune confie l'eau à son agglomération, le registre le dit
 * au présent et ne dit pas quand — or c'est le changement que ce site devrait
 * annoncer le premier, puisque c'est son sujet.
 *
 * Il faut donc comparer deux états, et c'est le seul endroit du journal où
 * cela se justifie : il n'y a aucune date à projeter. La comparaison ne
 * demande pourtant aucun état nouveau à conserver — **l'état précédent est
 * déjà versionné** dans `public/territoires/dep/<dep>.json`, qui porte les
 * groupements, leurs codes de compétence et le rattachement de chaque commune.
 *
 * Deux garde-fous, et ils suffisent :
 *
 *   — **la date d'export fait foi.** Chaque fichier porte celle de l'export
 *     BANATIC dont il est issu. Deux ingestions sur le même export ne peuvent
 *     rien avoir changé : on ne compare pas, et on ne date pas un changement
 *     du jour où on l'a remarqué mais du jour où le registre l'a publié ;
 *   — **BANATIC est une source fatale.** L'ingestion s'arrête sans elle, si
 *     bien qu'un export partiel ne peut pas exister et faire passer pour un
 *     retrait ce qui n'est qu'une réponse tronquée.
 *
 * L'événement est attribué au **groupement** quand c'est lui qui gagne ou perd
 * une compétence : une communauté d'agglomération qui prend l'eau, c'est un
 * fait, pas cent quatre. Il est attribué à la **commune** quand c'est son
 * rattachement qui bouge.
 */
import { GENRES, type Evenement } from '../src/modele/journal.ts';

/** La forme du fichier de département, telle qu'elle est écrite et relue. */
export interface EtatDep {
  maj: string;
  /** SIREN, nom, nature, codes de compétence. */
  g: [string, string, string, string[]][];
  /** Code INSEE, nom, population, indices dans `g`, codes postaux. */
  c: [string, string, number, number[], (string | undefined)?][];
}

/** Ce que le libellé d'un code devient dans une entrée de flux. */
function nommer(code: string, libelles: Map<string, string>): string {
  return libelles.get(code) ?? `compétence ${code}`;
}

export function comparerTransferts(
  ancien: EtatDep | null,
  nouveau: EtatDep,
  libelles: Map<string, string>,
): Evenement[] {
  // Même export, donc même registre : il n'y a rien à comparer, et prétendre
  // le contraire daterait un changement du jour où on l'a relu.
  if (!ancien || ancien.maj === nouveau.maj || !nouveau.maj) return [];
  const date = nouveau.maj;
  const evenements: Evenement[] = [];

  const transfere = GENRES.indexOf('Compétence transférée');
  const reprise = GENRES.indexOf('Compétence reprise');
  const rattachement = GENRES.indexOf('Rattachement modifié');

  // --- ce que chaque groupement gagne ou perd ---
  const avant = new Map(ancien.g.map(([siren, , , codes]) => [siren, new Set(codes)]));
  for (const [siren, nom, , codes] of nouveau.g) {
    const vieux = avant.get(siren);
    // Un groupement qui apparaît n'a rien « gagné » : c'est le rattachement
    // des communes qui le signale, et lister ses trente compétences le jour de
    // sa création noierait tout le reste.
    if (!vieux) continue;
    for (const code of codes) {
      if (!vieux.has(code)) {
        evenements.push({
          genre: transfere,
          date,
          quoi: nommer(code, libelles),
          detail: nom,
          siren,
        });
      }
    }
    for (const code of vieux) {
      if (!codes.includes(code)) {
        evenements.push({
          genre: reprise,
          date,
          quoi: nommer(code, libelles),
          detail: nom,
          siren,
        });
      }
    }
  }

  // --- ce à quoi chaque commune est rattachée ---
  const nomAncien = new Map(ancien.g.map(([siren, nom]) => [siren, nom]));
  const nomNouveau = new Map(nouveau.g.map(([siren, nom]) => [siren, nom]));
  const rattachAncien = new Map(
    ancien.c.map(([code, , , indices]) => [code, new Set(indices.map((i) => ancien.g[i]?.[0] ?? ''))]),
  );
  for (const [code, , , indices] of nouveau.c) {
    const vieux = rattachAncien.get(code);
    // Une commune qui apparaît au découpage n'a pas « rejoint » : elle vient
    // de naître, ou de fusionner, et son histoire n'est pas un transfert.
    if (!vieux) continue;
    const maintenant = new Set(indices.map((i) => nouveau.g[i]?.[0] ?? ''));
    for (const siren of maintenant) {
      if (siren && !vieux.has(siren)) {
        evenements.push({
          genre: rattachement,
          date,
          quoi: `Rattachement à ${nomNouveau.get(siren) ?? siren}`,
          commune: code,
        });
      }
    }
    for (const siren of vieux) {
      if (siren && !maintenant.has(siren)) {
        evenements.push({
          genre: rattachement,
          date,
          quoi: `Sortie de ${nomAncien.get(siren) ?? siren}`,
          commune: code,
        });
      }
    }
  }

  return evenements;
}
