/**
 * Contrôle qualité du contenu — la ligne éditoriale rendue exécutable.
 *
 *   npm run valider              structure, références, règles éditoriales
 *   npm run valider -- --liens   vérifie en plus que les URL répondent (réseau)
 *   npm run fraicheur            échoue si une fiche a dépassé sa date de péremption
 *
 * Le build appelle `valider` : une fiche sans source, sans levier ou avec une
 * référence cassée ne peut pas être mise en ligne.
 */
import { chargerGraphe, estPerime, formaterDate } from '../src/modele/graphe.ts';
import { construireGlossaire } from '../src/modele/glossaire.ts';
import { construireReseau } from '../src/modele/reseau.ts';

const args = new Set(process.argv.slice(2));
const verifierLiens = args.has('--liens');
const fraicheurBloquante = args.has('--fraicheur');

const ROUGE = '\x1b[31m';
const JAUNE = '\x1b[33m';
const VERT = '\x1b[32m';
const GRIS = '\x1b[90m';
const RAZ = '\x1b[0m';

const erreurs: string[] = [];
const avertissements: string[] = [];

const g = chargerGraphe();

for (const a of g.anomalies) {
  const ligne = `${a.fichier}${a.chemin ? ` → ${a.chemin}` : ''} : ${a.message}`;
  (a.gravite === 'erreur' ? erreurs : avertissements).push(ligne);
}

/* ------------------------------------------------------------------ *
 * Règles éditoriales
 * ------------------------------------------------------------------ */

// Une source déclarée mais citée par personne est du bruit : on la signale.
const citees = new Set<string>();
const recolter = (s: string[]) => s.forEach((id) => citees.add(id));
for (const a of g.acteurs.values()) recolter(a.liens);
for (const c of g.competences.values()) recolter(c.liens);
for (const d of g.documents.values()) recolter(d.liens);
for (const f of g.flux.values()) recolter(f.liens);
for (const p of g.processus.values()) {
  recolter(p.liens);
  p.etapes.forEach((e) => recolter(e.liens));
  p.leviers.forEach((l) => recolter(l.liens));
}
for (const id of g.sources.keys()) {
  if (!citees.has(id)) avertissements.push(`page de référence « ${id} » déclarée mais liée depuis aucun nœud`);
}

// Tout sigle employé doit avoir son entrée au glossaire. C'est la règle qui
// empêche le site de redevenir illisible pour qui n'est pas du métier — et elle
// se renforce toute seule à mesure que le réseau grossit.
const glossaire = construireGlossaire([...g.sigles.values()]);
const textesVisibles: [string, string][] = [];
const noter = (ou: string, ...textes: (string | undefined)[]) => {
  for (const t of textes) if (t) textesVisibles.push([ou, t]);
};
for (const a of g.acteurs.values()) noter(`acteur ${a.id}`, a.nom, a.nom_court, a.resume);
for (const c of g.competences.values()) noter(`compétence ${c.id}`, c.nom, c.nom_court, c.resume);
for (const d of g.documents.values()) noter(`document ${d.id}`, d.nom, d.resume, d.ou_le_trouver);
for (const f of g.flux.values()) noter(`flux ${f.id}`, f.nom, f.resume, f.ordre_de_grandeur);
for (const s of g.sources.values()) noter(`source ${s.id}`, s.titre);
for (const s of g.sigles.values()) noter(`sigle ${s.sigle}`, s.definition);
for (const r of g.reperes.values()) noter(`repère ${r.id}`, r.nom, r.explication);
for (const p of g.processus.values()) {
  noter(`processus ${p.id}`, p.nom, p.resume, p.declencheur, p.sortie);
  for (const e of p.etapes) noter(`processus ${p.id}, étape ${e.ordre}`, e.action, e.note);
  for (const l of p.leviers) noter(`levier ${l.id}`, l.quoi, l.quand, l.aupres_de, l.piege, l.recours_si_refus);
}

const sigleManquant = new Map<string, string>();
for (const [ou, texte] of textesVisibles) {
  for (const inconnu of glossaire.inconnus(texte)) {
    if (!sigleManquant.has(inconnu)) sigleManquant.set(inconnu, ou);
  }
}
for (const [sigle, ou] of sigleManquant) {
  erreurs.push(
    `sigle « ${sigle} » employé dans ${ou} sans entrée au glossaire — ajoutez-le à contenu/glossaire.yaml`,
  );
}

// « Un nœud isolé n'apporte rien » : le premier critère d'admission de
// docs/02-familles.md, jusqu'ici seulement écrit. Un nœud que rien ne relie est
// invisible depuis tout autre point du réseau — sur un site qui *est* un
// réseau, c'est une page morte.
//
// Un document fait exception, en avertissement seulement : il ne peut être
// relié que par un processus qui le produit, et tous les processus qui
// comptent ne sont pas encore décrits. L'exiger reviendrait à interdire de
// nommer un document avant d'avoir modélisé son processus.
for (const n of construireReseau().noeuds) {
  if (n.degre > 0) continue;
  const ligne =
    `${n.type} « ${n.id} » n'est relié à aucun autre nœud — ` +
    `un nœud isolé n'apporte rien (docs/02-familles.md).`;
  (n.type === 'document' ? avertissements : erreurs).push(ligne);
}

// La branche du pouvoir est exigée là où elle a un sens, et refusée ailleurs.
// Sans cette règle, `pouvoirs` serait un champ facultatif que personne ne
// remplirait : la classification par branche resterait à moitié faite, et une
// vue « par branche » à moitié faite est pire que pas de vue du tout.
//
// Le critère n'est pas seulement l'échelon. Une chambre régionale des comptes
// siège en région tout en étant une juridiction de l'État : c'est le fait
// d'être une juridiction ou une autorité indépendante qui appelle la réponse,
// autant que d'être une entité nationale.
for (const a of g.acteurs.values()) {
  // Les personnes physiques sont exclues : un commissaire enquêteur est
  // désigné pour une mission, il n'incarne pas une branche. Un mandat électif,
  // lui, en est bien un organe — d'où la distinction entre les deux types.
  const concerne =
    (a.echelon === 'etat' && a.type !== 'personne') ||
    a.type === 'juridiction' ||
    a.type === 'autorite_independante';
  if (concerne && !a.pouvoirs) {
    erreurs.push(
      `acteur « ${a.id} » relève de l'État ou d'une juridiction sans déclarer sa branche — ` +
        `ajoutez « pouvoirs: [...] » (docs/02-familles.md).`,
    );
  }
  if (!concerne && a.pouvoirs) {
    erreurs.push(
      `acteur « ${a.id} » déclare une branche du pouvoir alors qu'il n'est ni national, ` +
        `ni juridiction, ni autorité indépendante — la séparation des pouvoirs ne s'y joue pas.`,
    );
  }
}

// Famille « influence » : mécanismes, jamais de personnes. Contrôle grossier
// mais suffisant pour attraper l'écart le plus probable — une civilité suivie
// d'un nom propre. Il ne remplace pas la relecture, il la rend obligatoire.
const CIVILITES = /\b(M\.|MM\.|Mme|Mmes|Monsieur|Madame|Maître)\s+[A-ZÉÈÀÂÎÔÛÇ]/;
for (const p of g.processus.values()) {
  if (p.famille !== 'influence') continue;
  const textes = [
    p.nom,
    p.resume,
    p.declencheur,
    p.sortie,
    ...p.etapes.flatMap((e) => [e.action, e.note ?? '']),
    ...p.leviers.flatMap((l) => [l.quoi, l.quand, l.aupres_de, l.piege ?? '']),
  ];
  for (const t of textes) {
    if (CIVILITES.test(t)) {
      erreurs.push(
        `processus « ${p.id} » (famille influence) semble nommer une personne physique : « ${t.slice(0, 80)}… ». ` +
          `Cette famille décrit des mécanismes, jamais des personnes (docs/07-risques.md).`,
      );
    }
  }
}

// Un levier sans « quand » exploitable ne sert à rien : c'est la question 5.
for (const p of g.processus.values()) {
  for (const l of p.leviers) {
    if (l.quand.trim().length < 8) {
      erreurs.push(`levier « ${l.id} » : le champ « quand » doit dire jusqu'à quand on peut agir`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Fraîcheur
 * ------------------------------------------------------------------ */

const perimees: string[] = [];
const controlerFraicheur = (type: string, id: string, e: { verifie_le: Date; perime_apres_mois: number }) => {
  if (estPerime(e)) perimees.push(`${type} « ${id} » — dernière vérification le ${formaterDate(e.verifie_le)}`);
};
for (const [id, a] of g.acteurs) controlerFraicheur('acteur', id, a);
for (const [id, c] of g.competences) controlerFraicheur('compétence', id, c);
for (const [id, f] of g.flux) controlerFraicheur('flux', id, f);
for (const [id, p] of g.processus) controlerFraicheur('processus', id, p);

/* ------------------------------------------------------------------ *
 * Liens (réseau, sur demande)
 * ------------------------------------------------------------------ */

if (verifierLiens) {
  const urls = [...g.sources.values()];
  console.log(`${GRIS}Vérification de ${urls.length} liens…${RAZ}`);
  const lots = 5;
  for (let i = 0; i < urls.length; i += lots) {
    await Promise.all(
      urls.slice(i, i + lots).map(async (s) => {
        try {
          const r = await fetch(s.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
          if (!r.ok && r.status !== 405) avertissements.push(`source « ${s.id} » : ${r.status} sur ${s.url}`);
        } catch (e) {
          avertissements.push(`source « ${s.id} » : injoignable (${(e as Error).message})`);
        }
      }),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Rapport
 * ------------------------------------------------------------------ */

const total =
  g.acteurs.size +
  g.competences.size +
  g.documents.size +
  g.processus.size +
  g.flux.size +
  g.sources.size +
  g.sigles.size +
  g.reperes.size +
  g.surveillances.size;
console.log(
  `${GRIS}${total} entités : ${g.acteurs.size} acteurs, ${g.competences.size} compétences, ` +
    `${g.processus.size} processus, ${g.documents.size} documents, ${g.flux.size} flux, ` +
    `${g.sources.size} sources, ${g.sigles.size} sigles, ${g.reperes.size} repères, ` +
    `${g.surveillances.size} surveillances.${RAZ}`,
);

for (const a of avertissements) console.log(`${JAUNE}avertissement${RAZ} ${a}`);
for (const p of perimees) console.log(`${JAUNE}périmé${RAZ}       ${p}`);
for (const e of erreurs) console.log(`${ROUGE}erreur${RAZ}        ${e}`);

if (erreurs.length > 0) {
  console.log(`\n${ROUGE}${erreurs.length} erreur(s) — contenu non publiable.${RAZ}`);
  process.exit(1);
}
if (fraicheurBloquante && perimees.length > 0) {
  console.log(`\n${ROUGE}${perimees.length} fiche(s) à revérifier.${RAZ}`);
  process.exit(1);
}
console.log(`\n${VERT}Contenu valide.${RAZ}${perimees.length ? ` ${perimees.length} fiche(s) à revérifier bientôt.` : ''}`);
