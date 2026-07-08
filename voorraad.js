// voorraad.js — Funny Covers voorraadbeheer.

import { PRIJS_COVER, fmt } from './helpers.js';
import { saveCoversData, state } from './storage.js';

export function renderCovers() {
  const st = document.getElementById('f-covers-status').value;
  const totVrd = state.COVERS.reduce((s,c)=>s+c.voorraad,0);
  const totOmzet = state.COVERS.reduce((s,c)=>s+c.omzet2026*PRIJS_COVER,0);
  const totVk2026 = state.COVERS.reduce((s,c)=>s+c.omzet2026,0);
  const aktief = state.COVERS.filter(c=>c.voorraad>0).length;
  document.getElementById('covers-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Op voorraad</div><div class="val">${totVrd} stuks</div><div class="sub">${aktief} actieve artikelen</div></div>
    <div class="metric"><div class="lbl">Omzet 2026</div><div class="val pos">${fmt(totOmzet)}</div><div class="sub">${totVk2026} verkocht à €31,95</div></div>
    <div class="metric"><div class="lbl">Totaal verkocht</div><div class="val">${state.COVERS.reduce((s,c)=>s+c.verkoop,0)} stuks</div></div>
    <div class="metric"><div class="lbl">Uitverkocht</div><div class="val">${state.COVERS.filter(c=>c.voorraad===0).length} artikelen</div></div>`;
  const list = state.COVERS.filter(c => !st || (st==='ok'?c.voorraad>0:c.voorraad===0));
  document.getElementById('covers-body').innerHTML = list.map(c => `<tr>
    <td style="padding-left:14px;font-weight:${c.voorraad>0?500:400}">${c.artikel}</td>
    <td style="text-align:right">${c.voorraad}</td>
    <td style="text-align:right;color:var(--text-muted)">${c.inkoop}</td>
    <td style="text-align:right;color:var(--text-muted)">${c.verkoop}</td>
    <td style="text-align:right" class="${c.omzet2026>0?'pos':''}">${c.omzet2026>0?fmt(c.omzet2026*PRIJS_COVER):'—'}</td>
    <td><span class="${c.voorraad>0?'stock-ok':'stock-uit'}">${c.voorraad>0?'op voorraad':'uitverkocht'}</span></td>
    <td>${c.zoekterm?`<a href="https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(c.zoekterm)}" target="_blank" style="font-size:11px;color:var(--blue);text-decoration:none;white-space:nowrap">🔍 AliExpress</a>`:''}</td>
    <td><span class="sell-link" onclick="openCoverEdit(${c.id})">Bewerk</span></td>
  </tr>`).join('');
}

export function openCoverModal() {
  state.editCoverId = null;
  document.getElementById('cover-modal-title').textContent = 'Artikel toevoegen';
  ['cv-naam','cv-ink','cv-vk','cv-vrd','cv-26','cv-zoek','cv-prijs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-cover').classList.add('open');
}

export function openCoverEdit(id) {
  state.editCoverId = id;
  const c = state.COVERS.find(x=>x.id===id);
  document.getElementById('cover-modal-title').textContent = 'Artikel bewerken';
  document.getElementById('cv-naam').value = c.artikel;
  document.getElementById('cv-ink').value = c.inkoop;
  document.getElementById('cv-vk').value = c.verkoop;
  document.getElementById('cv-vrd').value = c.voorraad;
  document.getElementById('cv-26').value = c.omzet2026;
  document.getElementById('cv-zoek').value = c.zoekterm||'';
  document.getElementById('cv-prijs').value = c.prijs||'';
  document.getElementById('modal-cover').classList.add('open');
}

export function closeCoverModal() { document.getElementById('modal-cover').classList.remove('open'); }

export function saveCover() {
  const obj = {
    id: state.editCoverId || state.nxtCover++,
    artikel: document.getElementById('cv-naam').value,
    inkoop: parseInt(document.getElementById('cv-ink').value)||0,
    verkoop: parseInt(document.getElementById('cv-vk').value)||0,
    voorraad: parseInt(document.getElementById('cv-vrd').value)||0,
    omzet2026: parseInt(document.getElementById('cv-26').value)||0,
    zoekterm: document.getElementById('cv-zoek').value,
    prijs: parseFloat(document.getElementById('cv-prijs').value)||null,
  };
  if (state.editCoverId) { state.COVERS = state.COVERS.map(c => c.id===state.editCoverId ? obj : c); }
  else { state.COVERS.push(obj); }
  saveCoversData();
  closeCoverModal();
  renderCovers();
}
