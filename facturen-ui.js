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
  facturenVan, openstaandSaldo, factuurnummerInGebruik,
  vindBoeking, koppelBetaling, ontkoppelBetaling,
  ouderdomsanalyse, OUDERDOM_VOLGORDE
} from './facturen.js?v=20260902a';
import { esc, fmt, ddmm, bedragUit, leegVlak, isInkomst, isUitgave, weergaveNaam } from './helpers.js?v=20260902a';
import { downloadModelPdf } from './pdf.js?v=20260902a';
import { state, grootboekNamen, grootboekOptgroepen } from './storage.js?v=20260902a';
import { zoekBoekingen } from './search.js?v=20260902a';

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

  // De ouderdomsgroepen ná "niet vervallen" zijn per definitie de vervallen
  // facturen — "Te laat" is dus de som daarvan, uit dezelfde bron als het
  // blokje hieronder, in plaats van een eigen, aparte telling.
  const analyse = ouderdomsanalyse(soort);
  const vervallenGroepen = OUDERDOM_VOLGORDE.slice(1);
  const teLaat = vervallenGroepen.reduce((s, g) => s + analyse[g].aantal, 0);
  const binnenkort = lijst.filter(f => vervaltBinnenkort(f)).length;

  const kop = `
    <div class="page-head" style="margin-bottom:var(--spacing-3);align-items:flex-end">
      <div class="kpi-grid" style="flex:1">
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Openstaand</div><div class="kpi-val">${fmt(openstaandSaldo(soort))}</div></div>
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Te laat</div><div class="kpi-val${teLaat ? ' neg' : ''}">${teLaat}</div></div>
        <div class="kpi kpi--secondary"><div class="kpi-lbl">Vervalt binnenkort</div><div class="kpi-val">${binnenkort}</div></div>
      </div>
      <button class="btn btn-primary" onclick="openFactuurModal()">Nieuwe factuur</button>
    </div>
    <div class="table-wrap" style="margin-bottom:var(--spacing-4)"><table class="tbl-compact">
      <thead><tr>${OUDERDOM_VOLGORDE.map((g, i) =>
        `<th style="text-align:right${i === 0 ? ';padding-left:16px' : ''}${i === OUDERDOM_VOLGORDE.length - 1 ? ';padding-right:16px' : ''}">${esc(g)}</th>`).join('')}</tr></thead>
      <tbody><tr>${OUDERDOM_VOLGORDE.map((g, i) => `
        <td style="text-align:right${i === 0 ? ';padding-left:16px' : ''}${i === OUDERDOM_VOLGORDE.length - 1 ? ';padding-right:16px' : ''}">
          <div>${analyse[g].aantal}</div>
          <div class="muted" style="font-size:11px">${fmt(analyse[g].bedrag)}</div>
        </td>`).join('')}</tr></tbody>
    </table></div>`;

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
          <button type="button" class="btn-details" data-koppel="${esc(f.id)}">Koppelen${f.txIds && f.txIds.length ? ` (${f.txIds.length})` : ''}</button>
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
  doel.querySelectorAll('[data-koppel]').forEach(k =>
    k.addEventListener('click', () => openKoppelModal(k.dataset.koppel)));
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

/** Vult #fact-gb met de actuele grootboekrekeningen, mét de vaste
 *  "— geen —"-optie vooraan. */
function vulFactuurGrootboekSelect(huidigeWaarde) {
  const select = el('fact-gb');
  select.innerHTML = '<option value="">— geen —</option>' + grootboekOptgroepen().map(g => `
    <optgroup label="${esc(g.naam)}">
      ${g.rekeningen.map(r => `<option value="${esc(r.nummer)}">${esc(r.nummer)} ${esc(r.naam)}</option>`).join('')}
    </optgroup>`).join('');
  if (huidigeWaarde && ![...select.options].some(o => o.value === huidigeWaarde)) {
    const optie = document.createElement('option');
    optie.value = huidigeWaarde;
    optie.textContent = `${huidigeWaarde} (niet in schema)`;
    select.appendChild(optie);
  }
  select.value = huidigeWaarde || '';
}

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
  vulFactuurGrootboekSelect(f?.gb || '');
  el('fact-fout').textContent = '';

  vervaldatumHandmatig = !!f;

  const statusBlok = el('fact-status-blok');
  if (f) {
    statusBlok.style.display = '';
    el('fact-status').value = f.status;
    // Zolang er een boeking gekoppeld is, blijft factuurStatus() altijd
    // 'betaald' tonen (isBetaald() kijkt naar txIds, niet naar dit veld) —
    // dit veld hier laten wijzigen zou dus een schijnkeuze zijn.
    const gekoppeld = Array.isArray(f.txIds) && f.txIds.length > 0;
    el('fact-status').disabled = gekoppeld;
    el('fact-status-hint').textContent = gekoppeld
      ? 'Deze factuur is gekoppeld aan een boeking — koppel hem eerst los (via "Koppelen") om de status te wijzigen.'
      : 'Betaald hier handmatig zetten koppelt geen boeking — gebruik daarvoor de knop "Koppelen".';
  } else {
    statusBlok.style.display = 'none';
  }

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

// ──────────────────────────────────────────────────── koppelen aan boeking
//
// koppelBetaling()/ontkoppelBetaling() (facturen.js) doen zelf al het werk:
// koppelen zet de status automatisch op 'betaald', loskoppelen zet hem
// terug naar 'open' — dat wordt hier dus niet nogmaals gedaan, alleen
// aangeroepen en herrenderd.

let koppelFactuurId = null;

/** Eén boekingsregel, met de knop-tekst en eventuele bedrag-waarschuwing
 *  als los, herbruikbaar bouwblok voor zowel "gekoppeld" als "resultaten". */
function boekingRij(t, factuur, actieLabel) {
  const positief = isInkomst(t) || t.type === 'prive_storting';
  const verschil = Math.abs(Number(t.bedrag) - Number(factuur.bedrag)) > 0.005;
  const naam = grootboekNamen()[t.gb] || '';
  return `
    <div class="ctrl-item">
      <span class="ctrl-item-main" style="cursor:default">
        <span class="ctrl-item-label">${esc(weergaveNaam(t)) || '(geen naam)'}</span>
        <span class="ctrl-item-sub">${ddmm(t.datum)} · ${esc(t.gb)} ${esc(naam)}</span>
      </span>
      ${verschil ? `<span class="badge badge-amber" style="margin-right:8px">wijkt af van ${fmt(factuur.bedrag)}</span>` : ''}
      <span class="${positief ? 'pos' : 'neg'}" style="padding-right:12px">${positief ? '+' : '–'}${fmt(t.bedrag)}</span>
      <button type="button" class="btn-details" data-tx="${esc(t.id)}">${esc(actieLabel)}</button>
    </div>`;
}

function renderGekoppeld(f) {
  const doel = el('fact-koppel-gekoppeld');
  if (!f.txIds.length) {
    doel.innerHTML = `<div class="ctrl-item"><span class="muted" style="padding:4px 0">Nog geen boeking gekoppeld.</span></div>`;
    return;
  }
  doel.innerHTML = f.txIds.map(txId => {
    const t = vindBoeking(txId);
    if (!t) return `<div class="ctrl-item"><span class="neg">Boeking ${esc(txId)} niet gevonden (mogelijk verwijderd).</span></div>`;
    return boekingRij(t, f, 'Loskoppelen');
  }).join('');
  doel.querySelectorAll('[data-tx]').forEach(k =>
    k.addEventListener('click', () => ontkoppelBoekingVanFactuur(k.dataset.tx)));
}

export function openKoppelModal(id) {
  const f = vindFactuur(id);
  if (!f) return;
  koppelFactuurId = f.id;
  el('fact-koppel-context').textContent =
    `${f.relatie || '(geen relatie)'} · ${fmt(f.bedrag)} · ${f.soort === 'debiteur' ? 'te ontvangen' : 'te betalen'}`;
  renderGekoppeld(f);
  el('fact-koppel-zoek').value = '';
  el('fact-koppel-resultaten').innerHTML = '';
  document.getElementById('modal-factuur-koppel').classList.add('open');
  el('fact-koppel-zoek').focus();
}

export function sluitKoppelModal() {
  document.getElementById('modal-factuur-koppel')?.classList.remove('open');
  koppelFactuurId = null;
}

export function zoekFactuurBoeking() {
  const f = vindFactuur(koppelFactuurId);
  const doel = el('fact-koppel-resultaten');
  if (!f) { doel.innerHTML = ''; return; }

  const q = el('fact-koppel-zoek').value.trim().toLowerCase();
  if (q.length < 2) {
    doel.innerHTML = `<div class="ctrl-item"><span class="muted" style="padding:4px 0">Typ minstens 2 tekens om te zoeken.</span></div>`;
    return;
  }

  // Alleen boekingen met de bij deze factuur passende richting: een
  // debiteur-factuur (te ontvangen) koppelt aan inkomsten, een crediteur-
  // factuur (te betalen) aan uitgaven. Een al gekoppelde boeking wordt hier
  // nooit nogmaals aangeboden.
  const richtingPast = t => (f.soort === 'debiteur' ? isInkomst(t) : isUitgave(t));
  const resultaten = zoekBoekingen(q)
    .filter(richtingPast)
    .filter(t => !f.txIds.some(id => String(id) === String(t.id)))
    .slice(0, 10);

  if (!resultaten.length) {
    doel.innerHTML = `<div class="ctrl-item"><span class="muted" style="padding:4px 0">Niets gevonden.</span></div>`;
    return;
  }

  doel.innerHTML = resultaten.map(t => boekingRij(t, f, 'Koppelen')).join('');
  doel.querySelectorAll('[data-tx]').forEach(k =>
    k.addEventListener('click', () => koppelBoekingAanFactuur(k.dataset.tx)));
}

function koppelBoekingAanFactuur(txId) {
  const r = koppelBetaling(koppelFactuurId, txId);
  if (!r.ok) { alert('Koppelen mislukt: ' + r.reden); return; }
  renderGekoppeld(r.factuur);
  el('fact-koppel-zoek').value = '';
  el('fact-koppel-resultaten').innerHTML = '';
  renderFacturen();
}

function ontkoppelBoekingVanFactuur(txId) {
  const r = ontkoppelBetaling(koppelFactuurId, txId);
  if (!r.ok) { alert('Loskoppelen mislukt: ' + r.reden); return; }
  renderGekoppeld(r.factuur);
  renderFacturen();
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
