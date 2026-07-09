// ui.js — navigatie tussen pagina's.

import { renderBank } from './bank.js?v=20260710a';
import { renderBelasting } from './belasting.js?v=20260710a';
import { renderHome } from './dashboard.js?v=20260710a';
import { renderGrootboek } from './grootboek.js?v=20260710a';
import { renderHNVI } from './hnvi.js?v=20260710a';
import { renderCovers } from './voorraad.js?v=20260710a';

export function nav(p, btn) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById('p-' + p).classList.add('active');
  btn.classList.add('active');
  const renders = {home:renderHome, bank:renderBank, grootboek:renderGrootboek, belasting:renderBelasting, covers:renderCovers, hnvi:renderHNVI};
  renders[p]();
}
