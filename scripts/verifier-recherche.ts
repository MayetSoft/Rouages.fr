/**
 * Vérifie le classement de la recherche de communes, sur l'index réel.
 *
 * Une régression de tri ne se voit pas : le champ répond, la liste s'affiche, et
 * elle propose la mauvaise commune. Or plus d'une commune sur dix porte un nom
 * qu'une autre porte aussi — 1 481 noms pour 3 769 communes. Ces cas sont donc
 * fixés ici plutôt que laissés à la vigilance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classer, type CommuneBreve } from '../src/client/territoire.ts';
import { RACINE } from '../src/modele/graphe.ts';

const brut = JSON.parse(
  readFileSync(join(RACINE, 'public', 'territoires', 'index.json'), 'utf8'),
) as { deps: Record<string, string>; c: [string, string, string, string, number][] };

const index: CommuneBreve[] = brut.c.map(([code, nom, cps, dep, population]) => {
  const liste = cps ? cps.split(' ') : [];
  return { code, nom, cp: liste[0] ?? '', cps: liste, dep, depNom: brut.deps[dep] ?? dep, population };
});

const ROUGE = '\x1b[31m', VERT = '\x1b[32m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

function attendre(requete: string, attendu: string, pourquoi: string) {
  const trouve = classer(index, requete)[0];
  const ok = trouve?.code === attendu;
  if (!ok) echecs++;
  const nom = trouve ? `${trouve.nom} (${trouve.depNom}, ${trouve.code})` : 'rien';
  console.log(
    `${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}« ${requete} » → ${nom}\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

function attendreDepartements(requete: string, minimum: number, pourquoi: string) {
  const deps = new Set(classer(index, requete, 12).map((c) => c.dep));
  const ok = deps.size >= minimum;
  if (!ok) echecs++;
  console.log(
    `${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}« ${requete} » → ${deps.size} départements distincts ` +
      `(minimum ${minimum})\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

function attendrePresent(requete: string, codes: string[], pourquoi: string) {
  const trouves = classer(index, requete, 12).map((c) => c.code);
  const manquants = codes.filter((c) => !trouves.includes(c));
  if (manquants.length > 0) echecs++;
  console.log(
    `${manquants.length === 0 ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}« ${requete} » contient ${codes.length} attendus` +
      `${manquants.length ? ` — manquent ${manquants.join(', ')}` : ''}\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

// Le cas qui a motivé ce fichier : deux communes dont le nom commence pareil.
attendre('Mayet', '72191', 'la correspondance exacte passe avant Le Mayet-de-Montagne');
attendre('Le Mayet-de-Montagne', '03165', 'le nom complet, article compris, reste trouvable');
attendrePresent('mayet de montagne', ['03165'], "on doit la trouver sans taper l'article");

// Cinq chiffres, pour un habitant, c'est un code postal.
attendre('72360', '72191', 'le code postal passe avant le code INSEE de Trangé');
attendrePresent('72360', ['72191', '72327', '72369'], 'les autres communes du même code postal suivent');

// Les homonymes doivent être départageables : c'est le département affiché qui
// tranche, donc la liste doit en présenter plusieurs.
attendreDepartements('Sainte-Colombe', 5, 'les homonymes de plusieurs départements coexistent');

// Accents, casse et abréviations ne doivent pas être un obstacle : 3 885
// communes commencent par Saint, et personne ne l'écrit en entier.
attendre('ST ETIENNE', '42218', "« St » vaut « Saint »");
// À rang égal, la plus peuplée d'abord — c'est le départage assumé.
attendre('Ste Colombe', '69189', "« Ste » vaut « Sainte », et la plus peuplée passe devant");
attendre('saint-etienne', '42218', 'sans accent ni casse, on trouve quand même');
attendre('Ajaccio', '2A004', 'un code INSEE non numérique reste géré');

console.log(
  echecs === 0
    ? `\n${VERT}Classement conforme.${RAZ}`
    : `\n${ROUGE}${echecs} cas en échec.${RAZ}`,
);
process.exit(echecs === 0 ? 0 : 1);
