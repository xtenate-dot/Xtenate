// beheer.js — de pagina Beheer: gegevens, onderhoud en systeem.
//
// Deze acties zaten alleen in de zijbalk, als negen losse regels zonder
// ordening. Hier staan ze gegroepeerd, met Controle erbij. De acties zelf zijn
// ongewijzigd: elke tegel roept dezelfde globale functie aan als het
// zijbalk-item, dus er verandert niets aan wat ze doen.

import { draaiControles } from './controle.js?v=20260902a';
import { esc } from './helpers.js?v=20260902a';
import { saveVoorraadInstellingen, standaardMinVoorraad, saveControleInstellingen, CONTROLE_INSTELLINGEN, saveBtwInstellingen, BTW_INSTELLINGEN } from './storage.js?v=20260902a';
import { hertekenHuidigePagina } from './ui.js?v=20260902a';
import { getPendingItems } from './supabase-client-v2.js?v=20260902a';
import { syncNu } from './autosync.js?v=20260902a';

const el = id => document.getElementById(id);

const I = {
  controle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
  gegevens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg>',
  herstel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>',
  migratie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6a8 3 0 1016 0 8 3 0 10-16 0"/><path d="M4 6v6a8 3 0 0016 0V6"/><path d="M4 12v6a8 3 0 0016 0v-6"/></svg>',
  diagnose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  zelftest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3h6M10 3v6.5L5.5 18a2 2 0 001.7 3h9.6a2 2 0 001.7-3L14 9.5V3"/></svg>',
  sleutel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  wissen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
};

function controleMerk() {
  try {
    const regels = draaiControles();
    const fout = regels.filter(r => r.ernst === 'fout' && !r.ok).length;
    const waarschuwing = regels.filter(r => r.ernst === 'waarschuwing' && !r.ok).length;
    if (fout) return { soort: 'fout', tekst: `${fout} te doen` };
    if (waarschuwing) return { soort: 'waarschuwing', tekst: `${waarschuwing} let op` };
    return { soort: 'info', tekst: 'in orde' };
  } catch (e) {
    console.error('Controles konden niet worden gedraaid voor de beheerpagina:', e);
    return null;
  }
}

function tegel({ titel, uitleg, icoon, pagina, actie, merk = null, gevaarlijk = false, nadruk = false }) {
  const doel = pagina ? `gaNaar('${pagina}')` : actie;
  const merkje = merk
    ? `<span class="home-tegel-merk home-tegel-merk-${merk.soort}">${esc(merk.tekst)}</span>`
    : '';
  return `
    <button type="button" class="home-tegel${gevaarlijk ? ' home-tegel-gevaar' : ''}${nadruk ? ' home-tegel-nadruk' : ''}"
            onclick="${doel}" aria-label="${esc(titel)} — ${esc(uitleg)}">
      <span class="home-tegel-kop">
        <span class="home-tegel-icoon">${icoon}</span>
        ${merkje}
      </span>
      <span class="home-tegel-titel">${esc(titel)}</span>
      <span class="home-tegel-uitleg">${esc(uitleg)}</span>
    </button>`;
}

function groep(naam, tegels) {
  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">${esc(naam)}</div>
      <div class="home-tegels">${tegels.join('')}</div>
    </div>`;
}

export function renderBeheer() {
  const doel = el('beheer-inhoud');
  if (!doel) return;

  doel.innerHTML =
    groep('Administratie', [
      tegel({
        titel: 'Controle', uitleg: 'Controlepunten in je administratie',
        icoon: I.controle, pagina: 'controle', merk: controleMerk()
      }),
      tegel({
        titel: 'Importeer Excel', uitleg: 'Boekingen inlezen uit een Excel-bestand',
        icoon: I.import, actie: "document.getElementById('import-file').click()"
      }),
      tegel({
        titel: 'Exporteer Excel', uitleg: 'Je administratie wegschrijven naar Excel',
        icoon: I.export, actie: 'openExportModal()'
      }),
      tegel({
        titel: 'Cloud sync', uitleg: 'Gegevens uitwisselen met de cloud',
        icoon: I.sync, actie: 'openSyncModal()'
      }),
      tegel({
        titel: 'Alles naar cloud', uitleg: 'Boekingen, voorraad en loten in een keer naar Supabase',
        icoon: I.sync, actie: 'openVoorraadSyncModal()', nadruk: true
      })
    ]) +
    synchronisatieBlok() +
    voorraadInstellingenBlok() +
    controleInstellingenBlok() +
    btwInstellingenBlok() +
    groep('Voorzichtig', [
      tegel({
        titel: 'Data wissen', uitleg: 'Alles verwijderen uit deze browser — niet ongedaan te maken!',
        icoon: I.wissen, actie: 'openWisModal()', gevaarlijk: true
      })
    ]);
}

/**
 * Instellingen die over de voorraad gaan. Nu alleen de standaarddrempel voor
 * 'lage voorraad'. Die gold eerder als vaste 3 in de code; een artikel met een
 * eigen minimum gebruikt nog steeds dat eigen getal, deze waarde is alleen de
 * terugval voor artikelen zonder.
 */
function voorraadInstellingenBlok() {
  const huidig = standaardMinVoorraad();
  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">Voorraad</div>
      <div class="card" style="padding:var(--spacing-4)">
        <label for="beheer-min-voorraad" style="display:block;font-weight:500;margin-bottom:4px">
          Standaard minimumvoorraad
        </label>
        <div class="muted" style="font-size:12px;margin-bottom:10px">
          Ligt er van een artikel minder dan dit aantal, dan geldt de voorraad als laag.
          Artikelen met een eigen minimum houden dat; deze waarde geldt voor de rest.
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="beheer-min-voorraad" min="0" step="1" value="${huidig}"
            style="width:90px" aria-label="Standaard minimumvoorraad">
          <button class="btn btn-primary" onclick="bewaarMinVoorraad()">Opslaan</button>
          <span id="beheer-min-melding" class="muted" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;
}

export function bewaarMinVoorraad() {
  const veld = el('beheer-min-voorraad');
  const melding = el('beheer-min-melding');
  const n = Number(veld?.value);
  if (!Number.isFinite(n) || n < 0) {
    if (melding) melding.textContent = 'Vul een getal van 0 of hoger in.';
    return;
  }
  saveVoorraadInstellingen({ standaardMin: Math.round(n) });
  if (melding) melding.textContent = `Opgeslagen: artikelen zonder eigen minimum gebruiken nu ${Math.round(n)}.`;
  // De voorraadstatus hangt hiervan af, dus opnieuw tekenen.
  hertekenHuidigePagina();
}

/**
 * Referentiewaarden die Gegevenscontrole, Uitvoeren en Herstel gebruiken om de
 * administratie tegen te controleren. Zulke getallen kan alleen jij bevestigen
 * — ze stonden eerder vast in de code, nu vul je ze hier eenmalig in. Leeg
 * laten mag: de bijbehorende controle slaat dan gewoon over.
 */
function controleInstellingenBlok() {
  const huidig = CONTROLE_INSTELLINGEN?.jaartotaal2022PriveSt;
  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">Gegevenscontrole</div>
      <div class="card" style="padding:var(--spacing-4)">
        <label for="beheer-referentie-privest-2022" style="display:block;font-weight:500;margin-bottom:4px">
          Jaartotaal 2022 — privé-storting
        </label>
        <div class="muted" style="font-size:12px;margin-bottom:10px">
          Het bedrag uit het Per Periode-tabblad waar de Gegevenscontrole het jaartotaal van 2022
          tegen vergelijkt. Vul dit eenmalig in, na eigen natelling. Leeg laten zet de controle uit.
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="beheer-referentie-privest-2022" step="0.01" placeholder="€ 0,00"
            value="${huidig != null ? huidig : ''}"
            style="width:140px" aria-label="Jaartotaal 2022 privé-storting">
          <button class="btn btn-primary" onclick="bewaarReferentiePriveSt2022()">Opslaan</button>
          <span id="beheer-referentie-melding" class="muted" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;
}

export function bewaarReferentiePriveSt2022() {
  const veld = el('beheer-referentie-privest-2022');
  const melding = el('beheer-referentie-melding');
  const ruw = (veld?.value ?? '').trim();
  const n = ruw === '' ? null : Number(ruw);
  if (n !== null && !Number.isFinite(n)) {
    if (melding) melding.textContent = 'Vul een getal in, of laat leeg om de controle uit te zetten.';
    return;
  }
  saveControleInstellingen({ jaartotaal2022PriveSt: n });
  if (melding) melding.textContent = n === null
    ? 'Opgeslagen: deze controle staat nu uit.'
    : `Opgeslagen: de controle vergelijkt nu tegen € ${n.toFixed(2).replace('.', ',')}.`;
  hertekenHuidigePagina();
}

/**
 * Fase 1 van BTW-plichtig maken: alleen de instelling. Werkt nog nergens
 * door in boekingen, export of de aangifte — dat is voor een latere fase.
 */
function btwInstellingenBlok() {
  const huidig = BTW_INSTELLINGEN?.btwPlichtigVanaf;
  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">BTW</div>
      <div class="card" style="padding:var(--spacing-4)">
        <label for="beheer-btw-vanaf" style="display:block;font-weight:500;margin-bottom:4px">
          BTW-plichtig vanaf
        </label>
        <div class="muted" style="font-size:12px;margin-bottom:10px">
          Vanaf deze datum geldt BTW-plicht (de datum zelf telt mee). Leeg laten betekent:
          geen BTW-plicht. Werkt op dit moment nog nergens door — dat volgt in een latere fase.
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="date" id="beheer-btw-vanaf" value="${huidig || ''}"
            style="width:160px" aria-label="BTW-plichtig vanaf">
          <button class="btn btn-primary" onclick="bewaarBtwVanaf()">Opslaan</button>
          <span id="beheer-btw-melding" class="muted" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;
}

export function bewaarBtwVanaf() {
  const veld = el('beheer-btw-vanaf');
  const melding = el('beheer-btw-melding');
  const ruw = (veld?.value ?? '').trim();
  if (ruw !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(ruw)) {
    if (melding) melding.textContent = 'Vul een geldige datum in, of laat leeg.';
    return;
  }
  saveBtwInstellingen({ btwPlichtigVanaf: ruw === '' ? null : ruw });
  if (melding) melding.textContent = ruw === ''
    ? 'Opgeslagen: geen BTW-plicht ingesteld.'
    : `Opgeslagen: BTW-plichtig vanaf ${ruw}.`;
  hertekenHuidigePagina();
}

/**
 * Eén duidelijke plek voor de synchronisatiestatus, in plaats van alleen een
 * aantal in de topbalk of op de Bank-pagina. Toont per vastgelopen item
 * (5 mislukte pogingen) om welke boeking/welk artikel het gaat en wat de
 * laatste foutmelding was — die twee bestonden eerder niet; ze komen uit
 * addToPendingQueue() (welk item) en de nieuwe laatsteFoutPerId-registratie
 * in supabase-client-v2.js (welke fout).
 */
function synchronisatieBlok() {
  const items = getPendingItems();
  const vastgelopen = items.filter(p => p.attempts >= (p.maxAttempts || 5));

  const regels = vastgelopen.map(p => {
    const omschrijving = p.data?.naam || p.data?.artikel || `#${p.id}`;
    return `
      <div style="padding:8px 0;border-top:1px solid var(--border)">
        <div style="font-weight:500">${esc(String(omschrijving))}</div>
        <div class="muted" style="font-size:12px">
          ${p.attempts} van ${p.maxAttempts || 5} pogingen · ${esc(p.laatsteFout || 'geen foutmelding bekend')}
        </div>
      </div>`;
  }).join('');

  const inhoud = vastgelopen.length
    ? `<div class="alert alert-error" style="margin-bottom:4px">${vastgelopen.length} wijziging(en) vastgelopen na 5 pogingen</div>${regels}
       <button class="btn btn-primary" style="margin-top:12px" onclick="herprobeerSynchronisatie()">Opnieuw proberen</button>`
    : `<div class="muted" style="font-size:13px">
         Niets vastgelopen.${items.length ? ` ${items.length} wijziging(en) worden nog verwerkt.` : ' Alles is gesynchroniseerd.'}
       </div>`;

  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">Synchronisatie</div>
      <div class="card" style="padding:var(--spacing-4)">${inhoud}</div>
    </div>`;
}

export async function herprobeerSynchronisatie() {
  await syncNu();
  renderBeheer();
}
