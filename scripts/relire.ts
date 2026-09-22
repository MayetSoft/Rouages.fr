/**
 * Ce qui reste à faire relire, et par où commencer.
 *
 * Deux cent quatre attributions portaient `confiance: a_confirmer` — une
 * affirmation écrite mais non vérifiée contre sa source. C'est le vrai reste à
 * faire du contenu, et c'était jusqu'ici un nombre dans la feuille de route :
 * rien ne disait *lesquelles*, ni ce qu'il faudrait lire pour en sortir.
 *
 * Ce script en fait une file de travail. Il n'invente aucune vérification : il
 * affiche, pour chaque fiche, l'affirmation exacte à contrôler et les pages de
 * référence qu'elle porte déjà — celles-là mêmes qu'il faut ouvrir. Une fiche
 * confirmée gagne l'article qui la fonde et passe à `etabli` ; une fiche dont
 * la source ne dit pas ce qu'on croyait est corrigée, et c'est le cas le plus
 * utile.
 *
 * **Une fiche qui reste `a_confirmer` n'est pas un échec.** Certaines
 * affirmations relèvent de la pratique locale ou d'un délai observé, qu'aucun
 * texte ne tranche : elles doivent le rester, et le site affiche cette réserve
 * plutôt que de la taire.
 */
import { chargerGraphe } from '../src/modele/graphe.ts';

const VERT = '\u001b[32m';
const JAUNE = '\u001b[33m';
const GRIS = '\u001b[90m';
const GRAS = '\u001b[1m';
const RAZ = '\u001b[0m';

interface Fiche {
  famille: string;
  ou: string;
  quoi: string;
  liens: string[];
}

const g = chargerGraphe();
const fiches: Fiche[] = [];

const ajouter = (famille: string, ou: string, quoi: string | undefined, liens: string[] = []) => {
  if (quoi) fiches.push({ famille, ou, quoi, liens });
};

for (const a of g.acteurs.values()) {
  if (a.confiance === 'a_confirmer') ajouter('acteur', a.id, a.resume, a.liens);
}
for (const c of g.competences.values()) {
  if (c.confiance === 'a_confirmer') ajouter('compétence', c.id, c.resume, c.liens);
}
for (const d of g.documents.values()) {
  if (d.confiance === 'a_confirmer') ajouter('document', d.id, d.resume ?? d.nom, d.liens);
}
for (const f of g.flux.values()) {
  if (f.confiance === 'a_confirmer') ajouter('flux', f.id, f.resume, f.liens);
}
for (const p of g.processus.values()) {
  if (p.confiance === 'a_confirmer') ajouter('processus', p.id, p.resume, p.liens);
  for (const e of p.etapes) {
    if (e.confiance === 'a_confirmer') {
      ajouter('étape', `${p.id} #${e.ordre}`, `${e.action}${e.note ? ` — ${e.note}` : ''}`, e.liens);
    }
  }
  for (const l of p.leviers) {
    if (l.confiance === 'a_confirmer') {
      ajouter('levier', `${p.id} / ${l.id}`, `${l.quoi} — ${l.quand}`, l.liens);
    }
  }
}

if (fiches.length === 0) {
  console.log(`${VERT}Aucune fiche à confirmer : tout le contenu est vérifié.${RAZ}`);
  process.exit(0);
}

// Par famille, parce qu'on relit un type de fiche à la fois : les acteurs se
// vérifient sur un article d'organisation, les délais sur un article de
// procédure, et passer de l'un à l'autre coûte plus que de les grouper.
const parFamille = new Map<string, Fiche[]>();
for (const f of fiches) {
  if (!parFamille.has(f.famille)) parFamille.set(f.famille, []);
  parFamille.get(f.famille)!.push(f);
}

const filtre = process.argv.find((a) => !a.startsWith('-') && parFamille.has(a));
console.log(
  `${GRAS}${fiches.length} fiche(s) à faire relire${RAZ}` +
    (filtre ? ` ${GRIS}(affichage limité à « ${filtre} »)${RAZ}` : ''),
);
console.log(
  `${GRIS}Vérifier l'affirmation contre les pages citées ; confirmer en passant ` +
    `« confiance: etabli »,\net en ajoutant l'article qui la fonde. Une affirmation de ` +
    `pratique locale reste « a_confirmer ».${RAZ}\n`,
);

for (const [famille, liste] of [...parFamille].sort((a, b) => b[1].length - a[1].length)) {
  if (filtre && famille !== filtre) continue;
  console.log(`${JAUNE}${famille} — ${liste.length}${RAZ}`);
  for (const f of liste) {
    console.log(`  ${GRAS}${f.ou}${RAZ}`);
    console.log(`    ${f.quoi}`);
    console.log(`    ${GRIS}à vérifier sur : ${f.liens.join(', ') || '— aucune page citée'}${RAZ}`);
  }
  console.log('');
}

// Un rappel plutôt qu'un reproche : le compte descend à chaque relecture, et
// c'est le seul indicateur du contenu qui ne dépende pas du volume écrit.
const parts = [...parFamille].map(([n, l]) => `${l.length} ${n}`).join(', ');
console.log(`${GRIS}Reste : ${parts}.${RAZ}`);
