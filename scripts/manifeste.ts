/**
 * Ce qui a vraiment changé depuis le dernier déploiement.
 *
 * `lftp mirror` compare la taille et la date. Sur une machine d'intégration
 * neuve, chaque fichier du build est daté du jour : tout repartait à chaque
 * publication, soixante-dix-sept mille fichiers un par un, y compris les
 * trente-trois mille flux identiques à l'octet près. Quatre heures d'envoi, et
 * deux échecs de suite en septembre 2026.
 *
 * Le manifeste est la liste des empreintes SHA-256 du dernier envoi réussi,
 * déposée sur le serveur sous `.manifeste` — que le `.htaccess` refuse de
 * servir, comme tout fichier qui commence par un point. On compare, et on
 * n'envoie que la différence.
 *
 *   tsx scripts/manifeste.ts ecrire   <dist> <manifeste>
 *   tsx scripts/manifeste.ts comparer <ancien> <nouveau> <dist> <envoi> <effacer>
 *
 * `comparer` range dans <envoi> des liens durs vers les fichiers nouveaux ou
 * modifiés, avec leur arborescence — `mirror` les enverra sans rien d'autre —,
 * et écrit dans <effacer> les commandes lftp qui retirent ceux qui ont disparu.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

function lister(racine: string, dossier = racine, out: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) lister(racine, chemin, out);
    else out.push(relative(racine, chemin).split('\\').join('/'));
  }
  return out;
}

function lire(fichier: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of readFileSync(fichier, 'utf8').split('\n')) {
    const i = l.indexOf('  ');
    if (i > 0) m.set(l.slice(i + 2), l.slice(0, i));
  }
  return m;
}

/** Une chaîne entre guillemets pour lftp : il n'y a ni guillemet ni retour dans nos noms, mais on n'en fait pas une hypothèse. */
function cite(chemin: string): string {
  if (/["\n\\]/.test(chemin)) throw new Error(`nom de fichier impossible à citer : ${chemin}`);
  return `"${chemin}"`;
}

const [mode, ...args] = process.argv.slice(2);

if (mode === 'ecrire') {
  const [dist, sortie] = args;
  const lignes = lister(dist)
    .sort()
    .map((f) => `${createHash('sha256').update(readFileSync(join(dist, f))).digest('hex')}  ${f}`);
  writeFileSync(sortie, lignes.join('\n') + '\n');
  console.log(`${lignes.length} fichiers au manifeste.`);
} else if (mode === 'comparer') {
  const [ancienF, nouveauF, dist, envoi, effacerF] = args;
  const ancien = lire(ancienF);
  const nouveau = lire(nouveauF);
  let envoyes = 0;
  for (const [f, h] of nouveau) {
    if (ancien.get(f) === h) continue;
    const cible = join(envoi, f);
    mkdirSync(dirname(cible), { recursive: true });
    // Un lien dur ne coûte rien ; entre deux systèmes de fichiers il est
    // impossible, et une copie fait le même travail.
    try {
      linkSync(join(dist, f), cible);
    } catch {
      copyFileSync(join(dist, f), cible);
    }
    envoyes++;
  }
  const disparus = [...ancien.keys()].filter((f) => !nouveau.has(f));
  writeFileSync(effacerF, disparus.map((f) => `rm -f ${cite(f)}`).join('\n') + (disparus.length ? '\n' : ''));
  console.log(`${envoyes} fichiers à envoyer, ${disparus.length} à effacer, ${nouveau.size - envoyes} inchangés.`);
} else if (mode === 'lots') {
  // L'envoi fichier par fichier, découpé en lots, avec pour chacun le
  // manifeste de ce qui sera en ligne une fois le lot arrivé : l'ancien, mis à
  // jour des fichiers des lots déjà partis. Déposé après chaque lot, il fait
  // qu'un envoi interrompu — GitHub arrête un job au bout de six heures, et le
  // #100 y est arrivé — reprend là où il s'est arrêté, au lieu de tout
  // renvoyer : sur une machine neuve, la date ne dit plus ce qui est parti.
  const [ancienF, nouveauF, envoi, tailleS, sortie] = args;
  const taille = Number(tailleS);
  if (!Number.isInteger(taille) || taille <= 0) throw new Error(`taille de lot invalide : ${tailleS}`);
  const courant = lire(ancienF);
  const nouveau = lire(nouveauF);
  const fichiers = lister(envoi).sort();
  let k = 0;
  for (; k * taille < fichiers.length; k++) {
    const nom = `lot-${String(k).padStart(3, '0')}`;
    for (const f of fichiers.slice(k * taille, (k + 1) * taille)) {
      const h = nouveau.get(f);
      if (!h) throw new Error(`${f} est à envoyer mais absent du nouveau manifeste`);
      const cible = join(sortie, nom, f);
      mkdirSync(dirname(cible), { recursive: true });
      try {
        linkSync(join(envoi, f), cible);
      } catch {
        copyFileSync(join(envoi, f), cible);
      }
      courant.set(f, h);
    }
    const lignes = [...courant.keys()].sort().map((f) => `${courant.get(f)}  ${f}`);
    writeFileSync(join(sortie, `${nom}.manifeste`), lignes.join('\n') + '\n');
  }
  console.log(`${fichiers.length} fichiers en ${k} lots de ${taille} au plus.`);
} else {
  console.error(
    'usage : manifeste.ts ecrire <dist> <manifeste> | comparer <ancien> <nouveau> <dist> <envoi> <effacer> | ' +
      'lots <ancien> <nouveau> <envoi> <taille> <sortie>',
  );
  process.exit(2);
}
