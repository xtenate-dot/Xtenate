// grootboek.js — Grootboek-pagina.

import { GBNM, ddmm, fmt, isInkomst, isUitgave, typeBadge, weergaveNaam } from './helpers.js';
import { state } from './storage.js';

export function renderGrootboek() {
  const maand = document.getElementById('f-maand-gb').value;
  const gbf = document.getElementById('f-gb-rek').value;
  let list = state.TX.filter(t => {
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
