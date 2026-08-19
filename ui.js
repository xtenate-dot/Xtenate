// ui.js — navigatie tussen pagina's en het onthouden van de actieve pagina.

import { renderBank } from './bank.js?v=20260812c';
import { renderBelasting } from './belasting.js?v=20260812c';
import { renderCrediteuren } from './crediteuren.js?v=20260818';
import { renderDebiteuren } from './debiteuren.js?v=20260818';
import { renderHome } from './dashboard.js?v=20260812c';
import { renderPortaal } from './home.js?v=20260812c';
import { renderGrootboek } from './grootboek.js?v=20260812c';
import { renderHNVI } from './hnvi.js?v=20260812c';
import { renderControle } from './controle.js?v=20260812c';
import { renderCovers } from './voorraad.js?v=20260812c';
import { renderFacturen, zetFactuurTab } from './facturen-ui.js?v=20260812c';
import { renderBeheer } from './beheer.js?v=20260812c';

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

// Oude deeplinks blijven werken. #debiteuren en #crediteuren waren losse
// pagina's; nu zijn het de twee tabbladen van Facturen.
const ALIASSEN = { debiteuren: 'debiteur', crediteuren: 'crediteur' };

/** Welke pagina hoort er bij de huidige hash? 'home' als de hash leeg of onbekend is. */
export function paginaUitHash() {
  const p = location.hash.slice(1);
  if (ALIASSEN[p]) { zetFactuurTab(ALIASSEN[p]); return 'facturen'; }
  return RENDERS[p] ? p : 'home';
}

// Terug- en vooruitknop van de browser, en handmatig aangepaste hash.
window.addEventListener('hashchange', () => {
  const p = paginaUitHash();
  if (p !== huidigePagina) gaNaar(p);
});
