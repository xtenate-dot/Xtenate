// facturen-ui.js — de pagina Facturen, met een tabblad voor Debiteuren en een
// voor Crediteuren. Beide leunen op dezelfde logica in facturen.js; alleen de
// richting verschilt.
//
// Fase 7, stap 3b: de indeling stond, de inhoud (fase 1 van het losse
// facturenmodule-traject) komt hier: een lijst per tabblad, een aanmaak-/
// bewerkformulier en een pdf per factuur. Nog geen koppeling met boekingen en
// geen automatische betaalstatus — dat is een latere fase.

import {
  vandaagISO, plusDagen, dagenTussen, standaardTermijn,
  voegFactuurToe, vindFactuur, werkFactuurBij, verwijderFactuur,
  factuurStatus, dagenTeLaat, vervaltBinnenkort,
  facturenVan, openstaandSaldo, factuurnummerInGebruik
} from './facturen.js?v=20260902a';
import { esc, fmt, ddmm, bedragUit, leegVlak } from './helpers.js?v=20260902a';
import { downloadModelPdf } from './pdf.js?v=20260902a';
import { state } from './storage.js?v=20260902a';

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
  // Een open formulier hoort bij het tabblad waarop het geopend werd (soort
  // volgt uit actiefTab); van tabblad wisselen terwijl het openstaat zou een
  // factuur van de verkeerde soort kunnen opleveren.
  sluitFactuurModal();
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

// ────────────────────────────────────────────────── status: gedeeld met pdf
// Eén plek die bepaalt hoe een status eruitziet — de lijst en de pdf roepen
// allebei precies deze functie aan, zodat ze nooit uit elkaar kunnen lopen.
// De onderliggende berekening (vervallen, dagen te laat, bijna vervallen)
// komt volledig uit facturen.js; hier wordt alleen tekst en kleur gekozen.

export function statusWeergave(f, peildatum = vandaagISO()) {
  const status = factuurStatus(f, peildatum);
  if (status === 'betaald') return { tekst: 'Betaald', klasse: 'badge-green' };
  if (status === 'oninbaar') return { tekst: 'Oninbaar', klasse: 'badge-gray' };
  if (status === 'vervallen') {
    const d = dagenTeLaat(f, peildatum);
    return { tekst: `Vervallen · ${d} dag${d === 1 ? '' : 'en'} te laat`, klasse: 'badge-red' };
  }
  if (vervaltBinnenkort(f, peildatum)) {
    return { tekst: 'Vervalt binnenkort', klasse: 'badge-amber' };
  }
  return { tekst: 'Open', klasse: 'badge-gray' };
}

// ─────────────────────────────────────────────────────────────────── lijst

export function renderFacturen() {
  tekenTabs();
  const doel = el('facturen-inhoud');
  if (!doel) return;

  const soort = actiefTab;
  const lijst = facturenVan(soort);
  const isDeb = soort === 'debiteur';
  const teken = isDeb ? 'pos' : 'neg';
  const teLaat = lijst.filter(f => factuurStatus(f) === 'vervallen').length;
  const binnenkort = lijst.filter(f => vervaltBinnenkort(f)).length;

  const kop = `
    <div class="page-head" style="margin-bottom:var(--spacing-3);align-items:flex-end">
      <div class="kpi-grid" style="flex:1">
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Openstaand</div><div class="kpi-val">${fmt(openstaandSaldo(soort))}</div></div>
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Te laat</div><div class="kpi-val${teLaat ? ' neg' : ''}">${teLaat}</div></div>
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Vervalt binnenkort</div><div class="kpi-val">${binnenkort}</div></div>
      </div>
      <button class="btn btn-primary" onclick="openFactuurModal()">Nieuwe factuur</button>
    </div>`;

  if (!lijst.length) {
    doel.innerHTML = kop + leegVlak(
      isDeb ? 'Nog geen openstaande verkoopfacturen' : 'Nog geen openstaande inkoopfacturen',
      'Voeg een factuur toe om openstaande bedragen bij te houden. Je boekingen en totalen veranderen hier niet door.',
      `<button class="btn" onclick="openFactuurModal()">Factuur toevoegen</button>`);
    return;
  }

  const rijen = lijst.map(f => {
    const sw = statusWeergave(f);
    return `
      <tr>
        <td class="muted" style="padding-left:16px">${ddmm(f.vervaldatum || f.datum)}</td>
        <td class="td-trunc">${esc(f.relatie || '(geen relatie)')}${f.omschrijving
          ? ` <span style="color:var(--text-muted);font-size:10px">· ${esc(f.omschrijving)}</span>` : ''}</td>
        <td class="muted" style="font-size:12px">${esc(f.factuurnummer || '—')}</td>
        <td style="text-align:right" class="${teken}">${fmt(f.bedrag)}</td>
        <td><span class="badge ${sw.klasse}">${esc(sw.tekst)}</span></td>
        <td style="text-align:right;padding-right:16px;white-space:nowrap">
          <button type="button" class="btn-details" data-bewerk="${esc(f.id)}">Bewerken</button>
          <button type="button" class="btn-details" data-pdf="${esc(f.id)}">Pdf</button>
          <button type="button" class="btn-details" data-verwijder="${esc(f.id)}">Verwijderen</button>
        </td>
      </tr>`;
  }).join('');

  doel.innerHTML = kop + `
    <div class="table-wrap"><table class="tbl-compact">
      <thead><tr>
        <th style="padding-left:16px">Vervaldatum</th>
        <th>Relatie</th>
        <th>Nr.</th>
        <th style="text-align:right">Bedrag</th>
        <th>Status</th>
        <th style="padding-right:16px"></th>
      </tr></thead>
      <tbody>${rijen}</tbody>
    </table></div>`;

  doel.querySelectorAll('[data-bewerk]').forEach(k =>
    k.addEventListener('click', () => openFactuurModal(k.dataset.bewerk)));
  doel.querySelectorAll('[data-pdf]').forEach(k =>
    k.addEventListener('click', () => downloadFactuurPdf(k.dataset.pdf)));
  doel.querySelectorAll('[data-verwijder]').forEach(k =>
    k.addEventListener('click', () => verwijderFactuurUi(k.dataset.verwijder)));
}

// ────────────────────────────────────────────────────────────────── formulier

// Blijft de vervaldatum meebewegen met de datum, of heeft de gebruiker hem
// zelf al aangepast? Bij bewerken staat dit meteen op waar, zodat het openen
// van een bestaande factuur zijn eigen vervaldatum nooit overschrijft.
let vervaldatumHandmatig = false;

export function openFactuurModal(id = null) {
  const f = id ? vindFactuur(id) : null;
  state.editFactuurId = f ? f.id : null;

  el('fact-modal-title').textContent = f ? 'Factuur bewerken' : 'Factuur toevoegen';
  el('fact-relatie-label').textContent = actiefTab === 'debiteur' ? 'Aan wie stuur je dit?' : 'Van wie ontvang je dit?';

  const datum = f?.datum || vandaagISO();
  el('fact-d').value = datum;
  el('fact-verval').value = f?.vervaldatum || plusDagen(datum, standaardTermijn(actiefTab));
  el('fact-bedrag').value = f ? String(f.bedrag).replace('.', ',') : '';
  el('fact-relatie').value = f?.relatie || '';
  el('fact-nr').value = f?.factuurnummer || '';
  el('fact-omschr').value = f?.omschrijving || '';
  el('fact-gb').value = f?.gb || '';
  el('fact-fout').textContent = '';

  vervaldatumHandmatig = !!f;

  const statusBlok = el('fact-status-blok');
  if (f) { statusBlok.style.display = ''; el('fact-status').value = f.status; }
  else { statusBlok.style.display = 'none'; }

  el('fact-delete-btn').style.display = f ? '' : 'none';

  document.getElementById('modal-factuur').classList.add('open');
  el('fact-d').focus();
}

export function sluitFactuurModal() {
  document.getElementById('modal-factuur')?.classList.remove('open');
  state.editFactuurId = null;
}

/** Vervaldatum meebewegen met de datum, zolang niemand hem handmatig aanpaste. */
export function syncFactuurVervaldatum() {
  if (vervaldatumHandmatig) return;
  const datum = el('fact-d').value;
  if (!datum) return;
  el('fact-verval').value = plusDagen(datum, standaardTermijn(actiefTab));
}

export function factVervaldatumHandmatig() {
  vervaldatumHandmatig = true;
}

export function saveFactuur() {
  const fout = el('fact-fout');
  const datum = el('fact-d').value;
  const vervaldatum = el('fact-verval').value;
  const bedrag = bedragUit('fact-bedrag', NaN);
  const relatie = el('fact-relatie').value.trim();
  const factuurnummer = el('fact-nr').value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    fout.textContent = 'Vul een geldige datum in.'; el('fact-d').focus(); return;
  }
  if (!relatie) {
    fout.textContent = 'Vul een relatie in.'; el('fact-relatie').focus(); return;
  }
  if (isNaN(bedrag) || bedrag <= 0) {
    fout.textContent = 'Vul een bedrag groter dan nul in.'; el('fact-bedrag').focus(); return;
  }
  if (!vervaldatum || dagenTussen(datum, vervaldatum) < 0) {
    fout.textContent = 'Vervaldatum kan niet vóór de factuurdatum liggen.'; el('fact-verval').focus(); return;
  }
  if (factuurnummerInGebruik(actiefTab, relatie, factuurnummer, state.editFactuurId)) {
    fout.textContent = `Factuurnummer ${factuurnummer} bestaat al bij deze relatie.`; el('fact-nr').focus(); return;
  }
  fout.textContent = '';

  const gegevens = {
    soort: actiefTab, datum, vervaldatum, bedrag,
    relatie, factuurnummer,
    omschrijving: el('fact-omschr').value.trim(),
    gb: el('fact-gb').value
  };

  if (state.editFactuurId != null) {
    if (el('fact-status-blok').style.display !== 'none') gegevens.status = el('fact-status').value;
    werkFactuurBij(state.editFactuurId, gegevens);
  } else {
    voegFactuurToe(gegevens);
  }

  sluitFactuurModal();
  renderFacturen();
}

export function verwijderFactuurUi(id) {
  const f = vindFactuur(id);
  if (!f) return false;
  if (!confirm(`Factuur van ${f.relatie || '(geen relatie)'} (${fmt(f.bedrag)}) verwijderen?`)) return false;
  verwijderFactuur(id);
  renderFacturen();
  return true;
}

/** De Verwijderen-knop ín het bewerken-formulier: leest het id daar zelf uit
 *  state, want de HTML kan state.editFactuurId niet rechtstreeks aanroepen. */
export function verwijderFactuurUitModal() {
  if (state.editFactuurId != null && verwijderFactuurUi(state.editFactuurId)) {
    sluitFactuurModal();
  }
}

// ──────────────────────────────────────────────────────────────────── pdf

/**
 * Het pdf-model voor één factuur. Het bedrag komt rechtstreeks uit f.bedrag
 * (een opgeslagen veld, geen optelsom) en de status komt uitsluitend via
 * statusWeergave() hierboven — dezelfde functie die de lijst gebruikt. Geen
 * eigen, evenwijdige berekening van vervallen/te laat/bijna vervallen.
 */
function factuurModel(f) {
  const sw = statusWeergave(f);
  return {
    titel: `Factuur ${f.factuurnummer || f.id}`,
    ondertitel: `${f.relatie || '(geen relatie)'} · ${f.soort === 'debiteur' ? 'Te ontvangen' : 'Te betalen'}`,
    blokken: [
      { type: 'kop', tekst: 'Gegevens' },
      { type: 'tekst', tekst: `Factuurnummer: ${f.factuurnummer || '—'}` },
      { type: 'tekst', tekst: `Factuurdatum: ${f.datum}` },
      { type: 'tekst', tekst: `Vervaldatum: ${f.vervaldatum || '—'}` },
      { type: 'tekst', tekst: `Status: ${sw.tekst}` },

      { type: 'kop', tekst: 'Bedrag' },
      { type: 'regel', label: f.soort === 'debiteur' ? 'Te ontvangen' : 'Te betalen', bedrag: f.bedrag, totaal: true },

      ...(f.omschrijving ? [{ type: 'tekst', tekst: `Omschrijving: ${f.omschrijving}` }] : []),

      { type: 'voet', tekst: `Interne kopie uit de Xtenate-administratie, gegenereerd op ${new Date().toLocaleDateString('nl-NL')}.` }
    ]
  };
}

export function downloadFactuurPdf(id) {
  const f = vindFactuur(id);
  if (!f) return;
  downloadModelPdf(factuurModel(f), `factuur-${f.factuurnummer || f.id}.pdf`);
}
