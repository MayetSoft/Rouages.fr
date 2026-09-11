/**
 * La page de signalement.
 *
 * Elle ne reçoit que des identifiants — un nœud, un code INSEE, un chemin —
 * et reconstitue elle-même ce que le site affiche, avec le code qui l'affiche.
 * Deux raisons : un relevé recopié depuis l'URL vieillirait sans qu'on le
 * sache, et il serait falsifiable par quiconque fabrique un lien.
 */
import {
  corpsSignalement,
  titreSignalement,
  urlIssue,
  cheminInterne,
  type Contexte,
} from '../modele/signalement.ts';
import { origineVerdict, resoudre, resumerVerdict, trouverParCode } from './territoire.ts';

interface Fiche {
  id: string;
  nom: string;
  territoriale: boolean;
  verifieLe?: string;
}

const brut = document.getElementById('donnees-fiches');
const fiches: Fiche[] = brut ? (JSON.parse(brut.textContent ?? '[]') as Fiche[]) : [];

const releve = document.getElementById('releve');
const attente = document.getElementById('releve-attente');
const dire = document.getElementById('dire') as HTMLTextAreaElement | null;
const vers = document.getElementById('vers-issue') as HTMLAnchorElement | null;
const copier = document.getElementById('copier');
const copieFaite = document.getElementById('copie-faite');

/** Le relevé courant, partagé avec les écouteurs posés plus bas. */
let contexte: Contexte | null = null;

if (releve && vers) composer();

async function composer() {
  const p = new URLSearchParams(location.search);
  const fiche = fiches.find((f) => f.id === p.get('n'));
  const chemin = p.get('p');

  const ctx: Contexte = {
    page: page(fiche?.id, chemin),
    ...(fiche ? { noeud: { id: fiche.id, nom: fiche.nom } } : {}),
    ...(fiche?.verifieLe ? { verifieLe: fiche.verifieLe } : {}),
  };

  contexte = ctx;
  // La réponse territoriale demande deux chargements ; le reste du relevé ne
  // doit pas les attendre, un lien mort le temps du réseau serait pire.
  afficher(ctx);
  const code = p.get('c');
  if (!code) return;

  if (fiche?.territoriale) {
    const reponse = await resoudreReponse(code, fiche);
    if (reponse) {
      ctx.reponse = reponse;
      afficher(ctx);
    }
    return;
  }

  // Pas de réponse territoriale à citer, mais le lecteur regardait bien un
  // territoire : le nommer coûte une ligne et épargne un aller-retour.
  const commune = await trouverParCode(code).catch(() => null);
  if (commune) {
    ctx.commune = { nom: commune.nom, code: commune.code };
    afficher(ctx);
  }
}

/**
 * La page citée dans le signalement. La fiche d'un nœud est plus stable que
 * l'ancre de la carte, et se lit sans JavaScript : c'est elle qu'un correcteur
 * ouvrira.
 */
function page(id?: string, chemin?: string | null): string {
  const base = location.origin;
  if (id) return `${base}/n/${id}`;
  if (chemin && cheminInterne(chemin)) return `${base}${chemin}`;
  return base;
}

async function resoudreReponse(code: string, fiche: Fiche): Promise<Contexte['reponse']> {
  try {
    const commune = await trouverParCode(code);
    if (!commune) return undefined;
    const t = await resoudre(commune);
    const v = t.verdict(fiche.id);
    return {
      commune: commune.nom,
      code: commune.code,
      competence: fiche.nom,
      dit: resumerVerdict(v),
      source: origineVerdict(v, t.maj),
    };
  } catch {
    // Le relevé vaut sans elle : mieux vaut un signalement partiel qu'aucun.
    return undefined;
  }
}

/** Tout en nœuds de texte : le relevé cite de la donnée, il ne la met en forme. */
function afficher(ctx: Contexte) {
  if (!releve || !vers) return;
  attente?.remove();
  releve.querySelector('dl')?.remove();

  const dl = document.createElement('dl');
  dl.className = 'releve-liste';
  const item = (cle: string, valeur: string) => {
    const d = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = cle;
    const dd = document.createElement('dd');
    dd.textContent = valeur;
    d.append(dt, dd);
    dl.append(d);
  };

  if (ctx.noeud) item('Fiche', ctx.noeud.nom);
  if (ctx.page) item('Page', ctx.page);
  if (ctx.verifieLe) item('Vérifiée le', ctx.verifieLe);
  if (!ctx.reponse && ctx.commune) {
    item('Commune choisie', `${ctx.commune.nom} (INSEE ${ctx.commune.code})`);
  }
  if (ctx.reponse) {
    item('Commune', `${ctx.reponse.commune} (INSEE ${ctx.reponse.code})`);
    item('Réponse affichée', ctx.reponse.dit);
    if (ctx.reponse.source) item('Origine', ctx.reponse.source);
  }
  if (dl.childElementCount === 0) item('Page', ctx.page ?? location.origin);
  releve.append(dl);

  vers.href = urlIssue(ctx, dire?.value ?? '');
}

/* Les écouteurs sont posés une fois pour toutes : `afficher` est rappelée
   quand la réponse territoriale arrive, et des écouteurs empilés enverraient
   deux signalements pour un clic. */

dire?.addEventListener('input', () => {
  if (contexte && vers) vers.href = urlIssue(contexte, dire.value);
});

copier?.addEventListener('click', async () => {
  if (!contexte) return;
  const texte = `${titreSignalement(contexte)}\n\n${corpsSignalement(contexte, dire?.value ?? '')}`;
  try {
    await navigator.clipboard.writeText(texte);
    if (copieFaite) copieFaite.hidden = false;
  } catch {
    // Presse-papier refusé : on montre le texte, à défaut de le copier.
    if (dire) {
      dire.value = texte;
      dire.select();
    }
  }
});
