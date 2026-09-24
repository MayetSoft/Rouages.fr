/**
 * La réglette et la courbe des repères chiffrés, écrites en SVG au build.
 *
 * Mêmes dimensions, mêmes classes et mêmes infobulles que celles que le panneau
 * de la carte dessinait dans le navigateur : la page de la commune les a
 * reprises, et le panneau ne les dessine plus. Une chaîne plutôt qu'un
 * élément, parce qu'une page statique n'a pas de DOM à remplir.
 */

/** Échappe ce qui entre dans une infobulle : un nom de flux peut porter une esperluette. */
function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Une réglette : le trait est la médiane, le point la commune.
 *
 * En CSS plutôt qu'en SVG : une page de commune en porte près de trente, et
 * trois cercles et deux traits par réglette coûtaient près de quatre cents
 * octets chacune, multipliés par 34 875 pages. Il ne reste que la position du
 * point, et l'infobulle.
 */
export function reglette(valeur: number, mediane: number, reference = 'la médiane de la strate'): string {
  const L = 108;
  // L'échelle va de 0 à deux fois la médiane : au-delà, on bute au bord et le
  // point le montre plutôt que d'écraser toutes les autres lignes.
  const x = Math.max(4, Math.min(L - 4, (valeur / (mediane * 2)) * L));
  const ecart = Math.round((valeur / mediane - 1) * 100);
  const titre = `${ecart >= 0 ? '+' : ''}${ecart} % par rapport à ${reference}`;
  return `<span class="reglette" role="img" title="${echapper(titre).replace(/"/g, '&quot;')}" style="--x:${+x.toFixed(1)}px"><i></i></span>`;
}

/**
 * La série d'un repère, en courbe minuscule.
 *
 * L'échelle est propre à chaque repère et part de zéro : une dotation qui passe
 * de 300 à 280 € doit se voir comme une inflexion, pas comme un effondrement —
 * ce qu'un cadrage sur les seuls extrêmes ferait croire. Moins de trois points
 * ne font pas une série : rien n'est dessiné.
 */
export function tendance(
  serie: (number | null)[],
  annees: number[],
  formater: (v: number) => string = (v) => `${v.toLocaleString('fr-FR')} €`,
): string | null {
  const points = serie
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 3) return null;
  const L = 108;
  const H = 20;
  const haut = Math.max(...points.map((p) => p.v), 0);
  const bas = Math.min(...points.map((p) => p.v), 0);
  const etendue = haut - bas || 1;
  // L'abscisse suit l'année, pas le rang : une série de recensements — 1876,
  // 1901… 2020, 2023 — écraserait sinon un siècle et étirerait trois ans.
  const debut = annees[0] ?? 0;
  const etendueAnnees = (annees[annees.length - 1] ?? debut) - debut || 1;
  const x = (i: number) => 2 + (((annees[i] ?? debut) - debut) / etendueAnnees) * (L - 4);
  const y = (v: number) => H - 3 - ((v - bas) / etendue) * (H - 6);
  const d = points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const premier = points[0];
  const dernier = points[points.length - 1];
  const titre =
    `${annees[premier.i]} : ${formater(premier.v)} · ${annees[dernier.i]} : ${formater(dernier.v)}`;
  return (
    `<svg class="tendance" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" role="img">` +
    `<title>${echapper(titre)}</title>` +
    `<path class="tendance-trait" d="${d}"/>` +
    `<circle class="tendance-fin" cx="${x(dernier.i).toFixed(1)}" cy="${y(dernier.v).toFixed(1)}" r="2.6"/>` +
    `</svg>`
  );
}

/**
 * « +12 % depuis 2018 », avec un vrai signe moins (U+2212) : il s'aligne sur
 * le plus et sur les chiffres, là où le trait d'union du clavier flotte.
 */
export function evolutionDepuis(evolution: number | null, depuis: number | null): string | null {
  if (evolution === null || depuis === null) return null;
  return `${evolution >= 0 ? '+' : '−'}${Math.abs(evolution)} % depuis ${depuis}`;
}

/**
 * Un montant lisible d'un coup d'œil : 489 k€, 2,0 M€. L'euro près n'apprend
 * rien sur un marché public, et « 489 025 € » se lit plus lentement que
 * « 489 k€ » quand on parcourt une liste.
 */
export function montantCourt(v: number | null): string {
  if (v === null) return '—';
  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  }
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000).toLocaleString('fr-FR')} k€`;
  return `${Math.round(v).toLocaleString('fr-FR')} €`;
}

/** « 2026-03-20 » devient « mars 2026 ». */
export function moisAnnee(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** Euros par habitant, au dixième au plus. */
export function euros(v: number): string {
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`;
}
