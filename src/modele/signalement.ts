/**
 * Le signalement d'erreur.
 *
 * Un site qui prétend dire qui fait quoi se trompera : le registre a des
 * trous, la loi change, une délibération locale échappe à l'open data. Le
 * lecteur qui habite la commune en sait souvent plus que la donnée. Ce module
 * lui donne le moyen de le dire — et surtout, il attache au signalement le
 * contexte sans lequel personne ne saurait quoi en faire.
 *
 * Deux exigences ont dicté la forme :
 *
 * 1. **Le contexte est produit par le site, pas par le lecteur.** Demander
 *    « sur quelle page ? quelle commune ? » à quelqu'un qui vient de voir une
 *    erreur, c'est perdre le signalement. Le site sait déjà tout cela.
 * 2. **La correction est publique.** Un signalement devient une issue du
 *    dépôt ; sa discussion et sa résolution restent lisibles. C'est la même
 *    règle que pour le reste du contenu : on montre d'où vient ce qu'on dit.
 *
 * Le module ne touche pas au DOM : il sert au rendu statique des pages comme
 * au panneau de l'explorateur.
 */

/** Le dépôt est public : l'issue est le canal, et elle est traçable. */
export const DEPOT = 'https://github.com/MayetSoft/Rouages.fr';

export interface Contexte {
  /** Le chemin de la page où l'erreur a été vue, avec son ancre s'il y en a une. */
  page?: string;
  /** Le nœud concerné, quand le signalement en vise un. */
  noeud?: { id: string; nom: string };
  /** La date de vérification portée par la fiche. */
  verifieLe?: string;
  /**
   * La commune choisie, quand le signalement ne porte pas sur une réponse
   * territoriale précise. Le lecteur regardait un territoire : le dire évite
   * au correcteur de deviner lequel.
   */
  commune?: { nom: string; code: string };
  /**
   * La réponse territoriale affichée. C'est la plus susceptible d'être
   * fausse — le registre national ignore ce qui se décide en conseil
   * communautaire — donc la plus utile à citer mot pour mot.
   */
  reponse?: {
    commune: string;
    /** Code INSEE : deux communes peuvent porter le même nom. */
    code: string;
    competence: string;
    dit: string;
    /** Le référentiel d'où sort la réponse, et sa date. */
    source?: string;
  };
}

/** Le titre de l'issue : reconnaissable dans une liste, sans être un roman. */
export function titreSignalement(ctx: Contexte): string {
  const quoi = ctx.reponse?.competence ?? ctx.noeud?.nom;
  // Seule une réponse territoriale met un lieu dans le titre : « Le préfet au
  // Mayet-de-Montagne » laisserait croire que la fiche est locale, alors que
  // la commune n'était que celle choisie au moment de la lecture.
  const ou = ctx.reponse?.commune;
  if (quoi && ou) return `Signalement : ${quoi} ${aLieu(ou)}`;
  if (quoi) return `Signalement : ${quoi}`;
  return 'Signalement sur le site';
}

/**
 * « au Mayet-de-Montagne », pas « à Le Mayet-de-Montagne ».
 *
 * Un tiers des communes françaises portent un article, et la contraction est
 * ce qui distingue un texte écrit d'un texte assemblé. « La » et « L' » ne se
 * contractent pas : on va à La Rochelle et à L'Aigle.
 */
export function aLieu(nom: string): string {
  if (nom.startsWith('Le ')) return `au ${nom.slice(3)}`;
  if (nom.startsWith('Les ')) return `aux ${nom.slice(4)}`;
  return `à ${nom}`;
}

/**
 * Le corps de l'issue.
 *
 * L'ordre compte : ce que le lecteur a à dire d'abord, le relevé technique
 * ensuite. L'inverse produit des issues dont on ne lit que l'en-tête.
 */
export function corpsSignalement(ctx: Contexte, dire = ''): string {
  const l: string[] = [];
  l.push("### Ce qui est faux, et ce que vous savez");
  l.push('');
  l.push(dire.trim() || '<!-- Décrivez ici l’erreur. -->');
  l.push('');
  l.push("### Votre source, si vous en avez une");
  l.push('');
  l.push(
    '<!-- Délibération, arrêté préfectoral, page officielle : c’est elle qui' +
      ' permettra la correction. -->',
  );
  l.push('');
  l.push('---');
  l.push('');
  l.push('**Ce que Rouages affichait** (relevé automatique)');
  l.push('');
  if (ctx.page) l.push(`- Page : ${ctx.page}`);
  if (ctx.noeud) l.push(`- Fiche : ${ctx.noeud.nom} (\`${ctx.noeud.id}\`)`);
  if (ctx.verifieLe) l.push(`- Vérifiée le : ${ctx.verifieLe}`);
  if (!ctx.reponse && ctx.commune) {
    l.push(`- Commune choisie : ${ctx.commune.nom} (INSEE ${ctx.commune.code})`);
  }
  if (ctx.reponse) {
    l.push(`- Commune : ${ctx.reponse.commune} (INSEE ${ctx.reponse.code})`);
    // La compétence ne se répète pas quand c'est la fiche elle-même.
    if (ctx.reponse.competence !== ctx.noeud?.nom) {
      l.push(`- Compétence : ${ctx.reponse.competence}`);
    }
    l.push(`- Réponse affichée : « ${ctx.reponse.dit} »`);
    if (ctx.reponse.source) l.push(`- Origine de la réponse : ${ctx.reponse.source}`);
  }
  return l.join('\n');
}

/** L'issue pré-remplie. Le lecteur relit et complète avant d'envoyer. */
export function urlIssue(ctx: Contexte, dire = ''): string {
  const p = new URLSearchParams({
    title: titreSignalement(ctx),
    body: corpsSignalement(ctx, dire),
  });
  return `${DEPOT}/issues/new?${p}`;
}

/**
 * Le lien vers la page de signalement.
 *
 * Elle ne transporte que des identifiants : la page recalcule elle-même ce que
 * le site affiche, avec le même code que l'explorateur. Un relevé recopié
 * depuis l'URL pourrait être trafiqué, et surtout il vieillirait — celui-ci
 * décrit l'état réel de la donnée au moment du signalement.
 */
export function urlSignaler(noeud?: string, commune?: string, page?: string): string {
  const p = new URLSearchParams();
  if (noeud) p.set('n', noeud);
  if (commune) p.set('c', commune);
  // Seulement un chemin du site : une URL complète transformerait le lien en
  // redirecteur ouvert, et n'apprendrait rien de plus au correcteur.
  if (page && cheminInterne(page)) p.set('p', page);
  const q = p.toString();
  return q ? `/signaler?${q}` : '/signaler';
}

/** Un chemin absolu du site, et rien d'autre : ni hôte, ni schéma, ni « // ». */
export function cheminInterne(p: string): boolean {
  return p.startsWith('/') && !p.startsWith('//') && !p.includes(':');
}
