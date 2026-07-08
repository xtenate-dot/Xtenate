// ui.js — navigatie tussen pagina's.

import { renderBank } from './bank.js';
import { renderBelasting } from './belasting.js';
import { renderHome } from './dashboard.js';
import { renderGrootboek } from './grootboek.js';
import { renderHNVI } from './hnvi.js';
import { renderCovers } from './voorraad.js';

export function nav(p, btn) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById('p-' + p).classList.add('active');
  btn.classList.add('active');
  const renders = {home:renderHome, bank:renderBank, grootboek:renderGrootboek, belasting:renderBelasting, covers:renderCovers, hnvi:renderHNVI};
  renders[p]();
}
