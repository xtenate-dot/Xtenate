// grootboek.js — Grootboek-pagina.

import { GBNM, ddmm, fmt, isInkomst, isUitgave, typeBadge, weergaveNaam } from './helpers.js?v=20260710a';
import { state } from './storage.js?v=20260710a';

const MND_NAMEN = {'01':'jan','02':'feb','03':'mrt','04':'apr','05':'mei','06':'jun','07':'jul','08':'aug','09':'sep','10':'okt','11':'nov','12':'dec'};

export function renderGrootboek() {
  const jaarSel = document.getElementById('f-jaar-gb');
  const gekozenJaar = jaarSel ? jaarSel.value : '2026';

  // Zelfde bron-logica als Bank/HNVI: 2026 = live data, anders historisch, 'all' = alles samen.
  let bronData;
  if (gekozenJaar === '2026') bronData = state.TX;
  else if (gekozenJaar === 'all') bronData = [...state.HIST_TX, ...state.TX];
  else bronData = state.HIST_TX.filter(t => t.datum.startsWith(gekozenJaar));

  // Maandenlijst dynamisch opbouwen voor het gekozen jaar (was voorheen hardcoded op 2026).
  const maandSel = document.getElementById('f-maand-gb');
  const huidigeMaandKeuze = maandSel.value;
  const beschikbareMaanden = [...new Set(bronData.map(t => t.datum.slice(0,7)))].sort().reverse();
  maandSel.innerHTML = '<option value="">Alle maanden</option>' + beschikbareMaanden.map(m =>
    `<option value="${m}"${m === huidigeMaandKeuze ? ' selected' : ''}>${MND_NAMEN[m.slice(5,7)] || m} ${m.slice(0,4)}</option>`
  ).join('');

  const maand = maandSel.value;
  const gbf = document.getElementById('f-gb-rek').value;
  let list = bronData.filter(t => {
    if (maand && !t.datum.startsWith(maand)) return false;
    if (gbf && t.gb !== gbf) return false;
    return true;
  });
  const inc = list.filter(isInkomst).reduce((s,t)=>s+t.bedrag,0);
  const exp = list.filter(isUitgave).reduce((s,t)=>s+t.bedrag,0);
  document.getElementById('gb-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Omzet</div><div class="val pos">${fmt(inc)}</div></div>
    <div class="metric"><div class="lbl">Kosten & inkoop</div><div class="val neg">${fmt(exp)}</div></div>
    <div class="metric"><div class="lbl">Resultaat</div><div class="val ${inc-exp>=0?'pos':'neg'}">${fmt(inc-exp)}</div></div>
    <div class="metric"><div class="lbl">Boekingen</div><div class="val">${list.length}</div></div>`;
  const gbs = [...new Set(list.map(t=>t.gb))].sort();
  document.getElementById('gb-body').innerHTML = gbs.map(gb => {
    const rows = list.filter(t=>t.gb===gb).sort((a,b)=>b.datum.localeCompare(a.datum));
    const tot = rows.reduce((s,t)=>s+(isInkomst(t)?t.bedrag:-t.bedrag),0);
    return `<div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <div style="font-weight:600;font-size:13px">${gb} — ${GBNM[gb]||gb}</div>
        <div class="${tot>=0?'pos':'neg'}" style="font-size:13px;font-weight:600">${tot>=0?'+':''}${fmt(tot)}</div>
      </div>
      <table><thead><tr><th style="width:72px">Datum</th><th>Naam</th><th style="width:76px">Rekening</th><th style="width:90px;text-align:right">Bedrag</th></tr></thead>
      <tbody>${rows.map(t=>`<tr>
        <td style="color:var(--text-muted)">${ddmm(t.datum)}</td>
        <td class="td-trunc">${weergaveNaam(t)}</td>
        <td style="text-align:right">${typeBadge(t.type,t.bedrag)}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  }).join('') || '<div style="color:var(--text-muted);padding:1rem 0;font-size:13px">Geen boekingen gevonden.</div>';
}
