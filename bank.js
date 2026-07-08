// bank.js — Bank-pagina inclusief transactie-modal.

import { GBNM, ddmm, fmt, isInkomst, isUitgave, rekBadge, typeBadge, weergaveNaam } from './helpers.js';
import { MAAND_SALDOS, saveTxData, state } from './storage.js';

export function renderBank() {
  const jaarSel = document.getElementById('f-jaar-bank');
  const gekozenJaar = jaarSel ? jaarSel.value : '2026';
  
  // Kies databron
  let bronData;
  if (gekozenJaar === '2026') bronData = state.TX;
  else if (gekozenJaar === 'all') bronData = [...state.HIST_TX, ...state.TX];
  else bronData = state.HIST_TX.filter(t => t.datum.startsWith(gekozenJaar));

  // Maanden voor het gekozen jaar
  const sel = document.getElementById('f-maand');
  const cur = sel.value;
  const beschikbareMaanden = [...new Set(bronData.map(t=>t.datum.slice(0,7)))].sort().reverse();
  sel.innerHTML = '<option value="">Alle maanden</option>' + beschikbareMaanden.map(m => {
    const mnms2 = {'2022-01':'jan','2022-02':'feb','2022-03':'mrt','2022-04':'apr','2022-05':'mei','2022-06':'jun','2022-07':'jul','2022-08':'aug','2022-09':'sep','2022-10':'okt','2022-11':'nov','2022-12':'dec','2023-01':'jan','2023-02':'feb','2023-03':'mrt','2023-04':'apr','2023-05':'mei','2023-06':'jun','2023-07':'jul','2023-08':'aug','2023-09':'sep','2023-10':'okt','2023-11':'nov','2023-12':'dec','2024-01':'jan','2024-02':'feb','2024-03':'mrt','2024-04':'apr','2024-05':'mei','2024-06':'jun','2024-07':'jul','2024-08':'aug','2024-09':'sep','2024-10':'okt','2024-11':'nov','2024-12':'dec','2025-01':'jan','2025-02':'feb','2025-03':'mrt','2025-04':'apr','2025-05':'mei','2025-06':'jun','2025-07':'jul','2025-08':'aug','2025-09':'sep','2025-10':'okt','2025-11':'nov','2025-12':'dec','2026-01':'jan','2026-02':'feb','2026-03':'mrt','2026-04':'apr','2026-05':'mei','2026-06':'jun'};
    return `<option value="${m}"${m===cur?' selected':''}>${mnms2[m]||m} ${m.slice(0,4)}</option>`;
  }).join('');

  const maand = sel.value, rek = document.getElementById('f-rek').value, typeF = document.getElementById('f-type').value;
  let list = bronData.filter(t => {
    if (maand && !t.datum.startsWith(maand)) return false;
    if (rek && t.rek !== rek) return false;
    if (typeF === 'prive' && !t.type.startsWith('prive')) return false;
    if (typeF === 'inkomst' && t.type !== 'inkomst') return false;
    if (typeF === 'uitgave' && t.type !== 'uitgave') return false;
    return true;
  }).sort((a,b) => b.datum.localeCompare(a.datum));
  const inc = list.filter(isInkomst).reduce((s,t)=>s+t.bedrag,0);
  const exp = list.filter(isUitgave).reduce((s,t)=>s+t.bedrag,0);
  const verschil = inc - exp;

  const allData = gekozenJaar === '2026' ? state.TX : gekozenJaar === 'all' ? [...state.HIST_TX, ...state.TX] : state.HIST_TX.filter(t=>t.datum.startsWith(gekozenJaar));
  const mnNamen = {'01':'jan','02':'feb','03':'mrt','04':'apr','05':'mei','06':'jun','07':'jul','08':'aug','09':'sep','10':'okt','11':'nov','12':'dec'};

  // Gebruik echte saldos altijd als beschikbaar
  let periodeSaldo = null, vorigSaldo2 = null;
  const vorigeMnd = maand
    ? (() => { const d = new Date(maand+'-01'); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })()
    : null;

  if (maand) {
    // Specifieke maand: gebruik saldo als bekend
    periodeSaldo = MAAND_SALDOS[maand] ? MAAND_SALDOS[maand].eind : null;
    vorigSaldo2 = vorigeMnd && MAAND_SALDOS[vorigeMnd] ? MAAND_SALDOS[vorigeMnd].eind : null;
  } else if (gekozenJaar !== 'all') {
    // Heel jaar: gebruik laatste bekende maand van dat jaar
    const laatste = Object.keys(MAAND_SALDOS).filter(m=>m.startsWith(gekozenJaar)).sort().pop();
    periodeSaldo = laatste ? MAAND_SALDOS[laatste].eind : null;
    const vorigeJaar = String(parseInt(gekozenJaar)-1);
    const vorigeL = Object.keys(MAAND_SALDOS).filter(m=>m.startsWith(vorigeJaar)).sort().pop();
    vorigSaldo2 = vorigeL ? MAAND_SALDOS[vorigeL].eind : null;
  }

  const saldoLabel = maand ? 'Saldo einde '+mnNamen[maand.slice(5,7)] : gekozenJaar==='all'?'Saldo huidig':'Saldo einde '+gekozenJaar;

  const vorigLabel = maand ? 'Saldo vorige maand' : ('Saldo einde '+String(parseInt(gekozenJaar==='all'?'2025':gekozenJaar)-1));
  const vorigSaldo = vorigSaldo2;

  const winstverlies = inc - exp;
  const priveOp = list.filter(t=>t.type==='prive_opname').reduce((s,t)=>s+t.bedrag,0);
  const priveSt = list.filter(t=>t.type==='prive_storting').reduce((s,t)=>s+t.bedrag,0);
  const priveSaldo = priveSt - priveOp;

  document.getElementById('bank-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Privé gestort</div><div class="val pos">${fmt(priveSt)}</div><div class="sub">${list.filter(t=>t.type==='prive_storting').length} keer</div></div>
    <div class="metric"><div class="lbl">Privé opgenomen</div><div class="val neg">${fmt(priveOp)}</div><div class="sub">${list.filter(t=>t.type==='prive_opname').length} keer</div></div>
    <div class="metric"><div class="lbl">Inkomsten periode</div><div class="val pos">${fmt(inc)}</div><div class="sub">${list.filter(t=>t.type==='inkomst').length} transacties</div></div>
    <div class="metric"><div class="lbl">Uitgaven periode</div><div class="val neg">${fmt(exp)}</div><div class="sub">${list.filter(t=>t.type==='uitgave').length} transacties</div></div>
    <div class="metric"><div class="lbl">Winst / verlies</div><div class="val ${winstverlies>=0?'pos':'neg'}">${winstverlies>=0?'+':''}${fmt(winstverlies)}</div><div class="sub">zakelijk netto</div></div>
    <div class="metric"><div class="lbl">${saldoLabel}</div><div class="val ${periodeSaldo!=null?(periodeSaldo>=0?'pos':'neg'):''}" style="${periodeSaldo==null?'color:#ccc':''}">${periodeSaldo!=null?fmt(Math.round(periodeSaldo*100)/100):'—'}</div><div class="sub">eindbalans rekening</div></div>
    <div class="metric"><div class="lbl">${vorigLabel}</div><div class="val" style="${vorigSaldo!=null?'color:#888':'color:#ccc'}">${vorigSaldo!=null?fmt(Math.round(vorigSaldo*100)/100):'—'}</div><div class="sub">vorige periode</div></div>`;
  document.getElementById('bank-body').innerHTML = list.map(t => `<tr>
    <td style="color:var(--text-muted);padding-left:14px">${ddmm(t.datum)}</td>
    <td class="td-trunc">${weergaveNaam(t)}${t.omschr&&t.omschr!==t.naam?` <span style="color:var(--text-hint);font-size:10px">· ${t.omschr}</span>`:''}</td>
    <td style="font-size:11px;color:var(--text-muted)">${t.gb} ${GBNM[t.gb]||''}</td>
    <td>${rekBadge(t.rek)}</td>
    <td style="text-align:right;padding-right:14px">${typeBadge(t.type, t.bedrag)}</td>
  </tr>`).join('');
}

export function openTxModal() {
  state.editTxId = null;
  document.getElementById('tx-modal-title').textContent = 'Transactie toevoegen';
  document.getElementById('tx-save-btn').textContent = 'Opslaan';
  document.getElementById('tx-d').value = new Date().toISOString().split('T')[0];
  document.getElementById('tx-b').value = '';
  document.getElementById('tx-n').value = '';
  document.getElementById('tx-o').value = '';
  document.getElementById('modal-tx').classList.add('open');
}

export function closeTx() { document.getElementById('modal-tx').classList.remove('open'); }

// Voorkomt dat type (privé storting/opname) en grootboek (600/601) uit elkaar
// kunnen lopen — dat was de oorzaak van een foutieve privé-boeking in de data
// (2023: gb=601 "opname" maar type "storting"). Bij het kiezen van een privé-type
// wordt de grootboekrekening automatisch meegezet.
export function syncTxGrootboek() {
  const type = document.getElementById('tx-t').value;
  const gbSel = document.getElementById('tx-gb');
  if (type === 'prive_storting') gbSel.value = '600';
  else if (type === 'prive_opname') gbSel.value = '601';
}

export function saveTx() {
  let type = document.getElementById('tx-t').value;
  let gb = document.getElementById('tx-gb').value;
  // Zelfde beveiliging als saveTxGrootboek(), maar dan als laatste vangnet vóór opslaan:
  // gb en type mogen nooit tegenstrijdig zijn voor privé-boekingen.
  if (type === 'prive_storting') gb = '600';
  else if (type === 'prive_opname') gb = '601';
  else if (gb === '600') type = 'prive_storting';
  else if (gb === '601') type = 'prive_opname';
  const tx = {
    id: state.editTxId || state.nxtTx++,
    datum: document.getElementById('tx-d').value,
    bedrag: parseFloat(document.getElementById('tx-b').value) || 0,
    naam: document.getElementById('tx-n').value,
    omschr: document.getElementById('tx-o').value,
    type,
    rek: document.getElementById('tx-rek').value,
    gb,
  };
  if (state.editTxId) { state.TX = state.TX.map(t => t.id===state.editTxId ? tx : t); }
  else { state.TX.push(tx); }
  saveTxData();
  closeTx();
  renderBank();
}
