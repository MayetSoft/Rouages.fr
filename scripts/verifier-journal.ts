/**
 * Vérifie ce que le journal retient, et ce qu'il écarte.
 *
 * Trois règles décident du contenu d'un flux, et aucune ne se voit à l'œil : la
 * fenêtre, le plafond par acteur, et le refus des dates impossibles. Une
 * régression y serait muette — le flux continuerait de paraître, avec les
 * mauvaises entrées. Les cas sont donc fixés ici.
 *
 * Les dates futures ne sont pas une prudence de principe : le répertoire des
 * associations porte onze créations datées de 2029, et une seule suffirait à
 * occuper la tête du flux pendant trois ans.
 */
import { FENETRE_MOIS, GENRES, PAR_ACTEUR, retenir, type Evenement } from '../src/modele/journal.ts';
import { comparerTransferts, type EtatDep } from './transferts-emettre.ts';

const ROUGE = '\x1b[31m', VERT = '\x1b[32m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

const LE_JOUR = new Date('2026-09-21T12:00:00Z');

function jourDecale(mois: number, jours = 0): string {
  const d = new Date(LE_JOUR);
  d.setMonth(d.getMonth() - mois);
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
}

function attendre(quoi: string, obtenu: unknown, attendu: unknown, pourquoi: string) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(
    `${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}${quoi} → ${JSON.stringify(obtenu)}` +
      (ok ? '' : ` (attendu ${JSON.stringify(attendu)})`) +
      `\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

const evenement = (date: string, quoi: string, siren = '200071454'): Evenement => ({
  genre: 0,
  date,
  quoi,
  siren,
});

// --- la fenêtre ---
attendre(
  'un fait de la semaine dernière',
  retenir([evenement(jourDecale(0, 7), 'récent')], LE_JOUR).length,
  1,
  'la fenêtre regarde en arrière, et ce fait y est',
);
attendre(
  `un fait d'il y a ${FENETRE_MOIS + 1} mois`,
  retenir([evenement(jourDecale(FENETRE_MOIS + 1), 'ancien')], LE_JOUR).length,
  0,
  'au-delà de la fenêtre, le journal ne le reprend pas — et ne le reprendra jamais',
);
attendre(
  'un fait daté de 2029',
  retenir([evenement('2029-03-04', 'impossible')], LE_JOUR).length,
  0,
  'une date future occuperait la tête du flux pendant des années (le RNA en porte onze)',
);
attendre(
  'un événement sans intitulé',
  retenir([evenement(jourDecale(0, 3), '')], LE_JOUR).length,
  0,
  'une entrée de flux sans titre ne dit rien à personne',
);

// --- le plafond, par acteur et par genre ---
const beaucoup = Array.from({ length: PAR_ACTEUR + 8 }, (_, i) =>
  evenement(jourDecale(0, i + 1), `marché ${i}`),
);
attendre(
  `${PAR_ACTEUR + 8} marchés d'un même acheteur`,
  retenir(beaucoup, LE_JOUR).length,
  PAR_ACTEUR,
  'une agglomération notifie une centaine de marchés par an : le plafond la borne',
);
attendre(
  'et ce sont les plus récents',
  retenir(beaucoup, LE_JOUR)[0].quoi,
  'marché 0',
  'le plafond coupe par le bas, jamais par le haut',
);

const deuxActeurs = [
  ...Array.from({ length: PAR_ACTEUR + 3 }, (_, i) => evenement(jourDecale(0, i + 1), `a${i}`, '111111111')),
  ...Array.from({ length: PAR_ACTEUR + 3 }, (_, i) => evenement(jourDecale(0, i + 1), `b${i}`, '222222222')),
];
attendre(
  'deux acheteurs actifs',
  retenir(deuxActeurs, LE_JOUR).length,
  PAR_ACTEUR * 2,
  "le plafond vaut par acteur : l'un ne mange pas la place de l'autre",
);

const deuxGenres = [
  ...Array.from({ length: PAR_ACTEUR + 3 }, (_, i) => evenement(jourDecale(0, i + 1), `m${i}`)),
  ...Array.from({ length: PAR_ACTEUR + 3 }, (_, i) => ({
    ...evenement(jourDecale(0, i + 1), `d${i}`),
    genre: 1,
  })),
];
attendre(
  'un acteur qui commande et qui délibère',
  retenir(deuxGenres, LE_JOUR).length,
  PAR_ACTEUR * 2,
  'le plafond vaut aussi par genre : les marchés ne chassent pas les délibérations',
);

// --- la commune, quand l'événement n'appartient qu'à elle ---
const parCommune = Array.from({ length: PAR_ACTEUR + 4 }, (_, i) => ({
  genre: 3,
  date: jourDecale(0, i + 1),
  quoi: `association ${i}`,
  commune: '03165',
}));
attendre(
  'des créations dans une même commune',
  retenir(parCommune, LE_JOUR).length,
  PAR_ACTEUR,
  "à défaut de SIREN, c'est la commune qui fait l'acteur",
);

// --- l'ordre ---
const desordre = [
  evenement(jourDecale(3), 'vieux'),
  evenement(jourDecale(0, 2), 'neuf'),
  evenement(jourDecale(1), 'entre'),
];
attendre(
  'trois faits en désordre',
  retenir(desordre, LE_JOUR).map((e) => e.quoi),
  ['neuf', 'entre', 'vieux'],
  'le journal sort du plus récent au plus ancien',
);

// --- la comparaison des états du registre des transferts ---
//
// C'est le seul endroit du journal qui compare deux états plutôt que de
// projeter des faits datés, parce que BANATIC ne date pas ses transferts. Les
// garde-fous comptent donc plus qu'ailleurs.
const LIBELLES = new Map([
  ['C4020', 'Eau (Traitement, Adduction, Distribution)'],
  ['C4502', 'Collecte des déchets des ménages'],
]);

const etat = (maj: string, codes: string[], rattachements: number[] = [0]): EtatDep => ({
  maj,
  g: [
    ['200071454', 'CA Vichy Communauté', 'CA', codes],
    ['250301165', 'SM des eaux de l’Allier', 'SM', ['C4020']],
  ],
  c: [['03165', 'Le Mayet-de-Montagne', 1383, rattachements, '03250']],
});

attendre(
  'deux ingestions sur le même export',
  comparerTransferts(etat('2026-01-01', ['C4020']), etat('2026-01-01', ['C4020', 'C4502']), LIBELLES).length,
  0,
  "le registre n'a pas bougé : relire le même export ne date pas un changement",
);
attendre(
  'aucun état précédent',
  comparerTransferts(null, etat('2026-02-01', ['C4020']), LIBELLES).length,
  0,
  'une première ingestion ne peut rien comparer, et annoncerait tout comme neuf',
);

const pris = comparerTransferts(etat('2026-01-01', []), etat('2026-02-01', ['C4020']), LIBELLES);
attendre(
  'une agglomération prend une compétence',
  pris.map((e) => [GENRES[e.genre], e.quoi, e.siren]),
  [['Compétence transférée', 'Eau (Traitement, Adduction, Distribution)', '200071454']],
  "un fait et non cent quatre : l'événement est porté par le groupement, ses communes le voient",
);
attendre(
  'et il est daté du nouvel export',
  pris[0]?.date,
  '2026-02-01',
  'du jour où le registre le publie, jamais du jour où on le relit',
);
attendre(
  'une agglomération rend une compétence',
  comparerTransferts(etat('2026-01-01', ['C4502']), etat('2026-02-01', []), LIBELLES)
    .map((e) => GENRES[e.genre]),
  ['Compétence reprise'],
  'le retrait se lit aussi bien que la prise',
);

attendre(
  'une commune rejoint un syndicat',
  comparerTransferts(etat('2026-01-01', ['C4020'], [0]), etat('2026-02-01', ['C4020'], [0, 1]), LIBELLES)
    .map((e) => [GENRES[e.genre], e.quoi, e.commune]),
  [['Rattachement modifié', 'Rattachement à SM des eaux de l’Allier', '03165']],
  "le rattachement appartient à la commune, pas au groupement qui l'accueille",
);
attendre(
  'une commune quitte un syndicat',
  comparerTransferts(etat('2026-01-01', ['C4020'], [0, 1]), etat('2026-02-01', ['C4020'], [0]), LIBELLES)
    .map((e) => e.quoi),
  ['Sortie de SM des eaux de l’Allier'],
  'et la sortie se nomme avec le nom que le groupement portait alors',
);

const neuf: EtatDep = {
  maj: '2026-02-01',
  g: [['200099999', 'CC toute neuve', 'CC', ['C4020', 'C4502']]],
  c: [['03165', 'Le Mayet-de-Montagne', 1383, [0], '03250']],
};
attendre(
  'un groupement qui apparaît',
  comparerTransferts(etat('2026-01-01', ['C4020']), neuf, LIBELLES).map((e) => GENRES[e.genre]),
  ['Rattachement modifié', 'Rattachement modifié'],
  "sa création ne « transfère » rien : c'est le rattachement des communes qui le dit",
);

console.log(
  echecs === 0
    ? `\n${VERT}Journal conforme.${RAZ}`
    : `\n${ROUGE}${echecs} règle(s) du journal ne tiennent plus.${RAZ}`,
);
process.exit(echecs === 0 ? 0 : 1);
