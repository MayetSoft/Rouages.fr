/**
 * Le glossaire : reconnaître les sigles dans un texte, et les expliquer.
 *
 * Utilisé aux trois endroits où du texte est rendu — les pages générées au
 * build, le panneau de l'explorateur, et les infobulles des schémas — pour que
 * la même explication apparaisse partout, et par le validateur pour refuser un
 * sigle qui n'aurait pas d'entrée.
 */
import type { Sigle } from './schemas.ts';

export type Segment = { texte: string; sigle?: Sigle };

/**
 * Toute suite d'au moins deux majuscules, avec une éventuelle queue en casse
 * mixte : attrape aussi bien CADA que SCoT, PLUi ou NOTRe.
 */
const CANDIDAT = /\b[A-Z]{2,}[A-Za-z]{0,3}\b/g;

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Glossaire {
  /** Découpe un texte en segments, ceux qui sont des sigles portant leur entrée. */
  decouper(texte: string): Segment[];
  /** Les sigles employés dans un texte, sans doublon. */
  employes(texte: string): Sigle[];
  /** Les suites de majuscules qu'aucune entrée n'explique. */
  inconnus(texte: string): string[];
  entrees: Sigle[];
}

export function construireGlossaire(sigles: Sigle[]): Glossaire {
  // Les plus longs d'abord : sans quoi PLU mangerait le début de PLUi.
  const tries = [...sigles].sort((a, b) => b.sigle.length - a.sigle.length);
  const parSigle = new Map(sigles.map((s) => [s.sigle, s]));
  const motif =
    tries.length > 0
      ? new RegExp(`\\b(${tries.map((s) => echapper(s.sigle)).join('|')})\\b`, 'g')
      : null;

  const decouper = (texte: string): Segment[] => {
    if (!motif || !texte) return [{ texte }];
    const segments: Segment[] = [];
    let curseur = 0;
    for (const trouve of texte.matchAll(motif)) {
      const debut = trouve.index!;
      if (debut > curseur) segments.push({ texte: texte.slice(curseur, debut) });
      segments.push({ texte: trouve[0], sigle: parSigle.get(trouve[0]) });
      curseur = debut + trouve[0].length;
    }
    if (curseur < texte.length) segments.push({ texte: texte.slice(curseur) });
    return segments.length > 0 ? segments : [{ texte }];
  };

  return {
    entrees: [...sigles].sort((a, b) => a.sigle.localeCompare(b.sigle, 'fr')),
    decouper,
    employes: (texte) => {
      const vus = new Map<string, Sigle>();
      for (const s of decouper(texte)) if (s.sigle) vus.set(s.sigle.id, s.sigle);
      return [...vus.values()];
    },
    inconnus: (texte) =>
      [...(texte.matchAll(CANDIDAT) ?? [])]
        .map((m) => m[0])
        .filter((m) => !parSigle.has(m)),
  };
}

/**
 * L'expansion à coller dans une infobulle SVG, où l'on ne peut pas mettre de
 * balise : « CADA (Commission d'accès aux documents administratifs) ».
 */
export function expansions(glossaire: Glossaire, ...textes: string[]): string {
  const vus = new Map<string, Sigle>();
  for (const t of textes) for (const s of glossaire.employes(t)) vus.set(s.id, s);
  return [...vus.values()].map((s) => `${s.sigle} : ${s.developpe}.`).join(' ');
}
