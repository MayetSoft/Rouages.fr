/**
 * Vérifie le rattachement des annonces du BODACC à une commune.
 *
 * Le BODACC ne donne pas de code commune, seulement une ville et un code
 * postal, écrits comme le déclarant les a écrits. Une régression ne se voit
 * pas : les décomptes restent plausibles, ils sont seulement comptés chez le
 * voisin — ou nulle part. Les cas qui ont motivé chaque règle du rattacheur
 * sont fixés ici, sur le découpage administratif réel.
 */
import { indexDuDecoupage, rattacheur } from './entreprises-emettre.ts';

const rattacher = rattacheur(indexDuDecoupage());
const ROUGE = '\x1b[31m', VERT = '\x1b[32m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

function attendre(ville: string, cp: string, attendu: string | null, pourquoi: string) {
  const trouve = rattacher(ville, cp);
  const ok = trouve === attendu;
  if (!ok) echecs++;
  console.log(
    `${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}« ${ville} », ${cp} → ${trouve ?? 'aucune commune'}` +
      `${ok ? '' : ` (attendu ${attendu ?? 'aucune'})`}\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

// La commune de référence, et ses voisines du même code postal.
attendre('Le Mayet-de-Montagne', '03250', '03165', 'le cas nominal');
attendre('LE MAYET DE MONTAGNE', '03250', '03165', 'capitales et tirets manquants');
attendre('Nizerolles', '03250', '03201', 'un code postal partagé se départage par le nom');
attendre('Mayet', '72360', '72191', "l'homonyme de la Sarthe reste chez lui");

// Les codes Cedex ne désignent aucune commune : le nom, dans le département.
attendre('Nanterre Cedex', '92741', '92050', 'code Cedex, mention « Cedex » retirée');
attendre('Paris', '75380', '75056', 'code Cedex parisien');

// Les arrondissements comptent pour la ville.
attendre('Marseille 2e Arrondissement Cedex 02', '13235', '13055', 'arrondissement et Cedex ensemble');

// Les communes associées ou déléguées comptent pour celle qui les a reprises.
attendre('Lomme', '59160', '59350', 'commune associée de Lille');
attendre('Hellemmes-Lille', '59260', '59350', 'commune associée de Lille');
attendre('La Madeleine', '59562', '59368', 'une commune à part entière, avec un code Cedex');

// Ce qu'on refuse de deviner : un lieu-dit n'est pas une commune.
attendre('Porticcio', '20166', null, 'un hameau corse, sans commune du même nom : rien plutôt qu’une erreur');

console.log(echecs === 0 ? `\n${VERT}Rattachement conforme.${RAZ}` : `\n${ROUGE}${echecs} cas en échec.${RAZ}`);
process.exit(echecs === 0 ? 0 : 1);
