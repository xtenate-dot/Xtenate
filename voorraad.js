// voorraad.js — Voorraad: kerncijfers, groepen per tab en voorraad per jaar.

import { PRIJS_COVER, esc, fmt } from './helpers.js?v=20260812c';
import {
  STANDAARD_MIN_VOORRAAD, groepId, groepNaam, saveCoversData, saveGroepen, standaardGroep, state
} from './storage.js?v=20260812c';
import { maakSorteerbaar } from './tables.js?v=20260812c';

const el = id => document.getElementById(id);
const HUIDIG_JAAR = '2026';

/** Welke tab er open staat: 'alle' of een groep-id. */
let actieveTab = 'alle';

/** 'nu' toont de actuele voorraad; een jaartal toont de stand per 31 december. */
let gekozenJaar = 'nu';

/** Artikelen die zijn aangevinkt voor een bulkactie. */
const selectie = new Set();

/** De laatste verplaatsing of verwijdering, zodat die terug te draaien is. */
let laatsteActie = null;

// ------------------------------------------------------------------ rekenen

/** Verkoopprijs; Funny Covers hebben een vaste standaardprijs. */
function verkoopprijs(c) {
  if (c.prijs != null && c.prijs !== '') return Number(c.prijs);
  return c.categorie === 'covers' ? PRIJS_COVER : null;
}

function drempel(c) {
  return c.minVoorraad != null && c.minVoorraad !== '' ? Number(c.minVoorraad) : STANDAARD_MIN_VOORRAAD;
}

/**
 * De aantallen die bij de gekozen periode horen. In jaarmodus komt alles uit
 * `jaren`; is er voor dat jaar niets vastgelegd, dan blijft het leeg in plaats
 * van dat de app de huidige stand als historie presenteert.
 */
function standVan(c) {
  if (gekozenJaar === 'nu') {
    return { voorraad: c.voorraad, verkocht: c.omzet2026 || 0, vastgelegd: true };
  }
  const j = (c.jaren || {})[gekozenJaar] || {};
  return { voorraad: j.eind ?? null, verkocht: j.verkocht ?? 0, vastgelegd: j.eind != null };
}

function waardeVan(c, stand) {
  if (stand.voorraad == null) return null;
  if (c.inkoopprijs == null || c.inkoopprijs === '') return null;
  return stand.voorraad * Number(c.inkoopprijs);
}

function status(c, stand) {
  if (stand.voorraad == null) return 'onbekend';
  if (stand.voorraad <= 0) return 'uit';
  return stand.voorraad <= drempel(c) ? 'laag' : 'ok';
}

function artikelenVoorTab() {
  return actieveTab === 'alle' ? state.COVERS : state.COVERS.filter(c => c.categorie === actieveTab);
}

/** De boekjaren van de app, aangevuld met elk jaar waarvoor al iets vastligt. */
function bekendeJaren() {
  const jaren = new Set(['2022', '2023', '2024', '2025', '2026']);
  state.COVERS.forEach(c => Object.keys(c.jaren || {}).forEach(j => jaren.add(j)));
  return [...jaren].sort().reverse();
}

/** Voorraadwaarde van één jaar, over de artikelen van de open tab. */
function waardeVanJaar(lijst, jaar) {
  return lijst.reduce((som, c) => {
    const eind = (c.jaren || {})[jaar]?.eind;
    if (eind == null || c.inkoopprijs == null || c.inkoopprijs === '') return som;
    return som + eind * Number(c.inkoopprijs);
  }, 0);
}

/** Of er voor een jaar überhaupt iets is vastgelegd. */
function jaarIsVastgelegd(lijst, jaar) {
  return lijst.some(c => (c.jaren || {})[jaar]?.eind != null);
}

// -------------------------------------------------------------------- tabs

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

export function kiesVoorraadTab(id) {
  actieveTab = id;
  selectie.clear();
  renderCovers();
}

function vulJaarKeuze() {
  const sel = el('f-voorraad-jaar');
  const opties = ['<option value="nu">Actuele voorraad</option>']
    .concat(bekendeJaren().map(j => `<option value="${j}">Stand eind ${j}</option>`));
  sel.innerHTML = opties.join('');
  sel.value = gekozenJaar;
}

export function kiesVoorraadJaar() {
  gekozenJaar = el('f-voorraad-jaar').value;
  selectie.clear();
  renderCovers();
}

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

// -------------------------------------------------------------- kerncijfers

function renderKerncijfers(lijst) {
  const standen = lijst.map(c => ({ c, s: standVan(c) }));
  const vastgelegd = standen.filter(x => x.s.voorraad != null);
  const stuks = vastgelegd.reduce((s, x) => s + x.s.voorraad, 0);
  const metPrijs = standen.filter(x => waardeVan(x.c, x.s) !== null);
  const waarde = metPrijs.reduce((s, x) => s + waardeVan(x.c, x.s), 0);
  const zonderPrijs = standen.filter(x => x.s.voorraad > 0 && waardeVan(x.c, x.s) === null).length;

  if (gekozenJaar === 'nu') {
    const laag = standen.filter(x => status(x.c, x.s) === 'laag').length;
    const uit = standen.filter(x => status(x.c, x.s) === 'uit').length;
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
    return;
  }

  const verkocht = standen.reduce((s, x) => s + (x.s.verkocht || 0), 0);
  const vorig = String(Number(gekozenJaar) - 1);
  const vorigVast = jaarIsVastgelegd(lijst, vorig);
  const mutatie = waarde - waardeVanJaar(lijst, vorig);
  el('voorraad-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-lbl">Voorraadwaarde 31-12-${gekozenJaar}</div>
      <div class="kpi-val">${fmt(waarde)}</div>
      <div class="kpi-sub">${zonderPrijs > 0 ? `${zonderPrijs} artikel${zonderPrijs === 1 ? '' : 'en'} zonder inkoopprijs` : 'tegen inkoopprijs'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Vastgelegd</div>
      <div class="kpi-val">${vastgelegd.length}<span class="muted" style="font-size:15px"> / ${lijst.length}</span></div>
      <div class="kpi-sub">${stuks} stuks in voorraad</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Verkocht in ${gekozenJaar}</div>
      <div class="kpi-val">${verkocht}</div>
      <div class="kpi-sub">stuks</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Mutatie t.o.v. ${vorig}</div>
      <div class="kpi-val ${!vorigVast ? 'muted' : mutatie >= 0 ? 'pos' : 'neg'}">${vorigVast ? (mutatie >= 0 ? '+' : '–') + fmt(Math.abs(mutatie)) : '—'}</div>
      <div class="kpi-sub">${vorigVast
        ? (mutatie >= 0 ? 'voorraad gegroeid, drukt de winst' : 'voorraad geslonken, verhoogt de winst')
        : `stand eind ${vorig} nog niet vastgelegd`}</div>
    </div>`;
}

// -------------------------------------------------------------------- tabel

const STATUS_BADGE = {
  ok: '<span class="stock-ok">op voorraad</span>',
  laag: '<span class="badge badge-amber">lage voorraad</span>',
  uit: '<span class="stock-uit">uitverkocht</span>',
  onbekend: '<span class="badge badge-gray">niet vastgelegd</span>'
};

export function renderCovers() {
  renderTabs();
  vulJaarKeuze();
  vulGroepKeuzes();
  renderMelding();

  const jaarModus = gekozenJaar !== 'nu';
  el('voorraad-jaarbalk').style.display = jaarModus ? 'flex' : 'none';
  if (jaarModus) {
    el('voorraad-jaar-tekst').innerHTML =
      `Je ziet de stand per <strong>31 december ${gekozenJaar}</strong>. Dit is wat je meeneemt naar ${Number(gekozenJaar) + 1} en wat als voorraad meetelt voor de aangifte.`;
    el('voorraad-vastleg-knop').textContent = `Huidige voorraad vastleggen als eind ${gekozenJaar}`;
  }
  el('voorraad-kop-aantal').textContent = jaarModus ? `Eind ${gekozenJaar}` : 'Voorraad';
  el('voorraad-kop-omzet').textContent = jaarModus ? `Verkocht ${gekozenJaar}` : 'Omzet 2026';

  const statusFilter = el('f-covers-status') ? el('f-covers-status').value : '';
  const zoekterm = (el('voorraad-zoek') ? el('voorraad-zoek').value : '').trim().toLowerCase();

  const basis = artikelenVoorTab();
  renderKerncijfers(basis);

  let lijst = basis;
  if (statusFilter) lijst = lijst.filter(c => status(c, standVan(c)) === statusFilter);
  if (zoekterm) lijst = lijst.filter(c => `${c.artikel} ${c.zoekterm || ''}`.toLowerCase().includes(zoekterm));

  const toonGroep = actieveTab === 'alle';
  el('voorraad-cat-kop').style.display = toonGroep ? '' : 'none';

  el('covers-body').innerHTML = lijst.length
    ? lijst.map(c => {
        const stand = standVan(c);
        const vk = verkoopprijs(c);
        const waarde = waardeVan(c, stand);
        const omzet = !jaarModus && vk != null ? stand.verkocht * vk : null;
        const rechts = jaarModus ? (stand.verkocht || 0) : (omzet ? fmt(omzet) : '—');
        return `<tr>
          <td style="padding-left:16px;width:34px"><input type="checkbox" data-artikel-id="${esc(c.id)}"${selectie.has(String(c.id)) ? ' checked' : ''}
            onchange="wisselVoorraadSelectie('${esc(c.id)}', this)" aria-label="Selecteer ${esc(c.artikel)}"></td>
          <td style="font-weight:${stand.voorraad > 0 ? 500 : 400}">${esc(c.artikel)}</td>
          ${toonGroep ? `<td class="muted">${esc(groepNaam(c.categorie))}</td>` : ''}
          <td style="text-align:right" data-v="${stand.voorraad ?? -1}">${stand.voorraad ?? '—'}</td>
          <td style="text-align:right" class="muted" data-v="${c.inkoopprijs ?? -1}">${c.inkoopprijs != null && c.inkoopprijs !== '' ? fmt(c.inkoopprijs) : '—'}</td>
          <td style="text-align:right" class="muted" data-v="${vk ?? -1}">${vk != null ? fmt(vk) : '—'}</td>
          <td style="text-align:right;font-weight:500" data-v="${waarde ?? -1}">${waarde != null ? fmt(waarde) : '—'}</td>
          <td style="text-align:right" class="${!jaarModus && omzet ? 'pos' : ''}" data-v="${jaarModus ? (stand.verkocht || 0) : (omzet ?? 0)}">${rechts}</td>
          <td data-v="${status(c, stand)}">${STATUS_BADGE[status(c, stand)]}</td>
          <td>${c.zoekterm
            ? `<a href="https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(c.zoekterm)}" target="_blank" rel="noopener" style="font-size:11px;white-space:nowrap">Zoek op AliExpress</a>`
            : ''}</td>
          <td style="padding-right:16px;white-space:nowrap">
            <span class="sell-link" onclick="openCoverEdit('${esc(c.id)}')">Bewerk</span>
            <button class="icon-btn" onclick="verwijderArtikel('${esc(c.id)}')" title="Artikel verwijderen" aria-label="Verwijder ${esc(c.artikel)}" style="width:26px;height:26px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('')
    : `<tr data-geen-sort="1"><td colspan="${toonGroep ? 11 : 10}"><div class="empty">
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

export function wisVoorraadSelectie() {
  selectie.clear();
  renderCovers();
}

// ------------------------------------------------------ verplaatsen en wissen

export function verplaatsVoorraadSelectie() {
  const doel = el('bulk-cat').value;
  if (!doel || !selectie.size) return;

  laatsteActie = {
    soort: 'verplaats',
    naar: doel,
    aantal: selectie.size,
    vorige: state.COVERS.filter(c => selectie.has(String(c.id))).map(c => ({ id: c.id, categorie: c.categorie }))
  };

  state.COVERS = state.COVERS.map(c => (selectie.has(String(c.id)) ? { ...c, categorie: doel } : c));
  saveCoversData();
  selectie.clear();
  renderCovers();
}

export function verwijderArtikel(id) {
  const c = state.COVERS.find(x => String(x.id) === String(id));
  if (!c) return;
  if (!window.confirm(`"${c.artikel}" verwijderen uit de voorraad?`)) return;
  bewaarVerwijdering([c]);
  state.COVERS = state.COVERS.filter(x => String(x.id) !== String(id));
  selectie.delete(String(id));
  saveCoversData();
  renderCovers();
}

export function verwijderVoorraadSelectie() {
  if (!selectie.size) return;
  const weg = state.COVERS.filter(c => selectie.has(String(c.id)));
  const n = weg.length;
  if (!window.confirm(`${n} artikel${n === 1 ? '' : 'en'} verwijderen uit de voorraad?`)) return;
  bewaarVerwijdering(weg);
  state.COVERS = state.COVERS.filter(c => !selectie.has(String(c.id)));
  selectie.clear();
  saveCoversData();
  renderCovers();
}

function bewaarVerwijdering(artikelen) {
  // De volledige regels bewaren, niet alleen de id's: alleen zo is een
  // verwijdering echt terug te draaien.
  laatsteActie = { soort: 'verwijder', aantal: artikelen.length, artikelen: artikelen.map(c => ({ ...c })) };
}

export function draaiActieTerug() {
  if (!laatsteActie) return;
  if (laatsteActie.soort === 'verplaats') {
    const terug = new Map(laatsteActie.vorige.map(v => [String(v.id), v.categorie]));
    state.COVERS = state.COVERS.map(c =>
      terug.has(String(c.id)) ? { ...c, categorie: terug.get(String(c.id)) } : c);
  } else {
    const bestaand = new Set(state.COVERS.map(c => String(c.id)));
    state.COVERS = [...state.COVERS, ...laatsteActie.artikelen.filter(c => !bestaand.has(String(c.id)))];
  }
  saveCoversData();
  laatsteActie = null;
  renderCovers();
}

function renderMelding() {
  const vak = el('voorraad-melding');
  if (!laatsteActie) { vak.style.display = 'none'; vak.innerHTML = ''; return; }
  const { soort, aantal } = laatsteActie;
  const tekst = soort === 'verplaats'
    ? `${aantal} artikel${aantal === 1 ? '' : 'en'} verplaatst naar ${esc(groepNaam(laatsteActie.naar))}.`
    : `${aantal} artikel${aantal === 1 ? '' : 'en'} verwijderd.`;
  vak.style.display = 'flex';
  vak.innerHTML = `<span>${tekst}</span><button class="btn btn-sm" onclick="draaiActieTerug()">Ongedaan maken</button>`;
}

// ------------------------------------------------------------- jaarafsluiting

/** Zet de huidige voorraad vast als eindstand van het gekozen jaar. */
export function legVoorraadVast() {
  if (gekozenJaar === 'nu') return;
  const lijst = artikelenVoorTab();
  const al = lijst.filter(c => (c.jaren || {})[gekozenJaar]?.eind != null).length;
  const vraag = al > 0
    ? `Van ${al} artikel${al === 1 ? '' : 'en'} is de stand voor ${gekozenJaar} al vastgelegd. Overschrijven met de huidige voorraad?`
    : `De huidige voorraad van ${lijst.length} artikel${lijst.length === 1 ? '' : 'en'} vastleggen als stand per 31-12-${gekozenJaar}?`;
  if (!window.confirm(vraag)) return;

  const ids = new Set(lijst.map(c => String(c.id)));
  state.COVERS = state.COVERS.map(c => ids.has(String(c.id))
    ? { ...c, jaren: { ...(c.jaren || {}), [gekozenJaar]: { eind: c.voorraad, verkocht: (c.jaren || {})[gekozenJaar]?.verkocht ?? null } } }
    : c);
  saveCoversData();
  renderCovers();
}

// ------------------------------------------------------------ groepenbeheer

export function openGroepenModal() {
  renderGroepenLijst();
  el('groep-nieuw').value = '';
  el('groep-fout').textContent = '';
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

// ------------------------------------------------------------- artikelmodal

const VELDEN = ['cv-naam','cv-cat','cv-ink','cv-vk','cv-vrd','cv-26','cv-zoek','cv-prijs','cv-inkoopprijs','cv-min','cv-jaar-eind'];

/** Het jaar waarvoor de modal de eindstand toont. */
function modalJaar() { return gekozenJaar === 'nu' ? HUIDIG_JAAR : gekozenJaar; }

function zetJaarLabels() {
  const j = modalJaar();
  el('cv-jaar-eind-label').textContent = `Eindvoorraad 31-12-${j}`;
  el('cv-26-label').textContent = `Verkocht in ${j} (stuks)`;
}

export function openCoverModal() {
  state.editCoverId = null;
  el('cover-modal-title').textContent = 'Artikel toevoegen';
  VELDEN.forEach(id => { if (el(id)) el(id).value = ''; });
  zetJaarLabels();
  el('cv-cat').value = actieveTab === 'alle' ? standaardGroep() : actieveTab;
  el('modal-cover').classList.add('open');
  el('cv-naam').focus();
}

export function openCoverEdit(id) {
  const c = state.COVERS.find(x => String(x.id) === String(id));
  if (!c) return;
  state.editCoverId = c.id;
  const j = modalJaar();
  zetJaarLabels();
  el('cover-modal-title').textContent = 'Artikel bewerken';
  el('cv-naam').value = c.artikel;
  el('cv-cat').value = c.categorie || standaardGroep();
  el('cv-ink').value = c.inkoop;
  el('cv-vk').value = c.verkoop;
  el('cv-vrd').value = c.voorraad;
  el('cv-26').value = (c.jaren || {})[j]?.verkocht ?? (j === HUIDIG_JAAR ? c.omzet2026 ?? '' : '');
  el('cv-jaar-eind').value = (c.jaren || {})[j]?.eind ?? '';
  el('cv-zoek').value = c.zoekterm || '';
  el('cv-prijs').value = c.prijs ?? '';
  el('cv-inkoopprijs').value = c.inkoopprijs ?? '';
  el('cv-min').value = c.minVoorraad ?? '';
  el('modal-cover').classList.add('open');
}

export function closeCoverModal() { el('modal-cover').classList.remove('open'); }

/** Leest een veld uit; leeg blijft leeg (null), niet nul. */
const getal = (id, decimalen) => {
  const ruw = el(id).value.trim();
  if (ruw === '') return null;
  const n = decimalen ? parseFloat(ruw.replace(',', '.')) : parseInt(ruw, 10);
  return isNaN(n) ? null : n;
};

export function saveCover() {
  const naam = el('cv-naam').value.trim();
  if (!naam) { el('cv-naam').focus(); return; }

  const bestaand = state.COVERS.find(c => c.id === state.editCoverId);
  const j = modalJaar();
  const verkocht = getal('cv-26');
  const eind = getal('cv-jaar-eind');

  const jaren = { ...(bestaand?.jaren || {}) };
  if (verkocht != null || eind != null) jaren[j] = { eind, verkocht };
  else delete jaren[j];

  const obj = {
    id: state.editCoverId || state.nxtCover++,
    artikel: naam,
    categorie: el('cv-cat').value || standaardGroep(),
    inkoop: getal('cv-ink') ?? 0,
    verkoop: getal('cv-vk') ?? 0,
    voorraad: getal('cv-vrd') ?? 0,
    omzet2026: j === HUIDIG_JAAR ? (verkocht ?? 0) : (bestaand?.omzet2026 ?? 0),
    zoekterm: el('cv-zoek').value.trim(),
    prijs: getal('cv-prijs', true),
    inkoopprijs: getal('cv-inkoopprijs', true),
    minVoorraad: getal('cv-min'),
    jaren
  };

  if (state.editCoverId) state.COVERS = state.COVERS.map(c => (c.id === state.editCoverId ? obj : c));
  else state.COVERS.push(obj);

  saveCoversData();
  closeCoverModal();
  renderCovers();
}
