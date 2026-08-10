// migratie-ui.js — het migratiescherm met de fasen en de uitkomsten.
//
// De fasen lopen van links naar rechts: Voorbereiden, Dry-run, Migreren,
// Controleren, Geslaagd. Een fase gaat pas open als de vorige is afgerond.
// Migreren is in deze versie nog niet gebouwd en blijft dus op slot.

import { maakVolledigeReservekopie, beschikbareJaren } from './export.js?v=20260806a';
import { alsTekst, diagnose, diagnoseAlsTekst, dryRun } from './migratie.js?v=20260806a';
import {
  herstelPreview, maakOpslagReservekopie, reservekopieen, voerHerstelUit, zetReservekopieTerug
} from './herstel.js?v=20260806a';

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const geld = n => '€ ' + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FASEN = ['Voorbereiden', 'Dry-run', 'Herstellen', 'Migreren', 'Controleren', 'Geslaagd'];
let fase = 0;
let reservekopieGemaakt = false;
let dryRunGoed = false;
let bezig = false;
let laatsteUitkomst = null;
let laatstePreview = null;

function renderFasen() {
  el('mig-fasen').innerHTML = FASEN.map((naam, i) => `
    <div class="mig-fase ${i < fase ? 'klaar' : i === fase ? 'bezig' : 'wacht'}">
      <span class="mig-bol">${i < fase ? '✓' : i + 1}</span>
      <span>${naam}</span>
    </div>`).join('<span class="mig-pijl">→</span>');
}

// ------------------------------------------------------- 1. voorbereiden

function renderVoorbereiden() {
  const jaren = beschikbareJaren().slice().sort();
  el('mig-inhoud').innerHTML = `
    <div class="alert alert-info">
      Voordat er iets verandert maak je een reservekopie in Excel. Dat is je terugweg, en die staat buiten de app en buiten Supabase.
    </div>
    <p class="ctrl-uitleg">Je krijgt ${jaren.length} bestanden, één per boekjaar: ${jaren.join(', ')}. Elk bestand is los terug te importeren. Je browser vraagt mogelijk of hij meerdere bestanden mag opslaan; sta dat toe.</p>
    <div id="mig-backup-status"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="mig-backup-knop" onclick="maakReservekopie()">Reservekopie downloaden</button>
      <button class="btn" id="mig-naar-dryrun" onclick="naarDryRun()" ${reservekopieGemaakt ? '' : 'disabled'}>Verder naar de dry-run</button>
    </div>`;
}

export async function maakReservekopie() {
  if (bezig) return;
  bezig = true;
  const knop = el('mig-backup-knop');
  knop.disabled = true;
  try {
    await maakVolledigeReservekopie((jaar, klaar, totaal) => {
      el('mig-backup-status').innerHTML =
        `<div class="alert alert-info">Bezig: ${klaar} van ${totaal} bestanden — zojuist Administratie_${jaar}.xlsx</div>`;
    });
    reservekopieGemaakt = true;
    el('mig-backup-status').innerHTML =
      `<div class="alert alert-ok">Alle bestanden gedownload. Controleer je downloadmap voordat je verdergaat.</div>`;
    el('mig-naar-dryrun').disabled = false;
  } catch (e) {
    el('mig-backup-status').innerHTML =
      `<div class="alert alert-error">De reservekopie kon niet worden gemaakt: ${esc(e.message)}</div>`;
  } finally {
    bezig = false;
    knop.disabled = false;
    knop.textContent = 'Opnieuw downloaden';
  }
}

export function naarDryRun() {
  fase = 1;
  renderFasen();
  renderDryRunStart();
}

// ------------------------------------------------------------ 2. dry-run

function renderDryRunStart() {
  el('mig-inhoud').innerHTML = `
    <div class="alert alert-info">
      De proefmigratie leest je administratie en de stand in Supabase, en laat zien wat er zou gebeuren. <strong>Er wordt niets weggeschreven.</strong>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="terugNaarVoorbereiden()">Terug</button>
      <button class="btn btn-primary" onclick="startDryRun()">Proefmigratie starten</button>
    </div>`;
}

export function terugNaarVoorbereiden() { fase = 0; renderFasen(); renderVoorbereiden(); }

export async function startDryRun() {
  if (bezig) return;
  bezig = true;
  el('mig-inhoud').innerHTML = '<p class="ctrl-uitleg">Bezig met vergelijken…</p>';
  try {
    const uitkomst = await dryRun();
    dryRunGoed = !uitkomst.heeftFouten && !uitkomst.fout;
    laatsteUitkomst = uitkomst;
    renderDryRunUitkomst(uitkomst);
  } catch (e) {
    el('mig-inhoud').innerHTML =
      `<div class="alert alert-error">De proefmigratie kon niet worden uitgevoerd: ${esc(e.message)}</div>
       <div class="modal-actions"><button class="btn" onclick="terugNaarVoorbereiden()">Terug</button></div>`;
  } finally {
    bezig = false;
  }
}

function renderDryRunUitkomst({ plan, totalen, waarschuwingen, regels, inDatabase, fout, heeftFouten }) {
  const tabelRij = r => `
    <tr>
      <td style="padding-left:16px">${esc(r.tabel)}</td>
      <td style="text-align:right;font-weight:600">${r.toevoegen}</td>
      <td style="text-align:right" class="muted">${inDatabase?.[r.tabel] ?? '—'}</td>
      <td class="muted" style="padding-right:16px;font-size:11px">${esc(r.toelichting)}</td>
    </tr>`;

  const jaarRij = j => `
    <tr>
      <td style="padding-left:16px">${j.jaar}</td>
      <td style="text-align:right">${j.aantal}</td>
      <td style="text-align:right" class="pos">${geld(j.excelOmzet ?? j.omzet)}</td>
      <td style="text-align:right" class="neg">${geld(j.excelKosten ?? j.kosten)}</td>
      <td style="text-align:right" class="muted">${geld(j.excelPriveOp ?? j.priveOp)}</td>
      <td style="text-align:right" class="muted">${geld(j.excelPriveSt ?? j.priveSt)}</td>
      <td style="text-align:right;padding-right:16px">${geld(j.ib)}</td>
    </tr>`;

  const waarschuwingBlok = w => `
    <div class="ctrl-regel ctrl-${w.ernst === 'fout' ? 'fout' : 'waarschuwing'}">
      <div class="ctrl-kop" style="cursor:default">
        <span class="ctrl-icoon">${w.ernst === 'fout' ? '✕' : '!'}</span>
        <span class="ctrl-titel">${esc(w.titel)} — ${w.aantal}
          <span class="ctrl-item-sub" style="display:block">${esc(w.uitleg)}</span>
          ${w.voorbeelden.length ? `<span class="ctrl-item-sub" style="display:block">Bijvoorbeeld: ${esc(w.voorbeelden.join(' · '))}</span>` : ''}
        </span>
      </div>
    </div>`;

  el('mig-inhoud').innerHTML = `
    ${fout ? `<div class="alert alert-error">De stand in Supabase kon niet worden opgehaald: ${esc(fout)}</div>` : ''}
    ${heeftFouten
      ? `<div class="alert alert-error">Er zijn punten die de migratie zouden laten mislukken. Los die eerst op.</div>`
      : `<div class="alert alert-ok">Het plan is compleet en er zijn geen blokkerende punten gevonden.</div>`}

    <div class="section-head"><div class="eyebrow">Wat er zou worden overgezet</div></div>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr>
          <th style="padding-left:16px">Onderdeel</th>
          <th style="text-align:right;width:80px">Erbij</th>
          <th style="text-align:right;width:70px">Nu in DB</th>
          <th style="padding-right:16px">Toelichting</th>
        </tr></thead>
        <tbody>${regels.map(tabelRij).join('')}</tbody>
      </table></div>
    </div>

    <div class="section-head"><div class="eyebrow">Financiële totalen per jaar</div></div>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr>
          <th style="padding-left:16px">Jaar</th>
          <th style="text-align:right">Boekingen</th>
          <th style="text-align:right">Omzet</th>
          <th style="text-align:right">Kosten</th>
          <th style="text-align:right">Privé op</th>
          <th style="text-align:right">Privé st</th>
          <th style="text-align:right;padding-right:16px">Geschatte IB</th>
        </tr></thead>
        <tbody>${totalen.perJaar.map(jaarRij).join('')}</tbody>
      </table></div>
    </div>

    <div class="section-head"><div class="eyebrow">Voorraad en saldo</div></div>
    <div class="kpi-grid" style="margin-bottom:var(--sp-3)">
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Banksaldo</div><div class="kpi-val">${geld(totalen.banksaldo)}</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Voorraadwaarde artikelen</div><div class="kpi-val">${geld(totalen.voorraadwaardeArtikelen)}</div><div class="kpi-sub">${totalen.artikelenZonderKostprijs} zonder kostprijs</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Stuks op voorraad</div><div class="kpi-val">${totalen.voorraadStuks}</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">HNVI in voorraad</div><div class="kpi-val">${geld(totalen.hnviVoorraadwaarde)}</div><div class="kpi-sub">${totalen.hnviInVoorraad} loten</div></div>
    </div>

    ${waarschuwingen.length ? `
      <div class="section-head"><div class="eyebrow">Aandachtspunten</div></div>
      <div class="card card-flush">${waarschuwingen.map(waarschuwingBlok).join('')}</div>` : ''}

    <div class="alert alert-info" style="margin-top:var(--sp-4)">
      Er is niets weggeschreven. De volgende fase, de daadwerkelijke migratie, is nog niet gebouwd — die komt pas als je akkoord geeft op deze cijfers.
    </div>

    <div class="modal-actions">
      <button class="btn" onclick="terugNaarVoorbereiden()">Terug</button>
      <button class="btn" onclick="startDryRun()">Opnieuw uitvoeren</button>
      <button class="btn" id="mig-kopieer" onclick="kopieerDryRun()">Resultaten kopiëren</button>
      <button class="btn" onclick="toonDiagnose()">Diagnose opslag</button>
      <button class="btn" onclick="naarHerstel()">Herstel bekijken</button>
      <button class="btn btn-primary" disabled title="Wordt gebouwd nadat je de cijfers hebt goedgekeurd">Migreren</button>
    </div>
    <textarea id="mig-tekst" readonly style="width:100%;height:150px;margin-top:var(--sp-3);display:none;
      font-family:ui-monospace,monospace;font-size:11px;padding:10px;border:1px solid var(--border-strong);
      border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text)"></textarea>`;
}

/** Toont wat er ruw in de opslag van deze browser staat. */
export async function toonDiagnose() {
  const tekst = diagnoseAlsTekst(diagnose());
  const vak = el('mig-tekst');
  vak.value = tekst;
  vak.style.display = '';
  vak.style.height = '320px';
  vak.select();
  try { await navigator.clipboard.writeText(tekst); } catch { /* dan selecteert de gebruiker zelf */ }
}

/** Zet de uitkomst op het klembord, met een tekstvak als terugval. */
export async function kopieerDryRun() {
  if (!laatsteUitkomst) return;
  const tekst = alsTekst(laatsteUitkomst);
  const vak = el('mig-tekst');
  const knop = el('mig-kopieer');
  vak.value = tekst;
  try {
    await navigator.clipboard.writeText(tekst);
    knop.textContent = 'Gekopieerd';
    setTimeout(() => { knop.textContent = 'Resultaten kopiëren'; }, 2500);
  } catch {
    // Kopiëren mag niet altijd zomaar; dan tonen we de tekst om zelf te selecteren.
    vak.style.display = '';
    vak.select();
    knop.textContent = 'Selecteer en kopieer hieronder';
  }
}

// ---------------------------------------------------------- 3. herstellen

/** Bedrag zonder euroteken, voor de compacte hersteltabellen. */
const kaal = n => Number(n || 0).toFixed(2);

export function naarHerstel() {
  fase = 2;
  renderFasen();
  renderHerstelPreview();
}

function renderHerstelPreview() {
  const p = herstelPreview();
  laatstePreview = p;

  const jaarRij = j => `
    <tr>
      <td style="padding-left:16px">${j.jaar}</td>
      <td style="text-align:right" class="muted">${j.nu}</td>
      <td style="text-align:right" class="muted">${j.inCode}</td>
      <td style="text-align:right">${j.alleenInApp}${j.dubbelInApp ? ` <span class="neg">(${j.dubbelInApp} dubbel)</span>` : ''}</td>
      <td style="text-align:right" class="muted">${j.alleenInCode}</td>
      <td style="text-align:right;font-weight:600;padding-right:16px" class="${j.na >= j.nu ? 'pos' : 'neg'}">${j.na}</td>
    </tr>`;

  const totaalRij = `
    <tr style="border-top:1px solid var(--border-strong)">
      <td style="padding-left:16px;font-weight:600">Historie</td>
      <td style="text-align:right" class="muted">${p.jaren.reduce((s, j) => s + j.nu, 0)}</td>
      <td style="text-align:right" class="muted">${p.jaren.reduce((s, j) => s + j.inCode, 0)}</td>
      <td style="text-align:right">${p.jaren.reduce((s, j) => s + j.alleenInApp, 0)}</td>
      <td style="text-align:right" class="muted">${p.jaren.reduce((s, j) => s + j.alleenInCode, 0)}</td>
      <td style="text-align:right;font-weight:600;padding-right:16px">${p.jaren.reduce((s, j) => s + j.na, 0)}</td>
    </tr>`;

  const jtRij = t => `
    <tr>
      <td style="padding-left:16px">${t.jaar}${t.wijzigt ? '' : ' <span class="muted">ongewijzigd</span>'}</td>
      <td style="text-align:right" class="muted">${kaal(t.nu.omzet)}</td>
      <td style="text-align:right" class="muted">${kaal(t.nu.kosten)}</td>
      <td style="text-align:right" class="${Number(t.nu.priveOp) < 0 ? 'neg' : 'muted'}">${kaal(t.nu.priveOp)}</td>
      <td style="text-align:right" class="${Number(t.nu.priveSt) < 0 ? 'neg' : 'muted'}">${kaal(t.nu.priveSt)}</td>
      <td style="text-align:right;padding-right:16px" class="pos">${t.na ? `${kaal(t.na.omzet)} / ${kaal(t.na.kosten)} / ${kaal(t.na.priveOp)} / ${kaal(t.na.priveSt)}` : '—'}</td>
    </tr>`;

  const extra2026 = p.huidigJaar.buitenJaar || p.huidigJaar.dubbel;

  el('mig-inhoud').innerHTML = `
    <div class="alert alert-info">
      Dit is een voorbeeldweergave. <strong>Er is nog niets gewijzigd.</strong> De herstelknop staat onderaan en werkt pas nadat je het vinkje hebt gezet.
    </div>

    <div class="section-head"><div class="eyebrow">Historische boekingen 2022 tot en met 2025</div></div>
    <p class="ctrl-uitleg">Er wordt niets vervangen maar samengevoegd: de boekingen uit de code vormen de basis, en alles wat daarnaast alleen in jouw browser staat blijft behouden. Twee boekingen gelden als dezelfde bij gelijke datum, bedrag, grootboek, rekening, soort, naam en omschrijving.</p>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr>
          <th style="padding-left:16px">Jaar</th>
          <th style="text-align:right">Nu</th>
          <th style="text-align:right">In de code</th>
          <th style="text-align:right">Alleen bij jou</th>
          <th style="text-align:right">Alleen in de code</th>
          <th style="text-align:right;padding-right:16px">Na herstel</th>
        </tr></thead>
        <tbody>${p.jaren.map(jaarRij).join('')}${totaalRij}</tbody>
      </table></div>
    </div>
    ${p.jaren.some(j => j.alleenInApp) ? `
      <p class="ctrl-uitleg"><strong>Alleen bij jou aanwezig, blijft dus staan:</strong><br>${
        p.jaren.filter(j => j.alleenInApp).map(j =>
          `${j.jaar}: ${j.alleenInAppVoorbeelden.join(' · ')}${j.alleenInApp > 5 ? ` en nog ${j.alleenInApp - 5}` : ''}`).join('<br>')}</p>` : ''}

    <div class="section-head"><div class="eyebrow">Het lopende jaar blijft ongemoeid</div></div>
    <div class="card">
      <p class="ctrl-uitleg" style="margin:0">
        <strong>${p.huidigJaar.aantal} boekingen</strong> in xtenate_tx worden niet aangeraakt.
        Verdeling over de jaren: ${Object.entries(p.huidigJaar.perJaar).sort().map(([j, n]) => `${j}: ${n}`).join(' · ')}.
        ${extra2026 ? `<br><span class="neg">Let op:</span> ${p.huidigJaar.buitenJaar} boekingen hebben geen datum in 2026${p.huidigJaar.dubbel ? `, en ${p.huidigJaar.dubbel} regels komen dubbel voor` : ''}. Die laat ik met rust — daar wil ik eerst met je naar kijken.` : ''}
      </p>
    </div>

    <div class="section-head"><div class="eyebrow">Jaartotalen</div></div>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr>
          <th style="padding-left:16px">Jaar</th>
          <th style="text-align:right">Omzet nu</th>
          <th style="text-align:right">Kosten nu</th>
          <th style="text-align:right">Privé op nu</th>
          <th style="text-align:right">Privé st nu</th>
          <th style="text-align:right;padding-right:16px">Na herstel (omzet / kosten / op / st)</th>
        </tr></thead>
        <tbody>${p.jaartotalen.map(jtRij).join('')}</tbody>
      </table></div>
    </div>

    <div class="section-head"><div class="eyebrow">Overig</div></div>
    <div class="kpi-grid" style="margin-bottom:var(--sp-3)">
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Maandsaldi</div><div class="kpi-val">${p.maandsaldi.nu} → ${p.maandsaldi.na}</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Voorraadartikelen</div><div class="kpi-val">${p.onaangeroerd.voorraadartikelen}</div><div class="kpi-sub">blijft</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">HNVI-loten</div><div class="kpi-val">${p.onaangeroerd.hnviLoten}</div><div class="kpi-sub">blijft</div></div>
      <div class="kpi kpi--secondary"><div class="kpi-lbl">Genegeerde meldingen</div><div class="kpi-val">${p.onaangeroerd.genegeerdeMeldingen}</div><div class="kpi-sub">blijft</div></div>
    </div>

    <div class="alert alert-ok">
      Totaal aantal boekingen: <strong>${p.totaalNu} → ${p.totaalNa}</strong>.
      Voordat er iets verandert wordt je complete browseropslag als reservekopie weggezet, zodat dit terug te draaien is.
    </div>

    <label style="display:flex;align-items:center;gap:10px;font-size:12.5px;margin:var(--sp-4) 0">
      <input type="checkbox" id="mig-akkoord" onchange="document.getElementById('mig-herstel-knop').disabled = !this.checked">
      Ik heb de bovenstaande cijfers gecontroleerd en ga akkoord met het herstel.
    </label>
    <div id="mig-herstel-status"></div>

    <div class="modal-actions">
      <button class="btn" onclick="startDryRun()">Terug naar de dry-run</button>
      <button class="btn btn-primary" id="mig-herstel-knop" disabled onclick="doeHerstel()">Herstel uitvoeren</button>
    </div>`;
}

export async function doeHerstel() {
  if (bezig) return;
  if (!el('mig-akkoord')?.checked) return;
  bezig = true;
  el('mig-herstel-knop').disabled = true;
  el('mig-herstel-status').innerHTML = '<div class="alert alert-info">Bezig met herstellen…</div>';
  try {
    const uit = voerHerstelUit();
    const na = diagnose();
    const controle = await dryRun();
    laatsteUitkomst = controle;
    fase = 3;
    renderFasen();
    renderNaHerstel(uit, na, controle);
  } catch (e) {
    el('mig-herstel-status').innerHTML =
      `<div class="alert alert-error">Het herstel is mislukt: ${esc(e.message)}. Er is een reservekopie gemaakt; die kun je hieronder terugzetten.</div>`;
    el('mig-herstel-knop').disabled = false;
  } finally {
    bezig = false;
  }
}

function renderNaHerstel(uit, na, controle) {
  const kopieen = reservekopieen();
  el('mig-inhoud').innerHTML = `
    <div class="alert alert-ok">
      Herstel uitgevoerd. Reservekopie weggezet onder <code>${esc(uit.reservekopie.naam)}</code> met ${uit.reservekopie.sleutels} opslagsleutels.
    </div>

    <div class="section-head"><div class="eyebrow">Boekingen per jaar na herstel</div></div>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr><th style="padding-left:16px">Jaar</th><th style="text-align:right;padding-right:16px">Boekingen</th></tr></thead>
        <tbody>${controle.plan.perJaar.map(j =>
          `<tr><td style="padding-left:16px">${j.jaar}</td><td style="text-align:right;padding-right:16px">${j.aantal}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--border-strong)">
            <td style="padding-left:16px;font-weight:600">Totaal</td>
            <td style="text-align:right;font-weight:600;padding-right:16px">${controle.plan.boekingen.length}</td></tr>
        </tbody>
      </table></div>
    </div>

    <div class="section-head"><div class="eyebrow">Jaartotalen na herstel</div></div>
    <div class="card card-flush">
      <div class="table-wrap"><table class="tbl-compact">
        <thead><tr><th style="padding-left:16px">Jaar</th><th style="text-align:right">Omzet</th><th style="text-align:right">Kosten</th>
          <th style="text-align:right">Privé op</th><th style="text-align:right;padding-right:16px">Privé st</th></tr></thead>
        <tbody>${controle.totalen.perJaar.map(j => `
          <tr><td style="padding-left:16px">${j.jaar}</td>
            <td style="text-align:right">${kaal(j.excelOmzet ?? j.omzet)}</td>
            <td style="text-align:right">${kaal(j.excelKosten ?? j.kosten)}</td>
            <td style="text-align:right" class="${(j.excelPriveOp ?? j.priveOp) < 0 ? 'neg' : ''}">${kaal(j.excelPriveOp ?? j.priveOp)}</td>
            <td style="text-align:right;padding-right:16px" class="${(j.excelPriveSt ?? j.priveSt) < 0 ? 'neg' : ''}">${kaal(j.excelPriveSt ?? j.priveSt)}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>

    <div class="section-head"><div class="eyebrow">Maandsaldi</div></div>
    <div class="card"><p class="ctrl-uitleg" style="margin:0">${na.maandenTotaal} maanden: ${
      Object.entries(na.maandenPerJaar).sort().map(([j, m]) => `${j} (${m.length})`).join(' · ')}</p></div>

    ${kopieen.length ? `
      <div class="section-head"><div class="eyebrow">Reservekopieën in deze browser</div></div>
      <div class="card card-flush">${kopieen.map(k => `
        <div class="ctrl-item">
          <span class="ctrl-item-main" style="cursor:default">
            <span class="ctrl-item-label">${esc(k.sleutel)}</span>
            <span class="ctrl-item-sub">${esc(k.gemaakt)} · ${k.sleutels} sleutels</span>
          </span>
          <div class="ctrl-item-acties">
            <button class="btn btn-sm" onclick="herstelReservekopie('${esc(k.sleutel)}')">Terugzetten</button>
          </div>
        </div>`).join('')}</div>` : ''}

    <div class="alert alert-info" style="margin-top:var(--sp-4)">
      Ververs de pagina om alles opnieuw te laten tekenen, en controleer daarna de Bank-pagina per jaar. Er is nog steeds niets naar Supabase geschreven.
    </div>

    <div class="modal-actions">
      <button class="btn" onclick="toonDiagnose()">Diagnose opnieuw</button>
      <button class="btn" onclick="startDryRun()">Dry-run opnieuw</button>
      <button class="btn" onclick="kopieerDryRun()">Resultaten kopiëren</button>
    </div>
    <textarea id="mig-tekst" readonly style="width:100%;height:150px;margin-top:var(--sp-3);display:none;
      font-family:ui-monospace,monospace;font-size:11px;padding:10px;border:1px solid var(--border-strong);
      border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text)"></textarea>`;
}

export function herstelReservekopie(sleutel) {
  if (!window.confirm(`Alles terugzetten zoals het was in ${sleutel}? Wijzigingen sindsdien gaan verloren. Daarna moet je de pagina verversen.`)) return;
  try {
    const aantal = zetReservekopieTerug(sleutel);
    window.alert(`${aantal} opslagsleutels teruggezet. Ververs de pagina om het resultaat te zien.`);
  } catch (e) {
    window.alert('Terugzetten mislukt: ' + e.message);
  }
}

// -------------------------------------------------------------------- modal

export function openMigratieModal() {
  fase = 0;
  renderFasen();
  renderVoorbereiden();
  el('modal-migratie').classList.add('open');
}

export function sluitMigratieModal() {
  if (bezig) return;
  el('modal-migratie').classList.remove('open');
}
