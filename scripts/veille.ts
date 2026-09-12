/**
 * Veille sur les sources de données.
 *
 *   npm run veille                  contrôle et met à jour l'état
 *   npm run veille -- --decouvrir   cherche en plus ce qui est apparu en open data
 *
 * Sort en 2 quand il y a quelque chose à regarder — un code distinct du 1 que
 * produirait une panne du script.
 *
 * Le projet se périme par ses sources, pas par son code. Trois ruptures ont été
 * rencontrées en une seule journée — une interface figée depuis huit ans, un
 * site refait qui a perdu son adresse de téléchargement, une URL d'export qui
 * change de forme selon le millésime — et aucune n'a produit d'alerte : elles
 * ont été découvertes à la main, par hasard.
 *
 * Chaque contrôle vise donc un signal *actionnable*, pas une disponibilité de
 * façade. Une source qui répond « 200 » en servant de la donnée de 2018 est en
 * panne, même si son serveur va très bien.
 *
 * L'état est versionné dans `veille/etat.json` : c'est lui qui permet de dire
 * « ça a changé depuis la dernière fois » plutôt que de tout redécouvrir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chargerGraphe, RACINE } from '../src/modele/graphe.ts';
import type { Surveillance } from '../src/modele/schemas.ts';

// Le fetch intégré de Node ne lit la configuration de proxy qu'à son démarrage.
if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== '1') {
  const { spawnSync } = await import('node:child_process');
  const { status } = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(status ?? 1);
}

const ETAT = join(RACINE, 'veille', 'etat.json');
const RAPPORT = join(RACINE, 'veille', 'rapport.md');
const META = join(RACINE, 'public', 'territoires', 'meta.json');

// Sur un terminal, la couleur ; dans un journal d'intégration continue, rien
// que du texte — les codes d'échappement y sont illisibles.
const couleur = process.stdout.isTTY === true;
const c = (code: string) => (couleur ? code : '');
const ROUGE = c('\x1b[31m'), JAUNE = c('\x1b[33m'), VERT = c('\x1b[32m'),
  GRIS = c('\x1b[90m'), RAZ = c('\x1b[0m');

type Gravite = 'ok' | 'a-regarder' | 'alerte';

interface Constat {
  id: string;
  nom: string;
  alimente: string;
  gravite: Gravite;
  message: string;
  /** Ce qui permettra, au prochain passage, de dire que quelque chose a bougé. */
  empreinte?: string;
  millesime?: number | string;
}

interface Etat {
  dernier_controle: string;
  constats: Record<string, { empreinte?: string; millesime?: number | string; gravite: Gravite }>;
  /** Identifiants des jeux déjà proposés : on ne les repropose pas indéfiniment. */
  decouvertes_vues?: string[];
}

async function obstine(url: string, essais = 4): Promise<Response> {
  let derniere: unknown;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'accept-language': 'fre' },
        signal: AbortSignal.timeout(90_000),
      });
      if (r.ok) return r;
      derniere = new Error(`HTTP ${r.status}`);
    } catch (e) {
      derniere = e;
    }
    await new Promise((r) => setTimeout(r, (i + 1) * 1500));
  }
  throw derniere instanceof Error ? derniere : new Error('injoignable');
}

const empreinteDe = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function lireEtat(): Etat {
  if (!existsSync(ETAT)) return { dernier_controle: '', constats: {} };
  return JSON.parse(readFileSync(ETAT, 'utf8')) as Etat;
}

function lireMeta(): { finances?: { annee: number }; eau?: { annee: number } } {
  return existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
}

/* ------------------------------------------------------------------ *
 * Les contrôles, un par nature de signal
 * ------------------------------------------------------------------ */

const controles: Record<
  Surveillance['type'],
  (s: Surveillance, ctx: { codesBanatic: Set<string>; agregats: Record<'commune' | 'groupement', Set<string>>; meta: ReturnType<typeof lireMeta> }) => Promise<Omit<Constat, 'id' | 'nom' | 'alimente'>>
> = {
  /** Le service répond-il encore ? Le minimum, et rarement suffisant. */
  async disponibilite(s) {
    await obstine(s.url);
    return { gravite: 'ok', message: 'disponible' };
  },

  /**
   * Le référentiel des compétences : on vérifie que chaque code dont le contenu
   * dépend existe toujours. Un code retiré casserait la résolution en silence.
   */
  async 'banatic-competences'(s, { codesBanatic }) {
    const r = (await (await obstine(s.url)).json()) as { data: { code: string; libelle: string }[] };
    const connus = new Set(r.data.map((c) => c.code));
    const perdus = [...codesBanatic].filter((c) => !connus.has(c));
    const empreinte = empreinteDe(JSON.stringify(r.data.map((c) => [c.code, c.libelle])));
    if (perdus.length > 0) {
      return {
        gravite: 'alerte',
        message: `${perdus.length} code(s) dont le contenu dépend ont disparu du référentiel : ${perdus.join(', ')}`,
        empreinte,
      };
    }
    return {
      gravite: 'ok',
      message: `${connus.size} compétences au référentiel, dont les ${codesBanatic.size} que nous utilisons`,
      empreinte,
    };
  },

  /** Un millésime plus récent que celui embarqué, et nos agrégats existent-ils encore ? */
  async 'ofgl-millesime'(s, { agregats, meta }) {
    const facettes = (await (
      await obstine(`${s.url}/facets?facet=annee_join&facet=agregat`)
    ).json()) as { facets: { name: string; facets: { name: string; count: number }[] }[] };
    const annees = facettes.facets.find((f) => f.name === 'annee_join')?.facets ?? [];
    const disponibles = facettes.facets.find((f) => f.name === 'agregat')?.facets ?? [];
    const connus = new Set(disponibles.map((a) => a.name));
    const attendus = agregats[s.echelon];
    const perdus = [...attendus].filter((a) => !connus.has(a));
    if (perdus.length > 0) {
      return {
        gravite: 'alerte',
        message: `agrégat(s) disparu(s), l'ingestion échouera : ${perdus.join(' ; ')}`,
      };
    }
    // Le millésime des flux intercommunaux n'est pas choisi par cette base :
    // il suit celui des comptes communaux, pour que deux chiffres affichés
    // côte à côte portent sur le même exercice. Ici on ne contrôle donc que la
    // survie des agrégats.
    if (s.echelon === 'groupement') {
      return { gravite: 'ok', message: `${attendus.size} agrégat(s) toujours publiés` };
    }
    // Un millésime tout juste ouvert est souvent incomplet : on ne le retient
    // que s'il couvre la quasi-totalité des communes.
    const utilisables = annees.filter((a) => a.count > 1_000_000).map((a) => Number(a.name));
    const dernier = Math.max(...utilisables);
    const embarque = meta.finances?.annee ?? 0;
    if (dernier > embarque) {
      return {
        gravite: 'a-regarder',
        message: `millésime ${dernier} disponible, le site est en ${embarque} — relancer « npm run territoires »`,
        millesime: dernier,
      };
    }
    return { gravite: 'ok', message: `à jour (millésime ${embarque})`, millesime: dernier };
  },

  /** Le catalogue liste ses pièces jointes : on y lit les millésimes publiés. */
  async 'sispea-millesime'(s, { meta }) {
    const xml = await (await obstine(s.url)).text();
    const annees = [...xml.matchAll(/SISPEA_extraction_(\d{4})_AEP/g)].map((m) => Number(m[1]));
    if (annees.length === 0) {
      return { gravite: 'alerte', message: 'aucune extraction listée : le catalogue a changé de forme' };
    }
    const dernier = Math.max(...annees);
    const embarque = meta.eau?.annee ?? 0;
    if (dernier > embarque) {
      return {
        gravite: 'a-regarder',
        message: `extraction ${dernier} publiée, le site est en ${embarque} — relancer « npm run territoires »`,
        millesime: dernier,
      };
    }
    return { gravite: 'ok', message: `à jour (extraction ${embarque})`, millesime: dernier };
  },

  /**
   * Un référentiel servi par Opendatasoft : on lui demande son nombre de
   * lignes. Il ne dit pas si la donnée est fraîche, mais il dit tout de suite
   * si elle a disparu — un référentiel qui perd la moitié de ses lignes, ou
   * change d'identifiant, casse l'ingestion en silence.
   */
  async 'opendatasoft-total'(s) {
    const r = (await (await obstine(`${s.url}/records?limit=1`)).json()) as {
      total_count?: number;
    };
    const n = r.total_count ?? 0;
    if (n === 0) {
      return { gravite: 'alerte', message: 'le jeu de données ne renvoie plus aucune ligne' };
    }
    const attendu = s.attendu ?? n;
    const ecart = Math.abs(n - attendu) / attendu;
    if (ecart > 0.1) {
      return {
        gravite: n < attendu ? 'alerte' : 'a-regarder',
        message:
          `${n.toLocaleString('fr-FR')} lignes, contre ${attendu.toLocaleString('fr-FR')} attendues ` +
          `(${n < attendu ? '−' : '+'}${Math.round(ecart * 100)} %) — mettre à jour « attendu » si c'est normal`,
        millesime: n,
      };
    }
    return { gravite: 'ok', message: `${n.toLocaleString('fr-FR')} lignes`, millesime: n };
  },

  /**
   * Une ressource data.gouv épinglée par son URL datée. C'est le cas le plus
   * fragile du site : l'ingestion pointe une version précise du fichier, donc
   * une nouvelle publication ne change rien tant que personne ne la voit.
   */
  async 'datagouv-ressource'(s) {
    const d = (await (await obstine(`https://www.data.gouv.fr/api/1/datasets/${s.url}/`)).json()) as {
      resources?: { title?: string; url?: string; last_modified?: string; created_at?: string }[];
    };
    const motif = (s.ressource ?? '').toLowerCase();
    const candidates = (d.resources ?? []).filter((r) =>
      (r.title ?? r.url ?? '').toLowerCase().includes(motif),
    );
    if (candidates.length === 0) {
      return {
        gravite: 'alerte',
        message: `aucune ressource ne correspond à « ${s.ressource} » : le jeu a changé de forme`,
      };
    }
    // La plus récente, quel que soit l'ordre de publication.
    const recente = candidates.sort((a, b) =>
      (b.last_modified ?? b.created_at ?? '').localeCompare(a.last_modified ?? a.created_at ?? ''),
    )[0];
    const empreinte = empreinteDe(recente.url ?? '');
    return {
      gravite: 'ok',
      message: `dernière ressource : ${(recente.last_modified ?? recente.created_at ?? '').slice(0, 10)}`,
      empreinte,
    };
  },

  /** Le découpage administratif bouge à chaque fusion de communes. */
  async 'paquet-npm'(s) {
    const r = (await (await obstine(`https://registry.npmjs.org/${s.url}/latest`)).json()) as {
      version: string;
    };
    const installe = JSON.parse(
      readFileSync(join(RACINE, 'node_modules', s.url, 'package.json'), 'utf8'),
    ) as { version: string };
    if (r.version !== installe.version) {
      return {
        gravite: 'a-regarder',
        message: `version ${r.version} publiée, la nôtre est ${installe.version}`,
        millesime: r.version,
      };
    }
    return { gravite: 'ok', message: `à jour (${installe.version})`, millesime: r.version };
  },
};

/* ------------------------------------------------------------------ *
 * Découverte : ce qui est apparu en open data
 * ------------------------------------------------------------------ */

type Portee = 'nationale' | 'locale' | 'indeterminee';

interface JeuBrut {
  id: string;
  title: string;
  page: string;
  created_at?: string;
  organization?: { name?: string; badges?: { kind: string }[] };
  spatial?: { zones?: string[]; geom?: unknown } | null;
}

interface Jeu {
  id: string;
  titre: string;
  url: string;
  org: string;
  date: string;
  portee: Exclude<Portee, 'locale'>;
}

/** France métropolitaine, en degrés : le cadre auquel comparer une emprise. */
const METROPOLE = { largeur: 14.8, hauteur: 9.8 };

/** Boîte englobante d'une géométrie GeoJSON, quelle que soit sa profondeur. */
function emprise(geom: unknown): { largeur: number; hauteur: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const parcourir = (n: unknown): void => {
    if (!Array.isArray(n)) return;
    if (typeof n[0] === 'number' && typeof n[1] === 'number') {
      xs.push(n[0]);
      ys.push(n[1]);
      return;
    }
    for (const f of n) parcourir(f);
  };
  parcourir((geom as { coordinates?: unknown } | undefined)?.coordinates);
  if (xs.length === 0) return null;
  return {
    largeur: Math.max(...xs) - Math.min(...xs),
    hauteur: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * data.gouv.fr est très majoritairement alimenté par des collectivités qui y
 * publient leur propre territoire : sur « délibérations », les premiers
 * résultats sont une commune après l'autre. Le site est national, un jeu qui
 * ne couvre qu'une commune ne s'y branche pas — et noyer les quelques jeux
 * utiles sous cent jeux locaux revient à ne rien signaler du tout.
 *
 * Trois marqueurs, du plus sûr au plus faible :
 *   — les zones déclarées, qui disent explicitement la portée quand elles sont
 *     renseignées ;
 *   — l'emprise géographique, qui ne ment pas : un jeu départemental tient dans
 *     1,6° de longitude là où la métropole en fait 14,8 ;
 *   — le producteur, une collectivité ne publiant par construction que son
 *     ressort.
 *
 * Aucun ne permet de conclure « nationale » à coup sûr : beaucoup de jeux
 * nationaux ne déclarent rien, et le badge du producteur n'est pas fiable —
 * la Région Île-de-France est badgée `public-service` quand la Région des
 * Pays de la Loire est badgée `local-authority`. On sépare donc ce qu'on peut
 * écarter de ce qu'on ne peut pas, et on annonce le reste comme indéterminé
 * plutôt que de le maquiller en certitude.
 */
function portee(d: JeuBrut): Portee {
  const zones = d.spatial?.zones ?? [];
  if (zones.some((z) => z.startsWith('country:fr') || z.startsWith('country-subset:fr'))) {
    return 'nationale';
  }
  // Toute autre zone déclarée est infra-nationale (commune, EPCI, département…).
  if (zones.length > 0) return 'locale';

  const cadre = emprise(d.spatial?.geom);
  if (cadre) {
    return cadre.largeur >= METROPOLE.largeur * 0.55 && cadre.hauteur >= METROPOLE.hauteur * 0.55
      ? 'nationale'
      : 'locale';
  }
  if (d.organization?.badges?.some((b) => b.kind === 'local-authority')) return 'locale';
  return 'indeterminee';
}

async function decouvrir(
  motsCles: string[],
  depuis: Date,
  dejaVus: Set<string>,
  urlsConnues: Set<string>,
): Promise<{ jeux: Jeu[]; ecartes: number }> {
  const trouves = new Map<string, Jeu>();
  let ecartes = 0;
  for (const mot of motsCles) {
    try {
      const r = (await (
        await obstine(
          `https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(mot)}&page_size=20&sort=-created`,
        )
      ).json()) as { data: JeuBrut[] };
      for (const d of r.data ?? []) {
        const cree = d.created_at ? new Date(d.created_at) : null;
        if (!cree || cree < depuis) continue;
        if (dejaVus.has(d.id) || urlsConnues.has(d.page)) continue;
        const p = portee(d);
        if (p === 'locale') {
          ecartes++;
          continue;
        }
        trouves.set(d.id, {
          id: d.id,
          titre: d.title,
          url: d.page,
          org: d.organization?.name ?? '',
          date: d.created_at!.slice(0, 10),
          portee: p,
        });
      }
    } catch {
      // Une recherche qui échoue ne doit pas faire tomber toute la veille.
    }
  }
  // Le national d'abord : c'est ce qui se branche directement sur la carte.
  const rang = (j: Jeu) => (j.portee === 'nationale' ? 0 : 1);
  return {
    jeux: [...trouves.values()].sort((a, b) => rang(a) - rang(b) || b.date.localeCompare(a.date)),
    ecartes,
  };
}

/* ------------------------------------------------------------------ *
 * Exécution
 * ------------------------------------------------------------------ */

const g = chargerGraphe();
const meta = lireMeta();
const etat = lireEtat();
const surveillances = [...g.surveillances.values()];
if (surveillances.length === 0) {
  console.log(`${JAUNE}Aucune source surveillée.${RAZ}`);
  process.exit(0);
}

const ctx = {
  codesBanatic: new Set([...g.competences.values()].flatMap((c) => c.banatic)),
  // Par échelon : chaque base de l'OFGL n'est comptable que des agrégats que
  // le site y lit réellement.
  agregats: {
    commune: new Set(
      [...g.reperes.values()].filter((r) => r.echelon === 'commune').map((r) => r.agregat),
    ),
    groupement: new Set(
      [...g.reperes.values()].filter((r) => r.echelon === 'groupement').map((r) => r.agregat),
    ),
  },
  meta,
};

const constats: Constat[] = [];
for (const s of surveillances) {
  try {
    const r = await controles[s.type](s, ctx);
    constats.push({ id: s.id, nom: s.nom, alimente: s.alimente, ...r });
  } catch (e) {
    constats.push({
      id: s.id,
      nom: s.nom,
      alimente: s.alimente,
      gravite: 'alerte',
      message: `injoignable : ${(e as Error).message}`,
    });
  }
}

// Un changement d'empreinte n'est pas une panne, mais mérite un œil.
for (const c of constats) {
  const avant = etat.constats[c.id];
  if (c.gravite === 'ok' && c.empreinte && avant?.empreinte && avant.empreinte !== c.empreinte) {
    c.gravite = 'a-regarder';
    c.message = `${c.message} — mais le contenu a changé depuis le dernier contrôle`;
  }
}

let decouvertes: Jeu[] = [];
let ecartes = 0;
if (process.argv.includes('--decouvrir') && g.decouverte) {
  ({ jeux: decouvertes, ecartes } = await decouvrir(
    g.decouverte.mots_cles,
    g.decouverte.depuis,
    new Set(etat.decouvertes_vues ?? []),
    new Set([...g.sources.values()].map((s) => s.url)),
  ));
}

/* --- rapport --- */
const symbole = { ok: `${VERT}  ok  ${RAZ}`, 'a-regarder': `${JAUNE} à voir${RAZ}`, alerte: `${ROUGE}ALERTE${RAZ}` };
console.log(`Veille du ${new Date().toISOString().slice(0, 10)} — ${surveillances.length} sources\n`);
for (const c of constats) {
  console.log(`${symbole[c.gravite]} ${c.nom}`);
  console.log(`        ${c.message}`);
  console.log(`        ${GRIS}alimente ${c.alimente}${RAZ}`);
}
if (decouvertes.length > 0) {
  console.log(`\n${JAUNE}${decouvertes.length} jeu(x) de données à examiner :${RAZ}`);
  for (const d of decouvertes.slice(0, 15)) {
    const p = d.portee === 'nationale' ? 'national' : 'portée à vérifier';
    console.log(`   ${d.date}  ${d.titre.slice(0, 72)}`);
    console.log(`             ${GRIS}${p} · ${d.org.slice(0, 44)}${RAZ}`);
    console.log(`             ${GRIS}${d.url}${RAZ}`);
  }
}
if (ecartes > 0) {
  console.log(`${GRIS}   (${ecartes} jeu(x) écarté(s) : d'emprise locale)${RAZ}`);
}

/* --- le même rapport en markdown, pour l'issue hebdomadaire --- */
const marque = { ok: '✅', 'a-regarder': '🟡', alerte: '🔴' };
const md: string[] = [
  `Veille du ${new Date().toISOString().slice(0, 10)} — ${surveillances.length} sources surveillées.`,
  '',
  '| | Source | Constat | Alimente |',
  '| --- | --- | --- | --- |',
  ...constats.map((k) => `| ${marque[k.gravite]} | ${k.nom} | ${k.message} | ${k.alimente} |`),
];
if (decouvertes.length > 0) {
  md.push('', `## ${decouvertes.length} jeu(x) de données à examiner`, '');
  for (const d of decouvertes) {
    const p = d.portee === 'nationale' ? 'national' : 'portée à vérifier';
    md.push(`- \`${d.date}\` [${d.titre}](${d.url}) — ${p}${d.org ? ` · ${d.org}` : ''}`);
  }
  if (ecartes > 0) md.push('', `_${ecartes} jeu(x) écarté(s) : emprise locale._`);
}
md.push(
  '',
  '---',
  '',
  'Un millésime plus récent se récupère par `npm run territoires`.',
  'Une source en panne se corrige dans `contenu/sources.yaml` et `contenu/veille.yaml`.',
);

mkdirSync(join(RACINE, 'veille'), { recursive: true });
writeFileSync(RAPPORT, md.join('\n') + '\n');
writeFileSync(
  ETAT,
  JSON.stringify(
    {
      dernier_controle: new Date().toISOString().slice(0, 10),
      constats: Object.fromEntries(
        constats.map((c) => [c.id, { empreinte: c.empreinte, millesime: c.millesime, gravite: c.gravite }]),
      ),
      decouvertes_vues: [...new Set([...(etat.decouvertes_vues ?? []), ...decouvertes.map((d) => d.id)])],
    },
    null,
    2,
  ) + '\n',
);

const alertes = constats.filter((c) => c.gravite === 'alerte').length;
const aVoir = constats.filter((c) => c.gravite === 'a-regarder').length + decouvertes.length;
console.log(
  alertes > 0
    ? `\n${ROUGE}${alertes} source(s) en panne.${RAZ}`
    : aVoir > 0
      ? `\n${JAUNE}${aVoir} point(s) à regarder.${RAZ}`
      : `\n${VERT}Toutes les sources sont à jour.${RAZ}`,
);
// 0 : rien à faire. 2 : il y a quelque chose à regarder. Tout autre code est
// une panne du script lui-même, qu'il ne faut pas confondre avec un constat.
process.exit(alertes > 0 || aVoir > 0 ? 2 : 0);
