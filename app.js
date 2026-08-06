// app.js — startpunt. Koppelt module-functies aan `window` zodat de onclick-
// attributen in index.html blijven werken, regelt de globale interacties
// (detailpaneel, zoeken, sneltoetsen) en start de app op.

import { nav, gaNaar, hertekenHuidigePagina } from './ui.js?v=20260806a';
import { wisselJaar, renderHome } from './dashboard.js?v=20260806a';
import { renderBank, openTxModal, closeTx, saveTx, syncTxGrootboek } from './bank.js?v=20260806a';
import { renderGrootboek, filterOpGrootboek, wisFiltersGrootboek } from './grootboek.js?v=20260806a';
import { renderBelasting } from './belasting.js?v=20260806a';
import { renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover } from './voorraad.js?v=20260806a';
import {
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport
} from './hnvi.js?v=20260806a';
import {
  importExcel, openWisModal, doWis, herstelHistorischeData, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey
} from './modals.js?v=20260806a';
import { initUiVoorkeuren, wisselThema, wisselMenu, wisselMobielMenu, sluitMobielMenu } from './theme.js?v=20260806a';
import { initZoek, focusZoek, sluitZoek } from './search.js?v=20260806a';
import { toonBoeking, sluitDrawer } from './drawer.js?v=20260806a';

Object.assign(window, {
  nav, gaNaar, wisselJaar, hertekenHuidigePagina,
  renderBank, openTxModal, closeTx, saveTx, syncTxGrootboek,
  renderGrootboek, filterOpGrootboek, wisFiltersGrootboek,
  renderBelasting,
  renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover,
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport,
  importExcel, openWisModal, doWis, herstelHistorischeData, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey,
  wisselThema, wisselMenu, wisselMobielMenu, sluitMobielMenu,
  sluitDrawer
});

// ---------- Voorkeuren (thema, ingeklapt menu) ----------
initUiVoorkeuren();
initZoek();

// ---------- Modals sluiten bij klik buiten ----------
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  if (overlay.id === 'modal-hnvi') return; // deze mag alleen via de knoppen dicht
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// ---------- Doorklikken naar een boeking ----------
// Eén luisteraar voor de hele app: rijen worden telkens opnieuw getekend,
// dus losse handlers per rij zouden steeds opnieuw gezet moeten worden.
document.addEventListener('click', e => {
  const rij = e.target.closest('.row-click[data-id]');
  if (rij && !e.target.closest('button, a, input, select')) {
    toonBoeking(rij.dataset.id, rij);
  }
});

// ---------- Sneltoetsen ----------
document.addEventListener('keydown', e => {
  const inVeld = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);

  // Zoeken openen
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusZoek(); return; }
  if (e.key === '/' && !inVeld) { e.preventDefault(); focusZoek(); return; }

  // Alles sluiten
  if (e.key === 'Escape') {
    sluitZoek();
    sluitDrawer();
    sluitMobielMenu();
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    return;
  }

  // Cijfers 1-6 springen naar een pagina
  if (!inVeld && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const paginas = ['home', 'bank', 'grootboek', 'belasting', 'covers', 'hnvi'];
    const index = parseInt(e.key, 10) - 1;
    if (index >= 0 && index < paginas.length) { e.preventDefault(); gaNaar(paginas[index]); }
  }
});

// ---------- Start ----------
renderHome();
