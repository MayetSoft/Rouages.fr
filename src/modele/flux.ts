/**
 * Écrire un flux Atom.
 *
 * C'est la forme la moins coûteuse de l'abonnement : le lecteur s'abonne dans
 * son agrégateur, et le site ne collecte **aucune adresse**, ne recueille aucun
 * consentement, ne dépend d'aucun tiers expéditeur et n'a rien à faire tourner.
 * Un site statique sait publier un flux ; il ne saurait pas envoyer un courriel
 * sans renier la promesse de ses mentions légales.
 *
 * **Deux précautions décident si c'est déployable.**
 *
 * La première : `<updated>` porte la date du fait le plus récent, jamais celle
 * de la génération. Sinon les trente-trois mille fichiers changeraient à chaque
 * ingestion, et l'envoi par FTP repasserait de quelques minutes à plus d'une
 * demi-heure — le déploiement ne transfère que ce qui a changé, encore faut-il
 * que l'inchangé reste identique à l'octet près.
 *
 * La seconde : l'`id` d'une entrée est stable. C'est lui, et non l'ordre ni la
 * date, qui dit à un agrégateur ce qu'il a déjà montré — d'où le fait qu'un
 * marché notifié en juin mais publié en septembre lui apparaisse comme nouveau
 * tout en se rangeant à sa date. C'est ce qui permet au journal de n'avoir
 * aucune mémoire à tenir.
 */

/** Les cinq caractères que XML ne laisse pas passer en clair. */
export function echapper(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Une date en AAAA-MM-JJ devient l'horodatage RFC 3339 qu'Atom exige. */
function horodatage(jour: string): string {
  return `${jour}T00:00:00Z`;
}

export interface EntreeFlux {
  /** Stable d'une ingestion à l'autre : c'est l'identité de l'entrée. */
  cle: string;
  titre: string;
  /** La date du fait, en AAAA-MM-JJ. */
  date: string;
  /** Le corps de l'entrée, en texte : ni balisage, ni mise en forme. */
  texte: string;
  /**
   * L'acte lui-même, chez celui qui l'a publié — absent le plus souvent.
   *
   * Répéter l'adresse de la page à chaque entrée coûterait soixante octets sur
   * trente-trois mille flux pour ne rien apprendre : le lien de tête y conduit
   * déjà. RFC 4287 l'autorise dès lors que l'entrée porte un `content`.
   */
  lien?: string;
  /** Le genre, qui devient une catégorie — un lecteur peut filtrer dessus. */
  categorie: string;
}

export function flux(o: {
  /** L'adresse du flux lui-même. */
  self: string;
  /** La page que le flux accompagne. */
  page: string;
  titre: string;
  resume: string;
  /** Le domaine et l'année servent à construire des identifiants pérennes. */
  tag: string;
  entrees: EntreeFlux[];
}): Response {
  // La date du flux est celle de son entrée la plus récente : deux
  // générations sans nouveauté doivent produire le même fichier.
  const majeure = o.entrees.reduce((a, e) => (e.date > a ? e.date : a), o.entrees[0]?.date ?? '');
  const corps = o.entrees
    .map(
      (e) =>
        `<entry>\n` +
        `<id>tag:${o.tag}:${e.cle}</id>\n` +
        `<title>${echapper(e.titre)}</title>\n` +
        `<updated>${horodatage(e.date)}</updated>\n` +
        (e.lien ? `<link href="${echapper(e.lien)}"/>\n` : '') +
        `<category term="${echapper(e.categorie)}"/>\n` +
        `<content type="text">${echapper(e.texte)}</content>\n` +
        `</entry>`,
    )
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">\n` +
      `  <id>${echapper(o.self)}</id>\n` +
      `  <title>${echapper(o.titre)}</title>\n` +
      `  <subtitle>${echapper(o.resume)}</subtitle>\n` +
      `  <updated>${horodatage(majeure)}</updated>\n` +
      `  <link rel="self" href="${echapper(o.self)}"/>\n` +
      `  <link rel="alternate" type="text/html" href="${echapper(o.page)}"/>\n` +
      `  <author><name>Rouages</name></author>\n` +
      `${corps}\n</feed>\n`,
    { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } },
  );
}
