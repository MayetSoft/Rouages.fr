/**
 * Le flux d'une commune : ce qui a bougé, à l'adresse de sa page.
 *
 * Un flux par commune plutôt qu'un flux national : c'est la seule échelle à
 * laquelle l'abonnement a un sens, et celle à laquelle le lecteur se reconnaît.
 * Trente-trois mille fichiers — les communes où rien n'a bougé sur la fenêtre
 * n'en ont pas, parce qu'un flux vide ne s'abonne pas et que le site préfère
 * ne rien écrire plutôt qu'écrire zéro.
 *
 * `03165-flux.xml` à côté de `03165.html`, et non `03165/flux.xml` : un
 * dossier par commune, ce sont trente-trois mille inodes de plus à créer et
 * autant de commandes en FTP, pour un chemin à peine plus joli. Le site nomme
 * déjà ses plans de site de la même façon.
 */
import type { APIRoute } from 'astro';
import { communes, journalCommune } from '../../modele/territoires.ts';
import { flux, type EntreeFlux } from '../../modele/flux.ts';

/**
 * Combien d'entrées le flux porte.
 *
 * Quinze couvre plus d'un mois dans la commune la plus active, et un
 * agrégateur garde de toute façon ce qu'il a déjà montré. Le nombre n'est pas
 * un détail de confort : chaque entrée pèse environ trois cents octets, et il
 * y a trente-trois mille flux.
 */
const ENTREES = 15;

export function getStaticPaths() {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  return communes()
    .filter((c) => !filtre || filtre.includes(c.dep))
    .filter((c) => journalCommune(c, 1).length > 0)
    .map((c) => ({ params: { code: c.code }, props: { commune: c } }));
}

export const GET: APIRoute = ({ site, props }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://rouages.fr';
  const c = props.commune as ReturnType<typeof communes>[number];
  const page = `${base}/commune/${c.code}`;
  const entrees: EntreeFlux[] = journalCommune(c, ENTREES).map((e) => ({
    cle: `${c.code}/${e.cle}`,
    // Le genre en tête : dans un agrégateur, le titre est souvent tout ce
    // qu'on lit, et « Marché notifié » dit d'emblée de quoi il retourne.
    titre: `${e.genre} — ${e.quoi}`,
    date: e.date,
    texte: [e.par, e.detail].filter(Boolean).join(' · ') || e.quoi,
    lien: e.url ?? undefined,
    categorie: e.genre,
  }));
  return flux({
    self: `${base}/commune/${c.code}-flux.xml`,
    page,
    titre: `Rouages — ${c.nom}`,
    resume:
      `Ce qui bouge à ${c.nom} et dans les structures dont la commune dépend : ` +
      `marchés notifiés, délibérations publiées, associations créées.`,
    // Le domaine et une année fixe : un identifiant d'entrée ne doit jamais
    // changer, sans quoi l'agrégateur remontrerait tout à chaque ingestion.
    tag: 'rouages.fr,2026',
    entrees,
  });
};
