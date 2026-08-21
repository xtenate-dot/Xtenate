// grootboek.js — Grootboek: compacte saldotabel per rekening, met doorklik
// naar de losse boekingen van één rekening.

import { GBNM, ddmm, esc, fmt, isInkomst, isUitgave, leegVlak, rekBadge, teltBij, typeBadge, vulMaandSelect, weergaveNaam } from './helpers.js?v=20260821j';
import { state } from './storage.js?v=20260821j';
import { maakSorteerbaar } from './tables.js?v=20260821j';

const el = id => document.getElementById(id);
const waarde = id => (el(id) ? el(id).value.trim() : '');

/** Welke rubriek hoort bij een grootboeknummer. */
export function rubriekVan(gb) {
  const gbStr = String(gb);
  // Privé-rekeningen (600, 601) zijn BALANSREKENINGEN, niet bedrijfskosten
  if (gbStr === '600' || gbStr === '601') return 'balans';
  
  const eersteC = gbStr.charAt(0);
  if (eersteC <= '3') return 'balans';
  if (eersteC === '4' || eersteC === '5' || eersteC === '6') return 'bedrijfskosten';
  if (eersteC === '7') return 'inkoop';
  if (eersteC === '8') return 'omzet';
  return 'overig';  // 9 en hoger
}

const RUBRIEK_NAAM = { balans: 'Balans', bedrijfskosten: 'Bedrijfskosten', inkoop: 'Inkoop', omzet: 'Omzet', overig: 'Overig' };
const RUBRIEK_VOLGORDE = ['balans', 'bedrijfskosten', 'inkoop', 'omzet', 'overig'];

/** Welke rekening staat er open in de detailweergave; null = overzicht. */
let geopendeRekening = null;

function bronVoorJaar(jaar) {
  if (jaar === '2026') return state.TX;
  if (jaar === 'all') return [...state.HIST_TX, ...state.TX];
  return state.HIST_TX.filter(t => t.datum.startsWith(jaar));
}

/** De boekingen die binnen de huidige periodefilters vallen. */
function gefilterdeBoekingen() {
  const jaar = el('f-jaar-gb') ? el('f-jaar-gb').value : '2026';
  const bron = bronVoorJaar(jaar);
  vulMaandSelect(el('f-maand-gb'), bron);
  const maand = waarde('f-maand-gb');
  return maand ? bron.filter(t => t.datum.startsWith(maand)) : bron;
}

export function wisFiltersGrootboek() {
  ['gb-zoek'].forEach(id => { if (el(id)) el(id).value = ''; });
  if (el('f-maand-gb')) el('f-maand-gb').value = '';
  if (el('f-rubriek-gb')) el('f-rubriek-gb').value = '';
  renderGrootboek();
}

// ---------------------------------------------------------------- overzicht

function renderOverzicht(boekingen) {
  const zoekterm = waarde('gb-zoek').toLowerCase();
  const rubriekFilter = waarde('f-rubriek-gb');

  // Optellen per grootboekrekening
  const perRekening = new Map();
  boekingen.forEach(t => {
    const r = perRekening.get(t.gb) || { gb: t.gb, saldo: 0, aantal: 0, bij: 0, af: 0 };
    const bedrag = teltBij(t) ? t.bedrag : -t.bedrag;
    r.saldo += bedrag;
    if (bedrag >= 0) r.bij += bedrag; else r.af += -bedrag;
    r.aantal++;
    perRekening.set(t.gb, r);
  });

  let rijen = [...perRekening.values()].map(r => ({
    ...r,
    naam: GBNM[r.gb] || 'Onbekende rekening',
    rubriek: rubriekVan(r.gb)
  }));

  if (rubriekFilter) rijen = rijen.filter(r => r.rubriek === rubriekFilter);
  if (zoekterm) rijen = rijen.filter(r => `${r.gb} ${r.naam}`.toLowerCase().includes(zoekterm));

  rijen.sort((a, b) => {
    const rubAVs = RUBRIEK_VOLGORDE.indexOf(a.rubriek);
    const rubBVs = RUBRIEK_VOLGORDE.indexOf(b.rubriek);
    if (rubAVs !== rubBVs) return rubAVs - rubBVs;
    // Binnen dezelfde rubriek: numeriek sorteren, van laag naar hoog
    return Number(a.gb) - Number(b.gb);
  });

  // Kerncijfers van de selectie
  // Zakelijk en privé apart houden: privé hoort niet in je resultaat thuis,
  // maar telt wel mee in het saldo van de rekeningen.
  const zakelijkeBoekingen = boekingen.filter(t => !String(t.type).startsWith('prive'));
  const inSelectie = t => rijen.some(r => r.gb === t.gb);
  const inkomsten = zakelijkeBoekingen.filter(t => isInkomst(t) && inSelectie(t)).reduce((s, t) => s + t.bedrag, 0);
  const uitgaven = zakelijkeBoekingen.filter(t => isUitgave(t) && inSelectie(t)).reduce((s, t) => s + t.bedrag, 0);
  const priveSaldo = rijen.filter(r => r.rubriek === 'prive').reduce((s, r) => s + r.saldo, 0);
  const aantal = rijen.reduce((s, r) => s + r.aantal, 0);
  el('gb-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Inkomsten</div><div class="val pos">${fmt(inkomsten)}</div></div>
    <div class="metric"><div class="lbl">Kosten en inkoop</div><div class="val neg">${fmt(uitgaven)}</div></div>
    <div class="metric"><div class="lbl">Zakelijk resultaat</div><div class="val ${inkomsten - uitgaven >= 0 ? 'pos' : 'neg'}">${fmt(inkomsten - uitgaven)}</div></div>
    <div class="metric"><div class="lbl">Privé</div><div class="val ${priveSaldo >= 0 ? 'pos' : 'neg'}">${priveSaldo >= 0 ? '+' : '–'}${fmt(Math.abs(priveSaldo))}</div><div class="sub">stortingen min opnames</div></div>
    <div class="metric"><div class="lbl">Rekeningen</div><div class="val">${rijen.length}</div><div class="sub">${aantal} boekingen</div></div>`;

  // Tabel met totaalrijen per rubriek
  const perRubriek = {};
  for (const r of rijen) {
    if (!perRubriek[r.rubriek]) perRubriek[r.rubriek] = [];
    perRubriek[r.rubriek].push(r);
  }

  const tabelRijen = [];
  for (const rub of RUBRIEK_VOLGORDE) {
    if (!perRubriek[rub]?.length) continue;
    // Rekeningen
    for (const r of perRubriek[rub]) {
      tabelRijen.push(`<tr class="gb-rij" data-gb="${esc(r.gb)}" tabindex="0" role="button" aria-label="Bekijk boekingen van ${esc(r.gb)}">
        <td style="padding-left:16px" data-v="${esc(r.gb)}"><span class="gbnr">${esc(r.gb)}</span></td>
        <td class="td-trunc">${esc(r.naam)}</td>
        <td class="muted">${RUBRIEK_NAAM[r.rubriek]}</td>
        <td style="text-align:right" class="muted" data-v="${r.aantal}">${r.aantal}</td>
        <td style="text-align:right;font-weight:600;padding-right:16px" class="${r.saldo >= 0 ? 'pos' : 'neg'}" data-v="${r.saldo}">${r.saldo >= 0 ? '+' : '–'}${fmt(Math.abs(r.saldo))}</td>
      </tr>`);
    }
    // Totaal per rubriek
    const totAantal = perRubriek[rub].reduce((s, r) => s + r.aantal, 0);
    const totSaldo = perRubriek[rub].reduce((s, r) => s + r.saldo, 0);
    tabelRijen.push(`<tr style="border-top:2px solid var(--border);background:var(--surface-alt,var(--surface))">
      <td colspan="3" style="padding-left:16px;font-weight:600">${RUBRIEK_NAAM[rub]}</td>
      <td style="text-align:right;font-weight:600;color:var(--text-muted)">${totAantal}</td>
      <td style="text-align:right;font-weight:600;padding-right:16px;color:${totSaldo >= 0 ? 'var(--pos)' : 'var(--neg)'}">${totSaldo >= 0 ? '+' : '–'}${fmt(Math.abs(totSaldo))}</td>
    </tr>`);
  }

  el('gb-body').innerHTML = rijen.length
    ? tabelRijen.join('')
    : `<tr data-geen-sort="1"><td colspan="5"><div class="empty">
        <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></div>
        <div class="empty-title">Geen rekeningen binnen deze filters</div>
        <div class="empty-text">Kies een andere periode of rubriek, of wis de filters om alles weer te zien.</div>
        <button class="btn" onclick="wisFiltersGrootboek()">Filters wissen</button>
      </div></td></tr>`;

  // De voetregel telt letterlijk de kolom erboven op, inclusief privé.
  const somSaldi = rijen.reduce((s, r) => s + r.saldo, 0);
  el('gb-totaal').innerHTML = rijen.length
    ? `<span>Totaal ${rijen.length} rekening${rijen.length === 1 ? '' : 'en'}</span>
       <span class="${somSaldi >= 0 ? 'pos' : 'neg'}" style="font-weight:600">${somSaldi >= 0 ? '+' : '–'}${fmt(Math.abs(somSaldi))}</span>`
    : '';

  maakSorteerbaar(el('tbl-grootboek'));
}

// ------------------------------------------------------------------ detail

function renderDetail(boekingen) {
  const gb = geopendeRekening;
  const rijen = boekingen.filter(t => t.gb === gb).sort((a, b) => b.datum.localeCompare(a.datum));
  const saldo = rijen.reduce((s, t) => s + (teltBij(t) ? t.bedrag : -t.bedrag), 0);

  el('gb-detail-kop').innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="sluitGrootboekRekening()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      Alle rekeningen
    </button>
    <div style="flex:1;min-width:0">
      <div style="font-size:15px;font-weight:600;letter-spacing:-0.3px">
        <span class="gbnr" style="font-size:13px">${esc(gb)}</span> ${esc(GBNM[gb] || 'Onbekende rekening')}
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${rijen.length} boeking${rijen.length === 1 ? '' : 'en'} · ${RUBRIEK_NAAM[rubriekVan(gb)]}</div>
    </div>
    <div class="${saldo >= 0 ? 'pos' : 'neg'}" style="font-size:19px;font-weight:600;letter-spacing:-0.5px">${saldo >= 0 ? '+' : '–'}${fmt(Math.abs(saldo))}</div>`;

  el('gb-detail-body').innerHTML = rijen.length
    ? rijen.map(t => `<tr class="row-click" data-id="${esc(t.id)}">
        <td class="muted" style="padding-left:16px" data-v="${t.datum}">${ddmm(t.datum)}</td>
        <td class="td-trunc">${esc(weergaveNaam(t))}</td>
        <td class="td-trunc muted">${esc(t.omschr) || '—'}</td>
        <td data-v="${esc(t.rek)}">${rekBadge(t.rek)}</td>
        <td style="text-align:right;padding-right:16px" data-v="${t.bedrag}">${typeBadge(t.type, t.bedrag)}</td>
      </tr>`).join('')
    : `<tr data-geen-sort="1"><td colspan="5"><div class="empty">
        <div class="empty-title">Geen boekingen in deze periode</div>
        <div class="empty-text">Deze rekening heeft binnen de gekozen periode geen mutaties.</div>
      </div></td></tr>`;

  maakSorteerbaar(el('tbl-gb-detail'));
}

// ------------------------------------------------------------------- router

export function renderGrootboek() {
  const boekingen = gefilterdeBoekingen();
  const inDetail = geopendeRekening !== null;

  el('gb-overzicht').style.display = inDetail ? 'none' : '';
  el('gb-detail').style.display = inDetail ? '' : 'none';
  el('f-rubriek-gb').style.display = inDetail ? 'none' : '';
  el('gb-zoek-wrap').style.display = inDetail ? 'none' : '';

  if (inDetail) renderDetail(boekingen);
  else renderOverzicht(boekingen);
}

export function openGrootboekRekening(gb) {
  geopendeRekening = gb;
  renderGrootboek();
  window.scrollTo({ top: 0 });
}

export function sluitGrootboekRekening() {
  geopendeRekening = null;
  renderGrootboek();
}

