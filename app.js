// app.js — entry point. Koppelt alle module-functies aan `window` zodat de
// bestaande onclick/onchange-attributen in index.html blijven werken, regelt
// het sluiten van modals bij een klik buiten de modal, en start de app op
// met de Home-pagina.

import { nav } from './ui.js?v=20260710a';
import { wisselJaar, renderHome } from './dashboard.js?v=20260710a';
import { renderBank, openTxModal, closeTx, saveTx, syncTxGrootboek } from './bank.js?v=20260710a';
import { renderGrootboek } from './grootboek.js?v=20260710a';
import { renderBelasting } from './belasting.js?v=20260710a';
import { renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover } from './voorraad.js?v=20260710a';
import {
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport
} from './hnvi.js?v=20260710a';
import {
  importExcel, openWisModal, doWis, herstelHistorischeData, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey
} from './modals.js?v=20260710a';

Object.assign(window, {
  nav, wisselJaar,
  renderBank, openTxModal, closeTx, saveTx, syncTxGrootboek,
  renderGrootboek,
  renderBelasting,
  renderCovers, openCoverModal, openCoverEdit, closeCoverModal, saveCover,
  renderHNVI, berekenHNVIInkoop, openHNVIModal, openHNVISell, closeHNVIModal, saveHNVI,
  wisHNVIVerkoop, verwijderHNVIItem, toggleAllHNVI, updateHNVIDeleteBtn, verwijderGeselecteerdeHNVI,
  importHNVIFactuur, bevestigHNVIImport,
  importExcel, openWisModal, doWis, herstelHistorischeData, openSyncModal, saveSyncUrl, syncUpload, syncDownload,
  openApiKeyModal, saveApiKey
});

// close modals on overlay click (niet voor HNVI modal)
document.querySelectorAll('.modal-overlay').forEach(el => {
  if (el.id === 'modal-hnvi') return; // HNVI modal sluit niet bij klik buiten
  el.addEventListener('click', e => { if(e.target===el) el.classList.remove('open'); });
});

// init
renderHome();
