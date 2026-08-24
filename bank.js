// bank.js — Bank: alle mutaties per rekening, inclusief transactie-modal.

import {
  GBNM, REKNM, bedragUit, ddmm, esc, fmt, isInkomst, isUitgave, leegVlak, maandLabel, rekBadge,
  typeBadge, vulMaandSelect, weergaveNaam
} from './helpers.js?v=20260823a';
import { MAAND_SALDOS, saveHistTxData, saveTxData, state } from './storage.js?v=20260823a';
import { maakSorteerbaar } from './tables.js?v=20260823a';

// Fase 3A: Supabase pending queue
import {
  addToPendingQueue,
  syncPendingQueue,
  pendingQueue,
  isSupabaseReady
} from './supabase-client-v2.js?v=20260823a';

const el = id => document.getElementById(id);

function bronVoorJaar(jaar) {
  if (jaar === '2026') return state.TX;
  if (jaar === 'all') return [...state.HIST_TX, ...state.TX];
  return state.HIST_TX.filter(t => t.datum.startsWith(jaar));
}

/** Laatst bekende eindsaldo van de bankrekening binnen een jaar. */
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

  // Fase 3A: Show pending queue badge if items waiting for sync
  const pendingCount = Object.keys(pendingQueue).length;
  const metrics = el('bank-metrics');
  if (pendingCount > 0 && metrics && metrics.parentNode) {
    let badge = el('pending-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'pending-badge';
      badge.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;color:#333;padding:8px 12px;border-radius:4px;font-size:12px;margin-bottom:12px;text-align:center';
      metrics.parentNode.insertBefore(badge, metrics);
    }
    badge.textContent = `⏳ ${pendingCount} wijziging(en) wachten op synchronisatie`;
  } else {
    const badge = el('pending-badge');
    if (badge) badge.remove();
  }

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

/** Zoekt een boeking in het lopende jaar én in de historische jaren. */
function vindTx(id) {
  const inTX = state.TX.find(t => String(t.id) === String(id));
  if (inTX) return { tx: inTX, historisch: false };
  const inHist = state.HIST_TX.find(t => String(t.id) === String(id));
  return inHist ? { tx: inHist, historisch: true } : null;
}

/**
 * Opent een bestaande boeking om te bewerken. Wordt aangeroepen vanuit het
 * detailpaneel en vanaf de controlepagina, zodat je een gevonden fout meteen
 * kunt herstellen zonder hem eerst te moeten opzoeken.
 */
export function bewerkBoeking(id) {
  const gevonden = vindTx(id);
  if (!gevonden) return;
  const { tx, historisch } = gevonden;

  state.editTxId = tx.id;
  el('tx-modal-title').textContent = historisch ? `Boeking bewerken (${tx.datum.slice(0, 4)})` : 'Boeking bewerken';
  el('tx-save-btn').textContent = 'Opslaan';
  el('tx-delete-btn').style.display = 'block'; // Toon delete-knop in edit mode
  el('tx-d').value = tx.datum || '';
  el('tx-b').value = tx.bedrag != null ? String(tx.bedrag).replace('.', ',') : '';
  el('tx-n').value = tx.naam || '';
  el('tx-o').value = tx.omschr || '';
  el('tx-t').value = tx.type || 'uitgave';
  el('tx-rek').value = REKNM[tx.rek] ? tx.rek : '1010';
  // Staat het grootboeknummer niet in de keuzelijst, dan voegen we het
  // tijdelijk toe — anders zou bewerken het nummer stilzwijgend veranderen.
  const gbSel = el('tx-gb');
  if (tx.gb && ![...gbSel.options].some(o => o.value === tx.gb)) {
    const optie = window.document.createElement('option');
    optie.value = tx.gb;
    optie.textContent = `${tx.gb} (niet in schema)`;
    gbSel.appendChild(optie);
  }
  gbSel.value = tx.gb || '';
  el('tx-fout').textContent = '';
  el('modal-tx').classList.add('open');
  el('tx-b').focus();
}

export function openTxModal() {
  state.editTxId = null;
  el('tx-modal-title').textContent = 'Transactie toevoegen';
  el('tx-save-btn').textContent = 'Opslaan';
  el('tx-delete-btn').style.display = 'none'; // Verberg delete-knop in add mode
  el('tx-d').value = new Date().toISOString().split('T')[0];
  el('tx-b').value = '';
  el('tx-n').value = '';
  el('tx-o').value = '';
  el('tx-fout').textContent = '';
  el('modal-tx').classList.add('open');
  el('tx-d').focus();
}

export function closeTx() { el('modal-tx').classList.remove('open'); }

/**
 * Verwijdert een bestaande boeking na bevestiging.
 * Alleen beschikbaar wanneer je een boeking aan het bewerken bent (state.editTxId is ingesteld).
 */
export function deleteTx() {
  if (state.editTxId == null) {
    console.warn('Geen boeking geselecteerd voor verwijdering');
    return;
  }

  const gevonden = vindTx(state.editTxId);
  if (!gevonden) {
    el('tx-fout').textContent = 'Boeking niet gevonden. Vernieuw de pagina.';
    return;
  }

  const { tx, historisch } = gevonden;
  const berichtDatum = tx.datum ? ` (${tx.datum})` : '';
  const berichtBedrag = tx.bedrag ? ` – €${tx.bedrag}` : '';
  
  // Vraag duidelijke bevestiging
  const bevestiging = window.confirm(
    `⚠️ BOEKING VERWIJDEREN\n\n` +
    `${tx.naam}${berichtBedrag}${berichtDatum}\n\n` +
    `Deze actie kan niet ongedaan gemaakt worden.\n` +
    `Weet je zeker dat je deze boeking wilt verwijderen?`
  );

  if (!bevestiging) {
    return; // Gebruiker heeft geannuleerd
  }

  // Verwijder uit TX of HIST_TX (hard delete lokaal)
  if (historisch) {
    state.HIST_TX = state.HIST_TX.filter(t => String(t.id) !== String(state.editTxId));
    saveHistTxData();
  } else {
    state.TX = state.TX.filter(t => String(t.id) !== String(state.editTxId));
    saveTxData();
  }

  // Fase 3A: Add to pending queue for Supabase soft delete
  addToPendingQueue({ id: state.editTxId }, 'delete', historisch);
  
  // Fase 3A: Try Supabase sync (async, non-blocking)
  if (isSupabaseReady()) {
    syncPendingQueue().catch(err => {
      console.warn('Supabase delete sync failed (will retry):', err);
    });
  }

  // Reset modal state
  state.editTxId = null;
  closeTx();

  // Herlaad de tabel zodat totalen direct kloppen
  renderBank();
}

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

  let isHistoric = false;
  
  if (state.editTxId != null) {
    // Een historische boeking hoort in HIST_TX te blijven staan, anders zou hij
    // naar 2026 verhuizen en uit de jaaroverzichten van dat jaar verdwijnen.
    const bestaand = vindTx(state.editTxId);
    isHistoric = bestaand && bestaand.historisch;
    
    if (isHistoric) {
      state.HIST_TX = state.HIST_TX.map(t => (String(t.id) === String(state.editTxId) ? tx : t));
      saveHistTxData();
    } else {
      state.TX = state.TX.map(t => (String(t.id) === String(state.editTxId) ? tx : t));
      saveTxData();
    }
    
    // Fase 3A: Add to pending queue for Supabase sync
    addToPendingQueue(tx, 'update', isHistoric);
    
  } else {
    state.TX.push(tx);
    saveTxData();
    
    // Fase 3A: Add to pending queue for Supabase sync
    addToPendingQueue(tx, 'create', false);
  }
  
  closeTx();
  
  // Fase 3A: Try Supabase sync (async, non-blocking)
  if (isSupabaseReady()) {
    syncPendingQueue().catch(err => {
      console.warn('Supabase sync failed (will retry):', err);
    });
  }

  // Een nieuwe boeking is altijd 2026; sta je in een ander jaar te kijken,
  // dan zou hij anders ongemerkt buiten beeld vallen.
  if (state.editTxId == null && el('f-jaar-bank') && el('f-jaar-bank').value !== '2026' && el('f-jaar-bank').value !== 'all') {
    el('f-jaar-bank').value = '2026';
    el('f-maand').value = '';
  }
  state.editTxId = null;
  renderBank();
}
