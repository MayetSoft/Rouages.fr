/**
 * Les documents qui décident de ce qui peut se construire.
 *
 * Le sigle seul ne dit rien à qui n'est pas du métier, et l'écart entre deux
 * d'entre eux est tout sauf technique : sous carte communale, la commune
 * délimite ce qui est constructible sans écrire de règlement ; sous plan
 * local, elle écrit les règles ; sous plan intercommunal, c'est un conseil
 * communautaire qui les vote, où elle a un siège ou deux ; et sans document
 * du tout, ce sont les règles nationales qui s'appliquent, avec l'accord du
 * préfet sur chaque permis.
 *
 * L'ordre du tableau est celui des fichiers publiés, qui portent l'index et
 * non le sigle : **on ajoute à la fin, on ne réordonne pas.**
 */
export const DOCUMENTS = ['PLU', 'PLUi', 'PLUiS', 'CC', 'POS', 'RNU'] as const;

export type Document = (typeof DOCUMENTS)[number];

/** Le nom que le sigle abrège, au singulier et sans majuscule inutile. */
export const NOM_DOCUMENT: Record<string, string> = {
  PLU: 'plan local d’urbanisme',
  PLUi: 'plan local d’urbanisme intercommunal',
  PLUiS: 'plan local d’urbanisme intercommunal sectoriel',
  CC: 'carte communale',
  POS: 'plan d’occupation des sols',
  RNU: 'règlement national d’urbanisme',
};

/** L'article qui convient à chacun — « un plan », mais « une carte ». */
export const ARTICLE_DOCUMENT: Record<string, string> = {
  PLU: 'un',
  PLUi: 'un',
  PLUiS: 'un',
  CC: 'une',
  POS: 'un',
  RNU: 'le',
};

/** Une date AAAA-MM-JJ en toutes lettres, sans dépendre du fuseau du lecteur. */
export function enFrancais(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  const jour = Number(m[3]);
  return `${jour === 1 ? '1er' : jour} ${mois[Number(m[2]) - 1]} ${m[1]}`;
}
