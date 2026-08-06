// ui.js — navigatie tussen pagina's en het onthouden van de actieve pagina.

import { renderBank } from './bank.js?v=20260806a';
import { renderBelasting } from './belasting.js?v=20260806a';
import { renderHome } from './dashboard.js?v=20260806a';
import { renderGrootboek } from './grootboek.js?v=20260806a';
import { renderHNVI } from './hnvi.js?v=20260806a';
import { renderCovers } from './voorraad.js?v=20260806a';

const RENDERS = {
  home: renderHome,
  bank: renderBank,
  grootboek: renderGrootboek,
  belasting: renderBelasting,
  covers: renderCovers,
  hnvi: renderHNVI
};

const TITELS = {
  home: 'Overzicht',
  bank: 'Bank',
  grootboek: 'Grootboek',
  belasting: 'Belasting',
  covers: 'Funny Covers',
  hnvi: 'HNVI / Xtenate'
};

export let huidigePagina = 'home';

export function nav(p, btn) {
  if (!RENDERS[p]) return;
  huidigePagina = p;

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
