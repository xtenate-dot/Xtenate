// ui.js — navigatie tussen pagina's en het onthouden van de actieve pagina.

import { renderBank } from './bank.js?v=20260821r';
import { renderBelasting } from './belasting.js?v=20260821r';
import { renderCrediteuren } from './crediteuren.js?v=20260821r';
import { renderDebiteuren } from './debiteuren.js?v=20260821r';
import { renderHome } from './dashboard.js?v=20260821r';
import { renderPortaal } from './home.js?v=20260821r';
import { renderGrootboek } from './grootboek.js?v=20260821r';
import { renderHNVI } from './hnvi.js?v=20260821r';
import { renderControle } from './controle.js?v=20260821r';
import { renderCovers } from './voorraad.js?v=20260821r';
import { renderFacturen } from './facturen-ui.js?v=20260821r';
import { renderBeheer } from './beheer.js?v=20260821r';
import { toonGroepVan } from './navgroepen.js?v=20260821r';

const RENDERS = {
  home: renderPortaal,      // de startpagina: tegels naar de onderdelen
  overzicht: renderHome,    // het financiële dashboard (voorheen 'home')
  bank: renderBank,
  facturen: renderFacturen,
  crediteuren: renderCrediteuren,
  debiteuren: renderDebiteuren,
  grootboek: renderGrootboek,
  belasting: renderBelasting,
  controle: renderControle,
  voorraad: renderCovers,
  hnvi: renderHNVI,
  beheer: renderBeheer
};

const TITELS = {
  home: 'Home',
  overzicht: 'Overzicht',
  bank: 'Bank',
  facturen: 'Facturen',
  crediteuren: 'Crediteuren',
  debiteuren: 'Debiteuren',
  grootboek: 'Grootboek',
  belasting: 'Belasting',
  controle: 'Controle',
  voorraad: 'Voorraad',
  hnvi: 'HNVI / Xtenate',
  beheer: 'Beheer'
};

export let huidigePagina = 'home';

export function nav(p, btn) {
  if (!RENDERS[p]) return;
  huidigePagina = p;

  // De hash bijwerken zodat een refresh en de terugknop de pagina onthouden.
  // De gelijkheidscontrole voorkomt een lus: hashchange roept gaNaar aan, die
  // roept nav aan, die anders de hash opnieuw zou zetten.
  if (location.hash.slice(1) !== p) location.hash = p;

  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(x => x.classList.remove('active'));
  document.getElementById('p-' + p).classList.add('active');

  // Zit de pagina in een dichtgeklapte menugroep, klap die dan open, zodat
  // je na een deeplink of sneltoets ziet waar je bent.
  toonGroepVan(p);

  const knop = btn || document.querySelector(`.nav-item[data-page="${p}"]`);
  if (knop) knop.classList.add('active');

  const titel = document.getElementById('topbar-title');
  if (titel) titel.textContent = TITELS[p] || '';

  document.body.classList.remove('nav-open');
  document.getElementById('nav-backdrop')?.classList.remove('open');
  window.scrollTo({ top: 0 });

  RENDERS[p]();
}

/** Tekent de pagina die nu open staat opnieuw (na thema- of datawijziging). */
export function hertekenHuidigePagina() {
  RENDERS[huidigePagina]?.();
}

/** Springt naar een pagina zonder dat er een knop is aangeklikt. */
export function gaNaar(p) {
  nav(p, document.querySelector(`.nav-item[data-page="${p}"]`));
}

// Debiteuren en crediteuren zijn weer eigen pagina's. Hier stond eerder een
// alias die #debiteuren en #crediteuren doorstuurde naar de tabbladen van
// Facturen. Dat botste met nav(): die zette de hash, waarna hashchange de
// bezoeker meteen naar Facturen gooide — de pagina flitste dan even voorbij.

/** Welke pagina hoort er bij de huidige hash? 'home' als de hash leeg of onbekend is. */
export function paginaUitHash() {
  const p = location.hash.slice(1);
  return RENDERS[p] ? p : 'home';
}

// Terug- en vooruitknop van de browser, en handmatig aangepaste hash.
window.addEventListener('hashchange', () => {
  const p = paginaUitHash();
  if (p !== huidigePagina) gaNaar(p);
});
