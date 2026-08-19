// debiteuren.js — Wie betaalt mij en hoeveel?
// Nu met edit/delete + Supabase sync!

import { state, saveTxData, saveHistTxData } from './storage.js?v=20260812c';
import { fmt } from './helpers.js?v=20260812c';
import { saveToSupabase, deleteFromSupabase, addToPendingQueue } from './supabase-client-v2.js?v=20260812c';

const el = id => document.getElementById(id);

// Global modal state
let currentEditBoeking = null;
let currentEditIndex = -1;
let currentEditIsHistoric = false;

/** Voorkomt dat een naam uit de bank de opmaak van de pagina kan breken. */
const veilig = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Alle boekingen van één jaar, uit zowel het lopende jaar als de historie.
 * 'all' geeft alles. Dubbele id's kunnen niet voorkomen: TX telt door vanaf
 * 200 en de historie gebruikt h<jaar>_<nr>.
 */
function boekingenVoorJaar(jaar) {
  const alles = [...(state.TX || []), ...(state.HIST_TX || [])];
  if (jaar === 'all') return alles;
  return alles.filter(t => String(t.datum || '').startsWith(jaar));
}

export function renderDebiteuren() {
  const jaar = el('f-jaar-debiteuren')?.value || '2026';
  const lijst = el('debiteuren-list');
  const totaalVeld = el('debiteuren-totaal');
  if (!lijst || !totaalVeld) return;

  const debiteuren = boekingenVoorJaar(jaar).filter(t => t.type === 'inkomst');

  if (debiteuren.length === 0) {
    const periode = jaar === 'all' ? 'de administratie' : jaar;
    lijst.innerHTML = `<div class="leeg">Geen inkomsten in ${veilig(periode)}</div>`;
    totaalVeld.textContent = fmt(0);
    return;
  }

  // Per naam samenvoegen: één regel per klant, niet per betaling.
  const groepen = new Map();
  for (const d of debiteuren) {
    const naam = (d.naam || '').trim() || '(geen naam)';
    const bedrag = Number(d.bedrag) || 0;
    const g = groepen.get(naam) || { totaal: 0, aantal: 0 };
    g.totaal += bedrag;
    g.aantal += 1;
    groepen.set(naam, g);
  }

  const gesorteerd = [...groepen.entries()].sort((a, b) => b[1].totaal - a[1].totaal);

  lijst.innerHTML = gesorteerd.map(([naam, g]) => `
    <div class="partij-rij">
      <div class="partij-naam">${veilig(naam)}</div>
      <div class="partij-stats">
        <span class="partij-aantal">${g.aantal}&times;</span>
        <span class="partij-bedrag pos">+ ${fmt(g.totaal)}</span>
      </div>
      <button class="btn-details" data-naam="${veilig(naam)}">Details</button>
    </div>`).join('');

  // Event listeners voor Details knoppen
  document.querySelectorAll('.btn-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const naam = btn.dataset.naam;
      toonDetailsModal(naam);
    });
  });

  const totaal = gesorteerd.reduce((som, [, g]) => som + g.totaal, 0);
  totaalVeld.textContent = fmt(totaal);
}

export function wisselJaarDebiteuren() {
  renderDebiteuren();
}

/**
 * Toon alle boekingen van één partij in een detail-modal
 */
function toonDetailsModal(naamVeilig) {
  const naam = naamVeilig; // dit is al ge-escaped
  const jaar = el('f-jaar-debiteuren')?.value || '2026';
  const alles = boekingenVoorJaar(jaar).filter(t => t.type === 'inkomst');
  
  // Alle boekingen van deze partij, maar nu ongeëscaped naam
  const boekingen = alles.filter(t => {
    const partijNaam = (t.naam || '').trim() || '(geen naam)';
    return partijNaam === naam || veilig(partijNaam) === naam;
  });

  if (boekingen.length === 0) {
    alert('Geen boekingen gevonden');
    return;
  }

  // Build HTML
  const html = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: center; justify-content: center;" id="modal-backdrop">
      <div style="background: white; border-radius: 8px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <h2>${veilig(naam)}</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="border-bottom: 2px solid #ddd;">
              <th style="text-align: left; padding: 8px;">Datum</th>
              <th style="text-align: right; padding: 8px;">Bedrag</th>
              <th style="text-align: left; padding: 8px;">Beschrijving</th>
              <th style="text-align: center; padding: 8px;">Acties</th>
            </tr>
          </thead>
          <tbody>
            ${boekingen.map((b, i) => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">${b.datum || '—'}</td>
                <td style="text-align: right; padding: 8px; font-weight: bold;">€ ${fmt(b.bedrag)}</td>
                <td style="padding: 8px;">${veilig(b.omschr || '—')}</td>
                <td style="text-align: center; padding: 8px;">
                  <button class="btn-rij-edit" data-index="${i}" style="padding: 4px 8px; margin-right: 4px; font-size: 12px;">✏️ Edit</button>
                  <button class="btn-rij-delete" data-index="${i}" style="padding: 4px 8px; font-size: 12px; background: #f44; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Del</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align: right; margin-top: 15px;">
          <button onclick="document.getElementById('modal-backdrop').remove()" style="padding: 8px 16px; cursor: pointer;">Sluiten</button>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal
  const existing = document.getElementById('modal-backdrop');
  if (existing) existing.remove();

  // Add to DOM
  document.body.insertAdjacentHTML('beforeend', html);

  // Event listeners
  document.querySelectorAll('.btn-rij-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      openEditModal(boekingen[idx], idx, boekingen);
    });
  });

  document.querySelectorAll('.btn-rij-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      handleDeleteBoeking(boekingen[idx]);
    });
  });
}

/**
 * Open edit modal voor een boeking
 */
function openEditModal(boeking, idx, boekingen) {
  currentEditBoeking = JSON.parse(JSON.stringify(boeking)); // Deep copy
  currentEditIndex = idx;
  
  // Bepaal of het historisch is
  const isHist = boeking.id && boeking.id.startsWith('h');
  currentEditIsHistoric = isHist;

  const html = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;" id="edit-modal-backdrop">
      <div style="background: white; border-radius: 8px; padding: 20px; max-width: 500px; width: 90%;">
        <h3>Boeking bewerken</h3>
        <form id="edit-form" style="display: grid; gap: 12px;">
          <div>
            <label>Datum:</label>
            <input type="date" id="edit-datum" value="${currentEditBoeking.datum || ''}" />
          </div>
          <div>
            <label>Bedrag (€):</label>
            <input type="number" id="edit-bedrag" value="${currentEditBoeking.bedrag || 0}" step="0.01" />
          </div>
          <div>
            <label>Naam/Partij:</label>
            <input type="text" id="edit-naam" value="${veilig(currentEditBoeking.naam || '')}" />
          </div>
          <div>
            <label>Omschrijving:</label>
            <input type="text" id="edit-omschr" value="${veilig(currentEditBoeking.omschr || '')}" />
          </div>
          <div>
            <label>Grootboek:</label>
            <input type="text" id="edit-gb" value="${currentEditBoeking.gb || ''}" placeholder="8010" />
          </div>
          <div style="display: flex; gap: 8px; margin-top: 15px;">
            <button type="button" id="btn-save-edit" style="flex: 1; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Opslaan</button>
            <button type="button" onclick="document.getElementById('edit-modal-backdrop').remove()" style="flex: 1; padding: 10px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;">Annuleren</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  
  document.getElementById('btn-save-edit').addEventListener('click', handleSaveEdit);
}

/**
 * Save edit to storage + Supabase
 */
async function handleSaveEdit() {
  const editForm = {
    datum: el('edit-datum')?.value || currentEditBoeking.datum,
    bedrag: parseFloat(el('edit-bedrag')?.value || currentEditBoeking.bedrag),
    naam: el('edit-naam')?.value || currentEditBoeking.naam,
    omschr: el('edit-omschr')?.value || currentEditBoeking.omschr,
    gb: el('edit-gb')?.value || currentEditBoeking.gb,
    type: currentEditBoeking.type,
    rek: currentEditBoeking.rek,
    id: currentEditBoeking.id
  };

  // Update state
  if (currentEditIsHistoric) {
    if (state.HIST_TX && state.HIST_TX[currentEditIndex]) {
      state.HIST_TX[currentEditIndex] = editForm;
      saveHistTxData();
    }
  } else {
    if (state.TX && state.TX[currentEditIndex]) {
      state.TX[currentEditIndex] = editForm;
      saveTxData();
    }
  }

  // Save to Supabase
  const result = await saveToSupabase(editForm, currentEditIsHistoric);
  if (!result) {
    // Fallback: add to pending queue
    addToPendingQueue(editForm, 'update', currentEditIsHistoric);
    console.warn('⚠️ Supabase save failed, added to pending queue');
  }

  // Close modal
  const backdrop = document.getElementById('edit-modal-backdrop');
  if (backdrop) backdrop.remove();

  // Re-render
  renderDebiteuren();
}

/**
 * Delete boeking van Supabase + state
 */
async function handleDeleteBoeking(boeking) {
  if (!confirm(`Zeker weten dat je deze boeking wil verwijderen?\n\n${boeking.datum} - € ${boeking.bedrag} - ${boeking.naam}`)) {
    return;
  }

  const isHist = boeking.id && boeking.id.startsWith('h');

  // Delete from state
  if (isHist) {
    state.HIST_TX = (state.HIST_TX || []).filter(t => t.id !== boeking.id);
    saveHistTxData();
  } else {
    state.TX = (state.TX || []).filter(t => t.id !== boeking.id);
    saveTxData();
  }

  // Delete from Supabase
  const result = await deleteFromSupabase(boeking.id);
  if (!result) {
    // Fallback: add to pending queue
    addToPendingQueue(boeking, 'delete', isHist);
    console.warn('⚠️ Supabase delete failed, added to pending queue');
  }

  // Close details modal
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.remove();

  // Re-render
  renderDebiteuren();
}
