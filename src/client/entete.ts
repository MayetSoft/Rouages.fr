/**
 * Le champ de recherche de commune de l'en-tête.
 *
 * Un combobox au sens de l'ARIA : les flèches parcourent les propositions, Entrée
 * ouvre la page de celle qui est active — la première si aucune ne l'est —, et
 * Échap referme. Chaque proposition est un vrai lien : un clic du milieu ouvre
 * la commune dans un nouvel onglet, comme partout ailleurs.
 */
import { chercher, type CommuneBreve } from './recherche-commune.ts';

export function brancherRechercheCommune(): void {
  const lien = document.querySelector<HTMLAnchorElement>('.entete-communes');
  const zone = document.querySelector<HTMLElement>('.entete-recherche');
  const champ = document.getElementById('entete-commune-champ') as HTMLInputElement | null;
  const liste = document.getElementById('entete-commune-liste');
  if (!lien || !zone || !champ || !liste) return;

  lien.hidden = true;
  zone.hidden = false;

  let trouvees: CommuneBreve[] = [];
  let active = -1;
  let enCours = 0;

  const fermer = () => {
    liste.textContent = '';
    trouvees = [];
    active = -1;
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  };

  const marquer = (i: number) => {
    active = i;
    for (const [k, li] of [...liste.children].entries()) {
      li.setAttribute('aria-selected', String(k === i));
    }
    if (i >= 0) champ.setAttribute('aria-activedescendant', `entete-commune-${i}`);
    else champ.removeAttribute('aria-activedescendant');
  };

  const afficher = (communes: CommuneBreve[]) => {
    liste.textContent = '';
    trouvees = communes;
    active = -1;
    for (const [i, c] of communes.entries()) {
      const li = document.createElement('li');
      li.id = `entete-commune-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const a = document.createElement('a');
      a.href = `/commune/${c.code}`;
      a.tabIndex = -1;
      const nom = document.createElement('span');
      nom.className = 'commune-nom';
      const dep = document.createElement('span');
      dep.className = 'commune-dep';
      // Le département en toutes lettres : c'est lui qui départage les
      // homonymes, une commune sur dix en ayant un.
      dep.textContent = `${c.depNom} · ${c.cp}`;
      nom.append(document.createTextNode(c.nom), dep);
      const pop = document.createElement('span');
      pop.className = 'commune-pop';
      pop.textContent = `${c.population.toLocaleString('fr-FR')} hab.`;
      a.append(nom, pop);
      li.append(a);
      liste.append(li);
    }
    champ.setAttribute('aria-expanded', String(communes.length > 0));
  };

  champ.addEventListener('input', () => {
    const mien = ++enCours;
    const q = champ.value;
    if (q.trim().length < 2) {
      fermer();
      return;
    }
    chercher(q)
      .then((communes) => {
        if (mien === enCours) afficher(communes);
      })
      // L'index n'a pas pu venir : le lien vers la liste reste le chemin sûr.
      .catch(() => {
        if (mien !== enCours) return;
        fermer();
        lien.hidden = false;
      });
  });

  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && trouvees.length > 0) {
      e.preventDefault();
      marquer((active + 1) % trouvees.length);
    } else if (e.key === 'ArrowUp' && trouvees.length > 0) {
      e.preventDefault();
      marquer(active <= 0 ? trouvees.length - 1 : active - 1);
    } else if (e.key === 'Enter') {
      const c = trouvees[active >= 0 ? active : 0];
      if (c) {
        e.preventDefault();
        location.href = `/commune/${c.code}`;
      }
    } else if (e.key === 'Escape') {
      fermer();
    }
  });

  // Un clic ailleurs referme la liste ; un clic dedans suit le lien.
  document.addEventListener('click', (e) => {
    if (!zone.contains(e.target as Node)) fermer();
  });
}
