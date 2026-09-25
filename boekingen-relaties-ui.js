// boekingen-relaties-ui.js — scherm voor fase 4b-1: bestaande boekingen aan
// relaties koppelen via exacte IBAN-clusters.
//
// Zelfde venster-patroon als partijen.js (dynamisch toegevoegde
// .pm-laag/.pm-venster), maar in een eigen bestand: dit gaat over
// facturenmodule-relaties, niet over de debiteuren/crediteuren-lijst.
//
// Read-only totdat er wordt bevestigd: dit bestand roept
// bevestigIbanCluster() nergens automatisch aan, alleen als directe reactie
// op de Koppelen-knop van één cluster, met precies de op dat moment
// aangevinkte boekingen van dát cluster. Afwijzen schrijft nooit naar een
// boeking — dat verbergt alleen de suggestie.

import { esc, fmt, ddmm } from './helpers.js?v=20260902a';
import { zoekRelaties, maakRelatie } from './relaties.js?v=20260902a';
import {
  berekenIbanClusters, bevestigIbanCluster, afwijsIbanCluster,
  afgewezenIbanClusters, herstelIbanCluster
} from './boekingen-relaties.js?v=20260902a';

let sluitHuidige = null;

// Schermstatus — puur UI, leeft alleen zolang het venster open staat en
// bepaalt alleen wát je ziet. De daadwerkelijke koppeling gebeurt
// uitsluitend in de Koppelen-knop hieronder, met de dan geldende
// aanvinkingen — nooit als bijeffect van uitklappen of typen.
let uitgeklapt = new Set();     // iban's die uitgeklapt staan
let uitgesloten = new Map();    // iban -> Set van boekingsleutels die zijn uitgevinkt
let bevestigModus = null;       // iban waarvoor het relatie-zoekveld open staat
let bevestigGekozen = null;     // {id, naam} of null, voor bevestigModus

const boekingSleutel = b => `${b._hist ? 'h' : 't'}_${b.id}`;

export function openIbanClusterScherm() {
  uitgeklapt = new Set();
  uitgesloten = new Map();
  bevestigModus = null;
  bevestigGekozen = null;
  tekenVenster();
}

function tekenVenster() {
  sluitHuidige?.();

  const laag = document.createElement('div');
  laag.className = 'pm-laag';
  laag.id = 'pm-iban-clusters';
  laag.innerHTML = `<div class="pm-venster" role="dialog" aria-modal="true" style="max-width:880px">${inhoudHtml()}</div>`;
  document.body.appendChild(laag);

  const sluit = () => {
    document.removeEventListener('keydown', opToets, true);
    laag.remove();
    if (sluitHuidige === sluit) sluitHuidige = null;
  };
  function opToets(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); sluit(); }
  }
  document.addEventListener('keydown', opToets, true);
  laag.addEventListener('mousedown', e => { if (e.target === laag) sluit(); });

  sluitHuidige = sluit;
  hangKoppelingenOp(laag);
}

function herteken() {
  const laag = document.getElementById('pm-iban-clusters');
  const venster = laag?.querySelector('.pm-venster');
  if (!venster) return;
  venster.innerHTML = inhoudHtml();
  hangKoppelingenOp(laag);
}

function inhoudHtml() {
  const clusters = berekenIbanClusters();

  const lijstHtml = clusters.length
    ? clusters.map(clusterHtml).join('')
    : `<div class="leeg" style="padding:24px 0">Geen openstaande IBAN-clusters. Alle boekingen met een IBAN als naam zijn al gekoppeld of afgewezen.</div>`;

  const afgewezen = afgewezenIbanClusters();
  const afgewezenHtml = afgewezen.length
    ? `<p class="pm-hint" style="margin:10px 0 0">${afgewezen.length} eerder afgewezen cluster${afgewezen.length === 1 ? '' : 's'} — <a href="#" data-reset-afgewezen>allemaal weer tonen</a></p>`
    : '';

  return `
    <header class="pm-kop">
      <div>
        <h3>Boekingen koppelen — gelijke IBAN</h3>
        <p class="pm-sub">Boekingen waarvan de naam exact dezelfde IBAN is, gegroepeerd als voorstel. Niets wordt gewijzigd totdat je een cluster bevestigt.</p>
      </div>
      <button type="button" class="pm-kruis" data-pm-sluit aria-label="Sluiten">&times;</button>
    </header>
    <div class="pm-inhoud" style="padding:4px 20px 16px">
      ${lijstHtml}
      ${afgewezenHtml}
    </div>
    <footer class="pm-voet">
      <span class="pm-hint">Esc sluit dit venster</span>
      <button type="button" class="btn" data-pm-sluit>Sluiten</button>
    </footer>`;
}

function clusterHtml(c) {
  const open = uitgeklapt.has(c.iban);
  const uitgeslotenSet = uitgesloten.get(c.iban) || new Set();
  const meegenomen = c.boekingen.filter(b => !uitgeslotenSet.has(boekingSleutel(b)));

  const rijen = c.boekingen.map(b => {
    const sleutel = boekingSleutel(b);
    const uit = uitgeslotenSet.has(sleutel);
    return `
    <tr style="${uit ? 'opacity:.45' : ''}">
      <td style="width:28px"><input type="checkbox" data-cluster="${esc(c.iban)}" data-boeking="${esc(sleutel)}" ${uit ? '' : 'checked'} aria-label="Boeking van ${esc(ddmm(String(b.datum)))} meenemen"></td>
      <td class="pm-datum">${esc(ddmm(String(b.datum)))}</td>
      <td class="pm-bedrag">${fmt(b.bedrag)}</td>
      <td class="pm-gb">${esc(b.gb || '—')}</td>
      <td class="pm-omschr" title="${esc(b.omschr || '')}">${esc(b.omschr || '—')}</td>
    </tr>`;
  }).join('');

  return `
    <div class="groep-rij" style="flex-wrap:wrap;align-items:flex-start;padding:10px 0;border-top:1px solid var(--border-default)">
      <div style="flex:1;min-width:220px;cursor:pointer" data-toggle="${esc(c.iban)}">
        <div style="font-weight:600;font-size:13px">${esc(c.iban)} <span class="muted" style="font-weight:400">${open ? '▾' : '▸'}</span></div>
        <div class="muted" style="font-size:12px">${c.aantal} boeking${c.aantal === 1 ? '' : 'en'} &middot; ${fmt(c.totaal)} &middot; ${esc(ddmm(c.vanDatum))}&ndash;${esc(ddmm(c.totDatum))}</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-bevestig="${esc(c.iban)}">Bevestigen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-aanpassen="${esc(c.iban)}">Aanpassen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-afwijzen="${esc(c.iban)}">Afwijzen</button>
      ${open ? `
      <div style="width:100%;overflow:auto;margin-top:8px">
        <table class="pm-tabel">
          <thead><tr><th></th><th class="pm-datum">Datum</th><th class="pm-bedrag">Bedrag</th><th class="pm-gb">Grootboek</th><th class="pm-omschr">Omschrijving</th></tr></thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>` : ''}
      ${bevestigModus === c.iban ? bevestigBlokHtml(c, meegenomen) : ''}
    </div>`;
}

function bevestigBlokHtml(c, meegenomen) {
  if (!meegenomen.length) {
    return `<div class="muted" style="width:100%;padding:8px 0;font-size:12px">Alle boekingen uit dit cluster zijn uitgevinkt — er is niets om te koppelen. Vink er minstens één weer aan, of sluit dit af met Annuleren.
      <button type="button" class="btn btn-ghost btn-sm" data-bevestig-annuleer="${esc(c.iban)}">Annuleren</button></div>`;
  }

  if (bevestigGekozen) {
    return `
    <div style="width:100%;margin-top:10px;padding:10px;border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--bg-card-hover)">
      <div class="muted" style="font-size:12px;margin-bottom:6px">Koppelen aan relatie voor ${meegenomen.length} boeking${meegenomen.length === 1 ? '' : 'en'}:</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong>${esc(bevestigGekozen.naam)}</strong>
        <button type="button" class="btn-details" data-bevestig-anders="${esc(c.iban)}">Andere relatie kiezen</button>
        <button type="button" class="btn btn-primary btn-sm" data-bevestig-koppel="${esc(c.iban)}">Koppelen</button>
        <button type="button" class="btn btn-ghost btn-sm" data-bevestig-annuleer="${esc(c.iban)}">Annuleren</button>
      </div>
    </div>`;
  }

  return `
    <div style="width:100%;margin-top:10px;padding:10px;border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--bg-card-hover)">
      <div class="muted" style="font-size:12px;margin-bottom:6px">Koppelen aan relatie voor ${meegenomen.length} boeking${meegenomen.length === 1 ? '' : 'en'} — zoek een bestaande relatie of maak een nieuwe:</div>
      <div style="position:relative;max-width:340px">
        <input type="text" data-bevestig-zoek="${esc(c.iban)}" placeholder="Naam relatie…" autocomplete="off">
        <div class="search-results" data-bevestig-sugg="${esc(c.iban)}"></div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" data-bevestig-annuleer="${esc(c.iban)}">Annuleren</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────── koppelingen

function hangKoppelingenOp(laag) {
  laag.querySelectorAll('[data-pm-sluit]').forEach(k => k.addEventListener('click', () => sluitHuidige?.()));

  laag.querySelectorAll('[data-toggle]').forEach(k => k.addEventListener('click', () => {
    const iban = k.dataset.toggle;
    uitgeklapt.has(iban) ? uitgeklapt.delete(iban) : uitgeklapt.add(iban);
    herteken();
  }));

  laag.querySelectorAll('[data-cluster][data-boeking]').forEach(k => k.addEventListener('change', () => {
    const iban = k.dataset.cluster, sleutel = k.dataset.boeking;
    if (!uitgesloten.has(iban)) uitgesloten.set(iban, new Set());
    const set = uitgesloten.get(iban);
    k.checked ? set.delete(sleutel) : set.add(sleutel);
    herteken();
  }));

  laag.querySelectorAll('[data-bevestig]').forEach(k => k.addEventListener('click', () => {
    const iban = k.dataset.bevestig;
    bevestigModus = iban;
    bevestigGekozen = null;
    uitgeklapt.add(iban);
    herteken();
    laag.querySelector('[data-bevestig-zoek]')?.focus();
  }));

  laag.querySelectorAll('[data-aanpassen]').forEach(k => k.addEventListener('click', () => {
    uitgeklapt.add(k.dataset.aanpassen);
    herteken();
  }));

  laag.querySelectorAll('[data-afwijzen]').forEach(k => k.addEventListener('click', () => {
    const iban = k.dataset.afwijzen;
    if (!window.confirm(`Cluster voor ${iban} afwijzen?\n\nEr wordt niets aan deze boekingen gewijzigd. Je kunt dit cluster later weer terugzetten via "allemaal weer tonen".`)) return;
    afwijsIbanCluster(iban);
    uitgeklapt.delete(iban);
    uitgesloten.delete(iban);
    if (bevestigModus === iban) bevestigModus = null;
    herteken();
  }));

  laag.querySelectorAll('[data-bevestig-zoek]').forEach(inp => {
    inp.addEventListener('input', () => tekenSuggesties(laag, inp.dataset.bevestigZoek, inp.value));
    inp.addEventListener('blur', () => setTimeout(() => {
      laag.querySelector(`[data-bevestig-sugg="${inp.dataset.bevestigZoek}"]`)?.classList.remove('open');
    }, 150));
  });

  laag.querySelectorAll('[data-bevestig-anders]').forEach(k => k.addEventListener('click', () => {
    bevestigGekozen = null;
    herteken();
    laag.querySelector('[data-bevestig-zoek]')?.focus();
  }));

  laag.querySelectorAll('[data-bevestig-annuleer]').forEach(k => k.addEventListener('click', () => {
    bevestigModus = null;
    bevestigGekozen = null;
    herteken();
  }));

  laag.querySelectorAll('[data-bevestig-koppel]').forEach(k => k.addEventListener('click', async () => {
    const iban = k.dataset.bevestigKoppel;
    const c = berekenIbanClusters().find(x => x.iban === iban);
    if (!c || !bevestigGekozen) return;
    const uitgeslotenSet = uitgesloten.get(iban) || new Set();
    const meegenomen = c.boekingen.filter(b => !uitgeslotenSet.has(boekingSleutel(b)));
    if (!meegenomen.length) return;

    k.disabled = true;
    k.textContent = 'Bezig…';
    const res = await bevestigIbanCluster(meegenomen, bevestigGekozen.id);
    if (!res.ok) {
      alert('Koppelen is niet gelukt. Probeer het nog eens.');
      k.disabled = false;
      k.textContent = 'Koppelen';
      return;
    }

    uitgeklapt.delete(iban);
    uitgesloten.delete(iban);
    bevestigModus = null;
    bevestigGekozen = null;
    herteken();
  }));

  laag.querySelectorAll('[data-reset-afgewezen]').forEach(k => k.addEventListener('click', e => {
    e.preventDefault();
    afgewezenIbanClusters().forEach(herstelIbanCluster);
    herteken();
  }));
}

function tekenSuggesties(laag, iban, q) {
  const paneel = laag.querySelector(`[data-bevestig-sugg="${iban}"]`);
  if (!paneel) return;
  const term = q.trim();
  if (term.length < 2) { paneel.classList.remove('open'); paneel.innerHTML = ''; return; }

  const resultaten = zoekRelaties(term);
  const exacteMatch = resultaten.some(r => r.naam.toLowerCase() === term.toLowerCase());

  let html = resultaten.map(r => `
    <div class="sr-item" data-relatie-id="${esc(r.id)}" data-relatie-naam="${esc(r.naam)}">
      <div class="sr-main"><div class="sr-title">${esc(r.naam)}</div></div>
    </div>`).join('');
  if (!exacteMatch) {
    html += `<div class="sr-item" data-nieuwe-relatie="1"><div class="sr-main"><div class="sr-title">+ Nieuwe relatie: "${esc(term)}"</div></div></div>`;
  }
  paneel.innerHTML = html || `<div class="sr-empty">Niets gevonden.</div>`;
  paneel.classList.add('open');

  paneel.querySelectorAll('[data-relatie-id]').forEach(k => k.addEventListener('click', () => {
    bevestigGekozen = { id: k.dataset.relatieId, naam: k.dataset.relatieNaam };
    herteken();
  }));
  const nieuweKnop = paneel.querySelector('[data-nieuwe-relatie]');
  if (nieuweKnop) nieuweKnop.addEventListener('click', async () => {
    const r = await maakRelatie(term);
    if (!r) { alert('Relatie aanmaken mislukt. Probeer het nog eens.'); return; }
    bevestigGekozen = { id: r.id, naam: r.naam };
    herteken();
  });
}
