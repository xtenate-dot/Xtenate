// opslagdiagnose-ui.js — het scherm bij de tijdelijke opslagdiagnose.
//
// Toont alleen. Er wordt niets opgeslagen, hersteld of gemigreerd; ook geen
// voorkeur over welk tabblad open stond. Na het onderzoek mag dit bestand weg.

import { opslagDiagnose, opslagDiagnoseAlsTekst } from './opslagdiagnose.js?v=20260806a';

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let laatsteTekst = '';

export function openOpslagDiagnose() {
  laatsteTekst = '';
  el('diag-inhoud').innerHTML = `
    <div class="alert alert-info">
      Dit scherm <strong>leest alleen</strong>. Er wordt niets opgeslagen, hersteld of naar Supabase geschreven.
      Het vergelijkt drie bronnen: <code>xtenate_tx</code>, <code>xtenate_hist_tx_override</code> en de historie in de code (<code>HIST_TX_DEFAULT</code>).
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="diag-knop" onclick="voerOpslagDiagnoseUit()">Diagnose opslag uitvoeren</button>
    </div>`;
  el('modal-opslagdiagnose').classList.add('open');
}

export function sluitOpslagDiagnose() {
  el('modal-opslagdiagnose').classList.remove('open');
}

export function voerOpslagDiagnoseUit() {
  const knop = el('diag-knop');
  if (knop) knop.disabled = true;
  try {
    const d = opslagDiagnose();
    laatsteTekst = opslagDiagnoseAlsTekst(d);
    render(d);
  } catch (e) {
    el('diag-inhoud').innerHTML =
      `<div class="alert alert-error">De diagnose liep vast: ${esc(e.message)}. Er is niets gewijzigd.</div>`;
  }
}

function render(d) {
  const bronRij = ([naam, b]) => `
    <tr>
      <td style="padding-left:16px"><code>${esc(naam)}</code></td>
      <td style="text-align:right;font-weight:600">${b.aantal}</td>
      <td class="muted" style="padding-right:16px;font-size:11px">
        ${esc(Object.entries(b.perJaar).sort().map(([j, n]) => `${j}: ${n}`).join(' · ') || '—')}
        ${b.aanwezig === false ? ' <span class="neg">(sleutel bestaat niet)</span>' : ''}
        ${b.fout ? ` <span class="neg">(${esc(b.fout)})</span>` : ''}
      </td>
    </tr>`;

  const jaarRij = j => `
    <tr>
      <td style="padding-left:16px">${j.jaar}</td>
      <td style="text-align:right" class="muted">${j.aantalMijn}</td>
      <td style="text-align:right" class="muted">${j.aantalCode}</td>
      <td style="text-align:right;font-weight:600" class="${j.exact.length ? 'pos' : ''}">${j.exact.length}</td>
      <td style="text-align:right;font-weight:600" class="${j.verschoven.length ? 'neg' : ''}">${j.verschoven.length}</td>
      <td style="text-align:right">${j.afwijkend.length}</td>
      <td style="text-align:right">${j.alleenBijMij.length}</td>
      <td style="text-align:right;padding-right:16px">${j.alleenInCode.length}</td>
    </tr>`;

  // Alle datumverschillen samengeteld, want dat is het vermoeden dat we toetsen.
  const perDelta = {};
  d.jaren.forEach(j => j.verschoven.forEach(v => { perDelta[v.dagen] = (perDelta[v.dagen] || 0) + 1; }));
  const deltas = Object.entries(perDelta).sort((a, b) => a[0] - b[0]);

  const voorbeelden = [];
  d.jaren.forEach(j => j.verschoven.slice(0, 4).forEach(v => voorbeelden.push({ jaar: j.jaar, ...v })));

  el('diag-inhoud').innerHTML = `
    <div class="alert alert-ok">
      Klaar. <strong>Er is niets geschreven.</strong> Tijdzone ${esc(d.tijdzone)}, UTC ${d.utcAfwijkingUren >= 0 ? '+' : ''}${d.utcAfwijkingUren} uur.
    </div>

    <div class="section-head"><div class="eyebrow">De drie bronnen</div></div>
    <div class="card card-flush"><div class="table-wrap"><table class="tbl-compact">
      <thead><tr><th style="padding-left:16px">Bron</th><th style="text-align:right">Boekingen</th><th style="padding-right:16px">Per jaar</th></tr></thead>
      <tbody>${Object.entries(d.bakken).map(bronRij).join('')}</tbody>
    </table></div></div>

    <div class="section-head"><div class="eyebrow">Vergelijking per jaar</div></div>
    <div class="card card-flush"><div class="table-wrap"><table class="tbl-compact">
      <thead><tr>
        <th style="padding-left:16px">Jaar</th>
        <th style="text-align:right">Bij mij</th>
        <th style="text-align:right">In code</th>
        <th style="text-align:right">Exact gelijk</th>
        <th style="text-align:right">Datum verschoven</th>
        <th style="text-align:right">Ander veld</th>
        <th style="text-align:right">Alleen bij mij</th>
        <th style="text-align:right;padding-right:16px">Alleen in code</th>
      </tr></thead>
      <tbody>${d.jaren.map(jaarRij).join('')}</tbody>
    </table></div></div>
    <p class="ctrl-uitleg">"Datum verschoven" betekent: bedrag, grootboek, rekening, soort, naam én omschrijving zijn gelijk, alleen de datum wijkt af. Dat is dus dezelfde boeking, geen nieuwe.</p>

    <div class="section-head"><div class="eyebrow">Datumverschillen</div></div>
    <div class="card">
      <p class="ctrl-uitleg" style="margin:0">
        ${deltas.length
          ? deltas.map(([dagen, n]) => `<strong>${n}×</strong> ${dagen > 0 ? '+' : ''}${dagen} dag`).join(' · ')
          : 'Geen verschoven boekingen gevonden.'}
      </p>
      ${voorbeelden.length ? `<div class="table-wrap" style="margin-top:var(--sp-3)"><table class="tbl-compact">
        <thead><tr><th>Jaar</th><th>Bij mij</th><th>In code</th><th style="text-align:right">Verschil</th><th style="text-align:right">Bedrag</th><th>Naam</th></tr></thead>
        <tbody>${voorbeelden.map(v => `<tr>
          <td>${v.jaar}</td><td>${esc(v.mijn.datum)}</td><td>${esc(v.code.datum)}</td>
          <td style="text-align:right" class="neg">${v.dagen > 0 ? '+' : ''}${v.dagen}</td>
          <td style="text-align:right">${Number(v.mijn.bedrag).toFixed(2)}</td>
          <td class="muted" style="font-size:11px">${esc(String(v.mijn.naam || '').slice(0, 44))}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>

    <div class="section-head"><div class="eyebrow">Losse bevindingen</div></div>
    <div class="kpi-grid" style="margin-bottom:var(--sp-3)">
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Zonder geldige datum</div>
        <div class="kpi-val ${d.zonderDatum.length ? 'neg' : ''}">${d.zonderDatum.length}</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Dubbele nummers</div>
        <div class="kpi-val ${d.idBotsingen.length ? 'neg' : ''}">${d.idBotsingen.length}</div>
        <div class="kpi-sub">${d.idBotsingen.reduce((s, x) => s + x.aantal - 1, 0)} regels te veel</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Echte dubbele boekingen</div>
        <div class="kpi-val">${d.jaren.reduce((s, j) => s + j.dubbelen.length, 0)}</div>
        <div class="kpi-sub">identiek in mijn opslag</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Boekingen 2022</div>
        <div class="kpi-val">${d.tweeentwintigVolledig.length}</div></div>
    </div>

    <p class="ctrl-uitleg">De volledige uitvoer staat hieronder: alle regels van 2022, alle datumverschuivingen, de boekingen zonder datum en elke nummerbotsing met de bijbehorende regels. Kopieer die en plak hem terug in het gesprek.</p>

    <div class="modal-actions">
      <button class="btn" onclick="voerOpslagDiagnoseUit()">Opnieuw uitvoeren</button>
      <button class="btn btn-primary" id="diag-kopieer" onclick="kopieerOpslagDiagnose()">Resultaten kopiëren</button>
    </div>
    <textarea id="diag-tekst" readonly style="width:100%;height:340px;margin-top:var(--sp-3);
      font-family:ui-monospace,monospace;font-size:11px;padding:10px;border:1px solid var(--border-strong);
      border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text)">${esc(laatsteTekst)}</textarea>`;
}

export async function kopieerOpslagDiagnose() {
  const knop = el('diag-kopieer');
  const vak = el('diag-tekst');
  try {
    await navigator.clipboard.writeText(laatsteTekst);
    knop.textContent = 'Gekopieerd';
    setTimeout(() => { knop.textContent = 'Resultaten kopiëren'; }, 2500);
  } catch {
    // Kopiëren mag niet altijd zomaar; dan selecteren we de tekst zodat je
    // hem met Ctrl+C zelf kunt pakken.
    vak.focus();
    vak.select();
    knop.textContent = 'Druk nu Ctrl+C';
  }
}
