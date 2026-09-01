// voorraad.js — Voorraad: kerncijfers, groepen per tab en voorraad per jaar.

import { GBNM, PRIJS_COVER, esc, fmt, gbCode } from './helpers.js?v=20260902a';
import {
  STANDAARD_MIN_VOORRAAD, groepId, groepNaam, saveCoversData, saveGroepen, standaardGroep, state
} from './storage.js?v=20260902a';
import { maakSorteerbaar } from './tables.js?v=20260902a';
import { inkoopprijzenUitBank, prijsPerStuk, factorVan, heeftHandmatigePrijs, isHandelsvoorraad } from './belasting.js?v=20260902a';
import { saveCoverToSupabase, deleteFromSupabase, addToPendingQueue, syncAllesNaarSupabase } from './supabase-client-v2.js?v=20260902a';
import { downloadModelPdf } from './pdf.js?v=20260902a';

const el = id => document.getElementById(id);
const HUIDIG_JAAR = '2026';

/** Welke tab er open staat: 'alle' of een groep-id. */
let actieveTab = 'alle';

/** 'nu' toont de actuele voorraad; een jaartal toont de stand per 31 december. */
let gekozenJaar = '2025';

/** Heeft de bezoeker zelf een periode gekozen, of volgt de voorraad het boekjaar? */
let handmatigJaar = false;

/** Het boekjaar waarop we het laatst gesynchroniseerd hebben. */
let laatstGlobaalJaar = null;

/** Artikelen die zijn aangevinkt voor een bulkactie. */
const selectie = new Set();

/** De laatste verplaatsing of verwijdering, zodat die terug te draaien is. */
let laatsteActie = null;

// ------------------------------------------------------------------ rekenen

/** Verkoopprijs; Funny Covers hebben een vaste standaardprijs. */
function verkoopprijs(c) {
  if (c.prijs != null && c.prijs !== '') return Number(c.prijs);
  return c.categorie === 'covers' ? PRIJS_COVER : null;
}

function drempel(c) {
  return c.minVoorraad != null && c.minVoorraad !== '' ? Number(c.minVoorraad) : STANDAARD_MIN_VOORRAAD;
}

/**
 * De aantallen die bij de gekozen periode horen. In jaarmodus komt alles uit
 * `jaren`; is er voor dat jaar niets vastgelegd, dan blijft het leeg in plaats
 * van dat de app de huidige stand als historie presenteert.
 */
function standVan(c) {
  const jaren = c.jaren || {};
  if (gekozenJaar === 'nu') {
    const j = jaren[HUIDIG_JAAR] || {};
    return {
      voorraad: c.voorraad,
      inkoop: j.inkoop ?? c.inkoop ?? 0,
      verkocht: j.verkocht ?? c.verkoop ?? 0,
      retour: j.retour ?? 0,
      vastgelegd: true
    };
  }
  // Voor een afgesloten jaar komen alle cijfers uit dat jaar zelf: wat je toen
  // hebt ingekocht, verkocht en teruggekregen, en wat er op 31 december lag.
  const j = jaren[gekozenJaar] || {};
  return {
    voorraad: j.eind ?? null,
    inkoop: j.inkoop ?? 0,
    verkocht: j.verkocht ?? 0,
    retour: j.retour ?? 0,
    vastgelegd: j.eind != null
  };
}


/**
 * Inkoopprijzen die uit de bank af te leiden zijn: bedrag op de inkooprekening
 * gedeeld door het aantal ingekochte stuks. Wordt per render één keer berekend,
 * want het loopt over alle boekingen heen.
 */
let bankPrijzen = null;
function ververBankPrijzen() {
  try {
    bankPrijzen = inkoopprijzenUitBank([...state.HIST_TX, ...state.TX], state.COVERS);
  } catch (err) {
    console.warn('Inkoopprijzen uit bank niet beschikbaar:', err);
    bankPrijzen = null;
  }
}

/**
 * De inkoopprijs per stuk die we voor dit artikel gebruiken. Staat er een
 * bedrag bij het artikel, dan wint dat. Zo niet, dan leiden we hem af uit de
 * bankboekingen op de inkooprekening. Levert null op als geen van beide kan.
 */
function inkoopprijsVan(c) {
  const handmatig = Number(c.inkoopprijs);
  if (Number.isFinite(handmatig) && handmatig > 0) return handmatig;
  if (!bankPrijzen) return null;
  const jaar = gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar;
  const uitBank = Number(prijsPerStuk(c, bankPrijzen, jaar));
  return Number.isFinite(uitBank) && uitBank > 0 ? uitBank : null;
}

function waardeVan(c, stand) {
  if (stand.voorraad == null) return null;
  const prijs = inkoopprijsVan(c);
  if (prijs == null) return null;
  return stand.voorraad * prijs;
}

/** Wat de voorraad zou opbrengen als alles tegen de verkoopprijs weggaat. */
function verkoopwaardeVan(c, stand) {
  if (stand.voorraad == null) return null;
  const vk = verkoopprijs(c);
  if (vk == null || !(vk > 0)) return null;
  return stand.voorraad * vk;
}

function status(c, stand) {
  if (stand.voorraad == null) return 'onbekend';
  if (stand.voorraad <= 0) return 'uit';
  return stand.voorraad <= drempel(c) ? 'laag' : 'ok';
}

function artikelenVoorTab() {
  return actieveTab === 'alle' ? state.COVERS : state.COVERS.filter(c => c.categorie === actieveTab);
}

/** De boekjaren van de app, aangevuld met elk jaar waarvoor al iets vastligt. */
function bekendeJaren() {
  const jaren = new Set(['2022', '2023', '2024', '2025', '2026']);
  state.COVERS.forEach(c => Object.keys(c.jaren || {}).forEach(j => jaren.add(j)));
  return [...jaren].sort().reverse();
}

/** Voorraadwaarde van één jaar, over de artikelen van de open tab. */
function waardeVanJaar(lijst, jaar) {
  return lijst.reduce((som, c) => {
    const eind = (c.jaren || {})[jaar]?.eind;
    if (eind == null || c.inkoopprijs == null || c.inkoopprijs === '') return som;
    return som + eind * Number(c.inkoopprijs);
  }, 0);
}

/** Of er voor een jaar überhaupt iets is vastgelegd. */
function jaarIsVastgelegd(lijst, jaar) {
  return lijst.some(c => (c.jaren || {})[jaar]?.eind != null);
}

// -------------------------------------------------------------------- tabs

function renderTabs() {
  const tel = id => state.COVERS.filter(c => c.categorie === id).length;
  const tabs = [{ id: 'alle', naam: 'Overzicht', aantal: state.COVERS.length }]
    .concat(state.GROEPEN.map(g => ({ id: g.id, naam: g.naam, aantal: tel(g.id) })));

  el('voorraad-tabs').innerHTML = tabs.map(t => `
    <div class="vtab${t.id === actieveTab ? ' active' : ''}" onclick="kiesVoorraadTab('${esc(t.id)}')" role="tab"
         tabindex="0" aria-selected="${t.id === actieveTab}">
      ${esc(t.naam)} <span class="muted" style="font-size:11px">${t.aantal}</span>
    </div>`).join('')
    + `<div class="vtab vtab-actie" onclick="openGroepenModal()" title="Groepen beheren" tabindex="0">+ Groep</div>`;
}

export function kiesVoorraadTab(id) {
  actieveTab = id;
  selectie.clear();
  renderCovers();
}

function vulJaarKeuze() {
  const sel = el('f-voorraad-jaar');
  const opties = ['<option value="nu">Actuele voorraad</option>']
    .concat(bekendeJaren().map(j => `<option value="${j}">Stand eind ${j}</option>`));
  sel.innerHTML = opties.join('');
  sel.value = gekozenJaar;
}

export function kiesVoorraadJaar() {
  // Alleen de lokale keuze bijstellen. Vroeger werd state.huidigJaar hier
  // meegeschreven; dan kwam bij 'Actuele voorraad' de waarde 'nu' in het
  // globale boekjaar terecht, waar Bank en Grootboek niets mee kunnen.
  gekozenJaar = el('f-voorraad-jaar').value;
  handmatigJaar = true;
  selectie.clear();
  renderCovers();
}

function vulGroepKeuzes() {
  const opties = state.GROEPEN.map(g => `<option value="${esc(g.id)}">${esc(g.naam)}</option>`).join('');
  ['cv-cat', 'bulk-cat'].forEach(id => {
    const sel = el(id);
    if (!sel) return;
    const gekozen = sel.value;
    sel.innerHTML = opties;
    if (state.GROEPEN.some(g => g.id === gekozen)) sel.value = gekozen;
  });
}

// -------------------------------------------------------------- kerncijfers

function renderKerncijfers(lijst) {
  const standen = lijst.map(c => ({ c, s: standVan(c) }));
  const vastgelegd = standen.filter(x => x.s.voorraad != null);
  const stuks = vastgelegd.reduce((s, x) => s + x.s.voorraad, 0);
  const metPrijs = standen.filter(x => waardeVan(x.c, x.s) !== null);
  const waarde = metPrijs.reduce((s, x) => s + waardeVan(x.c, x.s), 0);
  const zonderPrijs = standen.filter(x => x.s.voorraad > 0 && waardeVan(x.c, x.s) === null).length;

  const metVk = standen.filter(x => verkoopwaardeVan(x.c, x.s) !== null);
  const verkoopwaarde = metVk.reduce((s, x) => s + verkoopwaardeVan(x.c, x.s), 0);
  const zonderVk = standen.filter(x => x.s.voorraad > 0 && verkoopwaardeVan(x.c, x.s) === null).length;

  const tabNaam = actieveTab === 'alle' ? 'alle groepen' : groepNaam(actieveTab);

  if (gekozenJaar === 'nu') {
    const laag = standen.filter(x => status(x.c, x.s) === 'laag').length;
    const uit = standen.filter(x => status(x.c, x.s) === 'uit').length;
    // Marge alleen over de artikelen waar we allebei de prijzen van kennen,
    // anders vergelijk je een volledige verkoopwaarde met een halve inkoop.
    const beide = standen.filter(x => waardeVan(x.c, x.s) !== null && verkoopwaardeVan(x.c, x.s) !== null);
    const inkoopBeide = beide.reduce((s, x) => s + waardeVan(x.c, x.s), 0);
    const verkoopBeide = beide.reduce((s, x) => s + verkoopwaardeVan(x.c, x.s), 0);
    const marge = verkoopBeide - inkoopBeide;
    const margePct = inkoopBeide > 0 ? Math.round(marge / verkoopBeide * 100) : null;

    el('voorraad-kpi').innerHTML = `
      <div class="kpi">
        <div class="kpi-lbl">Voorraadwaarde (inkoop)</div>
        <div class="kpi-val">${fmt(waarde)}</div>
        <div class="kpi-sub">${zonderPrijs > 0
          ? `${zonderPrijs} artikel${zonderPrijs === 1 ? '' : 'en'} zonder inkoopprijs`
          : `${tabNaam} · tegen inkoopprijs`}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Verkoopwaarde</div>
        <div class="kpi-val pos">${fmt(verkoopwaarde)}</div>
        <div class="kpi-sub">${zonderVk > 0
          ? `${zonderVk} artikel${zonderVk === 1 ? '' : 'en'} zonder verkoopprijs`
          : 'als alles verkocht wordt'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Verwachte marge</div>
        <div class="kpi-val ${marge >= 0 ? 'pos' : 'neg'}">${beide.length ? fmt(marge) : '—'}</div>
        <div class="kpi-sub">${beide.length
          ? `${margePct != null ? margePct + '% · ' : ''}over ${beide.length} artikel${beide.length === 1 ? '' : 'en'}`
          : 'nog geen prijzen bekend'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Aantal producten</div>
        <div class="kpi-val">${lijst.length}</div>
        <div class="kpi-sub">${stuks} stuks op voorraad</div>
      </div>
      <div class="kpi kpi--secondary">
        <div class="kpi-lbl">Lage voorraad</div>
        <div class="kpi-val ${laag > 0 ? 'neg' : ''}">${laag}</div>
        <div class="kpi-sub">${laag > 0 ? 'bijbestellen' : 'niets onder de drempel'}</div>
      </div>
      <div class="kpi kpi--secondary">
        <div class="kpi-lbl">Uitverkocht</div>
        <div class="kpi-val ${uit > 0 ? 'muted' : ''}">${uit}</div>
        <div class="kpi-sub">van ${lijst.length} artikelen</div>
      </div>`;
    return;
  }

  const verkocht = standen.reduce((s, x) => s + (x.s.verkocht || 0), 0);
  const vorig = String(Number(gekozenJaar) - 1);
  const vorigVast = jaarIsVastgelegd(lijst, vorig);
  const mutatie = waarde - waardeVanJaar(lijst, vorig);
  el('voorraad-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-lbl">Voorraadwaarde 31-12-${gekozenJaar}</div>
      <div class="kpi-val">${fmt(waarde)}</div>
      <div class="kpi-sub">${zonderPrijs > 0 ? `${zonderPrijs} artikel${zonderPrijs === 1 ? '' : 'en'} zonder inkoopprijs` : 'tegen inkoopprijs'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Vastgelegd</div>
      <div class="kpi-val">${vastgelegd.length}<span class="muted" style="font-size:15px"> / ${lijst.length}</span></div>
      <div class="kpi-sub">${stuks} stuks in voorraad</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Verkocht in ${gekozenJaar}</div>
      <div class="kpi-val">${verkocht}</div>
      <div class="kpi-sub">stuks</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Mutatie t.o.v. ${vorig}</div>
      <div class="kpi-val ${!vorigVast ? 'muted' : mutatie >= 0 ? 'pos' : 'neg'}">${vorigVast ? (mutatie >= 0 ? '+' : '–') + fmt(Math.abs(mutatie)) : '—'}</div>
      <div class="kpi-sub">${vorigVast
        ? (mutatie >= 0 ? 'voorraad gegroeid, drukt de winst' : 'voorraad geslonken, verhoogt de winst')
        : `stand eind ${vorig} nog niet vastgelegd`}</div>
    </div>`;
}

// -------------------------------------------------------------------- tabel

const STATUS_BADGE = {
  ok: '<span class="stock-ok">op voorraad</span>',
  laag: '<span class="badge badge-amber">lage voorraad</span>',
  uit: '<span class="stock-uit">uitverkocht</span>',
  onbekend: '<span class="badge badge-gray">niet vastgelegd</span>'
};

/**
 * De artikelen zoals ze nu op het scherm staan: de open tab, het statusfilter
 * en de zoekterm. De pdf gebruikt dezelfde lijst, zodat wat je afdrukt gelijk
 * is aan wat je ziet.
 */
function zichtbareArtikelen() {
  const statusFilter = el('f-covers-status') ? el('f-covers-status').value : '';
  const zoekterm = (el('voorraad-zoek') ? el('voorraad-zoek').value : '').trim().toLowerCase();
  let lijst = artikelenVoorTab();
  if (statusFilter) lijst = lijst.filter(c => status(c, standVan(c)) === statusFilter);
  if (zoekterm) lijst = lijst.filter(c => `${c.artikel} ${c.zoekterm || ''}`.toLowerCase().includes(zoekterm));
  return lijst;
}

/** Voorraadlijst als pdf, met de cijfers van het gekozen jaar. */
export function exporteerVoorraadPdf() {
  const jaarModus = gekozenJaar !== 'nu';
  const lijst = zichtbareArtikelen();
  const periode = jaarModus ? `stand per 31 december ${gekozenJaar}` : 'actuele voorraad';
  const tabNaam = actieveTab === 'alle' ? 'alle groepen' : groepNaam(actieveTab);

  // Samen 483 punten: precies de breedte tussen de marges op A4.
  const kolommen = [
    { kop: 'Artikel',     breedte: 138 },
    { kop: 'Groep',       breedte: 72 },
    { kop: 'Ingekocht',   breedte: 55, rechts: true },
    { kop: 'Verkocht',    breedte: 52, rechts: true },
    { kop: jaarModus ? 'Eind' : 'Voorraad', breedte: 50, rechts: true },
    { kop: 'Inkoopprijs', breedte: 60, rechts: true },
    { kop: 'Waarde',      breedte: 56, rechts: true }
  ];

  let totWaarde = 0, totStuks = 0, totIn = 0, totVer = 0;
  const rijen = lijst.map(c => {
    const stand = standVan(c);
    const ip = inkoopprijsVan(c);
    const waarde = waardeVan(c, stand);
    const stuks = stand.voorraad ?? 0;
    totStuks += stuks;
    totIn += stand.inkoop || 0;
    totVer += stand.verkocht || 0;
    if (waarde != null) totWaarde += waarde;
    return [
      c.artikel,
      groepNaam(c.categorie),
      String(stand.inkoop || 0),
      String(stand.verkocht || 0),
      stand.voorraad == null ? '\u2014' : String(stuks),
      ip == null ? '\u2014' : fmt(ip),
      waarde == null ? '\u2014' : fmt(waarde)
    ];
  });

  rijen.push({
    vet: true, streep: true,
    cellen: ['Totaal', `${lijst.length} artikelen`, String(totIn), String(totVer),
             String(totStuks), '', fmt(totWaarde)]
  });

  downloadModelPdf({
    titel: 'Voorraadoverzicht',
    ondertitel: `${periode} \u00b7 ${tabNaam} \u00b7 opgemaakt op ${vandaagNl()}`,
    blokken: [
      { type: 'tabel', kolommen, rijen },
      { type: 'voet', tekst: jaarModus
        ? `Ingekocht, verkocht en de eindstand gaan over boekjaar ${gekozenJaar}. De waarde is de eindstand maal de inkoopprijs per stuk. Een inkoopprijs die uit de bankboekingen is afgeleid kan afwijken van wat je per stuk hebt betaald.`
        : 'Dit is de actuele voorraad. Kies linksboven een boekjaar om de stand per 31 december van dat jaar af te drukken.' }
    ]
  }, jaarModus ? `Voorraad_${gekozenJaar}.pdf` : 'Voorraad_actueel.pdf');
}

/** Datum in de notatie die we ook op het scherm gebruiken. */
function vandaagNl() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export function renderCovers() {
  // De jaarkiezer rechtsboven is leidend. Wijzigt die, dan volgt de voorraad;
  // 'Alle jaren' heeft hier geen betekenis en wordt de actuele stand. Een
  // eigen keuze in de voorraadkiezer blijft staan tot het boekjaar wijzigt.
  if (state.huidigJaar !== laatstGlobaalJaar) {
    laatstGlobaalJaar = state.huidigJaar;
    handmatigJaar = false;
  }
  if (!handmatigJaar) {
    gekozenJaar = (!state.huidigJaar || state.huidigJaar === 'all') ? 'nu' : state.huidigJaar;
  }
  ververBankPrijzen();
  renderTabs();
  vulJaarKeuze();
  vulGroepKeuzes();
  renderMelding();

  const jaarModus = gekozenJaar !== 'nu';
  el('voorraad-jaarbalk').style.display = jaarModus ? 'flex' : 'none';
  if (jaarModus) {
    el('voorraad-jaar-tekst').innerHTML =
      `Je ziet de stand per <strong>31 december ${gekozenJaar}</strong>. Dit is wat je meeneemt naar ${Number(gekozenJaar) + 1} en wat als voorraad meetelt voor de aangifte.`;
    el('voorraad-vastleg-knop').textContent = `Huidige voorraad vastleggen als eind ${gekozenJaar}`;
  }
  el('voorraad-kop-aantal').textContent = jaarModus ? `Eind ${gekozenJaar}` : 'Voorraad';
  el('voorraad-kop-omzet').textContent = 'Verkoopwaarde';
  // De kolommen Ingekocht en Verkocht slaan in jaarweergave op dat boekjaar.
  const kopIn = el('voorraad-kop-ingekocht'), kopVer = el('voorraad-kop-verkocht');
  if (kopIn) kopIn.textContent = jaarModus ? `Ingekocht ${gekozenJaar}` : 'Ingekocht';
  if (kopVer) kopVer.textContent = jaarModus ? `Verkocht ${gekozenJaar}` : 'Verkocht';

  const statusFilter = el('f-covers-status') ? el('f-covers-status').value : '';
  const zoekterm = (el('voorraad-zoek') ? el('voorraad-zoek').value : '').trim().toLowerCase();

  const basis = artikelenVoorTab();
  renderKerncijfers(basis);
  renderWaardeDiagnose(basis);

  const lijst = zichtbareArtikelen();

  const toonGroep = actieveTab === 'alle';
  el('voorraad-cat-kop').style.display = toonGroep ? '' : 'none';

  el('covers-body').innerHTML = lijst.length
    ? lijst.map(c => {
        const stand = standVan(c);
        const vk = verkoopprijs(c);
        const ip = inkoopprijsVan(c);
        const handmatigeIp = Number(c.inkoopprijs) > 0;
        const waarde = waardeVan(c, stand);
        const verkoopwaarde = vk != null && stand.voorraad ? stand.voorraad * vk : null;
        const rechts = verkoopwaarde != null ? fmt(verkoopwaarde) : '—';
        return `<tr>
          <td class="cel-kies" style="padding-left:16px;width:34px"><input type="checkbox" data-artikel-id="${esc(c.id)}"${selectie.has(String(c.id)) ? ' checked' : ''}
            onchange="wisselVoorraadSelectie('${esc(c.id)}', this)" aria-label="Selecteer ${esc(c.artikel)}"></td>
          <td class="cel-naam" style="font-weight:${stand.voorraad > 0 ? 500 : 400}">${esc(c.artikel)}</td>
          ${toonGroep ? `<td class="muted" data-label="Groep">${esc(groepNaam(c.categorie))}</td>` : ''}
          <td style="text-align:right" data-label="Voorraad" data-v="${stand.voorraad ?? -1}">${stand.voorraad ?? '—'}</td>
          <td style="text-align:right" data-label="Inkoopprijs" data-v="${ip ?? -1}"${!handmatigeIp && ip != null ? ' title="Afgeleid uit de bankboekingen op de inkooprekening"' : ''}>${
            ip == null ? '<span class="muted">—</span>'
                       : `${fmt(ip)}${handmatigeIp ? '' : '<span class="muted" style="font-size:10px"> ~</span>'}`}</td>
          <td style="text-align:right" data-label="Waarde" data-v="${waarde ?? -1}">${waarde == null ? '<span class="muted">—</span>' : fmt(waarde)}</td>
          <td style="text-align:right" data-label="Verkoopprijs" data-v="${vk ?? -1}">${vk == null ? '<span class="muted">—</span>' : fmt(vk)}</td>
          <td style="text-align:right" data-label="Ingekocht" data-v="${stand.inkoop ?? -1}">${stand.inkoop || '—'}</td>
          <td style="text-align:right" data-label="Verkocht" data-v="${stand.verkocht ?? -1}">${stand.verkocht || '—'}</td>
          <td style="text-align:right" data-label="Verkoopwaarde" class="${verkoopwaarde ? 'pos' : ''}" data-v="${verkoopwaarde ?? -1}">${rechts}</td>
          <td class="cel-status" data-v="${status(c, stand)}">${STATUS_BADGE[status(c, stand)]}</td>
          <td class="cel-zoek">${c.zoekterm
            ? `<a href="https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(c.zoekterm)}" target="_blank" rel="noopener" style="font-size:11px;white-space:nowrap">Zoek op AliExpress</a>`
            : ''}</td>
          <td class="cel-acties" style="padding-right:16px;white-space:nowrap">
            <span class="sell-link" onclick="openCoverEdit('${esc(c.id)}')">Bewerk</span>
            <button class="icon-btn" onclick="verwijderArtikel('${esc(c.id)}')" title="Artikel verwijderen" aria-label="Verwijder ${esc(c.artikel)}" style="width:26px;height:26px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('')
    : `<tr data-geen-sort="1"><td colspan="${toonGroep ? 13 : 12}"><div class="empty">
        <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg></div>
        <div class="empty-title">${basis.length ? 'Geen artikelen binnen deze filters' : 'Nog geen artikelen in deze groep'}</div>
        <div class="empty-text">${basis.length
          ? 'Pas de zoekterm of het statusfilter aan.'
          : 'Voeg een artikel toe en kies deze productgroep, dan verschijnt het hier.'}</div>
        <button class="btn" onclick="openCoverModal()">Artikel toevoegen</button>
      </div></td></tr>`;

  renderBulkbalk();
  maakSorteerbaar(el('tbl-voorraad'));
}

// --------------------------------------------------------------- selecteren

export function wisselVoorraadSelectie(id, vinkje) {
  if (vinkje.checked) selectie.add(String(id)); else selectie.delete(String(id));
  renderBulkbalk();
}

/** Vinkt alles aan of uit wat op dit moment in de tabel staat. */
export function selecteerAlleVoorraad(vinkje) {
  document.querySelectorAll('#covers-body input[data-artikel-id]').forEach(v => {
    v.checked = vinkje.checked;
    const id = v.dataset.artikelId;
    if (vinkje.checked) selectie.add(id); else selectie.delete(id);
  });
  renderBulkbalk();
}

/**
 * Zet de geselecteerde artikelen in één keer op (of af van) handelsvoorraad.
 * Handig na een import: pas dan kan de inkoopprijs uit de bank komen.
 */
export async function zetHandelsvoorraadSelectie(aan = true) {
  const gekozen = state.COVERS.filter(c => selectie.has(String(c.id)));
  if (!gekozen.length) return;

  gekozen.forEach(c => {
    c.handelsvoorraad = !!aan;
    if (aan && !c.inkoopGb) c.inkoopGb = '7000';
  });
  saveCoversData();
  renderCovers();

  let ok = 0;
  for (const c of gekozen) {
    try {
      if (await saveCoverToSupabase(c)) ok++;
      else addToPendingQueue(c, 'cover', false);
    } catch (err) {
      console.warn(`Sync van ${c.artikel} faalde:`, err);
      addToPendingQueue(c, 'cover', false);
    }
  }
  console.log(`Handelsvoorraad ${aan ? 'aan' : 'uit'} voor ${gekozen.length} artikelen · ${ok} gesynct`);
}

/**
 * Als de voorraadwaarde nul is terwijl er wel voorraad ligt, laat dan zien
 * waar het op vastloopt: op de instelling, op de aantallen of op de bank.
 * Dat scheelt zoeken in de afzonderlijke artikelen.
 */
function renderWaardeDiagnose(lijst) {
  const doel = el('voorraad-diagnose');
  if (!doel) return;

  const standen = lijst.map(c => ({ c, s: standVan(c) }));
  const metVoorraad = standen.filter(x => x.s.voorraad > 0);
  const zonder = metVoorraad.filter(x => waardeVan(x.c, x.s) === null);

  if (!metVoorraad.length || !zonder.length) { doel.style.display = 'none'; return; }

  const jaar = gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar;
  const geenHandel = zonder.filter(x => x.c.handelsvoorraad === false).length;

  // Per inkooprekening: hoeveel stuks staan er, en hoeveel is er geboekt?
  const perRekening = {};
  for (const { c } of zonder) {
    if (c.handelsvoorraad === false) continue;
    const gb = gbCode(c.inkoopGb) || '7000';
    perRekening[gb] = perRekening[gb] || { stuks: 0, artikelen: 0, bedrag: 0 };
    perRekening[gb].artikelen++;
    perRekening[gb].stuks += Object.values(c.jaren || {}).reduce((s, j) => s + (Number(j?.inkoop) || 0), 0);
  }
  for (const t of [...state.HIST_TX, ...state.TX]) {
    if (t.type !== 'uitgave') continue;
    const gb = gbCode(t.gb);
    if (!perRekening[gb]) continue;
    if (String(t.datum || '').slice(0, 4) !== String(jaar)) continue;
    perRekening[gb].bedrag += Number(t.bedrag) || 0;
  }

  const regels = [];
  if (geenHandel) {
    regels.push(`<li><strong>${geenHandel}</strong> artikel${geenHandel === 1 ? '' : 'en'} staat op <em>handelsvoorraad: Nee</em>. Selecteer ze en gebruik de knop “Handelsvoorraad: Ja”.</li>`);
  }
  for (const [gb, v] of Object.entries(perRekening)) {
    if (!(v.stuks > 0)) {
      regels.push(`<li>Rekening <strong>${gb}</strong>: ${v.artikelen} artikel${v.artikelen === 1 ? '' : 'en'}, maar <strong>0 ingekochte stuks</strong> in ${jaar}. Importeer de Excel opnieuw of vul “Ingekocht totaal” in.</li>`);
    } else if (!(v.bedrag > 0)) {
      regels.push(`<li>Rekening <strong>${gb}</strong>: ${v.stuks} stuks ingekocht, maar <strong>geen uitgaven</strong> geboekt op ${gb} in ${jaar}. Controleer of je inkoopfacturen op deze rekening staan.</li>`);
    } else {
      regels.push(`<li>Rekening <strong>${gb}</strong>: ${fmt(v.bedrag)} over ${v.stuks} stuks — dat is ${fmt(v.bedrag / v.stuks)} per stuk. Verschijnt dit niet in de tabel, ververs dan de pagina.</li>`);
    }
  }

  doel.style.display = '';
  doel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">Waarom ${zonder.length} artikel${zonder.length === 1 ? '' : 'en'} nog geen inkoopprijs ${zonder.length === 1 ? 'heeft' : 'hebben'}</div>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${regels.join('')}</ul>`;
}

// ===== INKOOPVERDELING =====

/** Tijdelijke factoren tijdens het bewerken; pas bij Opslaan gaan ze naar de artikelen. */
let conceptFactoren = {};

/** Alle artikelen die meedoen in de bankverdeling, gegroepeerd per inkooprekening. */
function verdelingsPool() {
  const perRekening = {};
  for (const c of state.COVERS) {
    if (!isHandelsvoorraad(c) || heeftHandmatigePrijs(c)) continue;
    const stuks = Object.values(c.jaren || {}).reduce((s, j) => s + (Number(j?.inkoop) || 0), 0);
    if (!(stuks > 0)) continue;
    const gb = gbCode(c.inkoopGb) || '7000';
    (perRekening[gb] = perRekening[gb] || []).push({ c, stuks });
  }
  return perRekening;
}

export function openVerdeling() {
  conceptFactoren = {};
  state.COVERS.forEach(c => { conceptFactoren[c.id] = factorVan(c); });
  tekenVerdeling();
  el('modal-verdeling').classList.add('open');
}

export function sluitVerdeling() {
  el('modal-verdeling').classList.remove('open');
}

export function herstelVerdeling() {
  Object.keys(conceptFactoren).forEach(id => { conceptFactoren[id] = 1; });
  tekenVerdeling();
}

/** Wordt aangeroepen bij elke toetsaanslag in een factorveld. */
export function wijzigFactor(id, waarde) {
  const f = parseFloat(String(waarde).replace(',', '.'));
  conceptFactoren[id] = Number.isFinite(f) && f > 0 ? f : 1;
  tekenVerdeling(String(id));
}

function tekenVerdeling(behoudFocus) {
  const doel = el('verdeling-rekeningen');
  if (!doel) return;

  const pool = verdelingsPool();
  const jaar = gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar;
  const rekeningen = Object.keys(pool).sort();

  if (!rekeningen.length) {
    doel.innerHTML = `<div class="empty" style="padding:22px">Geen artikelen om te verdelen. Dit gebeurt als er nog geen ingekochte stuks bekend zijn, of als alle artikelen al een eigen inkoopprijs hebben.</div>`;
    return;
  }

  // Bankbedrag per rekening, over alle jaren
  const bedragPer = {};
  for (const t of [...state.HIST_TX, ...state.TX]) {
    if (t.type !== 'uitgave') continue;
    const gb = gbCode(t.gb);
    if (!pool[gb]) continue;
    bedragPer[gb] = (bedragPer[gb] || 0) + (Number(t.bedrag) || 0);
  }

  doel.innerHTML = rekeningen.map(gb => {
    const rijen = pool[gb];
    const bedrag = bedragPer[gb] || 0;
    const gewogen = rijen.reduce((s, r) => s + conceptFactoren[r.c.id] * r.stuks, 0);
    const basis = gewogen > 0 && bedrag > 0 ? bedrag / gewogen : 0;
    const totaalStuks = rijen.reduce((s, r) => s + r.stuks, 0);
    const controle = rijen.reduce((s, r) => s + basis * conceptFactoren[r.c.id] * r.stuks, 0);

    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 11px;background:var(--bg-subtle-layer);border-radius:6px;margin-bottom:8px">
          <div><strong>${esc(gb)} — ${esc(GBNM[gb] || 'Inkoop')}</strong>
            <span style="color:var(--text-secondary);font-size:11.5px"> · ${rijen.length} artikelen · ${totaalStuks} stuks</span></div>
          <div style="text-align:right">
            <div style="font-weight:600">${fmt(bedrag)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">basisprijs ${fmt(basis)} per stuk</div>
          </div>
        </div>
        <div style="max-height:320px;overflow:auto">
        <table class="tbl-compact" style="width:100%">
          <thead><tr>
            <th>Artikel</th>
            <th style="text-align:right;width:70px">Stuks</th>
            <th style="text-align:right;width:96px">Factor</th>
            <th style="text-align:right;width:96px">Prijs/stuk</th>
            <th style="text-align:right;width:104px">Totaal</th>
          </tr></thead>
          <tbody>${rijen.map(r => {
            const f = conceptFactoren[r.c.id];
            const prijs = basis * f;
            return `<tr>
              <td>${esc(r.c.artikel)}</td>
              <td style="text-align:right">${r.stuks}</td>
              <td style="text-align:right"><input type="text" inputmode="decimal" value="${f}"
                  data-factor-id="${esc(r.c.id)}"
                  oninput="wijzigFactor('${esc(r.c.id)}', this.value)"
                  style="width:74px;text-align:right;padding:3px 6px;font-size:12px"></td>
              <td style="text-align:right${Math.abs(f - 1) > 0.001 ? ';font-weight:600' : ''}">${fmt(prijs)}</td>
              <td style="text-align:right;color:var(--text-secondary)">${fmt(prijs * r.stuks)}</td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr style="border-top:2px solid var(--border-default)">
            <td colspan="4" style="text-align:right;font-weight:600">Samen</td>
            <td style="text-align:right;font-weight:600;color:${Math.abs(controle - bedrag) < 0.02 ? 'var(--semantic-success-bright)' : 'var(--semantic-danger-bright)'}">${fmt(controle)}</td>
          </tr></tfoot>
        </table>
        </div>
      </div>`;
  }).join('');

  // Cursor terugzetten in het veld waar getypt werd
  if (behoudFocus) {
    const veld = doel.querySelector(`[data-factor-id="${CSS.escape(behoudFocus)}"]`);
    if (veld) { veld.focus(); veld.setSelectionRange(veld.value.length, veld.value.length); }
  }
}

export async function bewaarVerdeling() {
  const gewijzigd = [];
  for (const c of state.COVERS) {
    const nieuw = conceptFactoren[c.id];
    if (nieuw == null) continue;
    if (factorVan(c) !== nieuw) { c.prijsFactor = nieuw; gewijzigd.push(c); }
  }
  saveCoversData();
  sluitVerdeling();
  renderCovers();

  if (!gewijzigd.length) return;
  console.log(`📤 ${gewijzigd.length} factoren opslaan naar Supabase...`);
  for (const c of gewijzigd) {
    try {
      if (!await saveCoverToSupabase(c)) addToPendingQueue(c, 'cover', false);
    } catch (err) {
      console.warn(`Sync van ${c.artikel} faalde:`, err);
      addToPendingQueue(c, 'cover', false);
    }
  }
}

// ===== VOORRAAD NAAR CLOUD =====

export function openVoorraadSyncModal() {
  const doel = el('voorraad-sync-groepen');
  const status = el('voorraad-sync-status');
  if (status) status.textContent = '';

  const aantallen = {
    boekingen: (state.TX?.length || 0) + (state.HIST_TX?.length || 0),
    voorraad: state.COVERS?.length || 0,
    hnvi: state.HNVI_LOTS?.length || 0
  };
  const mv = (n, enkel, meer) => `${n} ${n === 1 ? enkel : meer}`;
  const regel = (sleutel, naam, aantal, eenheid) => `
    <label style="display:flex;align-items:center;gap:9px;padding:8px 2px;cursor:pointer">
      <input type="checkbox" class="vs-soort" value="${sleutel}" checked${aantal ? '' : ' disabled'}>
      <span${aantal ? '' : ' style="opacity:.5"'}>${naam}</span>
      <span style="color:var(--text-secondary);font-size:11.5px">${eenheid}</span>
    </label>`;

  doel.innerHTML =
    regel('boekingen', 'Boekingen', aantallen.boekingen, mv(aantallen.boekingen, 'boeking', 'boekingen')) +
    regel('voorraad', 'Voorraadartikelen', aantallen.voorraad, mv(aantallen.voorraad, 'artikel', 'artikelen')) +
    regel('hnvi', 'HNVI-loten', aantallen.hnvi, mv(aantallen.hnvi, 'lot', 'loten'));

  el('modal-voorraad-sync').classList.add('open');
}

export function sluitVoorraadSyncModal() {
  el('modal-voorraad-sync').classList.remove('open');
}

export async function startVoorraadSync() {
  const gekozen = new Set([...document.querySelectorAll('.vs-soort:checked')].map(i => i.value));
  const status = el('voorraad-sync-status');
  const knop = el('voorraad-sync-knop');

  if (!gekozen.size) { status.textContent = 'Niets geselecteerd.'; return; }

  knop.disabled = true;
  status.textContent = 'Bezig…';

  const uitkomst = await syncAllesNaarSupabase(
    { TX: state.TX, HIST_TX: state.HIST_TX, COVERS: state.COVERS, HNVI_LOTS: state.HNVI_LOTS },
    { boekingen: gekozen.has('boekingen'), voorraad: gekozen.has('voorraad'), hnvi: gekozen.has('hnvi') },
    (label, gedaan, totaal) => { status.textContent = `${label}: ${gedaan} van ${totaal}…`; }
  );

  knop.disabled = false;

  if (uitkomst.fout) {
    status.innerHTML = `<span style="color:var(--semantic-danger-bright)">${esc(uitkomst.fout)}</span>`;
    return;
  }

  const regels = [];
  let mislukt = 0;
  for (const [sleutel, naam] of [['boekingen', 'Boekingen'], ['voorraad', 'Voorraad'], ['hnvi', 'HNVI-loten']]) {
    const r = uitkomst[sleutel];
    if (!r) continue;
    mislukt += r.mislukt;
    regels.push(`${naam}: ${r.ok} verstuurd${r.mislukt ? `, ${r.mislukt} mislukt` : ''}`);
  }
  const kleur = mislukt ? 'var(--semantic-warning-bright)' : 'var(--semantic-success-bright)';
  status.innerHTML = `<span style="color:${kleur}">${regels.join('<br>')}</span>`;
  console.log('Alles naar cloud:', uitkomst);
}

function renderBulkbalk() {
  const balk = el('voorraad-bulk');
  const n = selectie.size;
  balk.style.display = n ? 'flex' : 'none';
  if (n) el('bulk-aantal').textContent = `${n} artikel${n === 1 ? '' : 'en'} geselecteerd`;
  const alles = el('voorraad-check-all');
  const zichtbaar = document.querySelectorAll('#covers-body input[data-artikel-id]').length;
  if (alles) {
    alles.checked = zichtbaar > 0 && n >= zichtbaar;
    alles.indeterminate = n > 0 && n < zichtbaar;
  }
}

export function wisVoorraadSelectie() {
  selectie.clear();
  renderCovers();
}

// ------------------------------------------------------ verplaatsen en wissen

export function verplaatsVoorraadSelectie() {
  const doel = el('bulk-cat').value;
  if (!doel || !selectie.size) return;

  laatsteActie = {
    soort: 'verplaats',
    naar: doel,
    aantal: selectie.size,
    vorige: state.COVERS.filter(c => selectie.has(String(c.id))).map(c => ({ id: c.id, categorie: c.categorie }))
  };

  state.COVERS = state.COVERS.map(c => (selectie.has(String(c.id)) ? { ...c, categorie: doel } : c));
  saveCoversData();
  selectie.clear();
  renderCovers();
}

export async function verwijderArtikel(id) {
  const c = state.COVERS.find(x => String(x.id) === String(id));
  if (!c) return;
  if (!window.confirm(`"${c.artikel}" verwijderen uit de voorraad?`)) return;
  bewaarVerwijdering([c]);
  state.COVERS = state.COVERS.filter(x => String(x.id) !== String(id));
  selectie.delete(String(id));
  saveCoversData();
  
  // Naar Supabase sturen
  try {
    const ok = await deleteFromSupabase(c.id, 'cover');
    if (!ok) addToPendingQueue(c, 'delete', false);
  } catch (err) {
    console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
    addToPendingQueue(c, 'delete', false);
  }
  
  renderCovers();
}

export async function verwijderVoorraadSelectie() {
  if (!selectie.size) return;
  const weg = state.COVERS.filter(c => selectie.has(String(c.id)));
  const n = weg.length;
  if (!window.confirm(`${n} artikel${n === 1 ? '' : 'en'} verwijderen uit de voorraad?`)) return;
  bewaarVerwijdering(weg);
  state.COVERS = state.COVERS.filter(c => !selectie.has(String(c.id)));
  selectie.clear();
  saveCoversData();
  
  // Elk artikel naar Supabase sturen
  for (const artikel of weg) {
    try {
      const ok = await deleteFromSupabase(artikel.id, 'cover');
      if (!ok) addToPendingQueue(artikel, 'delete', false);
    } catch (err) {
      console.warn('Supabase niet bereikbaar voor artikel, in wachtrij gezet:', err);
      addToPendingQueue(artikel, 'delete', false);
    }
  }
  
  renderCovers();
}

function bewaarVerwijdering(artikelen) {
  // De volledige regels bewaren, niet alleen de id's: alleen zo is een
  // verwijdering echt terug te draaien.
  laatsteActie = { soort: 'verwijder', aantal: artikelen.length, artikelen: artikelen.map(c => ({ ...c })) };
}

export function draaiActieTerug() {
  if (!laatsteActie) return;
  if (laatsteActie.soort === 'verplaats') {
    const terug = new Map(laatsteActie.vorige.map(v => [String(v.id), v.categorie]));
    state.COVERS = state.COVERS.map(c =>
      terug.has(String(c.id)) ? { ...c, categorie: terug.get(String(c.id)) } : c);
  } else {
    const bestaand = new Set(state.COVERS.map(c => String(c.id)));
    state.COVERS = [...state.COVERS, ...laatsteActie.artikelen.filter(c => !bestaand.has(String(c.id)))];
  }
  saveCoversData();
  laatsteActie = null;
  renderCovers();
}

function renderMelding() {
  const vak = el('voorraad-melding');
  if (!laatsteActie) { vak.style.display = 'none'; vak.innerHTML = ''; return; }
  const { soort, aantal } = laatsteActie;
  const tekst = soort === 'verplaats'
    ? `${aantal} artikel${aantal === 1 ? '' : 'en'} verplaatst naar ${esc(groepNaam(laatsteActie.naar))}.`
    : `${aantal} artikel${aantal === 1 ? '' : 'en'} verwijderd.`;
  vak.style.display = 'flex';
  vak.innerHTML = `<span>${tekst}</span><button class="btn btn-sm" onclick="draaiActieTerug()">Ongedaan maken</button>`;
}

// ------------------------------------------------------------- jaarafsluiting

/** Zet de huidige voorraad vast als eindstand van het gekozen jaar. */
export function legVoorraadVast() {
  if (gekozenJaar === 'nu') return;
  const lijst = artikelenVoorTab();
  const al = lijst.filter(c => (c.jaren || {})[gekozenJaar]?.eind != null).length;
  const vraag = al > 0
    ? `Van ${al} artikel${al === 1 ? '' : 'en'} is de stand voor ${gekozenJaar} al vastgelegd. Overschrijven met de huidige voorraad?`
    : `De huidige voorraad van ${lijst.length} artikel${lijst.length === 1 ? '' : 'en'} vastleggen als stand per 31-12-${gekozenJaar}?`;
  if (!window.confirm(vraag)) return;

  const ids = new Set(lijst.map(c => String(c.id)));
  state.COVERS = state.COVERS.map(c => ids.has(String(c.id))
    ? { ...c, jaren: { ...(c.jaren || {}), [gekozenJaar]: { eind: c.voorraad, verkocht: (c.jaren || {})[gekozenJaar]?.verkocht ?? null } } }
    : c);
  saveCoversData();
  renderCovers();
}

// ------------------------------------------------------------ groepenbeheer

export function openGroepenModal() {
  renderGroepenLijst();
  el('groep-nieuw').value = '';
  el('groep-fout').textContent = '';
  el('modal-groepen').classList.add('open');
  el('groep-nieuw').focus();
}

export function sluitGroepenModal() { el('modal-groepen').classList.remove('open'); }

function renderGroepenLijst() {
  const tel = id => state.COVERS.filter(c => c.categorie === id).length;
  el('groepen-lijst').innerHTML = state.GROEPEN.map(g => `
    <div class="groep-rij">
      <input type="text" value="${esc(g.naam)}" data-groep-id="${esc(g.id)}" aria-label="Naam van ${esc(g.naam)}">
      <span class="muted" style="font-size:11px;white-space:nowrap">${tel(g.id)} artikelen</span>
      <button class="icon-btn" onclick="verwijderGroep('${esc(g.id)}')" title="Groep verwijderen" aria-label="Verwijder ${esc(g.naam)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`).join('');
}

export function voegGroepToe() {
  const naam = el('groep-nieuw').value.trim();
  if (!naam) { el('groep-nieuw').focus(); return; }
  if (state.GROEPEN.some(g => g.naam.toLowerCase() === naam.toLowerCase())) {
    el('groep-fout').textContent = `Er bestaat al een groep "${naam}".`;
    return;
  }
  el('groep-fout').textContent = '';
  state.GROEPEN.push({ id: groepId(naam), naam });
  saveGroepen();
  el('groep-nieuw').value = '';
  renderGroepenLijst();
  renderCovers();
}

export function verwijderGroep(id) {
  if (state.GROEPEN.length <= 1) {
    el('groep-fout').textContent = 'De laatste groep kan niet weg.';
    return;
  }
  const aantal = state.COVERS.filter(c => c.categorie === id).length;
  const doel = state.GROEPEN.find(g => g.id !== id).id;
  if (aantal && !window.confirm(`${aantal} artikel${aantal === 1 ? '' : 'en'} staan in "${groepNaam(id)}". Die gaan naar "${groepNaam(doel)}". Doorgaan?`)) return;

  state.GROEPEN = state.GROEPEN.filter(g => g.id !== id);
  state.COVERS = state.COVERS.map(c => (c.categorie === id ? { ...c, categorie: doel } : c));
  if (actieveTab === id) actieveTab = 'alle';
  saveGroepen();
  saveCoversData();
  el('groep-fout').textContent = '';
  renderGroepenLijst();
  renderCovers();
}

export function bewaarGroepen() {
  el('groepen-lijst').querySelectorAll('input[data-groep-id]').forEach(inp => {
    const naam = inp.value.trim();
    if (!naam) return;
    const g = state.GROEPEN.find(x => x.id === inp.dataset.groepId);
    if (g) g.naam = naam;
  });
  saveGroepen();
  sluitGroepenModal();
  renderCovers();
}

// ------------------------------------------------------------- artikelmodal

const VELDEN = ['cv-naam','cv-cat','cv-ink','cv-vk','cv-vrd','cv-26','cv-zoek','cv-prijs','cv-inkoopprijs','cv-min','cv-jaar-eind'];

/** Keuzevelden hebben een zinnige standaard in plaats van leeg. */
function zetKeuzeStandaarden() {
  el('cv-handelsvoorraad').value = 'ja';
  el('cv-inkoop-gb').value = '7000';
  if (el('cv-factor')) el('cv-factor').value = '1';
}

/** Het jaar waarvoor de modal de eindstand toont. */
function modalJaar() { return gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar; }

function zetJaarLabels() {
  const j = modalJaar();
  el('cv-jaar-eind-label').textContent = `Eindvoorraad 31-12-${j}`;
  el('cv-26-label').textContent = `Verkocht in ${j} (stuks)`;
}

export function openCoverModal() {
  state.editCoverId = null;
  el('cover-modal-title').textContent = 'Artikel toevoegen';
  VELDEN.forEach(id => { if (el(id)) el(id).value = ''; });
  zetJaarLabels();
  el('cv-cat').value = actieveTab === 'alle' ? standaardGroep() : actieveTab;
  zetKeuzeStandaarden();
  if (el('cv-inkoopprijs-hint')) el('cv-inkoopprijs-hint').textContent = '';
  el('modal-cover').classList.add('open');
  el('cv-naam').focus();
}

/**
 * Legt uit wat de bank voor dit artikel kan afleiden. Geeft een korte tekst
 * terug voor onder het inkoopprijs-veld, zodat zichtbaar is waarom er wel of
 * geen prijs uit de bank komt in plaats van een stil streepje.
 */
function bankPrijsUitleg({ handelsvoorraad, inkoopGb, jaren, inkoopprijs }) {
  const handmatig = Number(inkoopprijs);
  if (Number.isFinite(handmatig) && handmatig > 0) {
    return { kleur: 'var(--text-secondary)', tekst: `Je vult hier zelf ${fmt(handmatig)} in. Maak het veld leeg om de bank te gebruiken.` };
  }
  if (handelsvoorraad === false) {
    return {
      kleur: 'var(--semantic-warning-bright)',
      tekst: 'Geen bankprijs: "Telt mee als handelsvoorraad" staat op Nee. De inkoop is dan meteen kosten, dus er wordt geen voorraadwaarde per stuk berekend. Zet dit op Ja voor een prijs uit de bank.'
    };
  }
  const gb = String(inkoopGb || '7000');
  if (gb !== '7000' && gb !== '7020') {
    return { kleur: 'var(--semantic-warning-bright)', tekst: `Geen bankprijs: rekening ${gb} telt niet als handelsvoorraad.` };
  }

  const stuks = Object.values(jaren || {}).reduce((s, j) => s + (Number(j?.inkoop) || 0), 0);
  if (!(stuks > 0)) {
    return {
      kleur: 'var(--semantic-warning-bright)',
      tekst: `Geen bankprijs: er staan 0 ingekochte stuks op ${gb}. De app deelt het bankbedrag door het aantal stuks, dus vul "Ingekocht totaal" in of importeer de Excel opnieuw.`
    };
  }

  const prijs = Number(prijsPerStuk({ handelsvoorraad, inkoopGb: gb, jaren, inkoopprijs: null },
    bankPrijzen, gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar));
  if (!(prijs > 0)) {
    return {
      kleur: 'var(--semantic-warning-bright)',
      tekst: `Geen bankprijs: wel ${stuks} stuks, maar geen uitgaven geboekt op rekening ${gb}. Boek de inkoopfactuur op ${gb}, dan verschijnt de prijs vanzelf.`
    };
  }
  return {
    kleur: 'var(--semantic-success-bright)',
    tekst: `Uit de bank: ${fmt(prijs)} per stuk — het bedrag op ${gb} gedeeld door ${stuks} ingekochte stuks. Laat leeg om dit te blijven volgen.`
  };
}

/** Ververst het hintregeltje onder het inkoopprijs-veld in de bewerk-modal. */
function ververInkoopprijsHint() {
  const doel = el('cv-inkoopprijs-hint');
  if (!doel) return;
  const c = state.COVERS.find(x => String(x.id) === String(state.editCoverId));
  const { kleur, tekst } = bankPrijsUitleg({
    handelsvoorraad: el('cv-handelsvoorraad')?.value === 'nee' ? false : true,
    inkoopGb: el('cv-inkoop-gb')?.value || '7000',
    prijsFactor: (() => { const f = parseFloat(String(el('cv-factor')?.value ?? '').replace(',', '.')); return Number.isFinite(f) && f > 0 ? f : 1; })(),
    jaren: c?.jaren || {},
    inkoopprijs: el('cv-inkoopprijs')?.value
  });
  doel.style.color = kleur;
  doel.textContent = tekst;
}

export function openCoverEdit(id) {
  const c = state.COVERS.find(x => String(x.id) === String(id));
  if (!c) return;
  state.editCoverId = c.id;
  const j = modalJaar();
  zetJaarLabels();
  el('cover-modal-title').textContent = 'Artikel bewerken';
  el('cv-naam').value = c.artikel;
  el('cv-cat').value = c.categorie || standaardGroep();
  el('cv-ink').value = c.inkoop;
  el('cv-vk').value = c.verkoop;
  el('cv-vrd').value = c.voorraad;
  el('cv-26').value = (c.jaren || {})[j]?.verkocht ?? (j === HUIDIG_JAAR ? c.omzet2026 ?? '' : '');
  el('cv-jaar-eind').value = (c.jaren || {})[j]?.eind ?? '';
  el('cv-zoek').value = c.zoekterm || '';
  el('cv-prijs').value = c.prijs ?? '';
  el('cv-inkoopprijs').value = c.inkoopprijs ?? '';
  el('cv-min').value = c.minVoorraad ?? '';
  el('cv-handelsvoorraad').value = c.handelsvoorraad === false ? 'nee' : 'ja';
  el('cv-inkoop-gb').value = c.inkoopGb || '7000';
  if (el('cv-factor')) el('cv-factor').value = factorVan(c);
  el('modal-cover').classList.add('open');
  
  // Event listener: auto-bereken eindstand
  const berekenEindstand = () => {
    const jVorig = String(Number(j) - 1);
    const beginVoorraad = c.jaren?.[jVorig]?.eind ?? 0;
    const inkoopDitJaar = c.jaren?.[j]?.inkoop ?? 0;
    const verkochtDitJaar = getal('cv-26');
    
    if (verkochtDitJaar != null) {
      const einde = beginVoorraad + inkoopDitJaar - (verkochtDitJaar || 0);
      el('cv-jaar-eind').value = einde;
    }
  };
  
  el('cv-26').removeEventListener('input', berekenEindstand);
  el('cv-26').addEventListener('input', berekenEindstand);

  // De hint moet meebewegen met de velden waar hij van afhangt.
  ververBankPrijzen();
  ververInkoopprijsHint();
  ['cv-handelsvoorraad', 'cv-inkoop-gb', 'cv-inkoopprijs', 'cv-ink'].forEach(veld => {
    const node = el(veld);
    if (!node) return;
    node.removeEventListener('change', ververInkoopprijsHint);
    node.removeEventListener('input', ververInkoopprijsHint);
    node.addEventListener('change', ververInkoopprijsHint);
    node.addEventListener('input', ververInkoopprijsHint);
  });
}

export function closeCoverModal() { el('modal-cover').classList.remove('open'); }

/** Leest een veld uit; leeg blijft leeg (null), niet nul. */
const getal = (id, decimalen) => {
  const ruw = el(id).value.trim();
  if (ruw === '') return null;
  const n = decimalen ? parseFloat(ruw.replace(',', '.')) : parseInt(ruw, 10);
  return isNaN(n) ? null : n;
};

export async function saveCover() {
  const naam = el('cv-naam').value.trim();
  if (!naam) { el('cv-naam').focus(); return; }

  const bestaand = state.COVERS.find(c => c.id === state.editCoverId);
  const j = modalJaar();
  
  // Dit jaar's aantallen
  const verkochtDitJaar = getal('cv-26');        // verkocht in dit boekjaar
  const eindIngevoerd = getal('cv-jaar-eind');   // eindstand 31-12

  // Auto-bereken eindstand voor dit jaar
  // Eindstand = Begin + Ingekocht - Verkocht
  // Begin = eindstand vorig jaar
  let eindEindstand = eindIngevoerd;
  if (verkochtDitJaar != null) {
    const jVorig = String(Number(j) - 1);
    const beginVoorraad = bestaand?.jaren?.[jVorig]?.eind ?? 0;
    const inkoopDitJaar = bestaand?.jaren?.[j]?.inkoop ?? 0;
    eindEindstand = beginVoorraad + inkoopDitJaar - (verkochtDitJaar || 0);
  }

  // Sla op in jaren
  const jaren = { ...(bestaand?.jaren || {}) };
  if (verkochtDitJaar != null || eindEindstand != null) {
    jaren[j] = {
      ...(jaren[j] || {}),
      eind: eindEindstand,
      verkocht: verkochtDitJaar ?? jaren[j]?.verkocht
    };
  } else {
    delete jaren[j];
  }

  const obj = {
    id: state.editCoverId || state.nxtCover++,
    artikel: naam,
    categorie: el('cv-cat').value || standaardGroep(),
    inkoop: getal('cv-ink') ?? 0,
    verkoop: getal('cv-vk') ?? 0,
    voorraad: getal('cv-vrd') ?? 0,
    omzet2026: j === HUIDIG_JAAR ? (verkochtDitJaar ?? 0) : (bestaand?.omzet2026 ?? 0),
    zoekterm: el('cv-zoek').value.trim(),
    prijs: getal('cv-prijs', true),
    inkoopprijs: getal('cv-inkoopprijs', true),
    minVoorraad: getal('cv-min'),
    handelsvoorraad: el('cv-handelsvoorraad').value !== 'nee',
    inkoopGb: el('cv-inkoop-gb').value || '7000',
    prijsFactor: (() => { const f = parseFloat(String(el('cv-factor')?.value ?? '').replace(',', '.')); return Number.isFinite(f) && f > 0 ? f : 1; })(),
    jaren
  };

  if (state.editCoverId) state.COVERS = state.COVERS.map(c => (c.id === state.editCoverId ? obj : c));
  else state.COVERS.push(obj);

  saveCoversData();
  
  // Naar Supabase sturen
  try {
    const ok = await saveCoverToSupabase(obj);
    if (!ok) addToPendingQueue(obj, 'cover', false);
  } catch (err) {
    console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
    addToPendingQueue(obj, 'cover', false);
  }
  
  closeCoverModal();
  renderCovers();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORT VOORRAAD UIT EXCEL (2022-2026)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function openImportModalVoorraad() {
  const modal = el('modal-import-voorraad');
  if (modal) modal.classList.add('open');
  el('import-file-input').click();
}

export function sluitImportModal() {
  const modal = el('modal-import-voorraad');
  if (modal) modal.classList.remove('open');
}

/**
 * Voegt jaargegevens samen zonder eerder ingelezen velden weg te gooien.
 * Elk Excel-bestand levert alleen voor zijn eigen boekjaar de inkoop- en
 * verkoopaantallen; voor de andere jaren staat er enkel een eindstand. Een
 * gewone Object.assign zou dat rijkere jaar overschrijven met het armere.
 */
function voegJaarSamen(doel, bron) {
  for (const [jaar, waarden] of Object.entries(bron)) {
    const bestaand = doel[jaar] || {};
    for (const [veld, waarde] of Object.entries(waarden)) {
      if (waarde !== undefined && waarde !== null) bestaand[veld] = waarde;
    }
    doel[jaar] = bestaand;
  }
  return doel;
}

export async function handleImportVoorraad(event) {
  const files = event.target.files;
  if (!files.length) return;

  const status = el('import-status');
  status.innerHTML = '⏳ Inlezen...';

  try {
    // Lees alle Excel-bestanden
    const alleArtikelenNieuw = {};

    for (const file of files) {
      const data = await file.arrayBuffer();
      const wb = window.XLSX.read(data);
      
      // Zoek Voorraad sheet
      const sheetNaam = wb.SheetNames.find(s => 
        s.toLowerCase().includes('voorraad') && s.toLowerCase().includes('mutatie')
      );
      
      if (!sheetNaam) {
        console.warn(`${file.name}: geen Voorraad & Mutaties sheet`);
        status.innerHTML += `<br>⚠️ ${file.name}: geen Voorraad sheet`;
        continue;
      }

      const ws = wb.Sheets[sheetNaam];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      
      if (rows.length < 3) continue;

      // Vind header rij
      let headerRow = 1;
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        if (rows[r][0] === 'Artikel') {
          headerRow = r;
          break;
        }
      }

      const header = rows[headerRow] || [];
      const colPrijs = 13;   // rechterblok: Prijs (€)
      const colInkoop = 7;   // mutatieblok: 📦 Inkoop
      const colVerkoop = 8;  // mutatieblok: 🛒 Verkoop

      // Jaarkolommen staan rechts van de prijs. Excel levert ze soms als getal
      // (2022) en soms als 2022.0, dus we knippen de decimalen eraf.
      const jaarKolommen = {};
      for (let c = colPrijs + 1; c < header.length; c++) {
        const h = String(header[c] ?? '').trim().replace(/\.0+$/, '');
        if (/^20\d\d$/.test(h)) jaarKolommen[h] = c;
      }

      // Elk bestand is één boekjaar. De inkoop- en verkoopaantallen in het
      // mutatieblok horen bij dat jaar, en dat is het hoogste jaartal in de kop.
      const bestandsJaar = Object.keys(jaarKolommen).sort().pop();

      const getal = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };

      // Lees artikelen
      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row[0] || row[0] === '') continue;   // lege regel: overslaan, niet stoppen
        
        const artikel = String(row[0]).trim();
        // Tussentotalen en scheidingsregels zijn geen artikelen. Ze staan midden
        // in het blad ("Totaal Hoezen", "Totaal Mini beeldjes"), dus we slaan ze
        // over en lopen door — stoppen zou de helft van de lijst missen.
        if (!artikel || artikel.toLowerCase().includes('totaal') || artikel === '-') continue;
        if (/^[\s—–]*$/.test(artikel)) continue;

        const prijs = parseFloat(row[colPrijs]) || 0;
        const jaren = {};

        // De jaarkolommen zijn eindstanden: wat er op 31-12 nog lag.
        for (const [jaar, col] of Object.entries(jaarKolommen)) {
          jaren[jaar] = { eind: getal(row[col]) };
        }

        // De aantallen uit het mutatieblok horen bij het jaar van dit bestand.
        if (bestandsJaar) {
          jaren[bestandsJaar] = {
            ...(jaren[bestandsJaar] || {}),
            inkoop: getal(row[colInkoop]),
            verkocht: getal(row[colVerkoop])
          };
        }

        if (!alleArtikelenNieuw[artikel]) {
          alleArtikelenNieuw[artikel] = {
            artikel,
            prijs,
            jaren: {}
          };
        }
        voegJaarSamen(alleArtikelenNieuw[artikel].jaren, jaren);
      }
    }

    // Voeg toe aan state
    let toegevoegd = 0, bijgewerkt = 0;
    
    for (const [artikelNaam, nieuwData] of Object.entries(alleArtikelenNieuw)) {
      // Dubbele controle: skip totaal-rijen
      if (!artikelNaam || artikelNaam.toLowerCase().includes('totaal') || /^[\s—–]*$/.test(artikelNaam)) {
        continue;
      }
      
      const bestaand = state.COVERS.find(a => a.artikel === artikelNaam);
      
      if (bestaand) {
        if (!bestaand.jaren) bestaand.jaren = {};
        voegJaarSamen(bestaand.jaren, nieuwData.jaren);
        if (nieuwData.prijs && !bestaand.prijs) bestaand.prijs = nieuwData.prijs;
        bijgewerkt++;
      } else {
        // Maak een stabiele ID op basis van de artikelnaam, zodat twee
        // imports van hetzelfde artikel DEZELFDE ID krijgen. Voorkomt duplicaten
        // in Supabase. We voegen het ID-achtige voegwoord `imp-` eraan toe
        // zodat we kunnen zien dat het van de import komt.
        const stableId = `imp-${artikelNaam.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`;
        state.COVERS.push({
          id: stableId,
          artikel: artikelNaam,
          categorie: standaardGroep(),
          prijs: nieuwData.prijs || null,
          inkoop: 0,
          inkoopprijs: null,   // onbekend, niet nul — anders lijkt de waarde €0
          voorraad: Object.values(nieuwData.jaren)[Object.keys(nieuwData.jaren).length - 1]?.eind || 0,
          jaren: nieuwData.jaren
        });
        toegevoegd++;
      }
    }

    saveCoversData();
    
    // Sync ALLEEN de zojuist toegevoegde/bijgewerkte artikelen naar Supabase
    status.innerHTML = `⏳ Syncing ${toegevoegd + bijgewerkt} items to Supabase...`;
    
    let syncOk = 0, syncFailed = 0;
    
    // Bouw een set van artikel-namen die we net hebben verwerkt
    const verwerktArtikelNamen = new Set(Object.keys(alleArtikelenNieuw));
    
    // Filter state.COVERS om alleen de net verwerkte items te halen
    const recentArticles = state.COVERS.filter(a => verwerktArtikelNamen.has(a.artikel));
    
    console.log(`📤 Syncing ${recentArticles.length} covers naar Supabase (${toegevoegd} nieuw + ${bijgewerkt} bijgewerkt)...`);
    
    for (const artikel of recentArticles) {
      console.log(`   → Saving ${artikel.artikel}...`);
      try {
        const ok = await saveCoverToSupabase(artikel);
        if (ok) {
          syncOk++;
          console.log(`     ✅ ${artikel.artikel}`);
        } else {
          syncFailed++;
          console.log(`     ⚠️  ${artikel.artikel} returned false`);
        }
      } catch (err) {
        syncFailed++;
        console.error(`     ❌ ${artikel.artikel}:`, err.message);
      }
    }
    
    console.log(`📊 Import sync result: ${syncOk} ok, ${syncFailed} failed`);
    status.innerHTML = `✅ ${toegevoegd} toegevoegd, ${bijgewerkt} bijgewerkt<br><small style="color:var(--text-secondary)">✅ ${syncOk} naar Supabase · ${syncFailed ? syncFailed + ' mislukt' : 'alles OK'}</small>`;
    
    setTimeout(() => {
      sluitImportModal();
      renderCovers();
    }, 1500);

  } catch (e) {
    status.innerHTML = `❌ Fout: ${e.message}`;
    console.error('Import fout:', e);
  }
}
