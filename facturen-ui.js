// facturen-ui.js — de pagina Facturen, met een tabblad voor Debiteuren en een
// voor Crediteuren. Beide leunen op dezelfde logica in facturen.js; alleen de
// richting verschilt.
//
// Fase 7, stap 3b: de indeling staat, de inhoud volgt in stap 4 (Debiteuren)
// en stap 5 (Crediteuren).

import { openstaandSaldo } from './facturen.js?v=20260821t';
import { esc, fmt } from './helpers.js?v=20260821t';

const el = id => document.getElementById(id);

/** Welk tabblad open staat: 'debiteur' of 'crediteur'. */
let actiefTab = 'debiteur';

const TABS = [
  { id: 'debiteur', naam: 'Debiteuren' },
  { id: 'crediteur', naam: 'Crediteuren' }
];

export function kiesFactuurTab(id) {
  if (!TABS.some(t => t.id === id)) return;
  actiefTab = id;
  renderFacturen();
}

/** Voor deeplinks: #debiteuren en #crediteuren openen het juiste tabblad. */
export function zetFactuurTab(id) {
  if (TABS.some(t => t.id === id)) actiefTab = id;
}

export function huidigFactuurTab() {
  return actiefTab;
}

function tekenTabs() {
  const balk = el('facturen-tabs');
  if (!balk) return;
  balk.innerHTML = TABS.map(t => `
    <div class="vtab${t.id === actiefTab ? ' active' : ''}" onclick="kiesFactuurTab('${t.id}')"
         role="tab" tabindex="0" aria-selected="${t.id === actiefTab}">
      ${esc(t.naam)} <span class="muted" style="font-size:11px">${fmt(openstaandSaldo(t.id))}</span>
    </div>`).join('');
}

export function renderFacturen() {
  tekenTabs();
  const doel = el('facturen-inhoud');
  if (!doel) return;

  const isDeb = actiefTab === 'debiteur';
  doel.innerHTML = `
    <div class="empty">
      <div class="empty-title">${isDeb
        ? 'Nog geen openstaande verkoopfacturen'
        : 'Nog geen openstaande inkoopfacturen'}</div>
      <div class="empty-sub">Dit tabblad wordt ingericht in de volgende stap.
        Je boekingen en totalen veranderen hier niet door.</div>
    </div>`;
}
