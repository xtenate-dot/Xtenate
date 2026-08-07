// voorraad.js — Voorraad: overzicht met kerncijfers en tabs per productgroep.

import { PRIJS_COVER, esc, fmt } from './helpers.js?v=20260806a';
import {
  STANDAARD_MIN_VOORRAAD, groepId, groepNaam, saveCoversData, saveGroepen, standaardGroep, state
} from './storage.js?v=20260806a';
import { maakSorteerbaar } from './tables.js?v=20260806a';

const el = id => document.getElementById(id);

/** Welke tab er open staat: 'alle' of een categorie-id. */
let actieveTab = 'alle';

/** Artikelen die zijn aangevinkt om in bulk te verplaatsen. */
const selectie = new Set();

/** De vorige groep per artikel, zodat een verplaatsing terug te draaien is. */
let laatsteVerplaatsing = null;

/** Verkoopprijs van een artikel; Funny Covers hebben een vaste standaardprijs. */
function verkoopprijs(c) {
  if (c.prijs != null && c.prijs !== '') return Number(c.prijs);
  return c.categorie === 'covers' ? PRIJS_COVER : null;
}

function drempel(c) {
  return c.minVoorraad != null && c.minVoorraad !== '' ? Number(c.minVoorraad) : STANDAARD_MIN_VOORRAAD;
}

/** uitverkocht · laag · ok */
function status(c) {
  if (c.voorraad <= 0) return 'uit';
  return c.voorraad <= drempel(c) ? 'laag' : 'ok';
}

function voorraadwaarde(c) {
  return c.inkoopprijs != null && c.inkoopprijs !== '' ? c.voorraad * Number(c.inkoopprijs) : null;
}

function artikelenVoorTab() {
  return actieveTab === 'alle' ? state.COVERS : state.COVERS.filter(c => c.categorie === actieveTab);
}

// ------------------------------------------------------------------- tabs

function renderTabs() {
  const tel = id => state.COVERS.filter(c => c.categorie === id).length;
  const tabs = [{ id: 'alle', naam: 'Overzicht', aantal: state.COVERS.length }]
    .concat(state.GROEPEN.map(g => ({ id: g.id, naam: g.naam, aantal: tel(g.id) })));

  el('voorraad-tabs').innerHTML = tabs.map(t => `
    <div class="vtab${t.id === actieveTab ? ' active' : ''}" onclick="kiesVoorraadTab('${esc(t.id)}')" role="tab"
         tabindex="0" aria-selected="${t.id === actieveTab}">
      ${esc(t.naam)} <span class="muted" style="font-size:11px">${t.aantal}</span>
    </div>`).join('')
    + `<div class="vtab vtab-actie" onclick="openGroepenModal()" title="Groepen beheren" tabindex="0">+ Groep</div>`;
}

/** Vult elke keuzelijst met groepen (artikelmodal en bulkbalk). */
function vulGroepKeuzes() {
  const opties = state.GROEPEN.map(g => `<option value="${esc(g.id)}">${esc(g.naam)}</option>`).join('');
  ['cv-cat', 'bulk-cat'].forEach(id => {
    const sel = el(id);
    if (!sel) return;
    const gekozen = sel.value;
    sel.innerHTML = opties;
    if (state.GROEPEN.some(g => g.id === gekozen)) sel.value = gekozen;
  });
}

export function kiesVoorraadTab(id) {
  actieveTab = id;
  selectie.clear();
  renderCovers();
}

// --------------------------------------------------------------- selecteren

export function wisselVoorraadSelectie(id, vinkje) {
  if (vinkje.checked) selectie.add(String(id)); else selectie.delete(String(id));
  renderBulkbalk();
}

/** Vinkt alles aan of uit wat op dit moment in de tabel staat. */
export function selecteerAlleVoorraad(vinkje) {
  document.querySelectorAll('#covers-body input[data-artikel-id]').forEach(v => {
    v.checked = vinkje.checked;
    const id = v.dataset.artikelId;
    if (vinkje.checked) selectie.add(id); else selectie.delete(id);
  });
  renderBulkbalk();
}

function renderBulkbalk() {
  const balk = el('voorraad-bulk');
  const n = selectie.size;
  balk.style.display = n ? 'flex' : 'none';
  if (n) el('bulk-aantal').textContent = `${n} artikel${n === 1 ? '' : 'en'} geselecteerd`;
  const alles = el('voorraad-check-all');
  const zichtbaar = document.querySelectorAll('#covers-body input[data-artikel-id]').length;
  if (alles) {
    alles.checked = zichtbaar > 0 && n >= zichtbaar;
    alles.indeterminate = n > 0 && n < zichtbaar;
  }
}

/** Verplaatst alle aangevinkte artikelen naar de gekozen groep. */
export function verplaatsVoorraadSelectie() {
  const doel = el('bulk-cat').value;
  if (!doel || !selectie.size) return;

  // Onthoud waar alles vandaan kwam, zodat één misklik geen indeling kost.
  laatsteVerplaatsing = {
    naar: doel,
    aantal: selectie.size,
    vorige: state.COVERS
      .filter(c => selectie.has(String(c.id)))
      .map(c => ({ id: c.id, categorie: c.categorie }))
  };

  state.COVERS = state.COVERS.map(c => (selectie.has(String(c.id)) ? { ...c, categorie: doel } : c));
  saveCoversData();
  selectie.clear();
  renderCovers();
}

export function draaiVerplaatsingTerug() {
  if (!laatsteVerplaatsing) return;
  const terug = new Map(laatsteVerplaatsing.vorige.map(v => [String(v.id), v.categorie]));
  state.COVERS = state.COVERS.map(c =>
    terug.has(String(c.id)) ? { ...c, categorie: terug.get(String(c.id)) } : c);
  saveCoversData();
  laatsteVerplaatsing = null;
  renderCovers();
}

function renderMelding() {
  const vak = el('voorraad-melding');
  if (!laatsteVerplaatsing) { vak.style.display = 'none'; vak.innerHTML = ''; return; }
  const { aantal, naar } = laatsteVerplaatsing;
  vak.style.display = 'flex';
  vak.innerHTML = `<span>${aantal} artikel${aantal === 1 ? '' : 'en'} verplaatst naar ${esc(groepNaam(naar))}.</span>
    <button class="btn btn-sm" onclick="draaiVerplaatsingTerug()">Ongedaan maken</button>`;
}

// ------------------------------------------------------------ groepenbeheer

export function openGroepenModal() {
  renderGroepenLijst();
  el('groep-nieuw').value = '';
  el('modal-groepen').classList.add('open');
  el('groep-nieuw').focus();
}

export function sluitGroepenModal() { el('modal-groepen').classList.remove('open'); }

function renderGroepenLijst() {
  const tel = id => state.COVERS.filter(c => c.categorie === id).length;
  el('groepen-lijst').innerHTML = state.GROEPEN.map(g => `
    <div class="groep-rij">
      <input type="text" value="${esc(g.naam)}" data-groep-id="${esc(g.id)}" aria-label="Naam van ${esc(g.naam)}">
      <span class="muted" style="font-size:11px;white-space:nowrap">${tel(g.id)} artikelen</span>
      <button class="icon-btn" onclick="verwijderGroep('${esc(g.id)}')" title="Groep verwijderen" aria-label="Verwijder ${esc(g.naam)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`).join('');
}

export function voegGroepToe() {
  const naam = el('groep-nieuw').value.trim();
  if (!naam) { el('groep-nieuw').focus(); return; }
  if (state.GROEPEN.some(g => g.naam.toLowerCase() === naam.toLowerCase())) {
    el('groep-fout').textContent = `Er bestaat al een groep "${naam}".`;
    return;
  }
  el('groep-fout').textContent = '';
  state.GROEPEN.push({ id: groepId(naam), naam });
  saveGroepen();
  el('groep-nieuw').value = '';
  renderGroepenLijst();
  renderCovers();
}

export function verwijderGroep(id) {
  if (state.GROEPEN.length <= 1) {
    el('groep-fout').textContent = 'De laatste groep kan niet weg.';
    return;
  }
  const aantal = state.COVERS.filter(c => c.categorie === id).length;
  const doel = state.GROEPEN.find(g => g.id !== id).id;
  if (aantal && !window.confirm(`${aantal} artikel${aantal === 1 ? '' : 'en'} staan in "${groepNaam(id)}". Die gaan naar "${groepNaam(doel)}". Doorgaan?`)) return;

  state.GROEPEN = state.GROEPEN.filter(g => g.id !== id);
  state.COVERS = state.COVERS.map(c => (c.categorie === id ? { ...c, categorie: doel } : c));
  if (actieveTab === id) actieveTab = 'alle';
  saveGroepen();
  saveCoversData();
  el('groep-fout').textContent = '';
  renderGroepenLijst();
  renderCovers();
}

/** Neemt de hernoemingen uit de invoervelden over en sluit het venster. */
export function bewaarGroepen() {
  el('groepen-lijst').querySelectorAll('input[data-groep-id]').forEach(inp => {
    const naam = inp.value.trim();
    if (!naam) return;
    const g = state.GROEPEN.find(x => x.id === inp.dataset.groepId);
    if (g) g.naam = naam;
  });
  saveGroepen();
  sluitGroepenModal();
  renderCovers();
}

export function wisVoorraadSelectie() {
  selectie.clear();
  renderCovers();
}

// --------------------------------------------------------------- kerncijfers

function renderKerncijfers(lijst) {
  const stuks = lijst.reduce((s, c) => s + c.voorraad, 0);
  const metPrijs = lijst.filter(c => voorraadwaarde(c) !== null);
  const waarde = metPrijs.reduce((s, c) => s + voorraadwaarde(c), 0);
  const zonderPrijs = lijst.filter(c => c.voorraad > 0 && voorraadwaarde(c) === null).length;
  const laag = lijst.filter(c => status(c) === 'laag').length;
  const uit = lijst.filter(c => status(c) === 'uit').length;

  el('voorraad-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-lbl">Totale voorraadwaarde</div>
      <div class="kpi-val">${fmt(waarde)}</div>
      <div class="kpi-sub">${zonderPrijs > 0 ? `${zonderPrijs} artikel${zonderPrijs === 1 ? '' : 'en'} zonder inkoopprijs` : 'tegen inkoopprijs'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Aantal producten</div>
      <div class="kpi-val">${lijst.length}</div>
      <div class="kpi-sub">${stuks} stuks op voorraad</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Lage voorraad</div>
      <div class="kpi-val ${laag > 0 ? 'neg' : ''}">${laag}</div>
      <div class="kpi-sub">${laag > 0 ? 'bijbestellen' : 'niets onder de drempel'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Uitverkocht</div>
      <div class="kpi-val ${uit > 0 ? 'muted' : ''}">${uit}</div>
      <div class="kpi-sub">van ${lijst.length} artikelen</div>
    </div>`;
}

// -------------------------------------------------------------------- tabel

const STATUS_BADGE = {
  ok: '<span class="stock-ok">op voorraad</span>',
  laag: '<span class="badge badge-amber">lage voorraad</span>',
  uit: '<span class="stock-uit">uitverkocht</span>'
};

export function renderCovers() {
  renderTabs();
  vulGroepKeuzes();
  renderMelding();

  const statusFilter = el('f-covers-status') ? el('f-covers-status').value : '';
  const zoekterm = (el('voorraad-zoek') ? el('voorraad-zoek').value : '').trim().toLowerCase();

  const basis = artikelenVoorTab();
  renderKerncijfers(basis);

  let lijst = basis;
  if (statusFilter) lijst = lijst.filter(c => status(c) === statusFilter);
  if (zoekterm) lijst = lijst.filter(c => `${c.artikel} ${c.zoekterm || ''}`.toLowerCase().includes(zoekterm));

  const toonCategorie = actieveTab === 'alle';
  el('voorraad-cat-kop').style.display = toonCategorie ? '' : 'none';

  el('covers-body').innerHTML = lijst.length
    ? lijst.map(c => {
        const vk = verkoopprijs(c);
        const waarde = voorraadwaarde(c);
        const omzet = vk != null ? c.omzet2026 * vk : null;
        return `<tr>
          <td style="padding-left:16px;width:34px"><input type="checkbox" data-artikel-id="${esc(c.id)}"${selectie.has(String(c.id)) ? ' checked' : ''}
            onchange="wisselVoorraadSelectie('${esc(c.id)}', this)" aria-label="Selecteer ${esc(c.artikel)}"></td>
          <td style="font-weight:${c.voorraad > 0 ? 500 : 400}">${esc(c.artikel)}</td>
          ${toonCategorie ? `<td class="muted">${esc(groepNaam(c.categorie))}</td>` : ''}
          <td style="text-align:right" data-v="${c.voorraad}">${c.voorraad}</td>
          <td style="text-align:right" class="muted" data-v="${c.inkoopprijs ?? -1}">${c.inkoopprijs != null && c.inkoopprijs !== '' ? fmt(c.inkoopprijs) : '—'}</td>
          <td style="text-align:right" class="muted" data-v="${vk ?? -1}">${vk != null ? fmt(vk) : '—'}</td>
          <td style="text-align:right;font-weight:500" data-v="${waarde ?? -1}">${waarde != null ? fmt(waarde) : '—'}</td>
          <td style="text-align:right" class="${omzet ? 'pos' : ''}" data-v="${omzet ?? 0}">${omzet ? fmt(omzet) : '—'}</td>
          <td data-v="${status(c)}">${STATUS_BADGE[status(c)]}</td>
          <td>${c.zoekterm
            ? `<a href="https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(c.zoekterm)}" target="_blank" rel="noopener" style="font-size:11px;white-space:nowrap">Zoek op AliExpress</a>`
            : ''}</td>
          <td style="padding-right:16px"><span class="sell-link" onclick="openCoverEdit(${c.id})">Bewerk</span></td>
        </tr>`;
      }).join('')
    : `<tr data-geen-sort="1"><td colspan="${toonCategorie ? 11 : 10}"><div class="empty">
        <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg></div>
        <div class="empty-title">${basis.length ? 'Geen artikelen binnen deze filters' : 'Nog geen artikelen in deze groep'}</div>
        <div class="empty-text">${basis.length
          ? 'Pas de zoekterm of het statusfilter aan.'
          : 'Voeg een artikel toe en kies deze productgroep, dan verschijnt het hier.'}</div>
        <button class="btn" onclick="openCoverModal()">Artikel toevoegen</button>
      </div></td></tr>`;

  renderBulkbalk();
  maakSorteerbaar(el('tbl-voorraad'));
}

// -------------------------------------------------------------------- modal

const VELDEN = ['cv-naam','cv-cat','cv-ink','cv-vk','cv-vrd','cv-26','cv-zoek','cv-prijs','cv-inkoopprijs','cv-min'];

export function openCoverModal() {
  state.editCoverId = null;
  el('cover-modal-title').textContent = 'Artikel toevoegen';
  VELDEN.forEach(id => { if (el(id)) el(id).value = ''; });
  // Nieuwe artikelen komen standaard in de groep die je nu bekijkt.
  el('cv-cat').value = actieveTab === 'alle' ? standaardGroep() : actieveTab;
  el('modal-cover').classList.add('open');
  el('cv-naam').focus();
}

export function openCoverEdit(id) {
  state.editCoverId = id;
  const c = state.COVERS.find(x => x.id === id);
  if (!c) return;
  el('cover-modal-title').textContent = 'Artikel bewerken';
  el('cv-naam').value = c.artikel;
  el('cv-cat').value = c.categorie || 'covers';
  el('cv-ink').value = c.inkoop;
  el('cv-vk').value = c.verkoop;
  el('cv-vrd').value = c.voorraad;
  el('cv-26').value = c.omzet2026;
  el('cv-zoek').value = c.zoekterm || '';
  el('cv-prijs').value = c.prijs ?? '';
  el('cv-inkoopprijs').value = c.inkoopprijs ?? '';
  el('cv-min').value = c.minVoorraad ?? '';
  el('modal-cover').classList.add('open');
}

export function closeCoverModal() { el('modal-cover').classList.remove('open'); }

const getal = (id, decimalen) => {
  const v = el(id).value.trim();
  if (v === '') return null;
  const n = decimalen ? parseFloat(v.replace(',', '.')) : parseInt(v, 10);
  return isNaN(n) ? null : n;
};

export function saveCover() {
  const naam = el('cv-naam').value.trim();
  if (!naam) { el('cv-naam').focus(); return; }

  const obj = {
    id: state.editCoverId || state.nxtCover++,
    artikel: naam,
    categorie: el('cv-cat').value || standaardGroep(),
    inkoop: getal('cv-ink') ?? 0,
    verkoop: getal('cv-vk') ?? 0,
    voorraad: getal('cv-vrd') ?? 0,
    omzet2026: getal('cv-26') ?? 0,
    zoekterm: el('cv-zoek').value.trim(),
    prijs: getal('cv-prijs', true),
    inkoopprijs: getal('cv-inkoopprijs', true),
    minVoorraad: getal('cv-min')
  };

  if (state.editCoverId) state.COVERS = state.COVERS.map(c => (c.id === state.editCoverId ? obj : c));
  else state.COVERS.push(obj);

  saveCoversData();
  closeCoverModal();
  renderCovers();
}
