/**
 * Le prix de l'eau, service par service.
 *
 * L'API Hub'Eau expose ces indicateurs en JSON — mais s'arrête à 2018. Un prix
 * de l'eau vieux de huit ans n'est pas un prix : pour le seul service de Mayet,
 * il est passé de 2,11 € en 2018 à 2,73 € en 2024, soit +30 %. On prend donc la
 * source à jour, au prix d'une archive 7z contenant un classeur .xls, plutôt
 * qu'un chiffre commode et faux.
 *
 * La jointure se fait par SIREN : la structure qui exerce la compétence « eau
 * potable » est déjà identifiée pour chaque commune par ailleurs.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Les extractions nationales, de la plus récente à la plus ancienne. */
const EXTRACTIONS = [
  { annee: 2024, url: 'https://data.ofb.fr/catalogue/srv/api/records/7d6a3010-cf19-42c3-8a38-9823074185ce/attachments/SISPEA_extraction_2024_AEP.7z' },
  { annee: 2023, url: 'https://data.ofb.fr/catalogue/srv/api/records/7d6a3010-cf19-42c3-8a38-9823074185ce/attachments/SISPEA_extraction_2023_AEP.7z' },
];

/** Prix TTC du service au m³ pour une consommation de référence de 120 m³. */
const INDICATEUR_PRIX = 'D102.0';

export interface ServiceEau {
  nom: string;
  /** Régie, délégation… */
  gestion: string;
  /** Le délégataire, quand il y en a un. */
  operateur: string;
  /** Euros TTC par m³. */
  prix: number | null;
}

export interface Eau {
  annee: number;
  indicateur: string;
  /** Par SIREN de la structure, puis par code INSEE pour les services communaux. */
  parSiren: Map<string, ServiceEau>;
  parInsee: Map<string, ServiceEau>;
  /** Prix médian national, pour situer le sien. */
  prixMedian: number | null;
}

export async function collecterEau(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Eau | null> {
  const { default: sept } = await import('7zip-min');
  const XLSX = await import('xlsx');
  // La distribution ESM de SheetJS n'accède au disque que si on lui passe fs.
  XLSX.set_fs(await import('node:fs'));

  for (const { annee, url } of EXTRACTIONS) {
    const archive = join(cache, `sispea-${annee}-aep.7z`);
    try {
      await telecharger(url, archive);
    } catch {
      dire(`extraction ${annee} indisponible, on essaie l'année précédente`);
      continue;
    }

    const dossier = mkdtempSync(join(tmpdir(), 'sispea-'));
    try {
      await new Promise<void>((ok, ko) =>
        sept.unpack(archive, dossier, (e: Error | null) => (e ? ko(e) : ok())),
      );
      const fichier = readdirSync(dossier).find((f) => f.toLowerCase().endsWith('.xls'));
      if (!fichier) throw new Error('archive sans classeur');

      const feuille = 'Entités de gestion';
      const classeur = XLSX.readFile(join(dossier, fichier), { sheets: [feuille] });
      const lignes = XLSX.utils.sheet_to_json<unknown[]>(classeur.Sheets[feuille], {
        header: 1,
        raw: true,
      });
      const entetes = (lignes[0] as string[]).map((h) => String(h ?? '').trim());
      const col = (nom: string) => {
        const i = entetes.indexOf(nom);
        if (i < 0) throw new Error(`colonne « ${nom} » absente de l'extraction ${annee}`);
        return i;
      };
      const cNom = col('Nom collectivité');
      const cSiren = col('N° SIREN');
      const cInsee = col('N° INSEE si commune');
      const cGestion = col('Mode de gestion');
      const cOperateur = col("Nom de l'opérateur");
      const cPrix = col(INDICATEUR_PRIX);

      const parSiren = new Map<string, ServiceEau>();
      const parInsee = new Map<string, ServiceEau>();
      const prix: number[] = [];
      for (const ligne of lignes.slice(1)) {
        const brut = ligne[cPrix];
        const p = typeof brut === 'number' && brut > 0 ? Math.round(brut * 100) / 100 : null;
        const service: ServiceEau = {
          nom: String(ligne[cNom] ?? '').trim(),
          gestion: String(ligne[cGestion] ?? '').trim(),
          operateur: String(ligne[cOperateur] ?? '').trim(),
          prix: p,
        };
        if (p !== null) prix.push(p);
        const siren = String(ligne[cSiren] ?? '').trim();
        const insee = String(ligne[cInsee] ?? '').trim();
        // Un service mieux renseigné remplace un service muet sur le prix.
        if (siren && (p !== null || !parSiren.has(siren))) parSiren.set(siren, service);
        if (insee && (p !== null || !parInsee.has(insee))) parInsee.set(insee, service);
      }
      prix.sort((a, b) => a - b);
      const prixMedian = prix.length > 0 ? prix[Math.floor(prix.length / 2)] : null;
      dire(
        `Prix de l'eau ${annee} : ${parSiren.size.toLocaleString('fr-FR')} services, ` +
          `médiane ${prixMedian} €/m³.`,
      );
      return { annee, indicateur: INDICATEUR_PRIX, parSiren, parInsee, prixMedian };
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }
  return null;
}

/** Le service qui dessert une commune : celui de la structure compétente, sinon le sien. */
export function serviceDe(
  eau: Eau,
  sirenCommune: string,
  codeInsee: string,
  sirensCompetents: string[],
): ServiceEau | null {
  for (const siren of sirensCompetents) {
    const s = eau.parSiren.get(siren);
    if (s) return s;
  }
  return eau.parSiren.get(sirenCommune) ?? eau.parInsee.get(codeInsee) ?? null;
}

export function ecrireEau(
  sortie: string,
  dep: string,
  eau: Eau,
  services: Map<string, ServiceEau>,
): void {
  const c: Record<string, [number | null, string, string, string]> = {};
  for (const [code, s] of services) c[code] = [s.prix, s.nom, s.gestion, s.operateur];
  writeFileSync(
    join(sortie, 'dep', `${dep}-eau.json`),
    JSON.stringify({ dep, annee: eau.annee, c }),
  );
}
