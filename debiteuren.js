// debiteuren.js — Wie betaalt mij en hoeveel?

import { fmt } from './helpers.js?v=20260812c';

const el = id => document.getElementById(id);

export function renderDebiteuren() {
  const jaar = el('f-jaar-debiteuren')?.value || '2026';
  
  // State ophalen via window
  const s = window.state || {};
  let tx = s.TX || [];
  
  if (jaar !== '2026') {
    tx = (s.HIST_TX || []).filter(t => t.datum.startsWith(jaar));
  }
  
  const debiteuren = tx.filter(t => t.type === 'inkomst');
  
  if (debiteuren.length === 0) {
    el('debiteuren-list').innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">Geen inkomsten in ${jaar}</div>`;
    el('debiteuren-totaal').textContent = '€0,00';
    return;
  }
  
  const groepen = {};
  debiteuren.forEach(d => {
    const naam = d.naam || '(geen naam)';
    if (!groepen[naam]) groepen[naam] = { totaal: 0, count: 0 };
    groepen[naam].totaal += parseFloat(d.bedrag);
    groepen[naam].count += 1;
  });
  
  const sorted = Object.entries(groepen).sort((a, b) => b[1].totaal - a[1].totaal);
  
  const html = sorted.map(([naam, data]) => `
    <div class="debiteuren-row">
      <div class="debiteuren-naam">${naam}</div>
      <div class="debiteuren-stats">
        <span class="debiteuren-count">${data.count}x</span>
        <span class="debiteuren-bedrag pos">+ €${fmt(data.totaal)}</span>
      </div>
    </div>
  `).join('');
  
  el('debiteuren-list').innerHTML = html;
  
  const totaal = sorted.reduce((sum, [_, data]) => sum + data.totaal, 0);
  el('debiteuren-totaal').textContent = `€${fmt(totaal)}`;
}

export function wisselJaarDebiteuren() {
  renderDebiteuren();
}
