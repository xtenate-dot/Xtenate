// crediteuren.js — Wie betaal ik en hoeveel?

import { fmt } from './helpers.js?v=20260812c';

const el = id => document.getElementById(id);

export function renderCrediteuren() {
  const jaar = el('f-jaar-crediteuren')?.value || '2026';
  
  // State ophalen via window
  const s = window.state || {};
  let tx = s.TX || [];
  
  if (jaar !== '2026') {
    tx = (s.HIST_TX || []).filter(t => t.datum.startsWith(jaar));
  }
  
  const crediteuren = tx.filter(t => t.type === 'uitgave');
  
  if (crediteuren.length === 0) {
    el('crediteuren-list').innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">Geen uitgaven in ${jaar}</div>`;
    el('crediteuren-totaal').textContent = '€0,00';
    return;
  }
  
  const groepen = {};
  crediteuren.forEach(c => {
    const naam = c.naam || '(geen naam)';
    if (!groepen[naam]) groepen[naam] = { totaal: 0, count: 0 };
    groepen[naam].totaal += parseFloat(c.bedrag);
    groepen[naam].count += 1;
  });
  
  const sorted = Object.entries(groepen).sort((a, b) => b[1].totaal - a[1].totaal);
  
  const html = sorted.map(([naam, data]) => `
    <div class="crediteuren-row">
      <div class="crediteuren-naam">${naam}</div>
      <div class="crediteuren-stats">
        <span class="crediteuren-count">${data.count}x</span>
        <span class="crediteuren-bedrag neg">€${fmt(data.totaal)}</span>
      </div>
    </div>
  `).join('');
  
  el('crediteuren-list').innerHTML = html;
  
  const totaal = sorted.reduce((sum, [_, data]) => sum + data.totaal, 0);
  el('crediteuren-totaal').textContent = `€${fmt(totaal)}`;
}

export function wisselJaarCrediteuren() {
  renderCrediteuren();
}
