// app.js — entry point. Koppelt alle module-functies aan `window` zodat de
// bestaande onclick/onchange-attributen in index.html blijven werken, regelt
// het sluiten van modals bij een klik buiten de modal, en start de app op
// met de Home-pagina.

import { nav } from './ui.js';
import { wisselJaar, renderHome } from './dashboard.js';
import { renderBank, openTxModal, closeTx, saveTx } from './bank.js';
import { renderGrootboek } from './grootboek.js';
import { renderBelasting } from './belasting.js';
import { renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover } from './voorraad.js';
import {
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport
} from './hnvi.js';
import {
  importExcel, openWisModal, doWis, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey
} from './modals.js';

Object.assign(window, {
  nav, wisselJaar,
  renderBank, openTxModal, closeTx, saveTx,
  renderGrootboek,
  renderBelasting,
  renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover,
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport,
  importExcel, openWisModal, doWis, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey
});

// close modals on overlay click (niet voor HNVI modal)
document.querySelectorAll('.modal-overlay').forEach(el => {
  if (el.id === 'modal-hnvi') return; // HNVI modal sluit niet bij klik buiten
  el.addEventListener('click', e => { if(e.target===el) el.classList.remove('open'); });
});

// init
renderHome();
