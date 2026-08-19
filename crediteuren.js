// crediteuren.js — Wie betaal ik en hoeveel?
// De gegevens komen rechtstreeks uit `state` (storage.js). Eerder werd hier
// `window.state` gelezen, maar die is nooit gezet: de state is een module-
// export, geen globale variabele. Daardoor bleef de lijst altijd leeg.

import { state } from './storage.js?v=20260812c';
import { fmt } from './helpers.js?v=20260812c';

const el = id => document.getElementById(id);

/** Voorkomt dat een naam uit de bank de opmaak van de pagina kan breken. */
const veilig = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Alle boekingen van één jaar, uit zowel het lopende jaar als de historie.
 * 'all' geeft alles. Dubbele id's kunnen niet voorkomen: TX telt door vanaf
 * 200 en de historie gebruikt h<jaar>_<nr>.
 */
function boekingenVoorJaar(jaar) {
  const alles = [...(state.TX || []), ...(state.HIST_TX || [])];
  if (jaar === 'all') return alles;
  return alles.filter(t => String(t.datum || '').startsWith(jaar));
}

export function renderCrediteuren() {
  const jaar = el('f-jaar-crediteuren')?.value || '2026';
  const lijst = el('crediteuren-list');
  const totaalVeld = el('crediteuren-totaal');
  if (!lijst || !totaalVeld) return;

  const crediteuren = boekingenVoorJaar(jaar).filter(t => t.type === 'uitgave');

  if (crediteuren.length === 0) {
    const periode = jaar === 'all' ? 'de administratie' : jaar;
    lijst.innerHTML = `<div class="leeg">Geen uitgaven in ${veilig(periode)}</div>`;
    totaalVeld.textContent = fmt(0);
    return;
  }

  // Per naam samenvoegen: één regel per leverancier, niet per betaling.
  const groepen = new Map();
  for (const c of crediteuren) {
    const naam = (c.naam || '').trim() || '(geen naam)';
    const bedrag = Number(c.bedrag) || 0;
    const g = groepen.get(naam) || { totaal: 0, aantal: 0 };
    g.totaal += bedrag;
    g.aantal += 1;
    groepen.set(naam, g);
  }

  const gesorteerd = [...groepen.entries()].sort((a, b) => b[1].totaal - a[1].totaal);

  lijst.innerHTML = gesorteerd.map(([naam, g]) => `
    <div class="partij-rij">
      <div class="partij-naam">${veilig(naam)}</div>
      <div class="partij-stats">
        <span class="partij-aantal">${g.aantal}&times;</span>
        <span class="partij-bedrag neg">${fmt(g.totaal)}</span>
      </div>
    </div>`).join('');

  const totaal = gesorteerd.reduce((som, [, g]) => som + g.totaal, 0);
  totaalVeld.textContent = fmt(totaal);
}

export function wisselJaarCrediteuren() {
  renderCrediteuren();
}
