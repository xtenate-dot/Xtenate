// partijen.js — gedeelde logica voor debiteuren en crediteuren.
//
// Beide pagina's staan tegelijk in de DOM. Daarom werkt alles hier op een
// meegegeven container en nooit op document.querySelectorAll: anders pakt de
// ene pagina de knoppen van de andere over en opent de verkeerde modal.

import { state, saveTxData, saveHistTxData } from './storage.js?v=20260812c';
import { fmt } from './helpers.js?v=20260812c';
import {
  saveToSupabase,
  deleteFromSupabase,
  addToPendingQueue
} from './supabase-client-v2.js?v=20260812c';

export const veilig = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Historische boekingen hebben een id als 'h2025_12', lopende een getal. */
const isHistorisch = b => String(b?.id ?? '').startsWith('h');

/** Alle boekingen van één jaar, uit het lopende jaar én de historie. */
export function boekingenVoorJaar(jaar) {
  const alles = [...(state.TX || []), ...(state.HIST_TX || [])];
  if (jaar === 'all') return alles;
  return alles.filter(t => String(t.datum || '').startsWith(jaar));
}

const partijNaamVan = b => (b.naam || '').trim() || '(geen naam)';

// ---------------------------------------------------------------- lijst

/**
 * Tekent de partijenlijst en hangt de Details-knoppen op.
 *
 * @param {object}   opts
 * @param {string}   opts.lijstId     id van de container
 * @param {string}   opts.totaalId    id van het totaalveld
 * @param {string}   opts.jaarId      id van de jaarkiezer
 * @param {string}   opts.soort       'inkomst' of 'uitgave'
 * @param {string}   opts.leegTekst   tekst als er niets is
 * @param {Function} opts.herteken    functie om na wijzigen opnieuw te tekenen
 */
export function tekenPartijen(opts) {
  const lijst = document.getElementById(opts.lijstId);
  const totaalVeld = document.getElementById(opts.totaalId);
  if (!lijst || !totaalVeld) return;

  const jaar = document.getElementById(opts.jaarId)?.value || '2026';
  const boekingen = boekingenVoorJaar(jaar).filter(t => t.type === opts.soort);

  if (boekingen.length === 0) {
    const periode = jaar === 'all' ? 'de administratie' : jaar;
    lijst.innerHTML = `<div class="leeg">${opts.leegTekst} in ${veilig(periode)}</div>`;
    totaalVeld.textContent = fmt(0);
    return;
  }

  // Per partij samenvoegen: één regel per naam, niet per betaling.
  const groepen = new Map();
  for (const b of boekingen) {
    const naam = partijNaamVan(b);
    const g = groepen.get(naam) || { totaal: 0, aantal: 0 };
    g.totaal += Number(b.bedrag) || 0;
    g.aantal += 1;
    groepen.set(naam, g);
  }

  const gesorteerd = [...groepen.entries()].sort((a, b) => b[1].totaal - a[1].totaal);
  const tekenKlasse = opts.soort === 'inkomst' ? 'pos' : 'neg';
  const voorvoegsel = opts.soort === 'inkomst' ? '+&nbsp;' : '';

  lijst.innerHTML = gesorteerd.map(([naam, g], i) => `
    <div class="partij-rij">
      <span class="partij-naam" title="${veilig(naam)}">${veilig(naam)}</span>
      <span class="partij-aantal">${g.aantal}&times;</span>
      <span class="partij-bedrag ${tekenKlasse}">${voorvoegsel}${fmt(g.totaal)}</span>
      <button type="button" class="btn-details" data-rij="${i}">Details</button>
    </div>`).join('');

  // Alleen binnen deze lijst zoeken, niet in het hele document.
  lijst.querySelectorAll('.btn-details').forEach(knop => {
    knop.addEventListener('click', () => {
      const naam = gesorteerd[Number(knop.dataset.rij)][0];
      openPartijModal(naam, boekingen.filter(b => partijNaamVan(b) === naam), opts);
    });
  });

  totaalVeld.textContent = fmt(gesorteerd.reduce((som, [, g]) => som + g.totaal, 0));
}

// ---------------------------------------------------------------- modal

let sluitHuidigeModal = null;

/** Zet een overlay neer die met Esc, de knop of een klik ernaast dichtgaat. */
function toonOverlay(id, binnenkantHtml) {
  sluitHuidigeModal?.();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id;
  overlay.innerHTML = `<div class="modal-venster" role="dialog" aria-modal="true">${binnenkantHtml}</div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const sluit = () => {
    document.removeEventListener('keydown', opToets);
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) {
      document.body.classList.remove('modal-open');
    }
    if (sluitHuidigeModal === sluit) sluitHuidigeModal = null;
  };

  function opToets(e) {
    if (e.key === 'Escape') { e.preventDefault(); sluit(); }
  }

  document.addEventListener('keydown', opToets);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) sluit(); });
  overlay.querySelectorAll('[data-sluit]').forEach(k => k.addEventListener('click', sluit));

  sluitHuidigeModal = sluit;
  return { overlay, sluit };
}

function openPartijModal(naam, boekingen, opts) {
  const opDatum = [...boekingen].sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  const totaal = opDatum.reduce((s, b) => s + (Number(b.bedrag) || 0), 0);

  const rijen = opDatum.map((b, i) => `
    <tr>
      <td class="col-datum">${veilig(b.datum || '—')}</td>
      <td class="col-bedrag">${fmt(b.bedrag)}</td>
      <td class="col-gb">${veilig(b.gb || '—')}</td>
      <td class="col-omschr" title="${veilig(b.omschr || '')}">${veilig(b.omschr || '—')}</td>
      <td class="col-acties">
        <button type="button" class="btn-mini" data-bewerk="${i}">Bewerk</button>
        <button type="button" class="btn-mini btn-mini-rood" data-verwijder="${i}">Verwijder</button>
      </td>
    </tr>`).join('');

  const { overlay } = toonOverlay('partij-modal', `
    <header class="modal-kop">
      <div>
        <h2>${veilig(naam)}</h2>
        <p class="modal-sub">${opDatum.length} boeking${opDatum.length === 1 ? '' : 'en'} &middot; ${fmt(totaal)}</p>
      </div>
      <button type="button" class="modal-sluit" data-sluit aria-label="Sluiten">&times;</button>
    </header>
    <div class="modal-inhoud">
      <table class="modal-tabel">
        <thead>
          <tr>
            <th class="col-datum">Datum</th>
            <th class="col-bedrag">Bedrag</th>
            <th class="col-gb">Grootboek</th>
            <th class="col-omschr">Omschrijving</th>
            <th class="col-acties">Acties</th>
          </tr>
        </thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>
    <footer class="modal-voet">
      <span class="modal-hint">Esc sluit dit venster</span>
      <button type="button" class="btn-secundair" data-sluit>Sluiten</button>
    </footer>`);

  overlay.querySelectorAll('[data-bewerk]').forEach(k => k.addEventListener('click',
    () => openBewerkModal(opDatum[Number(k.dataset.bewerk)], opts)));

  overlay.querySelectorAll('[data-verwijder]').forEach(k => k.addEventListener('click',
    () => verwijderBoeking(opDatum[Number(k.dataset.verwijder)], opts)));
}

function openBewerkModal(boeking, opts) {
  const { overlay, sluit } = toonOverlay('bewerk-modal', `
    <header class="modal-kop">
      <h2>Boeking bewerken</h2>
      <button type="button" class="modal-sluit" data-sluit aria-label="Sluiten">&times;</button>
    </header>
    <div class="modal-inhoud">
      <div class="veld-raster">
        <label>Datum<input type="date" id="bew-datum" value="${veilig(boeking.datum || '')}"></label>
        <label>Bedrag (&euro;)<input type="number" step="0.01" id="bew-bedrag" value="${Number(boeking.bedrag) || 0}"></label>
        <label>Grootboek<input type="text" id="bew-gb" value="${veilig(boeking.gb || '')}"></label>
        <label>Rekening<input type="text" id="bew-rek" value="${veilig(boeking.rek || '')}"></label>
        <label class="veld-breed">Naam / partij<input type="text" id="bew-naam" value="${veilig(boeking.naam || '')}"></label>
        <label class="veld-breed">Omschrijving<input type="text" id="bew-omschr" value="${veilig(boeking.omschr || '')}"></label>
      </div>
    </div>
    <footer class="modal-voet">
      <span class="modal-hint">Esc annuleert</span>
      <div class="modal-knoppen">
        <button type="button" class="btn-secundair" data-sluit>Annuleren</button>
        <button type="button" class="btn-primair" id="bew-opslaan">Opslaan</button>
      </div>
    </footer>`);

  const waarde = id => overlay.querySelector('#' + id)?.value ?? '';

  overlay.querySelector('#bew-opslaan').addEventListener('click', async () => {
    const gewijzigd = {
      ...boeking,
      datum: waarde('bew-datum') || boeking.datum,
      bedrag: Number(waarde('bew-bedrag')) || 0,
      naam: waarde('bew-naam'),
      omschr: waarde('bew-omschr'),
      gb: waarde('bew-gb'),
      rek: waarde('bew-rek')
    };

    // Op id zoeken, niet op de index uit de gefilterde lijst: die index hoort
    // bij het scherm en niet bij state.TX, dus daarmee overschreef de vorige
    // versie de verkeerde boeking.
    const hist = isHistorisch(boeking);
    const lijst = hist ? state.HIST_TX : state.TX;
    const pos = (lijst || []).findIndex(t => String(t.id) === String(boeking.id));
    if (pos === -1) { alert('Boeking niet meer gevonden.'); sluit(); return; }

    lijst[pos] = gewijzigd;
    hist ? saveHistTxData() : saveTxData();

    try {
      const ok = await saveToSupabase(gewijzigd, hist);
      if (!ok) addToPendingQueue(gewijzigd, 'update', hist);
    } catch (err) {
      console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
      addToPendingQueue(gewijzigd, 'update', hist);
    }

    sluit();
    opts.herteken();
  });

  overlay.querySelector('#bew-datum')?.focus();
}

async function verwijderBoeking(boeking, opts) {
  const regel = `${boeking.datum} — ${fmt(boeking.bedrag)} — ${boeking.naam || '(geen naam)'}`;
  if (!confirm(`Deze boeking verwijderen?\n\n${regel}`)) return;

  const hist = isHistorisch(boeking);
  if (hist) {
    state.HIST_TX = (state.HIST_TX || []).filter(t => String(t.id) !== String(boeking.id));
    saveHistTxData();
  } else {
    state.TX = (state.TX || []).filter(t => String(t.id) !== String(boeking.id));
    saveTxData();
  }

  try {
    const ok = await deleteFromSupabase(boeking.id);
    if (!ok) addToPendingQueue(boeking, 'delete', hist);
  } catch (err) {
    console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
    addToPendingQueue(boeking, 'delete', hist);
  }

  sluitHuidigeModal?.();
  opts.herteken();
}
