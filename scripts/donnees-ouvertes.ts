/**
 * Lire ce que des centaines de collectivités publient chacune à sa façon.
 *
 * Les jeux du socle commun des données locales — délibérations, subventions —
 * partagent un schéma mais pas un producteur : chaque commune, chaque
 * agglomération, chaque syndicat exporte le sien avec son tableur, son
 * encodage et son délimiteur. Ce module tient les trois précautions que cela
 * impose, une fois pour toutes, plutôt qu'une copie par collecteur :
 *
 *   — le **délimiteur** se tranche sur l'en-tête plutôt que d'être supposé ;
 *   — l'**encodage** se détecte par l'échec du décodage strict ;
 *   — la **découverte** interroge data.gouv par attribut de schéma, si bien
 *     que la couverture grossit sans qu'on ait à connaître les producteurs.
 *
 * Chacune de ces trois précautions vient d'un fichier réel qui l'a exigée, et
 * non d'une prudence de principe.
 */

/**
 * Le délimiteur change d'un producteur à l'autre : Mégalis Bretagne écrit en
 * point-virgule, la mairie de Bouloc en virgule. On le tranche sur l'en-tête,
 * qui porte les mêmes noms de colonnes dans les deux cas — donc celui des deux
 * séparateurs qui y revient le plus est le bon.
 */
function delimiteur(entete: string): string {
  return (entete.match(/;/g)?.length ?? 0) > (entete.match(/,/g)?.length ?? 0) ? ';' : ',';
}

function decouper(ligne: string, sep: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else dansGuillemets = !dansGuillemets;
    } else if (c === sep && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

/** Une ligne peut contenir un saut de ligne dans un champ entre guillemets. */
function* lignesDe(texte: string): Iterable<string> {
  let courant = '';
  let dansGuillemets = false;
  for (const c of texte) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    if (c === '\n' && !dansGuillemets) {
      yield courant.replace(/\r$/, '');
      courant = '';
    } else courant += c;
  }
  if (courant.trim()) yield courant.replace(/\r$/, '');
}

/**
 * Tous les producteurs n'écrivent pas en UTF-8.
 *
 * Un fichier breton rendait « Délégation » en caractères de remplacement : il
 * est en Windows-1252, comme souvent ce qui sort d'un tableur. Le décodage
 * strict échoue sur ces octets — c'est précisément ce qui les signale, sans
 * avoir à deviner. Aucun en-tête ne l'annonce, et se fier au nom du producteur
 * ne tiendrait pas une saison.
 */
export function decoder(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/**
 * Un CSV du socle commun, décodé et découpé.
 *
 * `colonnesMin` écarte les lignes trop courtes pour être des données : un
 * fichier se termine souvent par une ligne de total ou une note.
 */
export function lireCsvOuvert(octets: Uint8Array, colonnesMin = 4): Record<string, string>[] {
  const it = lignesDe(decoder(octets))[Symbol.iterator]();
  const premiere = it.next();
  if (premiere.done) return [];
  const sep = delimiteur(premiere.value);
  // La marque d'ordre des octets traîne en tête du premier intitulé quand le
  // fichier sort d'un tableur : sans cela, la première colonne ne se retrouve
  // jamais par son nom.
  const entetes = decouper(premiere.value, sep).map((h) => h.trim().replace(/^﻿/, ''));
  const out: Record<string, string>[] = [];
  for (let l = it.next(); !l.done; l = it.next()) {
    const champs = decouper(l.value, sep);
    if (champs.length < colonnesMin) continue;
    const r: Record<string, string> = {};
    for (const [i, h] of entetes.entries()) r[h] = (champs[i] ?? '').trim();
    out.push(r);
  }
  return out;
}

/**
 * Un CSV du cache, lu en flux et ligne à ligne.
 *
 * `lireCsvOuvert` charge tout : très bien pour les quelques centaines de
 * kilo-octets d'un jeu SCDL, intenable pour les soixante-cinq méga-octets du
 * répertoire des élus, qui feraient cinq cent mille objets en mémoire. Mêmes
 * précautions que la version en mémoire — délimiteur tranché sur l'en-tête,
 * décodage qui bascule en Windows-1252 quand l'UTF-8 strict échoue — mais sur
 * un flux, et sans jamais garder plus d'une ligne.
 */
export async function* lignesCsvOuvert(
  chemin: string,
  lire: (chemin: string) => AsyncIterable<Uint8Array>,
): AsyncIterable<Record<string, string>> {
  let reste = '';
  let entetes: string[] | null = null;
  let sep = ',';
  let decode: ((o: Uint8Array) => string) | null = null;
  for await (const bloc of lire(chemin)) {
    // Le décodage se décide sur le premier bloc. En mode « stream », un
    // décodeur strict tolère une séquence incomplète en fin de morceau — c'est
    // précisément ce qu'il faut : lui couper arbitrairement quelques octets
    // pour éviter une coupure au milieu d'un caractère en recrée une ailleurs,
    // et le fichier entier repart alors en Windows-1252 alors qu'il est en
    // UTF-8.
    if (!decode) {
      let strict = true;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bloc, { stream: true });
      } catch {
        strict = false;
      }
      const d = new TextDecoder(strict ? 'utf-8' : 'windows-1252');
      decode = (o) => d.decode(o, { stream: true });
    }
    reste += decode(bloc);
    let coupe: number;
    while ((coupe = finDeLigne(reste)) !== -1) {
      const ligne = reste.slice(0, coupe).replace(/\r$/, '');
      reste = reste.slice(coupe + 1);
      if (!entetes) {
        sep = delimiteur(ligne);
        entetes = decouper(ligne, sep).map((h) => h.trim().replace(/^\ufeff/, ''));
        continue;
      }
      const champs = decouper(ligne, sep);
      if (champs.length < 2) continue;
      const r: Record<string, string> = {};
      for (const [i, h] of entetes.entries()) r[h] = (champs[i] ?? '').trim();
      yield r;
    }
  }
  if (entetes && reste.trim() !== '') {
    const champs = decouper(reste, sep);
    if (champs.length >= 2) {
      const r: Record<string, string> = {};
      for (const [i, h] of entetes.entries()) r[h] = (champs[i] ?? '').trim();
      yield r;
    }
  }
}

/** Une fin de ligne hors guillemets : un champ peut en contenir une. */
function finDeLigne(s: string): number {
  let dansGuillemets = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') dansGuillemets = !dansGuillemets;
    else if (s[i] === '\n' && !dansGuillemets) return i;
  }
  return -1;
}

const TAILLE_PAGE = 50;

/**
 * Les ressources que data.gouv déclare conformes à un schéma.
 *
 * C'est ce qui permet à la couverture de grossir toute seule : une commune qui
 * se met à publier au format est ingérée à l'ingestion suivante, sans qu'on
 * ait rien à ajouter. En contrepartie, elle manque les producteurs qui
 * respectent le schéma sans le déclarer — d'où la liste déclarée que chaque
 * collecteur tient à côté.
 */
export async function ressourcesDuSchema(
  schema: string,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<string[]> {
  const urls: string[] = [];
  let pagesLues = 0;
  try {
    type Jeu = { resources?: { url?: string; schema?: { name?: string } | null }[] };
    for (let page = 1; page <= 5; page++) {
      const d = await json<{ data?: Jeu[] }>(
        `https://www.data.gouv.fr/api/1/datasets/?schema=${encodeURIComponent(`scdl/${schema}`)}` +
          `&page_size=${TAILLE_PAGE}&page=${page}`,
      );
      const jeux = d.data ?? [];
      if (jeux.length === 0) break;
      pagesLues++;
      for (const j of jeux) {
        for (const r of j.resources ?? []) {
          if (r.url && (r.schema?.name ?? '').includes(schema)) urls.push(r.url);
        }
      }
      // Une page incomplète est la dernière : demander la suivante ferait
      // remonter une erreur de pagination qu'on signalerait comme un incident.
      if (jeux.length < TAILLE_PAGE) break;
    }
  } catch {
    // La découverte est un supplément : son échec ne doit pas emporter les
    // agrégateurs déclarés, qui portent l'essentiel du volume. Une page
    // manquante n'est pas un échec — le catalogue s'arrête là où il s'arrête,
    // et annoncer « pas de réponse » après en avoir lu deux serait faux.
    dire(
      pagesLues === 0
        ? `  la découverte du schéma « ${schema} » n’a pas répondu.`
        : `  la découverte du schéma « ${schema} » s’est arrêtée après ${pagesLues} page(s).`,
    );
  }
  return [...new Set(urls)];
}

/**
 * Les ressources d'un jeu de données nommé, retrouvées par son identifiant.
 *
 * La découverte par schéma ne voit pas tout : un agrégateur peut publier au
 * format sans le déclarer sur ses ressources, et il faut alors le nommer. Mais
 * **le nommer par l'adresse de ses fichiers ne tient pas**. Mégalis Bretagne
 * republie chaque jour, sous un chemin qui porte l'horodatage de la
 * publication : une adresse recopiée la veille rend déjà 404, et le collecteur
 * perd en silence l'agrégateur qui porte l'essentiel du volume — le site a
 * ainsi montré pendant un temps des délibérations qui s'arrêtaient au
 * 31 décembre, pendant que la source publiait tous les jours.
 *
 * On nomme donc le jeu, jamais le fichier, et on demande ses ressources au
 * moment de l'ingestion. L'API v2 plutôt que la v1 : sa réponse est plus
 * légère, et c'est la seule des deux qui réponde depuis l'environnement de
 * développement.
 */
export async function ressourcesDuJeu(
  jeu: string,
  motif: string,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<string[]> {
  type Ressource = { title?: string; url?: string };
  try {
    const d = await json<{ data?: Ressource[] }>(
      `https://www.data.gouv.fr/api/2/datasets/${encodeURIComponent(jeu)}/resources/?page_size=100`,
    );
    const cherche = motif.toLowerCase();
    const urls = (d.data ?? [])
      .filter((r) => r.url && (r.title ?? r.url ?? '').toLowerCase().includes(cherche))
      .map((r) => r.url!);
    if (urls.length === 0) {
      dire(`  le jeu « ${jeu} » ne porte aucune ressource « ${motif} » : il a changé de forme.`);
    }
    return urls;
  } catch {
    // Comme la découverte : un agrégateur manquant ampute la couverture, il ne
    // doit pas emporter le reste.
    dire(`  le jeu « ${jeu} » n’a pas répondu — ses fichiers manqueront à cette ingestion.`);
    return [];
  }
}

/**
 * Le préfixe de SIREN d'un département, puis de sa région.
 *
 * Les collectivités territoriales portent un SIREN construit : `21` puis un
 * rang pour une commune, `22` puis le code du département, `23` puis le code
 * du département chef-lieu pour une région. Les deux derniers se déduisent
 * donc du découpage, quand la commune, elle, demande une table.
 *
 * La règle a été vérifiée sur huit cas observés — les Côtes-d'Armor, la
 * Dordogne, la Meuse, la Loire, la Savoie, l'Ille-et-Vilaine, l'Eure-et-Loir
 * et la région Centre-Val de Loire. Elle n'est pas devinée, et elle ne peut
 * pas mal attribuer : on ne retient un SIREN que s'il figure tel quel dans la
 * donnée, le préfixe ne servant qu'à le reconnaître.
 */
export function prefixesEchelon(dep: string, chefLieuRegion: string | undefined): string[] {
  const prefixes = [`22${dep}`];
  if (chefLieuRegion) {
    // Outre-mer, le code de département tient sur trois chiffres.
    const depRegion = chefLieuRegion.startsWith('97')
      ? chefLieuRegion.slice(0, 3)
      : chefLieuRegion.slice(0, 2);
    prefixes.push(`23${depRegion}`);
  }
  return prefixes;
}

/** Les SIREN d'une liste qui commencent par l'un des préfixes donnés. */
export function sirensParPrefixe(prefixes: string[], candidats: Iterable<string>): string[] {
  const out: string[] = [];
  for (const s of candidats) {
    if (prefixes.some((p) => s.startsWith(p))) out.push(s);
  }
  return out;
}
