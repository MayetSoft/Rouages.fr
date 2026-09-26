/**
 * Ce qui a changé depuis la dernière visite.
 *
 * Le journal d'une commune montre ses six derniers faits ; un habitant qui
 * revient ne sait pas lesquels il a déjà vus. Le navigateur retient, commune
 * par commune, la date du fait le plus récent affiché à la dernière visite, et
 * marque ce qui est plus récent. Rien ne part au serveur — le site n'en a pas
 * qui écoute — et un navigateur qui refuse le stockage local voit simplement
 * la liste sans marque.
 */
const liste = document.querySelector<HTMLElement>('ul.journal[data-commune]');
if (liste) {
  const cle = `rouages-vu-${liste.dataset.commune}`;
  const faits = [...liste.querySelectorAll<HTMLElement>('li[data-date]')];
  let vu: string | null = null;
  try {
    vu = localStorage.getItem(cle);
  } catch {
    vu = null;
  }
  // Première visite : rien n'est « nouveau », tout l'est.
  if (vu) {
    let nouveaux = 0;
    for (const li of faits) {
      if ((li.dataset.date ?? '') > vu) {
        li.classList.add('journal-nouveau');
        const marque = document.createElement('span');
        marque.className = 'journal-marque';
        marque.textContent = 'nouveau';
        li.querySelector('.journal-fait')?.prepend(marque);
        nouveaux++;
      }
    }
    if (nouveaux > 0) {
      const note = document.createElement('p');
      note.className = 'journal-depuis';
      note.textContent =
        nouveaux === 1 ? 'Un fait nouveau depuis votre dernière visite.' : `${nouveaux} faits nouveaux depuis votre dernière visite.`;
      liste.before(note);
    }
  }
  const plusRecent = faits.reduce((m, li) => ((li.dataset.date ?? '') > m ? (li.dataset.date ?? '') : m), '');
  try {
    if (plusRecent) localStorage.setItem(cle, plusRecent);
  } catch {
    // Stockage refusé : la page reste la même, sans mémoire.
  }
}
