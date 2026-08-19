// navgroepen.js — de kopjes in het zijmenu zijn mappen die open en dicht
// kunnen. Welke er dicht staan wordt onthouden, zodat het menu er bij de
// volgende keer inloggen hetzelfde uitziet.

const KEY = 'xtenate_nav_groepen_dicht';

/** De namen van de groepen die de gebruiker heeft dichtgeklapt. */
function dichteGroepen() {
  try {
    const opgeslagen = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(opgeslagen) ? opgeslagen : [];
  } catch {
    return [];  // onleesbare voorkeur: dan maar alles open
  }
}

function bewaar(namen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(namen));
  } catch {
    // Opslag vol of geweigerd. Het menu werkt nog, alleen wordt de keuze
    // niet onthouden; dat is geen reden om de klik te laten mislukken.
  }
}

function zet(groep, dicht) {
  groep.classList.toggle('dicht', dicht);
  groep.querySelector('.nav-section-btn')?.setAttribute('aria-expanded', String(!dicht));
}

/** Klapt één groep open of dicht (aangeroepen vanaf het kopje in index.html). */
export function wisselNavGroep(knop) {
  const groep = knop.closest('.nav-groep');
  if (!groep) return;

  const naam = groep.dataset.groep;
  const wordtDicht = !groep.classList.contains('dicht');
  zet(groep, wordtDicht);

  const namen = dichteGroepen().filter(n => n !== naam);
  if (wordtDicht) namen.push(naam);
  bewaar(namen);
}

/**
 * Zorgt dat de groep waar deze pagina in zit openstaat. Nodig bij een
 * deeplink of een druk op de cijfertoetsen: anders spring je naar een
 * pagina waarvan het menu-item verstopt zit.
 */
export function toonGroepVan(pagina) {
  const item = document.querySelector(`.nav-item[data-page="${pagina}"]`);
  const groep = item?.closest('.nav-groep');
  if (groep && groep.classList.contains('dicht')) {
    zet(groep, false);
    bewaar(dichteGroepen().filter(n => n !== groep.dataset.groep));
  }
}

/** Herstelt bij het opstarten de eerder gekozen open/dicht-stand. */
export function initNavGroepen() {
  const dicht = dichteGroepen();
  document.querySelectorAll('.nav-groep').forEach(groep => {
    zet(groep, dicht.includes(groep.dataset.groep));
  });
}
