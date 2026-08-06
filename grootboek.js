// grootboek.js — Grootboek: filteren, zoeken en per boeking doorklikken.

import { GBNM, ddmm, esc, fmt, isInkomst, isUitgave, rekBadge, typeBadge, weergaveNaam } from './helpers.js?v=20260806a';
import { state } from './storage.js?v=20260806a';
import { maakSorteerbaar } from './tables.js?v=20260806a';

const MND_NAMEN = { '01':'jan','02':'feb','03':'mrt','04':'apr','05':'mei','06':'jun','07':'jul','08':'aug','09':'sep','10':'okt','11':'nov','12':'dec' };

const el = id => document.getElementById(id);
const waarde = id => (el(id) ? el(id).value.trim() : '');

/** Alle boekingen voor het gekozen jaar; 2026 is live data, ouder is historisch. */
function bronVoorJaar(jaar) {
  if (jaar === '2026') return state.TX;
  if (jaar === 'all') return [...state.HIST_TX, ...state.TX];
  return state.HIST_TX.filter(t => t.datum.startsWith(jaar));
}

/** Vult de maandkeuze met de maanden die in de gekozen bron voorkomen. */
function vulMaanden(bron) {
  const sel = el('f-maand-gb');
  const gekozen = sel.value;
  const maanden = [...new Set(bron.map(t => t.datum.slice(0, 7)))].sort().reverse();
  sel.innerHTML = '<option value="">Alle maanden</option>' + maanden.map(m =>
    `<option value="${m}"${m === gekozen ? ' selected' : ''}>${MND_NAMEN[m.slice(5, 7)] || m} ${m.slice(0, 4)}</option>`).join('');
}

export function wisFiltersGrootboek() {
  ['gb-zoek','f-datum-van','f-datum-tot','f-bedrag-min','f-bedrag-max'].forEach(id => { if (el(id)) el(id).value = ''; });
  if (el('f-maand-gb')) el('f-maand-gb').value = '';
  if (el('f-gb-rek')) el('f-gb-rek').value = '';
  renderGrootboek();
}

export function renderGrootboek() {
  const jaar = el('f-jaar-gb') ? el('f-jaar-gb').value : '2026';
  const bron = bronVoorJaar(jaar);
  vulMaanden(bron);

  const zoekterm = waarde('gb-zoek').toLowerCase();
  const maand = waarde('f-maand-gb');
  const grootboek = waarde('f-gb-rek');
  const van = waarde('f-datum-van');
  const tot = waarde('f-datum-tot');
  const min = parseFloat(waarde('f-bedrag-min'));
  const max = parseFloat(waarde('f-bedrag-max'));

  const lijst = bron.filter(t => {
    if (maand && !t.datum.startsWith(maand)) return false;
    if (grootboek && t.gb !== grootboek) return false;
    if (van && t.datum < van) return false;
    if (tot && t.datum > tot) return false;
    if (!isNaN(min) && t.bedrag < min) return false;
    if (!isNaN(max) && t.bedrag > max) return false;
    if (zoekterm) {
      const tekst = [t.naam, t.omschr, t.gb, GBNM[t.gb]].filter(Boolean).join(' ').toLowerCase();
      if (!tekst.includes(zoekterm)) return false;
    }
    return true;
  }).sort((a, b) => b.datum.localeCompare(a.datum));

  // ---------- Kerncijfers van de selectie ----------
  const inkomsten = lijst.filter(isInkomst).reduce((s, t) => s + t.bedrag, 0);
  const uitgaven = lijst.filter(isUitgave).reduce((s, t) => s + t.bedrag, 0);
  el('gb-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Inkomsten</div><div class="val pos">${fmt(inkomsten)}</div></div>
    <div class="metric"><div class="lbl">Kosten en inkoop</div><div class="val neg">${fmt(uitgaven)}</div></div>
    <div class="metric"><div class="lbl">Resultaat</div><div class="val ${inkomsten - uitgaven >= 0 ? 'pos' : 'neg'}">${fmt(inkomsten - uitgaven)}</div></div>
    <div class="metric"><div class="lbl">Boekingen</div><div class="val">${lijst.length}</div>${
      lijst.length !== bron.length ? `<div class="sub">van ${bron.length} totaal</div>` : ''}</div>`;

  // ---------- Totalen per grootboekrekening ----------
  const perGb = {};
  lijst.forEach(t => { perGb[t.gb] = (perGb[t.gb] || 0) + (isInkomst(t) ? t.bedrag : -t.bedrag); });
  const rijen = Object.entries(perGb).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  el('gb-samenvatting').innerHTML = rijen.length
    ? rijen.map(([gb, bedrag]) => `
      <button class="btn btn-sm" onclick="filterOpGrootboek('${esc(gb)}')" title="Filter op ${esc(GBNM[gb] || gb)}">
        <span class="gbnr">${esc(gb)}</span>
        <span>${esc(GBNM[gb] || gb)}</span>
        <span class="${bedrag >= 0 ? 'pos' : 'neg'}" style="font-weight:600">${bedrag >= 0 ? '+' : ''}${fmt(bedrag)}</span>
      </button>`).join('')
    : '';

  // ---------- Tabel ----------
  el('gb-body').innerHTML = lijst.length
    ? lijst.map(t => `<tr class="row-click" data-id="${esc(t.id)}">
        <td class="muted" data-v="${t.datum}">${ddmm(t.datum)}</td>
        <td class="td-trunc">${esc(weergaveNaam(t))}</td>
        <td data-v="${esc(t.gb)}"><span class="gbnr">${esc(t.gb)}</span> ${esc(GBNM[t.gb] || 'onbekend')}</td>
        <td data-v="${esc(t.rek)}">${rekBadge(t.rek)}</td>
        <td style="text-align:right" data-v="${t.bedrag}">${typeBadge(t.type, t.bedrag)}</td>
      </tr>`).join('')
    : `<tr data-geen-sort="1"><td colspan="5"><div class="empty">
        <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></div>
        <div class="empty-title">Geen boekingen binnen deze filters</div>
        <div class="empty-text">Verruim de periode of het bedrag, of wis de filters om alles weer te zien.</div>
        <button class="btn" onclick="wisFiltersGrootboek()">Filters wissen</button>
      </div></td></tr>`;

  maakSorteerbaar(el('tbl-grootboek'));
}

/** Wordt aangeroepen vanuit de totalenknoppen boven de tabel. */
export function filterOpGrootboek(gb) {
  const sel = el('f-gb-rek');
  sel.value = sel.value === gb ? '' : gb;
  renderGrootboek();
}
