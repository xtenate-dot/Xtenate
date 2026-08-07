// bank.js — Bank: alle mutaties per rekening, inclusief transactie-modal.

import {
  GBNM, bedragUit, ddmm, esc, fmt, isInkomst, isUitgave, leegVlak, maandLabel, rekBadge,
  typeBadge, vulMaandSelect, weergaveNaam
} from './helpers.js?v=20260806a';
import { MAAND_SALDOS, saveTxData, state } from './storage.js?v=20260806a';
import { maakSorteerbaar } from './tables.js?v=20260806a';

const el = id => document.getElementById(id);

function bronVoorJaar(jaar) {
  if (jaar === '2026') return state.TX;
  if (jaar === 'all') return [...state.HIST_TX, ...state.TX];
  return state.HIST_TX.filter(t => t.datum.startsWith(jaar));
}

/** Laatst bekende eindsaldo binnen een jaar. */
function eindsaldoVanJaar(jaar) {
  const laatste = Object.keys(MAAND_SALDOS).filter(m => m.startsWith(jaar)).sort().pop();
  return laatste ? MAAND_SALDOS[laatste].eind : null;
}

function vorigeMaand(maand) {
  const d = new Date(maand + '-01');
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export function renderBank() {
  const jaar = el('f-jaar-bank') ? el('f-jaar-bank').value : '2026';
  const bron = bronVoorJaar(jaar);
  vulMaandSelect(el('f-maand'), bron);

  const maand = el('f-maand').value;
  const rek = el('f-rek').value;
  const typeF = el('f-type').value;

  const lijst = bron.filter(t => {
    if (maand && !t.datum.startsWith(maand)) return false;
    if (rek && t.rek !== rek) return false;
    if (typeF === 'prive' && !t.type.startsWith('prive')) return false;
    if (typeF === 'inkomst' && t.type !== 'inkomst') return false;
    if (typeF === 'uitgave' && t.type !== 'uitgave') return false;
    return true;
  }).sort((a, b) => b.datum.localeCompare(a.datum));

  const inkomsten = lijst.filter(isInkomst).reduce((s, t) => s + t.bedrag, 0);
  const uitgaven = lijst.filter(isUitgave).reduce((s, t) => s + t.bedrag, 0);
  const resultaat = inkomsten - uitgaven;
  const priveOp = lijst.filter(t => t.type === 'prive_opname').reduce((s, t) => s + t.bedrag, 0);
  const priveSt = lijst.filter(t => t.type === 'prive_storting').reduce((s, t) => s + t.bedrag, 0);

  // Bekende eindsaldi van de bankrekening. Bij "alle jaren" is er geen
  // afgebakende periode, dus dan blijven deze twee kaarten leeg.
  let saldo = null, vorigSaldo = null, saldoLabel, vorigLabel;
  if (maand) {
    saldo = MAAND_SALDOS[maand]?.eind ?? null;
    vorigSaldo = MAAND_SALDOS[vorigeMaand(maand)]?.eind ?? null;
    saldoLabel = `Saldo eind ${maandLabel(maand)}`;
    vorigLabel = 'Saldo vorige maand';
  } else if (jaar !== 'all') {
    saldo = eindsaldoVanJaar(jaar);
    vorigSaldo = eindsaldoVanJaar(String(Number(jaar) - 1));
    saldoLabel = `Saldo eind ${jaar}`;
    vorigLabel = `Saldo eind ${Number(jaar) - 1}`;
  } else {
    saldoLabel = 'Saldo';
    vorigLabel = 'Saldo vorige periode';
  }

  const saldoKaart = (label, bedrag, sub) => `
    <div class="metric">
      <div class="lbl">${esc(label)}</div>
      <div class="val ${bedrag == null ? 'muted' : bedrag >= 0 ? 'pos' : 'neg'}">${bedrag == null ? '—' : fmt(bedrag)}</div>
      <div class="sub">${esc(sub)}</div>
    </div>`;

  el('bank-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Privé gestort</div><div class="val pos">${fmt(priveSt)}</div><div class="sub">${lijst.filter(t => t.type === 'prive_storting').length} keer</div></div>
    <div class="metric"><div class="lbl">Privé opgenomen</div><div class="val neg">${fmt(priveOp)}</div><div class="sub">${lijst.filter(t => t.type === 'prive_opname').length} keer</div></div>
    <div class="metric"><div class="lbl">Inkomsten periode</div><div class="val pos">${fmt(inkomsten)}</div><div class="sub">${lijst.filter(t => t.type === 'inkomst').length} transacties</div></div>
    <div class="metric"><div class="lbl">Uitgaven periode</div><div class="val neg">${fmt(uitgaven)}</div><div class="sub">${lijst.filter(t => t.type === 'uitgave').length} transacties</div></div>
    <div class="metric"><div class="lbl">Winst / verlies</div><div class="val ${resultaat >= 0 ? 'pos' : 'neg'}">${resultaat >= 0 ? '+' : ''}${fmt(resultaat)}</div><div class="sub">zakelijk netto</div></div>
    ${saldoKaart(saldoLabel, saldo, 'eindbalans rekening')}
    ${saldoKaart(vorigLabel, vorigSaldo, 'vorige periode')}`;

  el('bank-body').innerHTML = lijst.length
    ? lijst.map(t => `<tr class="row-click" data-id="${esc(t.id)}">
        <td class="muted" style="padding-left:16px" data-v="${t.datum}">${ddmm(t.datum)}</td>
        <td class="td-trunc">${esc(weergaveNaam(t))}${t.omschr && t.omschr !== t.naam
          ? ` <span style="color:var(--text-hint);font-size:10px">· ${esc(t.omschr)}</span>` : ''}</td>
        <td data-v="${esc(t.gb)}"><span class="gbnr">${esc(t.gb)}</span> ${esc(GBNM[t.gb] || '')}</td>
        <td data-v="${esc(t.rek)}">${rekBadge(t.rek)}</td>
        <td style="text-align:right;padding-right:16px" data-v="${t.bedrag}">${typeBadge(t.type, t.bedrag)}</td>
      </tr>`).join('')
    : `<tr data-geen-sort="1"><td colspan="5">${leegVlak(
        bron.length ? 'Geen transacties binnen deze filters' : 'Nog geen transacties in dit jaar',
        bron.length ? 'Kies een andere maand, rekening of soort mutatie.' : 'Importeer je Excel-bestand of voeg handmatig een transactie toe.',
        '<button class="btn" onclick="openTxModal()">Transactie toevoegen</button>')}</td></tr>`;

  maakSorteerbaar(el('tbl-bank'));
}

// -------------------------------------------------------------------- modal

export function openTxModal() {
  state.editTxId = null;
  el('tx-modal-title').textContent = 'Transactie toevoegen';
  el('tx-save-btn').textContent = 'Opslaan';
  el('tx-d').value = new Date().toISOString().split('T')[0];
  el('tx-b').value = '';
  el('tx-n').value = '';
  el('tx-o').value = '';
  el('tx-fout').textContent = '';
  el('modal-tx').classList.add('open');
  el('tx-d').focus();
}

export function closeTx() { el('modal-tx').classList.remove('open'); }

// Voorkomt dat type (privé storting/opname) en grootboek (600/601) uit elkaar
// kunnen lopen — dat was de oorzaak van een foutieve privé-boeking in de data
// (2023: gb=601 "opname" maar type "storting").
export function syncTxGrootboek() {
  const type = el('tx-t').value;
  if (type === 'prive_storting') el('tx-gb').value = '600';
  else if (type === 'prive_opname') el('tx-gb').value = '601';
}

export function saveTx() {
  const datum = el('tx-d').value;
  const bedrag = bedragUit('tx-b', NaN);
  const fout = el('tx-fout');

  // Een boeking zonder geldige datum of met een bedrag van nul of minder maakt
  // alle latere totalen onbetrouwbaar, dus die weigeren we hier.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { fout.textContent = 'Vul een geldige datum in.'; el('tx-d').focus(); return; }
  if (isNaN(bedrag) || bedrag <= 0) { fout.textContent = 'Vul een bedrag groter dan nul in. Of het bij- of afgaat bepaal je met de soort.'; el('tx-b').focus(); return; }
  fout.textContent = '';

  let type = el('tx-t').value;
  let gb = el('tx-gb').value;
  // Laatste vangnet: gb en type mogen nooit tegenstrijdig zijn bij privé.
  if (type === 'prive_storting') gb = '600';
  else if (type === 'prive_opname') gb = '601';
  else if (gb === '600') type = 'prive_storting';
  else if (gb === '601') type = 'prive_opname';

  const tx = {
    id: state.editTxId || state.nxtTx++,
    datum,
    bedrag: Math.round(bedrag * 100) / 100,
    naam: el('tx-n').value.trim(),
    omschr: el('tx-o').value.trim(),
    type,
    rek: el('tx-rek').value,
    gb
  };

  if (state.editTxId) state.TX = state.TX.map(t => (t.id === state.editTxId ? tx : t));
  else state.TX.push(tx);

  saveTxData();
  closeTx();

  // Een nieuwe boeking is altijd 2026; sta je in een ander jaar te kijken,
  // dan zou hij anders ongemerkt buiten beeld vallen.
  if (el('f-jaar-bank') && el('f-jaar-bank').value !== '2026' && el('f-jaar-bank').value !== 'all') {
    el('f-jaar-bank').value = '2026';
    el('f-maand').value = '';
  }
  renderBank();
}
